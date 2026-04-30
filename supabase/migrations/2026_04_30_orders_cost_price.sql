-- ============================================================================
-- Migration: orders.cost_price (Harga Modal) for profit tracking
-- ============================================================================
-- Tujuan:
--   * Tambah kolom `cost_price numeric` ke tabel `orders` — ini "harga modal"
--     (apa yang agency bayar ke supplier). Kombinasi dgn `total_price` (harga
--     jual ke klien) dipake utk hitung profit di Laporan Keuangan.
--   * Default 0 supaya re-run aman & data lama tidak pecah.
--   * Idempotent: pakai `if not exists`.
--
-- Cara pakai:
--   1. Buka Supabase Dashboard → SQL Editor.
--   2. Paste isi file ini, RUN.
-- ============================================================================

alter table public.orders
  add column if not exists cost_price numeric not null default 0;

-- Index buat aggregation di Reports page (opsional, ringan).
create index if not exists orders_cost_price_idx on public.orders(agency_id, type);

-- ============================================================================
-- DONE. Verifikasi:
--   select id, type, total_price, cost_price, (total_price - cost_price) as profit
--   from public.orders
--   limit 10;
-- ============================================================================
