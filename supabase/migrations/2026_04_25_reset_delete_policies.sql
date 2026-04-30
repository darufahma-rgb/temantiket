-- Reset DELETE policies untuk tabel utama (packages, trips, jamaah, jamaah_docs).
--
-- Konteks: laporan user di tanggal 2026-04-25 — UI optimistic delete jalan,
-- tapi data muncul lagi pas refresh. Diagnosis: DELETE silently di-blok oleh
-- RLS (supabase-js gak ngelempar error kalau RLS nge-blok DELETE; cuma return
-- 0 rows). Klien udah dipatch buat verifikasi rows dgn `.select()` chained
-- setelah `.delete()`, dan sekarang ngelempar error eksplisit kalau 0 rows
-- ke-delete. Tapi kalau policy emang missing/rusak, DELETE tetep gak bakal
-- jalan — script ini drop & re-create policy DELETE supaya yakin konsisten.
--
-- Aman dijalanin berkali-kali (idempoten via DROP IF EXISTS).
--
-- Cara pakai:
--   1. Buka Supabase Dashboard → SQL Editor.
--   2. Copy-paste script ini, RUN.
--   3. Coba hapus paket lagi di app — harusnya beneran ke-hapus + gak balik
--      pas refresh.

-- Pastikan helper `public.is_member(uuid)` ada (dibuat di IGH_FULL_SETUP.sql).
-- Kalau gak ada, jalanin IGH_FULL_SETUP.sql dulu.

do $$
declare
  t text;
begin
  -- Tabel-tabel scoped per agency yang punya kolom agency_id + harus bisa
  -- di-DELETE oleh member agency tsb.
  foreach t in array array[
    'packages',
    'trips',
    'jamaah',
    'jamaah_docs',
    'payments'  -- tambahin kalau ada di schema kamu; kalau gak ada, baris di-skip
  ]
  loop
    -- Skip table yg gak ada (misal: payments belum dibuat di project ini).
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      raise notice 'skip: tabel public.% tidak ada', t;
      continue;
    end if;

    -- Pastikan RLS aktif (defensive — biasanya udah on dari schema awal).
    execute format('alter table public.%I enable row level security', t);

    -- Drop policy DELETE lama (kalau ada) — naming convention dari schema.sql.
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);

    -- Re-create policy DELETE: izinkan member agency yg ngedelete.
    execute format(
      'create policy "%s_delete" on public.%I for delete using (public.is_member(agency_id))',
      t, t
    );

    raise notice 'policy DELETE dibuat ulang utk public.%', t;
  end loop;
end $$;

-- Verifikasi — list semua policy DELETE yg sekarang aktif:
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual as using_expression
from pg_policies
where schemaname = 'public'
  and cmd = 'DELETE'
  and tablename in ('packages','trips','jamaah','jamaah_docs','payments')
order by tablename;
