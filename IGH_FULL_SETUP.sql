-- ============================================================================
-- IGH Tour — FULL Supabase Setup (single-file, copy-paste sekali jalan)
-- ============================================================================
-- Idempotent: aman dijalankan ulang berkali-kali tanpa rusak data existing.
-- Cakup: schema multi-tenant, RLS, helper functions, storage buckets,
--        storage policies, realtime publications.
--
-- CARA PAKAI:
--   1) Buka Supabase Dashboard → SQL Editor → New query.
--   2) Paste SELURUH isi file ini → klik Run.
--   3) Tunggu sampai sukses (biasanya 2–5 detik).
--   4) Deploy 3 Edge Functions terpisah (lihat supabase/functions/README.md):
--        supabase functions deploy bootstrap     --no-verify-jwt
--        supabase functions deploy invite-member
--        supabase functions deploy remove-member
--   5) Buka https://<domain>/bootstrap → bikin owner pertama + agency.
--   6) Login normal di /login.
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

-- ── HELPER FUNCTIONS (SECURITY DEFINER → cegah RLS recursion) ───────────────
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

-- Trip / paket perjalanan
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

-- Jamaah (peserta)
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
create index if not exists jamaah_trip_idx   on public.jamaah(trip_id);
create index if not exists jamaah_agency_idx on public.jamaah(agency_id);

-- Dokumen jamaah (paspor scan, visa, dll)
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

-- Paket penawaran (Umrah/Haji)
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
  airline         text,
  hotel_level     text,
  notes           text,
  facilities      jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.packages add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists packages_agency_idx on public.packages(agency_id);

-- Kalkulasi paket (snapshot kalkulator HPP)
create table if not exists public.package_calculations (
  package_id  text primary key references public.packages(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.package_calculations add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists package_calculations_agency_idx on public.package_calculations(agency_id);

-- Catatan internal (sticky notes)
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

-- Template PDF custom (logo, header, watermark, dll)
create table if not exists public.pdf_templates (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.pdf_templates add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists pdf_templates_agency_idx on public.pdf_templates(agency_id);

-- PDF Layout Presets (Tuner — koordinat & ukuran tiap section)
create table if not exists public.pdf_layout_presets (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pdf_layout_presets_agency_idx on public.pdf_layout_presets(agency_id);

-- Pembayaran
create table if not exists public.payments (
  id            text primary key,
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  trip_id       text references public.trips(id) on delete cascade,
  jamaah_id     text references public.jamaah(id) on delete cascade,
  amount        numeric not null default 0,
  currency      text not null default 'IDR',
  method        text,
  reference     text,
  notes         text,
  proof_url     text,
  paid_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
alter table public.payments add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists payments_agency_idx on public.payments(agency_id);
create index if not exists payments_trip_idx   on public.payments(trip_id);
create index if not exists payments_jamaah_idx on public.payments(jamaah_id);

-- Audit log (track perubahan data)
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

-- ── ENABLE RLS DI SEMUA TABEL ───────────────────────────────────────────────
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
alter table public.payments              enable row level security;
alter table public.audit_logs            enable row level security;

-- ── DROP POLICIES LAMA (idempotent — supaya bisa di-rerun) ──────────────────
do $$
declare t text; pname text;
begin
  for t in select unnest(array[
    'agencies','agency_members','trips','jamaah','jamaah_docs','packages',
    'package_calculations','notes','pdf_templates','pdf_layout_presets',
    'payments','audit_logs'
  ]) loop
    for pname in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pname, t);
    end loop;
  end loop;
end$$;

-- ── AGENCIES POLICIES ───────────────────────────────────────────────────────
create policy "agencies_select_member" on public.agencies
  for select using (public.is_member(id));

create policy "agencies_update_owner" on public.agencies
  for update using (public.is_owner(id)) with check (public.is_owner(id));

-- ── AGENCY_MEMBERS POLICIES ─────────────────────────────────────────────────
create policy "members_select_same_agency" on public.agency_members
  for select using (public.is_member(agency_id));

-- ── DOMAIN TABLE POLICIES (loop generator) ──────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'trips','jamaah','jamaah_docs','packages',
    'package_calculations','notes','pdf_templates','pdf_layout_presets','payments'
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

-- Audit log: read-only buat member
create policy "audit_logs_select" on public.audit_logs
  for select using (public.is_member(agency_id));

-- ── STORAGE BUCKETS ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('jamaah-photos', 'jamaah-photos', true),
  ('jamaah-docs',   'jamaah-docs',   true),
  ('pdf-templates', 'pdf-templates', true),
  ('payments',      'payments',      true)
on conflict (id) do nothing;

-- Drop storage policies lama (yang berprefix igh_)
do $$
declare pname text;
begin
  for pname in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    if pname like 'igh_%' then
      execute format('drop policy if exists %I on storage.objects', pname);
    end if;
  end loop;
end$$;

-- Storage path convention: `{agency_id}/{file}`. Folder pertama = agency_id (UUID).
create policy "igh_storage_select" on storage.objects
  for select using (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates','payments')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "igh_storage_insert" on storage.objects
  for insert with check (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates','payments')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "igh_storage_update" on storage.objects
  for update using (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates','payments')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates','payments')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "igh_storage_delete" on storage.objects
  for delete using (
    bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates','payments')
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

-- ── REALTIME PUBLICATION ────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'trips','jamaah','jamaah_docs','packages',
    'package_calculations','notes','pdf_templates','pdf_layout_presets','payments'
  ]) loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ============================================================================
-- DONE ✅
-- Verifikasi cepat:
--   select tablename from pg_tables where schemaname='public' order by 1;
--   select id from storage.buckets order by 1;
--   select count(*) from pg_policies where schemaname='public';
-- ============================================================================
