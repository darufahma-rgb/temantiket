-- ═════════════════════════════════════════════════════════════════════════════
-- Fix: agent_wallet_transactions — tabel + CHECK constraint + RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
-- Jalankan di Supabase SQL Editor (dashboard.supabase.com → SQL Editor → New query)
--
-- Masalah yang diselesaikan:
--   1. Tabel belum ada (jika migration cloud_sync_tables belum dijalankan)
--   2. CHECK constraint type hanya mengizinkan 4 nilai lama, bukan voa_agent_fee
--      / pelaksana_fee / kurir_fee → INSERT/UPSERT dari backfill gagal dengan
--      "violates check constraint agent_wallet_transactions_type_check"
--   3. RLS INSERT/UPDATE hanya untuk owner → perlu tambah UPDATE policy
--      agar service-role UPSERT bekerja benar
--
-- Idempotent — aman dijalankan ulang berkali-kali.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Pastikan tabel agent_wallet_transactions ada ───────────────────────────
create table if not exists public.agent_wallet_transactions (
  id           text         primary key,
  agency_id    uuid         not null references public.agencies(id) on delete cascade,
  agent_id     text         not null,
  type         text         not null,
  points_delta numeric      not null default 0,
  amount_idr   numeric      not null default 0,
  description  text         not null default '',
  created_by   text,
  created_at   timestamptz  not null default now()
);

create index if not exists wallet_txs_agent_idx
  on public.agent_wallet_transactions(agency_id, agent_id, created_at desc);

-- ── 2. Enable RLS ─────────────────────────────────────────────────────────────
alter table public.agent_wallet_transactions enable row level security;

-- ── 3. RLS policies — bersih (drop + recreate) ───────────────────────────────
drop policy if exists "wallet_txs_select"  on public.agent_wallet_transactions;
drop policy if exists "wallet_txs_insert"  on public.agent_wallet_transactions;
drop policy if exists "wallet_txs_update"  on public.agent_wallet_transactions;
drop policy if exists "wallet_txs_upsert"  on public.agent_wallet_transactions;
drop policy if exists "wallet_txs_delete"  on public.agent_wallet_transactions;

-- Semua member agency bisa SELECT wallet mereka (untuk tampilkan di profil)
create policy "wallet_txs_select"
  on public.agent_wallet_transactions
  for select
  using (public.is_member(agency_id));

-- Hanya owner yang bisa INSERT (service-role bypass RLS anyway)
create policy "wallet_txs_insert"
  on public.agent_wallet_transactions
  for insert
  with check (public.is_owner(agency_id));

-- Hanya owner yang bisa UPDATE (diperlukan untuk UPSERT onConflict=id)
create policy "wallet_txs_update"
  on public.agent_wallet_transactions
  for update
  using (public.is_owner(agency_id));

-- Hanya owner yang bisa DELETE
create policy "wallet_txs_delete"
  on public.agent_wallet_transactions
  for delete
  using (public.is_owner(agency_id));

-- ── 4. Perluas CHECK constraint type ──────────────────────────────────────────
-- Constraint lama hanya mengizinkan 4 nilai. Constraint baru mencakup semua
-- jenis yang digunakan di kode aplikasi.
alter table public.agent_wallet_transactions
  drop constraint if exists agent_wallet_transactions_type_check;

alter table public.agent_wallet_transactions
  add constraint agent_wallet_transactions_type_check
  check (type in (
    'mission_conversion',   -- konversi poin misi → IDR
    'mission_fee',          -- fee dari penyelesaian misi
    'order_bonus',          -- bonus komisi dari order sales
    'pelaksana_fee',        -- fee pelaksana visa pelajar / visa executor
    'voa_agent_fee',        -- fee agent lapangan VOA / field agent / operational agent
    'kurir_fee',            -- fee kurir setoran uang
    'payout',               -- pencairan ke agent
    'adjustment'            -- koreksi manual
  ));

-- ── 5. Verifikasi ─────────────────────────────────────────────────────────────
-- Jalankan query ini untuk memastikan constraint aktif:
select constraint_name, check_clause
  from information_schema.check_constraints
  where constraint_name like '%wallet_transactions%';

-- Jalankan ini untuk melihat isi tabel:
-- select id, agent_id, type, amount_idr, description, created_at
--   from public.agent_wallet_transactions
--   order by created_at desc
--   limit 20;
