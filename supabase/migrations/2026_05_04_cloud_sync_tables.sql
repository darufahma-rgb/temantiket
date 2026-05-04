-- ============================================================
-- Cloud Sync Tables — Fase Migrasi localStorage → Supabase
-- Covers: admin settings, product commissions, appearance,
--         agent phones, ticket markup, rates config,
--         agent fee payments, agent wallet transactions.
-- ============================================================

-- ── 1. agency_settings ──────────────────────────────────────
-- Key-value store per agency (replaces various localStorage keys).
-- Keys in use:
--   'admin_settings'       → { adminWhatsapp, adminInstagram }
--   'product_commissions'  → { umrah, haji, tiket_pesawat, visa, paket }
--   'ticket_markup'        → number (IDR markup flat)
--   'rates_config'         → { mode, markupPct, manualRates }
--   'agent_phones'         → { [agentId]: phone }

create table if not exists public.agency_settings (
  agency_id   uuid        not null references public.agencies(id) on delete cascade,
  key         text        not null,
  value       jsonb       not null default 'null'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (agency_id, key)
);

alter table public.agency_settings enable row level security;

drop policy if exists "agency_settings_select" on public.agency_settings;
drop policy if exists "agency_settings_insert" on public.agency_settings;
drop policy if exists "agency_settings_update" on public.agency_settings;
drop policy if exists "agency_settings_delete" on public.agency_settings;

create policy "agency_settings_select" on public.agency_settings
  for select using (public.is_member(agency_id));

create policy "agency_settings_insert" on public.agency_settings
  for insert with check (public.is_member(agency_id));

create policy "agency_settings_update" on public.agency_settings
  for update using (public.is_member(agency_id))
             with check (public.is_member(agency_id));

create policy "agency_settings_delete" on public.agency_settings
  for delete using (public.is_owner(agency_id));

create or replace function public.touch_agency_settings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists agency_settings_touch_updated_at on public.agency_settings;
create trigger agency_settings_touch_updated_at
  before update on public.agency_settings
  for each row execute function public.touch_agency_settings_updated_at();

-- ── 2. user_settings ────────────────────────────────────────
-- Per-user key-value (replaces per-user localStorage keys).
-- Keys in use:
--   'appearance' → { theme, fontSize, compactMode }

create table if not exists public.user_settings (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  key         text        not null,
  value       jsonb       not null default 'null'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select" on public.user_settings;
drop policy if exists "user_settings_insert" on public.user_settings;
drop policy if exists "user_settings_update" on public.user_settings;

create policy "user_settings_select" on public.user_settings
  for select using (user_id = auth.uid());

create policy "user_settings_insert" on public.user_settings
  for insert with check (user_id = auth.uid());

create policy "user_settings_update" on public.user_settings
  for update using (user_id = auth.uid())
             with check (user_id = auth.uid());

create or replace function public.touch_user_settings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_user_settings_updated_at();

-- ── 3. agent_fee_payments ───────────────────────────────────
-- Riwayat pembayaran fee komisi agen (replaces igh:fee-payments).

create table if not exists public.agent_fee_payments (
  id          text        primary key,
  agency_id   uuid        not null references public.agencies(id) on delete cascade,
  agent_id    text        not null,
  amount      numeric     not null,
  paid_at     timestamptz not null,
  note        text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists agent_fee_payments_agency_idx
  on public.agent_fee_payments(agency_id, paid_at desc);

create index if not exists agent_fee_payments_agent_idx
  on public.agent_fee_payments(agency_id, agent_id, paid_at desc);

alter table public.agent_fee_payments enable row level security;

drop policy if exists "fee_payments_select" on public.agent_fee_payments;
drop policy if exists "fee_payments_insert" on public.agent_fee_payments;
drop policy if exists "fee_payments_delete" on public.agent_fee_payments;

create policy "fee_payments_select" on public.agent_fee_payments
  for select using (public.is_member(agency_id));

create policy "fee_payments_insert" on public.agent_fee_payments
  for insert with check (public.is_owner(agency_id));

create policy "fee_payments_delete" on public.agent_fee_payments
  for delete using (public.is_owner(agency_id));

-- ── 4. agent_wallet_transactions ─────────────────────────────
-- Wallet transaksi komisi agen (replaces igh.agent_wallet.v2.*).

create table if not exists public.agent_wallet_transactions (
  id           text    primary key,
  agency_id    uuid    not null references public.agencies(id) on delete cascade,
  agent_id     text    not null,
  type         text    not null check (type in ('mission_conversion','order_bonus','payout','adjustment')),
  points_delta numeric not null default 0,
  amount_idr   numeric not null default 0,
  description  text    not null default '',
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists wallet_txs_agent_idx
  on public.agent_wallet_transactions(agency_id, agent_id, created_at desc);

alter table public.agent_wallet_transactions enable row level security;

drop policy if exists "wallet_txs_select" on public.agent_wallet_transactions;
drop policy if exists "wallet_txs_insert" on public.agent_wallet_transactions;
drop policy if exists "wallet_txs_delete" on public.agent_wallet_transactions;

create policy "wallet_txs_select" on public.agent_wallet_transactions
  for select using (public.is_member(agency_id));

create policy "wallet_txs_insert" on public.agent_wallet_transactions
  for insert with check (public.is_owner(agency_id));

create policy "wallet_txs_delete" on public.agent_wallet_transactions
  for delete using (public.is_owner(agency_id));
