-- Add return_date column to packages table for "Tanggal Pulang" feature.
-- Existing rows keep NULL; UI computes duration from departure_date when both set.
alter table public.packages
  add column if not exists return_date text;
