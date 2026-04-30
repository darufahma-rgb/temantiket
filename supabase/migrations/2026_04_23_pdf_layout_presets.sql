-- ============================================================================
-- Migration: pdf_layout_presets table (Tuner presets, multi-tenant + RLS)
-- ============================================================================
-- Aman dijalankan ulang. Jalankan di Supabase SQL Editor.

create table if not exists public.pdf_layout_presets (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pdf_layout_presets_agency_idx on public.pdf_layout_presets(agency_id);

alter table public.pdf_layout_presets enable row level security;

-- Drop policy lama (idempotent)
do $$
declare pname text;
begin
  for pname in select policyname from pg_policies
   where schemaname='public' and tablename='pdf_layout_presets' loop
    execute format('drop policy if exists %I on public.pdf_layout_presets', pname);
  end loop;
end$$;

create policy "pdf_layout_presets_select" on public.pdf_layout_presets
  for select using (public.is_member(agency_id));
create policy "pdf_layout_presets_insert" on public.pdf_layout_presets
  for insert with check (public.is_member(agency_id));
create policy "pdf_layout_presets_update" on public.pdf_layout_presets
  for update using (public.is_member(agency_id))
            with check (public.is_member(agency_id));
create policy "pdf_layout_presets_delete" on public.pdf_layout_presets
  for delete using (public.is_member(agency_id));

-- Realtime
do $$
begin
  execute 'alter publication supabase_realtime add table public.pdf_layout_presets';
exception when duplicate_object then null;
end$$;
