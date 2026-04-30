-- Tambahin kolom payment_status di tabel jamaah biar admin bisa tracking
-- pembayaran tiap jamaah dari halaman detail paket.
--
-- 3 status yg dipake (sengaja di-enforce via CHECK supaya konsisten dgn UI):
--   'Belum Lunas' (default — belum ada DP masuk)
--   'DP'          (down-payment udah, sisa belum)
--   'Lunas'       (full paid)
--
-- Cara apply:
-- 1) Buka Supabase dashboard → SQL Editor
-- 2) Paste isi file ini, run.
-- 3) Refresh app — badge status pembayaran langsung muncul di kartu jamaah.

alter table public.jamaah
  add column if not exists payment_status text not null default 'Belum Lunas';

-- CHECK constraint dipisah supaya idempoten kalau migration di-rerun.
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

-- Index ringan utk filtering (mis. "show me semua jamaah yg belum lunas").
create index if not exists jamaah_payment_status_idx on public.jamaah(payment_status);
