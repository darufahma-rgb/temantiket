-- ============================================================================
-- Migration: Enable Supabase Realtime untuk tabel misi
-- ============================================================================
-- Diperlukan agar notifikasi real-time di AgentMissionWidget & AgentProfile
-- bisa bekerja (postgres_changes subscription).
--
-- Cara pakai: Supabase Dashboard → SQL Editor → paste → RUN.
-- Idempotent — aman dijalankan lebih dari sekali.
-- ============================================================================

do $$
begin
  -- daily_missions
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_missions'
  ) then
    execute 'alter publication supabase_realtime add table public.daily_missions';
  end if;

  -- mission_submissions
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mission_submissions'
  ) then
    execute 'alter publication supabase_realtime add table public.mission_submissions';
  end if;

  -- mission_templates (opsional — biar admin juga dapat live update)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mission_templates'
  ) then
    execute 'alter publication supabase_realtime add table public.mission_templates';
  end if;
end $$;
