-- ============================================================
-- payment-status-migration.sql
-- Run ONCE in Supabase SQL Editor.
-- Adds payment_status + paid_amount to the orders table.
-- ============================================================

-- 1. Add columns (idempotent via IF NOT EXISTS equivalents)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'DP', 'PAID', 'REFUNDED')),
  ADD COLUMN IF NOT EXISTS paid_amount     NUMERIC(18,2) NOT NULL DEFAULT 0;

-- 2. Back-fill: orders already at status Paid/Completed → mark as PAID
--    and set paid_amount = total_price so the numbers are consistent.
UPDATE public.orders
SET
  payment_status = 'PAID',
  paid_amount    = total_price
WHERE
  status IN ('Paid', 'Completed')
  AND payment_status = 'UNPAID';   -- only touch rows not yet migrated

-- 3. Index for fast piutang queries
CREATE INDEX IF NOT EXISTS orders_payment_status_idx
  ON public.orders (payment_status);

-- 4. Verify
SELECT
  payment_status,
  COUNT(*)                               AS orders,
  SUM(total_price)                       AS total_price,
  SUM(paid_amount)                       AS total_paid,
  SUM(total_price - paid_amount)         AS total_receivable
FROM public.orders
WHERE status != 'Cancelled'
GROUP BY payment_status
ORDER BY payment_status;
