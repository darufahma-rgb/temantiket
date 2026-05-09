-- ============================================================================
-- Migration: Client-to-Client Referral System
-- ============================================================================
-- Perubahan:
--   1. Tambah kolom `referred_by_client_id` ke tabel `clients`
--   2. Trigger otomatis: saat order referee status → Confirmed/Paid/Completed,
--      referrer langsung dapat +1 referral_stamp
-- ============================================================================

-- 1. Kolom referrer (klien yang mengajak)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS referred_by_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clients.referred_by_client_id IS
  'ID klien yang mereferensikan klien ini. Saat order klien ini sukses, referrer dapat +1 referral_stamp otomatis via trigger.';

-- Index untuk lookup referrals milik satu referrer
CREATE INDEX IF NOT EXISTS idx_clients_referred_by
  ON public.clients(referred_by_client_id)
  WHERE referred_by_client_id IS NOT NULL;

-- ============================================================================
-- 2. Trigger function: award +1 referral_stamp ke referrer
--    Dipanggil setiap kali kolom `status` di orders berubah jadi sukses.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_referral_stamp_on_order_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  -- Hanya proses kalau status BARU adalah sukses dan status LAMA bukan sukses
  -- (supaya tidak double-count kalau status berubah antar Confirmed/Paid/Completed)
  IF NEW.status NOT IN ('Confirmed', 'Paid', 'Completed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('Confirmed', 'Paid', 'Completed') THEN
    RETURN NEW;
  END IF;

  -- Klien harus ada
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cari referrer dari klien pemilik order
  SELECT referred_by_client_id
    INTO v_referrer_id
    FROM public.clients
   WHERE id = NEW.client_id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Award +1 stamp ke referrer
  UPDATE public.clients
     SET referral_stamps = referral_stamps + 1,
         updated_at      = now()
   WHERE id = v_referrer_id;

  RETURN NEW;
END;
$$;

-- Pasang trigger ke tabel orders (UPDATE only — INSERT selalu Draft)
DROP TRIGGER IF EXISTS trg_referral_stamp_on_order_success ON public.orders;
CREATE TRIGGER trg_referral_stamp_on_order_success
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_stamp_on_order_success();

COMMENT ON FUNCTION public.handle_referral_stamp_on_order_success() IS
  'Trigger: saat order status berubah ke Confirmed/Paid/Completed untuk pertama kalinya, '
  'referrer klien (referred_by_client_id) mendapat +1 referral_stamp otomatis.';
