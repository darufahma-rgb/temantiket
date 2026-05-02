-- Fase 19.2: Deep Data Extraction — extended flight info columns
-- Run this in Supabase SQL Editor

ALTER TABLE ticket_prices
  ADD COLUMN IF NOT EXISTS flight_number    TEXT,
  ADD COLUMN IF NOT EXISTS etd              TEXT,
  ADD COLUMN IF NOT EXISTS eta              TEXT,
  ADD COLUMN IF NOT EXISTS terminal         TEXT,
  ADD COLUMN IF NOT EXISTS transit_code     TEXT,
  ADD COLUMN IF NOT EXISTS transit_city     TEXT,
  ADD COLUMN IF NOT EXISTS transit_duration TEXT;

COMMENT ON COLUMN ticket_prices.flight_number    IS 'Flight number e.g. QR818';
COMMENT ON COLUMN ticket_prices.etd              IS 'Departure time HH:MM (local)';
COMMENT ON COLUMN ticket_prices.eta              IS 'Arrival time HH:MM (local)';
COMMENT ON COLUMN ticket_prices.terminal         IS 'Departure terminal e.g. T3';
COMMENT ON COLUMN ticket_prices.transit_code     IS 'IATA 3-letter transit airport code';
COMMENT ON COLUMN ticket_prices.transit_city     IS 'Transit city name';
COMMENT ON COLUMN ticket_prices.transit_duration IS 'Layover duration e.g. 2h 30m';
