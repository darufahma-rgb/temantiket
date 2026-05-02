-- ============================================================================
-- Migration: Daily Mission System (Gamification Fase 12)
-- ============================================================================
-- Tabel:
--   daily_missions      — admin buat misi harian
--   mission_submissions — agent submit bukti + status validasi
--
-- Setelah apply SQL ini, buat Storage Bucket bernama 'mission-proofs'
-- di Supabase Dashboard → Storage → New bucket (public: true).
--
-- Idempotent — pakai `if not exists`, `or replace`, `if exists`.
-- Cara pakai: Supabase Dashboard → SQL Editor → paste → RUN.
-- ============================================================================

-- ── 1. daily_missions ────────────────────────────────────────────────────────
create table if not exists public.daily_missions (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  reward_points   int  not null default 10 check (reward_points > 0),
  deadline        timestamptz not null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists daily_missions_agency_deadline_idx
  on public.daily_missions(agency_id, deadline desc);

alter table public.daily_missions enable row level security;

drop policy if exists "missions_select_member"  on public.daily_missions;
drop policy if exists "missions_insert_owner"   on public.daily_missions;
drop policy if exists "missions_update_owner"   on public.daily_missions;
drop policy if exists "missions_delete_owner"   on public.daily_missions;

-- Members dapat membaca misi agensinya
create policy "missions_select_member" on public.daily_missions
  for select using (public.is_member(agency_id));

-- Hanya owner yg boleh buat/edit/hapus misi
create policy "missions_insert_owner" on public.daily_missions
  for insert with check (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = daily_missions.agency_id
        and role = 'owner'
    )
  );

create policy "missions_update_owner" on public.daily_missions
  for update using (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = daily_missions.agency_id
        and role = 'owner'
    )
  );

create policy "missions_delete_owner" on public.daily_missions
  for delete using (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = daily_missions.agency_id
        and role = 'owner'
    )
  );

-- ── 2. mission_submissions ────────────────────────────────────────────────────
create table if not exists public.mission_submissions (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  mission_id      uuid not null references public.daily_missions(id) on delete cascade,
  agent_id        uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  proof_image_url text,
  notes           text,
  reward_points   int  not null default 0,
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users(id) on delete set null,
  unique(mission_id, agent_id)
);

create index if not exists mission_submissions_agency_idx
  on public.mission_submissions(agency_id, submitted_at desc);
create index if not exists mission_submissions_agent_idx
  on public.mission_submissions(agency_id, agent_id);
create index if not exists mission_submissions_mission_idx
  on public.mission_submissions(mission_id);

alter table public.mission_submissions enable row level security;

drop policy if exists "msub_select_member"  on public.mission_submissions;
drop policy if exists "msub_insert_agent"   on public.mission_submissions;
drop policy if exists "msub_update_agent"   on public.mission_submissions;
drop policy if exists "msub_update_owner"   on public.mission_submissions;

-- Semua member bisa lihat submission (utk transparansi leaderboard)
create policy "msub_select_member" on public.mission_submissions
  for select using (public.is_member(agency_id));

-- Agent insert untuk dirinya sendiri
create policy "msub_insert_agent" on public.mission_submissions
  for insert with check (
    auth.uid() = agent_id
    and public.is_member(agency_id)
  );

-- Agent update proof/notes submission miliknya (selama masih pending)
create policy "msub_update_agent" on public.mission_submissions
  for update using (
    auth.uid() = agent_id
    and status = 'pending'
  );

-- Owner boleh update status (approve/reject) + reviewed_by/reviewed_at
create policy "msub_update_owner" on public.mission_submissions
  for update using (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = mission_submissions.agency_id
        and role = 'owner'
    )
  );
