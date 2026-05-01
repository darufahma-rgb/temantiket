-- ============================================================================
-- Migration: BC (Broadcast) Template Library
-- ============================================================================
-- Tujuan: nyimpen semua template pesan WA per kategori (Visa on Arrival,
-- Visa Pelajar, Tiket Pesawat, Umrah, Haji, Umum).
-- Variabel dinamis pakai format {{NAMA_KLIEN}} di body — UI bakal auto-detect
-- dan kasih form isian sebelum copy.
--
-- RLS: semua member (owner/staff/agent) bisa SELECT.
--      INSERT/UPDATE/DELETE: hanya non-agent (owner + staff).
-- Idempotent — aman di-run ulang.
-- ============================================================================

create table if not exists public.bc_templates (
  id           uuid primary key default uuid_generate_v4(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  title        text not null,
  category     text not null default 'general'
               check (category in (
                 'visa_on_arrival',
                 'visa_pelajar',
                 'tiket_pesawat',
                 'umrah',
                 'haji',
                 'general'
               )),
  body         text not null,
  sort_order   int  not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists bc_templates_agency_cat_idx
  on public.bc_templates(agency_id, category, sort_order);

alter table public.bc_templates enable row level security;

-- Semua member bisa baca template agency mereka.
drop policy if exists "bc_templates_select" on public.bc_templates;
create policy "bc_templates_select" on public.bc_templates
  for select using (public.is_member(agency_id));

-- Hanya non-agent (owner + staff) yg bisa insert.
drop policy if exists "bc_templates_insert" on public.bc_templates;
create policy "bc_templates_insert" on public.bc_templates
  for insert with check (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  );

-- Hanya non-agent yg bisa update.
drop policy if exists "bc_templates_update" on public.bc_templates;
create policy "bc_templates_update" on public.bc_templates
  for update using (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  ) with check (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  );

-- Hanya non-agent yg bisa delete.
drop policy if exists "bc_templates_delete" on public.bc_templates;
create policy "bc_templates_delete" on public.bc_templates
  for delete using (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  );

-- updated_at auto-update trigger
create or replace function public.set_bc_templates_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists tr_bc_templates_updated_at on public.bc_templates;
create trigger tr_bc_templates_updated_at
  before update on public.bc_templates
  for each row execute function public.set_bc_templates_updated_at();

-- ============================================================================
-- DONE.
--   select * from public.bc_templates order by category, sort_order;
-- ============================================================================
