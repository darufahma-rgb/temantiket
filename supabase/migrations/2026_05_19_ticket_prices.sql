-- ============================================================
-- Fase 19: AI Ticket Price List & Smart Margin Manager
-- Table: ticket_prices
-- ============================================================

create table if not exists public.ticket_prices (
  id            uuid          not null default gen_random_uuid() primary key,
  agency_id     uuid          not null references public.agencies(id) on delete cascade,
  airline       text          not null,
  airline_code  text,                        -- IATA 2-letter e.g. QR, SV, EK
  from_code     text          not null,       -- IATA 3-letter e.g. CGK
  from_city     text,
  to_code       text          not null,       -- IATA 3-letter e.g. JED
  to_city       text,
  depart_date   text,                        -- YYYY-MM-DD or "Fleksibel"
  base_price    numeric       not null default 0,
  currency      text          not null default 'IDR', -- IDR | EGP | USD | SAR
  valid_until   date,
  notes         text,
  is_published  boolean       not null default true,
  sort_order    integer       not null default 0,
  created_by    uuid          references auth.users(id),
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

-- ── Auto-update updated_at ───────────────────────────────────────────────────
create or replace function public.set_ticket_prices_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_ticket_prices_updated_at on public.ticket_prices;
create trigger tr_ticket_prices_updated_at
  before update on public.ticket_prices
  for each row execute function public.set_ticket_prices_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.ticket_prices enable row level security;

-- SELECT: semua member agency (termasuk agent)
drop policy if exists "ticket_prices_select" on public.ticket_prices;
create policy "ticket_prices_select" on public.ticket_prices
  for select using (public.is_member(agency_id));

-- INSERT: hanya non-agent (owner + staff)
drop policy if exists "ticket_prices_insert" on public.ticket_prices;
create policy "ticket_prices_insert" on public.ticket_prices
  for insert with check (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  );

-- UPDATE: hanya non-agent (owner + staff)
drop policy if exists "ticket_prices_update" on public.ticket_prices;
create policy "ticket_prices_update" on public.ticket_prices
  for update using (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  ) with check (
    public.is_member(agency_id)
    and not public.is_agent(agency_id)
  );

-- DELETE: owner only
drop policy if exists "ticket_prices_delete" on public.ticket_prices;
create policy "ticket_prices_delete" on public.ticket_prices
  for delete using (public.is_owner(agency_id));

-- ── Index ────────────────────────────────────────────────────────────────────
create index if not exists idx_ticket_prices_agency
  on public.ticket_prices (agency_id, is_published, sort_order, created_at desc);
