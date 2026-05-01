-- ============================================================================
-- Temantiket — Supabase Schema v2 (Multi-tenant + RLS)
-- ============================================================================
-- Jalankan di SQL Editor Supabase Dashboard. Idempotent, aman dijalankan ulang.
--
-- BOOTSTRAP (sekali setelah deploy schema ini):
--   1. Deploy Edge Functions (lihat supabase/functions/README.md)
--   2. Buka /bootstrap di app, isi email + password + nama agensi
--      → otomatis bikin auth user + agency + owner membership
-- ============================================================================

-- ── EXTENSIONS ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── TENANT TABLES ───────────────────────────────────────────────────────────

create table if not exists public.agencies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table if not exists public.agency_members (
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner','staff')),
  created_at  timestamptz not null default now(),
  primary key (agency_id, user_id)
);
create index if not exists agency_members_user_idx on public.agency_members(user_id);

-- ── HELPER FUNCTIONS ────────────────────────────────────────────────────────
-- SECURITY DEFINER supaya bisa baca tanpa kena RLS recursion saat policy lookup.

create or replace function public.current_agency_id()
returns uuid language sql stable security definer set search_path = public as $$
  select agency_id from public.agency_members
   where user_id = auth.uid()
   limit 1
$$;

create or replace function public.is_member(target_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_members
     where user_id = auth.uid() and agency_id = target_agency
  )
$$;

create or replace function public.is_owner(target_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_members
     where user_id = auth.uid() and agency_id = target_agency and role = 'owner'
  )
$$;

-- ── DOMAIN TABLES ───────────────────────────────────────────────────────────

create table if not exists public.trips (
  id            text primary key,
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  name          text not null,
  destination   text not null default '',
  start_date    text not null default '',
  end_date      text not null default '',
  emoji         text not null default '✈️',
  cover_image   text,
  created_at    timestamptz not null default now()
);
alter table public.trips add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists trips_agency_idx on public.trips(agency_id);

create table if not exists public.jamaah (
  id              text primary key,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  trip_id         text not null references public.trips(id) on delete cascade,
  name            text not null,
  phone           text not null default '',
  birth_date      text not null default '',
  passport_number text not null default '',
  gender          text not null default '',
  photo_data_url  text,
  needs_review    boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.jamaah add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
alter table public.jamaah add column if not exists needs_review boolean not null default false;
alter table public.jamaah add column if not exists passport_expiry text;
alter table public.jamaah add column if not exists payment_status text not null default 'Belum Lunas';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jamaah_payment_status_check'
      and conrelid = 'public.jamaah'::regclass
  ) then
    alter table public.jamaah
      add constraint jamaah_payment_status_check
      check (payment_status in ('Belum Lunas', 'DP', 'Lunas'));
  end if;
end $$;
create index if not exists jamaah_trip_idx on public.jamaah(trip_id);
create index if not exists jamaah_agency_idx on public.jamaah(agency_id);
create index if not exists jamaah_payment_status_idx on public.jamaah(payment_status);

