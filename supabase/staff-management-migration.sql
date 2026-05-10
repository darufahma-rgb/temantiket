-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Manajemen Staff — Tabel Pendukung
-- Jalankan di Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
--
-- Script ini idempotent — aman dijalankan ulang berkali-kali.
--
-- Tabel yang dibuat:
--   1. staff_tasks           — tugas yang diberikan owner ke staff
--   2. staff_internal_notes  — catatan internal owner tentang staff (private)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabel staff_tasks ─────────────────────────────────────────────────────
create table if not exists public.staff_tasks (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  assigned_to  uuid not null references auth.users(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text,
  priority     text not null default 'normal'
               check (priority in ('rendah', 'normal', 'tinggi', 'urgent')),
  status       text not null default 'pending'
               check (status in ('pending', 'diproses', 'menunggu_customer', 'revisi', 'selesai', 'bermasalah')),
  due_date     timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indeks untuk query per agency
create index if not exists idx_staff_tasks_agency_id    on public.staff_tasks(agency_id);
create index if not exists idx_staff_tasks_assigned_to  on public.staff_tasks(assigned_to);
create index if not exists idx_staff_tasks_status       on public.staff_tasks(status);

-- RLS
alter table public.staff_tasks enable row level security;

drop policy if exists "staff_tasks_owner_all" on public.staff_tasks;
drop policy if exists "staff_tasks_staff_read" on public.staff_tasks;
drop policy if exists "staff_tasks_staff_update" on public.staff_tasks;

-- Owner: full access ke semua task di agency-nya
create policy "staff_tasks_owner_all" on public.staff_tasks
  for all
  using (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = staff_tasks.agency_id
        and am.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = staff_tasks.agency_id
        and am.role = 'owner'
    )
  );

-- Staff: bisa baca task yang di-assign ke mereka
create policy "staff_tasks_staff_read" on public.staff_tasks
  for select
  using (assigned_to = auth.uid());

-- Staff: bisa update status task mereka sendiri
create policy "staff_tasks_staff_update" on public.staff_tasks
  for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());


-- ── 2. Tabel staff_internal_notes ─────────────────────────────────────────────
create table if not exists public.staff_internal_notes (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  target_user_id   uuid not null references auth.users(id) on delete cascade,
  author_id        uuid not null references auth.users(id) on delete cascade,
  content          text not null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_staff_notes_agency_id      on public.staff_internal_notes(agency_id);
create index if not exists idx_staff_notes_target_user_id on public.staff_internal_notes(target_user_id);

alter table public.staff_internal_notes enable row level security;

drop policy if exists "staff_notes_owner_all" on public.staff_internal_notes;

-- Owner only: full access (catatan bersifat private, tidak terlihat staff)
create policy "staff_notes_owner_all" on public.staff_internal_notes
  for all
  using (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = staff_internal_notes.agency_id
        and am.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = staff_internal_notes.agency_id
        and am.role = 'owner'
    )
  );


-- ── 3. Verifikasi (jalankan terpisah untuk mengecek) ──────────────────────────
-- select table_name from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('staff_tasks', 'staff_internal_notes');
--
-- select policyname, tablename, cmd
--   from pg_policies
--   where tablename in ('staff_tasks', 'staff_internal_notes');
