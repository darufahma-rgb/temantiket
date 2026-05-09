-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Perluas CHECK constraint type di agent_wallet_transactions
-- Jalankan di Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
--
-- Masalah: CHECK constraint awal hanya mengizinkan:
--   ('mission_conversion','order_bonus','payout','adjustment')
-- Tapi kode menggunakan tambahan jenis:
--   'voa_agent_fee' — fee agent lapangan VOA di bandara
--   'kurir_fee'     — fee kurir setoran uang
--   'pelaksana_fee' — fee pelaksana visa pelajar (staff)
--   'mission_fee'   — fee misi agen
-- Akibatnya INSERT/UPSERT gagal dengan PostgreSQL CHECK constraint violation.
-- ─────────────────────────────────────────────────────────────────────────────

-- Hapus constraint lama (nama di-generate otomatis oleh Postgres saat CREATE TABLE)
alter table public.agent_wallet_transactions
  drop constraint if exists agent_wallet_transactions_type_check;

-- Tambah constraint baru yang mencakup semua jenis transaksi wallet
alter table public.agent_wallet_transactions
  add constraint agent_wallet_transactions_type_check
  check (type in (
    'mission_conversion',
    'mission_fee',
    'order_bonus',
    'pelaksana_fee',
    'voa_agent_fee',
    'kurir_fee',
    'payout',
    'adjustment'
  ));

-- Verifikasi (opsional — jalankan untuk memastikan constraint aktif):
-- select constraint_name, check_clause
--   from information_schema.check_constraints
--   where constraint_name like '%wallet_transactions%';
