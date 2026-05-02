-- ============================================================================
-- Migration: client_documents table (Document Vault per klien)
-- ============================================================================
-- Tujuan: simpan dokumen penting klien (Paspor, Visa, Tiket, Lainnya)
--         langsung di DB sebagai data_url (sama pola dgn jamaah_docs).
-- Idempotent — aman dijalankan ulang.
-- Cara pakai: Supabase Dashboard → SQL Editor → paste → RUN.
-- ============================================================================

create table if not exists public.client_documents (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  client_id   uuid not null references public.clients(id)  on delete cascade,
  category    text not null default 'lainnya'
              check (category in ('paspor', 'visa', 'tiket', 'lainnya')),
  label       text not null default '',
  file_name   text not null default '',
  file_type   text not null default 'image',
  data_url    text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists client_docs_client_idx  on public.client_documents(client_id);
create index if not exists client_docs_agency_idx  on public.client_documents(agency_id);
create index if not exists client_docs_category_idx on public.client_documents(agency_id, category);

alter table public.client_documents enable row level security;

drop policy if exists "client_docs_select" on public.client_documents;
drop policy if exists "client_docs_insert" on public.client_documents;
drop policy if exists "client_docs_delete" on public.client_documents;

create policy "client_docs_select" on public.client_documents
  for select using (public.is_member(agency_id));
create policy "client_docs_insert" on public.client_documents
  for insert with check (public.is_member(agency_id));
create policy "client_docs_delete" on public.client_documents
  for delete using (public.is_member(agency_id));

-- Realtime (opsional — biar vault langsung update di tab lain)
do $$
begin
  execute 'alter publication supabase_realtime add table public.client_documents';
exception when duplicate_object then null;
end$$;

-- ============================================================================
-- DONE. Verifikasi:
--   select * from public.client_documents limit 5;
-- ============================================================================
