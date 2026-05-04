-- ============================================================================
-- Temantiket — FULL Supabase Setup (single-file, copy-paste sekali jalan)
-- ============================================================================
-- Idempotent: aman dijalankan ulang berkali-kali.
-- Cakup: schema multi-tenant, RLS, helper functions, profiles mirror,
--        storage buckets, storage policies, realtime publications,
--        owner safety-net policies, DELETE policy reset.
--
-- CARA PAKAI:
--   1) Buka Supabase Dashboard → SQL Editor → New query.
--   2) Paste SELURUH isi file ini → klik Run.
--   3) Tunggu sukses (5–10 detik).
--   4) Lanjut deploy 4 Edge Functions (lihat supabase/functions/README.md):
--        supabase functions deploy bootstrap     --no-verify-jwt
--        supabase functions deploy invite-member
--        supabase functions deploy remove-member
--        supabase functions deploy ocr-passport
--   5) Set OPENAI_API_KEY di Supabase Functions → Secrets (utk OCR paspor).
--   6) Buka https://<your-domain>/bootstrap → bikin owner pertama.
-- ============================================================================

-- ─── PART 1: Schema utama, RLS, profiles, storage, realtime ────────────────
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
    'package_calculations','notes','pdf_templates','pdf_layout_presets'
  ]) loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ============================================================================
-- DONE. Lanjut: deploy Edge Functions, lalu /bootstrap di app.
-- ============================================================================

-- ─── PART 2: Agency members owner safety-net policies ─────────────────────
-- Tambah RLS policy untuk INSERT & DELETE pada tabel agency_members.
--
-- Konteks: schema awal sengaja ngebatesin invite-member lewat Edge Function
-- (service_role bypass RLS). Tapi kalau Edge Function gak ke-deploy /
-- SUPABASE_SERVICE_ROLE_KEY belum di-set di Functions secrets, alur invite
-- bisa stuck mid-process. Policy ini jadi safety net: owner BOLEH insert
-- staff baru ke agency-nya sendiri, dan BOLEH delete non-owner member.
--
-- Aman karena:
--  1. Helper public.is_owner(agency_id) sudah cek caller adalah owner di
--     agency tsb (baca `auth.uid()` + agency_members).
--  2. WITH CHECK memastikan row baru cuma boleh untuk agency caller.
--  3. Owner gak bisa demote/hapus owner lain (kondisi role <> 'owner').
--
-- Idempoten: pakai `if not exists` pattern lewat DO block supaya aman
-- dijalankan ulang.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agency_members'
      and policyname = 'members_insert_owner'
  ) then
    create policy "members_insert_owner" on public.agency_members
      for insert
      with check (public.is_owner(agency_id) and role in ('owner','staff'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agency_members'
      and policyname = 'members_delete_owner'
  ) then
    create policy "members_delete_owner" on public.agency_members
      for delete
      using (public.is_owner(agency_id) and role <> 'owner');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agency_members'
      and policyname = 'members_update_owner'
  ) then
    create policy "members_update_owner" on public.agency_members
      for update
      using (public.is_owner(agency_id))
      with check (public.is_owner(agency_id));
  end if;
end $$;

-- ─── PART 3: Reset DELETE policies (defensive) ────────────────────────────
-- Reset DELETE policies untuk tabel utama (packages, trips, jamaah, jamaah_docs).
--
-- Konteks: laporan user di tanggal 2026-04-25 — UI optimistic delete jalan,
-- tapi data muncul lagi pas refresh. Diagnosis: DELETE silently di-blok oleh
-- RLS (supabase-js gak ngelempar error kalau RLS nge-blok DELETE; cuma return
-- 0 rows). Klien udah dipatch buat verifikasi rows dgn `.select()` chained
-- setelah `.delete()`, dan sekarang ngelempar error eksplisit kalau 0 rows
-- ke-delete. Tapi kalau policy emang missing/rusak, DELETE tetep gak bakal
-- jalan — script ini drop & re-create policy DELETE supaya yakin konsisten.
--
-- Aman dijalanin berkali-kali (idempoten via DROP IF EXISTS).
--
-- Cara pakai:
--   1. Buka Supabase Dashboard → SQL Editor.
--   2. Copy-paste script ini, RUN.
--   3. Coba hapus paket lagi di app — harusnya beneran ke-hapus + gak balik
--      pas refresh.

-- Pastikan helper `public.is_member(uuid)` ada (dibuat di IGH_FULL_SETUP.sql).
-- Kalau gak ada, jalanin IGH_FULL_SETUP.sql dulu.

do $$
declare
  t text;
begin
  -- Tabel-tabel scoped per agency yang punya kolom agency_id + harus bisa
  -- di-DELETE oleh member agency tsb.
  foreach t in array array[
    'packages',
    'trips',
    'jamaah',
    'jamaah_docs',
    'payments'  -- tambahin kalau ada di schema kamu; kalau gak ada, baris di-skip
  ]
  loop
    -- Skip table yg gak ada (misal: payments belum dibuat di project ini).
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      raise notice 'skip: tabel public.% tidak ada', t;
      continue;
    end if;

    -- Pastikan RLS aktif (defensive — biasanya udah on dari schema awal).
    execute format('alter table public.%I enable row level security', t);

    -- Drop policy DELETE lama (kalau ada) — naming convention dari schema.sql.
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);

    -- Re-create policy DELETE: izinkan member agency yg ngedelete.
    execute format(
      'create policy "%s_delete" on public.%I for delete using (public.is_member(agency_id))',
      t, t
    );

    raise notice 'policy DELETE dibuat ulang utk public.%', t;
  end loop;
end $$;

-- Verifikasi — list semua policy DELETE yg sekarang aktif:
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual as using_expression
from pg_policies
where schemaname = 'public'
  and cmd = 'DELETE'
  and tablename in ('packages','trips','jamaah','jamaah_docs','payments')
order by tablename;

-- ============================================================================
-- DONE. Lanjut: deploy 4 Edge Functions + set OPENAI_API_KEY + /bootstrap
-- ============================================================================
