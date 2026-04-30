-- ============================================================================
-- TEMANTIKET — DELTA Migration
-- ============================================================================
-- File ini ngebenerin 3 hal yang ke-skip di TEMANTIKET_SETUP.sql awal:
--   1. Kolom `payment_status` di tabel jamaah (badge status di kartu jamaah)
--   2. Kolom `return_date` di tabel packages (tanggal pulang paket)
--   3. Tabel `payments` + storage bucket `payment-proofs` (riwayat pembayaran
--      jamaah). Tabel ini dulu dibuat manual di Supabase lama, gak pernah
--      masuk repo, jadi project baru perlu di-create eksplisit.
--
-- AMAN dijalankan ulang (semua statement idempoten).
--
-- Cara pakai:
--   1) Supabase Dashboard → SQL Editor → New Query
--   2) Paste seluruh isi file ini → Run
--   3) Refresh app — error "Could not find the table 'public.payments'"
--      langsung ilang.
-- ============================================================================

-- ── 1. jamaah.payment_status ────────────────────────────────────────────────
alter table public.jamaah
  add column if not exists payment_status text not null default 'Belum Lunas';

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


-- ── 2. packages.return_date ─────────────────────────────────────────────────
alter table public.packages
  add column if not exists return_date text;


-- ── 3. payments table ───────────────────────────────────────────────────────
create table if not exists public.payments (
  id          text primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  jamaah_id   uuid not null references public.jamaah(id)   on delete cascade,
  trip_id     uuid          references public.trips(id)    on delete set null,
  type        text not null default 'other'
              check (type in ('dp','installment','final','refund','other')),
  amount      numeric not null default 0,
  method      text not null default '',
  paid_at     timestamptz not null default now(),
  notes       text not null default '',
  proof_url   text,
  created_at  timestamptz not null default now()
);

create index if not exists payments_agency_idx  on public.payments(agency_id);
create index if not exists payments_jamaah_idx  on public.payments(jamaah_id);
create index if not exists payments_trip_idx    on public.payments(trip_id);
create index if not exists payments_paid_at_idx on public.payments(paid_at desc);

alter table public.payments enable row level security;

-- Drop dulu biar idempoten
drop policy if exists "payments_select" on public.payments;
drop policy if exists "payments_insert" on public.payments;
drop policy if exists "payments_update" on public.payments;
drop policy if exists "payments_delete" on public.payments;

create policy "payments_select" on public.payments
  for select using (public.is_member(agency_id));

create policy "payments_insert" on public.payments
  for insert with check (public.is_member(agency_id));

create policy "payments_update" on public.payments
  for update using (public.is_member(agency_id))
              with check (public.is_member(agency_id));

create policy "payments_delete" on public.payments
  for delete using (public.is_member(agency_id));

-- Realtime publication
do $$
begin
  begin
    alter publication supabase_realtime add table public.payments;
  exception when duplicate_object then null;
  end;
end$$;


-- ── 4. payment-proofs storage bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Storage policies: cuma member agency yang bisa akses file dgn prefix
-- {agency_id}/... (path convention dari paymentsRepo.uploadPaymentProof).
drop policy if exists "payment_proofs_select" on storage.objects;
drop policy if exists "payment_proofs_insert" on storage.objects;
drop policy if exists "payment_proofs_update" on storage.objects;
drop policy if exists "payment_proofs_delete" on storage.objects;

create policy "payment_proofs_select" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "payment_proofs_insert" on storage.objects
  for insert with check (
    bucket_id = 'payment-proofs'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "payment_proofs_update" on storage.objects
  for update using (
    bucket_id = 'payment-proofs'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id = 'payment-proofs'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "payment_proofs_delete" on storage.objects
  for delete using (
    bucket_id = 'payment-proofs'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================================
-- DONE. Refresh app, error payment-alerts harusnya udah ilang.
-- ============================================================================