create table if not exists public.jamaah_docs (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  jamaah_id   text not null references public.jamaah(id) on delete cascade,
  category    text not null,
  label       text not null default '',
  file_name   text not null default '',
  file_type   text not null default 'image',
  data_url    text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.jamaah_docs add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists jamaah_docs_jamaah_idx on public.jamaah_docs(jamaah_id);
create index if not exists jamaah_docs_agency_idx on public.jamaah_docs(agency_id);

create table if not exists public.packages (
  id              text primary key,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  name            text not null,
  destination     text not null default '',
  people          int  not null default 1,
  days            int  not null default 1,
  hpp             numeric not null default 0,
  total_idr       numeric not null default 0,
  status          text not null default 'Draft',
  emoji           text not null default '📦',
  cover_image     text,
  departure_date  text,
  return_date     text,
  airline         text,
  hotel_level     text,
  notes           text,
  facilities      jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.packages add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
alter table public.packages add column if not exists return_date text;
create index if not exists packages_agency_idx on public.packages(agency_id);

create table if not exists public.package_calculations (
  package_id  text primary key references public.packages(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.package_calculations add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists package_calculations_agency_idx on public.package_calculations(agency_id);

create table if not exists public.notes (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  title       text not null default '',
  content     text not null default '',
  color       text not null default 'bg-white border-slate-200',
  pinned      boolean not null default false,
  tags        jsonb,
  created_at  bigint not null,
  updated_at  bigint not null
);
alter table public.notes add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists notes_agency_idx on public.notes(agency_id);

create table if not exists public.pdf_layout_presets (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.pdf_layout_presets add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists pdf_layout_presets_agency_idx on public.pdf_layout_presets(agency_id);

create table if not exists public.pdf_templates (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.pdf_templates add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists pdf_templates_agency_idx on public.pdf_templates(agency_id);

-- ── ORDER HUB (clients + orders) ────────────────────────────────────────────
-- Multi-tenant + RLS via helper public.is_member().
create table if not exists public.clients (
  id                uuid primary key default uuid_generate_v4(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  name              text not null,
  phone             text not null default '',
  email             text,
  birth_date        text,
  passport_number   text,
  passport_expiry   text,
  gender            text,
  photo_data_url    text,
  notes             text,
  legacy_jamaah_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists clients_agency_idx on public.clients(agency_id);
create index if not exists clients_name_idx   on public.clients(agency_id, lower(name));
create index if not exists clients_legacy_idx on public.clients(legacy_jamaah_id);

create table if not exists public.orders (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  type            text not null,
  status          text not null default 'Draft',
  title           text,
  total_price     numeric not null default 0,
  currency        text not null default 'IDR',
  metadata        jsonb not null default '{}'::jsonb,
  trip_id         text references public.trips(id) on delete set null,
  package_id      text references public.packages(id) on delete set null,
  jamaah_id       text references public.jamaah(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_type_check' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_type_check
      check (type in ('umrah','flight','visa_voa','visa_student'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_status_check' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_status_check
      check (status in ('Draft','Confirmed','Paid','Completed','Cancelled'));
  end if;
end $$;
create index if not exists orders_agency_idx  on public.orders(agency_id);
create index if not exists orders_type_idx    on public.orders(agency_id, type);
create index if not exists orders_client_idx  on public.orders(client_id);
create index if not exists orders_package_idx on public.orders(package_id);
create index if not exists orders_trip_idx    on public.orders(trip_id);
create index if not exists orders_jamaah_idx  on public.orders(jamaah_id);
create index if not exists orders_status_idx  on public.orders(agency_id, status);

-- Audit logs (placeholder buat fitur #5 nanti)
create table if not exists public.audit_logs (
  id          bigserial primary key,
  agency_id   uuid references public.agencies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_agency_idx on public.audit_logs(agency_id, created_at desc);

-- ── ENABLE RLS ──────────────────────────────────────────────────────────────

alter table public.agencies              enable row level security;
alter table public.agency_members        enable row level security;
alter table public.trips                 enable row level security;
alter table public.jamaah                enable row level security;
alter table public.jamaah_docs           enable row level security;
alter table public.packages              enable row level security;
alter table public.package_calculations  enable row level security;
alter table public.notes                 enable row level security;
alter table public.pdf_templates         enable row level security;
alter table public.pdf_layout_presets    enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.clients               enable row level security;
alter table public.orders                enable row level security;

-- ── POLICY HELPERS ──────────────────────────────────────────────────────────
-- Drop semua kemungkinan policy lama biar idempotent.

do $$
declare t text; pname text;
begin
  for t in select unnest(array[
    'agencies','agency_members','trips','jamaah','jamaah_docs','packages',
    'package_calculations','notes','pdf_templates','pdf_layout_presets','audit_logs'
  ]) loop
    for pname in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pname, t);
    end loop;
  end loop;
end$$;

-- ── AGENCIES POLICIES ───────────────────────────────────────────────────────
-- Member bisa lihat agency-nya. Hanya owner yang bisa rename. Insert dilakukan
-- via Edge Function `bootstrap` (service_role bypass RLS).

create policy "agencies_select_member" on public.agencies
  for select using (public.is_member(id));

create policy "agencies_update_owner" on public.agencies
  for update using (public.is_owner(id)) with check (public.is_owner(id));

-- ── AGENCY_MEMBERS POLICIES ─────────────────────────────────────────────────
-- Member bisa lihat semua member di agency-nya.
-- Insert/delete via Edge Function (invite-member, remove-member).

create policy "members_select_same_agency" on public.agency_members
  for select using (public.is_member(agency_id));

-- ── DOMAIN TABLE POLICIES (template) ────────────────────────────────────────
-- Pattern: SELECT/INSERT/UPDATE/DELETE hanya kalo agency_id ∈ user's agencies.

do $$
declare t text;
begin
  for t in select unnest(array[
    'trips','jamaah','jamaah_docs','packages',
    'package_calculations','notes','pdf_templates','pdf_layout_presets'
  ]) loop
    execute format($f$
      create policy "%1$s_select" on public.%1$I
        for select using (public.is_member(agency_id));
      create policy "%1$s_insert" on public.%1$I
        for insert with check (public.is_member(agency_id));
      create policy "%1$s_update" on public.%1$I
        for update using (public.is_member(agency_id))
                  with check (public.is_member(agency_id));
      create policy "%1$s_delete" on public.%1$I
        for delete using (public.is_member(agency_id));
    $f$, t);
  end loop;
end$$;

-- Audit logs: read-only buat member, insert via trigger (SECURITY DEFINER nanti)
create policy "audit_logs_select" on public.audit_logs
  for select using (public.is_member(agency_id));

-- ── STORAGE BUCKETS ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('jamaah-photos', 'jamaah-photos', true),
  ('jamaah-docs',   'jamaah-docs',   true),
  ('pdf-templates', 'pdf-templates', true)
on conflict (id) do nothing;

-- Drop policy lama
do $$
declare pname text;
begin
  for pname in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    if pname like 'igh_%' or pname = 'buckets_open_all' then
      execute format('drop policy if exists %I on storage.objects', pname);
    end if;
  end loop;
end$$;

-- Path convention: `{agency_id}/{file}`. Folder pertama = agency_id (UUID).
-- Cek member-nya pake helper is_member().

create policy "igh_storage_select" on storage.objects
  for select using (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "igh_storage_insert" on storage.objects
  for insert with check (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "igh_storage_update" on storage.objects
  for update using (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "igh_storage_delete" on storage.objects
  for delete using (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

-- ── PROFILES (mirror of auth.users untuk display name di UI) ────────────────
-- auth.users ga bisa di-select dari client (perlu service role), jadi kita
-- mirror data minimum (full_name, email) ke public.profiles supaya halaman
-- "Manajemen Tim" bisa render nama beneran. Di-upsert dari edge function
-- invite-member & bootstrap pake service role.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles(lower(email));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self"        on public.profiles;
drop policy if exists "profiles_update_self"        on public.profiles;
drop policy if exists "profiles_insert_self"        on public.profiles;
drop policy if exists "profiles_select_same_agency" on public.profiles;

create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_select_same_agency" on public.profiles
  for select using (
    exists (
      select 1
        from public.agency_members am_target
        join public.agency_members am_self on am_self.agency_id = am_target.agency_id
       where am_target.user_id = profiles.id
         and am_self.user_id = auth.uid()
    )
  );

create or replace function public.set_profiles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- ── REALTIME PUBLICATION ────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'trips','jamaah','jamaah_docs','packages',
    'package_calculations','notes','pdf_templates','pdf_layout_presets',
    'clients','orders'
  ]) loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ── CLIENTS + ORDERS POLICIES ───────────────────────────────────────────────
do $$
declare t text; pname text;
begin
  for t in select unnest(array['clients','orders']) loop
    -- Drop existing policies first (idempotent re-run)
    for pname in select policyname from pg_policies
     where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pname, t);
    end loop;
    execute format($f$
      create policy "%1$s_select" on public.%1$I
        for select using (public.is_member(agency_id));
      create policy "%1$s_insert" on public.%1$I
        for insert with check (public.is_member(agency_id));
      create policy "%1$s_update" on public.%1$I
        for update using (public.is_member(agency_id))
                  with check (public.is_member(agency_id));
      create policy "%1$s_delete" on public.%1$I
        for delete using (public.is_member(agency_id));
    $f$, t);
  end loop;
end$$;

-- ============================================================================
-- DONE. Lanjut: deploy Edge Functions, lalu /bootstrap di app.
-- ============================================================================
-- ============================================================================
-- Migration: Agent (Mitra) Management System
-- ============================================================================
-- Tujuan:
--   1. Tambah role 'agent' di agency_members + commission_pct per-agent.
--   2. Tambah created_by_agent ke clients & orders utk attribution.
--   3. Tabel agent_points + trigger auto-award saat order → Completed.
--   4. RLS hardening: agent cuma boleh liat clients/orders yg dia bikin sendiri.
--   5. Helper SQL `is_agent()` utk policy.
--
-- Idempotent — semua `if not exists`, `do $$` blocks, `on conflict`.
-- Cara pakai: Supabase Dashboard → SQL Editor → paste → RUN.
-- ============================================================================

-- ── 1. Allow 'agent' role di agency_members ────────────────────────────────
do $$
begin
  -- Drop existing CHECK constraint kalau ada (nama default Postgres).
  if exists (
    select 1 from pg_constraint
    where conname = 'agency_members_role_check'
  ) then
    alter table public.agency_members drop constraint agency_members_role_check;
  end if;

  alter table public.agency_members
    add constraint agency_members_role_check
    check (role in ('owner', 'staff', 'agent'));
end$$;

alter table public.agency_members
  add column if not exists commission_pct numeric not null default 10;

-- ── 2. Helper: is_agent(agency) ─────────────────────────────────────────────
create or replace function public.is_agent(target_agency uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.agency_members
    where user_id = auth.uid()
      and agency_id = target_agency
      and role = 'agent'
  )
$$;

-- ── 3. created_by_agent column (clients + orders) ──────────────────────────
alter table public.clients
  add column if not exists created_by_agent uuid references auth.users(id) on delete set null;
alter table public.orders
  add column if not exists created_by_agent uuid references auth.users(id) on delete set null;

create index if not exists clients_created_by_agent_idx
  on public.clients(agency_id, created_by_agent);
create index if not exists orders_created_by_agent_idx
  on public.orders(agency_id, created_by_agent);

-- ── 4. agent_points table ──────────────────────────────────────────────────
create table if not exists public.agent_points (
  id          uuid primary key default uuid_generate_v4(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  agent_id    uuid not null references auth.users(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  points      int  not null default 10,
  reason      text not null default 'order_completed',
  awarded_at  timestamptz not null default now(),
  unique(order_id)  -- 1 order = 1 award (idempotent re-completion)
);
create index if not exists agent_points_agency_agent_idx
  on public.agent_points(agency_id, agent_id);
create index if not exists agent_points_awarded_idx
  on public.agent_points(agency_id, awarded_at desc);

-- RLS — semua member agency boleh liat (utk leaderboard + dashboard agent
-- liat skor sendiri). Insert HANYA via trigger (security definer).
alter table public.agent_points enable row level security;

drop policy if exists "agent_points_select" on public.agent_points;
create policy "agent_points_select" on public.agent_points
  for select using (public.is_member(agency_id));

-- (Sengaja gak bikin insert/update/delete policy — trigger pake security
-- definer jadi bypass RLS. User normal gak bisa manipulasi poin manual.)

-- ── 5. Trigger: auto-award points saat order → Completed ───────────────────
create or replace function public.award_points_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hanya award kalau:
  --   * Status sekarang 'Completed'
  --   * Order punya created_by_agent (bukan Direct)
  --   * Status sebelumnya BUKAN 'Completed' (idempotent — re-update gak double-award)
  --     atau ini INSERT pertama dgn status='Completed'.
  if new.status = 'Completed'
     and new.created_by_agent is not null
     and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'Completed')
  then
    insert into public.agent_points(agency_id, agent_id, order_id, points, reason)
    values (new.agency_id, new.created_by_agent, new.id, 10, 'order_completed')
    on conflict (order_id) do nothing;  -- safety net (unique constraint)
  end if;
  return new;
end;
$$;

drop trigger if exists tr_award_points_on_completion on public.orders;
create trigger tr_award_points_on_completion
  after insert or update of status on public.orders
  for each row execute function public.award_points_on_completion();

-- ── 6. RLS hardening — agent cuma akses data sendiri ───────────────────────
-- Kita drop & re-create select/update/delete policies utk clients & orders.
-- Owner/staff TETEP liat semua. Agent dibatasi ke `created_by_agent = auth.uid()`.
do $$
declare t text;
begin
  for t in select unnest(array['clients','orders']) loop
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
  end loop;
end$$;

-- CLIENTS
create policy "clients_select" on public.clients
  for select using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "clients_insert" on public.clients
  for insert with check (
    public.is_member(agency_id) and (
      -- Agent wajib tag dirinya sebagai creator (atau biarkan null lalu di-set client-side).
      not public.is_agent(agency_id)
      or created_by_agent is null
      or created_by_agent = auth.uid()
    )
  );
create policy "clients_update" on public.clients
  for update using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  ) with check (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "clients_delete" on public.clients
  for delete using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );

-- ORDERS
create policy "orders_select" on public.orders
  for select using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "orders_insert" on public.orders
  for insert with check (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id)
      or created_by_agent is null
      or created_by_agent = auth.uid()
    )
  );
create policy "orders_update" on public.orders
  for update using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  ) with check (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "orders_delete" on public.orders
  for delete using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );

-- ── 7. Realtime: subscribe agent_points ────────────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.agent_points';
exception when duplicate_object then null;
end$$;

-- ============================================================================
-- DONE. Verifikasi:
--   select role, count(*) from public.agency_members group by 1;
--   select * from public.agent_points order by awarded_at desc limit 10;
--
-- Test trigger:
--   1. Bikin order dgn created_by_agent = <some-agent-uid>, status='Draft'
--   2. Update status → 'Completed'
--   3. Cek public.agent_points → harus muncul 1 row baru (10 poin)
--   4. Re-update status (Cancelled → Completed) → tetap 1 row (idempotent)
-- ============================================================================
-- ============================================================================
-- Migration: Agent Marketing & Retention
-- ============================================================================
-- Tujuan:
--   1. Retention trigger: order baru auto-inherit `created_by_agent` dari
--      `clients.created_by_agent` kalau client udah punya pemilik agen.
--      Ini bikin "client locking" — sekali daftar lewat agen X, semua order
--      berikutnya buat klien itu otomatis kasih poin ke agen X (siapapun yg
--      input order-nya).
--
--   2. Tabel `reward_redemptions` — request tukar poin → hadiah dari mitra.
--      Workflow: agent submit request → admin lihat & approve → poin dipotong.
--      MVP: agent insert + select sendiri; admin (owner) lihat semua.
--
-- Idempotent — semua `if not exists` / `do $$` / `or replace`.
-- Cara pakai: jalanin SETELAH 2026_04_30_agents_system.sql sukses.
-- ============================================================================

-- ── 1. Trigger inherit_agent_from_client ───────────────────────────────────
-- BEFORE INSERT pada orders. Kalau order baru dibikin tanpa created_by_agent
-- tapi client-nya punya agen → set created_by_agent = client.created_by_agent.
-- Inilah inti retention logic — admin gak bisa "merebut" klien dari agen.
create or replace function public.inherit_agent_from_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.created_by_agent is null and NEW.client_id is not null then
    NEW.created_by_agent := (
      select c.created_by_agent
      from public.clients c
      where c.id = NEW.client_id
        and c.agency_id = NEW.agency_id
      limit 1
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists tr_inherit_agent_from_client on public.orders;
create trigger tr_inherit_agent_from_client
  before insert on public.orders
  for each row execute function public.inherit_agent_from_client();

-- ── 2. Tabel reward_redemptions ────────────────────────────────────────────
create table if not exists public.reward_redemptions (
  id            uuid primary key default uuid_generate_v4(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  agent_id      uuid not null references auth.users(id) on delete cascade,
  reward_key    text not null,                      -- mis. 'pulsa_50k', 'tshirt_mitra'
  reward_label  text not null,                      -- snapshot label (utk UI)
  cost_points   int  not null check (cost_points > 0),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  notes         text,
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null
);

create index if not exists reward_redemptions_agency_status_idx
  on public.reward_redemptions(agency_id, status, requested_at desc);
create index if not exists reward_redemptions_agent_idx
  on public.reward_redemptions(agency_id, agent_id, requested_at desc);

alter table public.reward_redemptions enable row level security;

-- Agent boleh INSERT request (untuk dirinya sendiri) & SELECT request sendiri.
-- Owner/staff (non-agent) boleh SELECT semua + UPDATE status (approve/reject).
drop policy if exists "rewards_select" on public.reward_redemptions;
create policy "rewards_select" on public.reward_redemptions
  for select using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or agent_id = auth.uid()
    )
  );

drop policy if exists "rewards_insert" on public.reward_redemptions;
create policy "rewards_insert" on public.reward_redemptions
  for insert with check (
    public.is_member(agency_id)
    and agent_id = auth.uid()
    and status = 'pending'    -- baru bisa request, bukan auto-approve
  );

drop policy if exists "rewards_update" on public.reward_redemptions;
create policy "rewards_update" on public.reward_redemptions
  for update using (
    public.is_member(agency_id) and not public.is_agent(agency_id)
  ) with check (
    public.is_member(agency_id) and not public.is_agent(agency_id)
  );

drop policy if exists "rewards_delete" on public.reward_redemptions;
create policy "rewards_delete" on public.reward_redemptions
  for delete using (
    public.is_member(agency_id) and not public.is_agent(agency_id)
  );

-- ── 3. Realtime: subscribe reward_redemptions ──────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.reward_redemptions';
exception when duplicate_object then null;
end$$;

-- ============================================================================
-- DONE. Verifikasi:
--   1. Insert client w/ created_by_agent = <agent-uid>
--   2. Insert order w/ client_id = <client-id> tapi tanpa created_by_agent
--   3. Cek: select created_by_agent from public.orders where id = <new-order>;
--      → harus auto-isi dgn <agent-uid>
--
--   select * from public.reward_redemptions order by requested_at desc;
-- ============================================================================
