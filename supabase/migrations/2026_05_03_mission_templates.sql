-- ============================================================================
-- Migration: Mission Template Library (Fase 13)
-- ============================================================================
-- Tabel mission_templates: admin simpan template misi reusable.
-- Idempotent — pakai `if not exists`, `or replace`.
-- Cara pakai: Supabase Dashboard → SQL Editor → paste → RUN.
-- ============================================================================

create table if not exists public.mission_templates (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  default_points  int  not null default 10 check (default_points > 0),
  use_count       int  not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists mission_templates_agency_idx
  on public.mission_templates(agency_id, created_at desc);

alter table public.mission_templates enable row level security;

drop policy if exists "tmpl_select_member"  on public.mission_templates;
drop policy if exists "tmpl_insert_owner"   on public.mission_templates;
drop policy if exists "tmpl_update_owner"   on public.mission_templates;
drop policy if exists "tmpl_delete_owner"   on public.mission_templates;

create policy "tmpl_select_member" on public.mission_templates
  for select using (public.is_member(agency_id));

create policy "tmpl_insert_owner" on public.mission_templates
  for insert with check (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = mission_templates.agency_id
        and role = 'owner'
    )
  );

create policy "tmpl_update_owner" on public.mission_templates
  for update using (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = mission_templates.agency_id
        and role = 'owner'
    )
  );

create policy "tmpl_delete_owner" on public.mission_templates
  for delete using (
    exists (
      select 1 from public.agency_members
      where user_id = auth.uid()
        and agency_id = mission_templates.agency_id
        and role = 'owner'
    )
  );
