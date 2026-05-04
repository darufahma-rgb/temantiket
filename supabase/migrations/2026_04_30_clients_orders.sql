-- ============================================================================
-- Migration: clients + orders (Order Hub refactor)
-- ============================================================================
-- Tujuan:
--   1. `clients` jadi entitas independen (kontak per agency, tidak lagi
--      terikat trip/package). Existing `jamaah` table tetap utuh — kita
--      mirror data jamaah ke clients utk backfill (linked via legacy_jamaah_id).
--   2. `orders` jadi tabel universal (umrah, flight, visa_voa, visa_student).
--      Hasil kalkulator umrah masuk ke total_price + metadata.
--
-- AMAN:
--   * Tidak menyentuh / drop tabel jamaah, trips, packages, jamaah_docs.
--   * Idempoten — `if not exists`, `do $$` blocks, `on conflict do nothing`.
--   * Backfill non-destructive (insert saja, tidak update existing rows).
--
-- Cara pakai:
--   1. Buka Supabase Dashboard → SQL Editor.
--   2. Paste isi file ini, RUN.
--   3. Reload app — menu sidebar baru langsung kelihatan.
-- ============================================================================

-- ── EXTENSIONS ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── CLIENTS ─────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id                uuid primary key default uuid_generate_v4(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  name              text not null,
  phone             text not null default '',
  email             text,
  birth_date        text,
  passport_number   text,
  passport_expiry   text,
  gender            text,
  photo_data_url    text,
  notes             text,
  -- Link balik ke jamaah lama (kalau client di-mirror dari jamaah).
  -- Bukan FK karena jamaah bisa dihapus — kita tetap simpan client-nya.
  legacy_jamaah_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists clients_agency_idx on public.clients(agency_id);
create index if not exists clients_name_idx   on public.clients(agency_id, lower(name));
create index if not exists clients_legacy_idx on public.clients(legacy_jamaah_id);

-- updated_at trigger
create or replace function public.set_clients_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_clients_updated_at();

-- ── ORDERS ──────────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  type            text not null,
  status          text not null default 'Draft',
  title           text,
  total_price     numeric not null default 0,
  currency        text not null default 'IDR',
  metadata        jsonb not null default '{}'::jsonb,
  -- Optional links untuk integrasi dgn entitas umrah lama
  trip_id         text references public.trips(id) on delete set null,
  package_id      text references public.packages(id) on delete set null,
  jamaah_id       text references public.jamaah(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Type CHECK constraint (idempoten)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_type_check
      check (type in ('umrah','flight','visa_voa','visa_student'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_status_check
      check (status in ('Draft','Confirmed','Paid','Completed','Cancelled'));
  end if;
end $$;

create index if not exists orders_agency_idx     on public.orders(agency_id);
create index if not exists orders_type_idx       on public.orders(agency_id, type);
create index if not exists orders_client_idx     on public.orders(client_id);
create index if not exists orders_package_idx    on public.orders(package_id);
create index if not exists orders_trip_idx       on public.orders(trip_id);
create index if not exists orders_jamaah_idx     on public.orders(jamaah_id);
create index if not exists orders_status_idx     on public.orders(agency_id, status);

create or replace function public.set_orders_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_orders_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.clients enable row level security;
alter table public.orders  enable row level security;

-- Drop policy lama supaya re-run tidak fail
do $$
declare t text; pname text;
begin
  for t in select unnest(array['clients','orders']) loop
    for pname in select policyname from pg_policies
     where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pname, t);
    end loop;
  end loop;
end$$;

-- Pakai helper public.is_member(uuid) yg sudah ada di schema utama.
create policy "clients_select" on public.clients
  for select using (public.is_member(agency_id));
create policy "clients_insert" on public.clients
  for insert with check (public.is_member(agency_id));
create policy "clients_update" on public.clients
  for update using (public.is_member(agency_id))
            with check (public.is_member(agency_id));
create policy "clients_delete" on public.clients
  for delete using (public.is_member(agency_id));

create policy "orders_select" on public.orders
  for select using (public.is_member(agency_id));
create policy "orders_insert" on public.orders
  for insert with check (public.is_member(agency_id));
create policy "orders_update" on public.orders
  for update using (public.is_member(agency_id))
            with check (public.is_member(agency_id));
create policy "orders_delete" on public.orders
  for delete using (public.is_member(agency_id));

-- ── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.clients';
exception when duplicate_object then null;
end$$;
do $$
begin
  execute 'alter publication supabase_realtime add table public.orders';
exception when duplicate_object then null;
end$$;

-- ============================================================================
-- BACKFILL: existing jamaah → clients + umrah orders
-- ============================================================================
-- Aturan:
--   1. Tiap jamaah belum punya client (cek via legacy_jamaah_id) → bikin 1 client.
--   2. Tiap jamaah yg punya trip_id valid → bikin 1 umrah order yg link ke
--      jamaah_id + trip_id (atau package_id kalau trip_id ternyata package).
--   3. Insert-only. Re-run aman karena cek "where not exists".
-- ============================================================================

-- 2a) Backfill clients dari jamaah
insert into public.clients (
  agency_id, name, phone, birth_date, passport_number, passport_expiry,
  gender, photo_data_url, legacy_jamaah_id, created_at
)
select
  j.agency_id,
  coalesce(nullif(trim(j.name), ''), 'Jamaah ' || substr(j.id, 1, 8)),
  coalesce(j.phone, ''),
  nullif(j.birth_date, ''),
  nullif(j.passport_number, ''),
  j.passport_expiry,
  nullif(j.gender, ''),
  j.photo_data_url,
  j.id,
  coalesce(j.created_at, now())
from public.jamaah j
where j.agency_id is not null
  and not exists (
    select 1 from public.clients c
    where c.legacy_jamaah_id = j.id
  );

-- 2b) Backfill umrah orders dari jamaah (1 jamaah = 1 umrah order)
-- jamaah.trip_id di app code dipake utk 2 hal:
--   - Trip ID kalau jamaah di-add via TripDetail
--   - Package ID kalau jamaah di-add via PackageDetail (re-using field name)
-- Jadi kita coba match keduanya, taruh di kolom yg sesuai.
insert into public.orders (
  agency_id, client_id, type, status, title,
  total_price, currency, metadata,
  trip_id, package_id, jamaah_id,
  created_at
)
select
  j.agency_id,
  c.id,
  'umrah',
  'Draft',
  coalesce(nullif(trim(j.name), ''), 'Order Umrah'),
  0,
  'IDR',
  jsonb_build_object(
    'source', 'backfill_jamaah',
    'paymentStatus', j.payment_status
  ),
  case when t.id is not null then j.trip_id else null end,
  case when p.id is not null then j.trip_id else null end,
  j.id,
  coalesce(j.created_at, now())
from public.jamaah j
join public.clients c on c.legacy_jamaah_id = j.id
left join public.trips    t on t.id = j.trip_id
left join public.packages p on p.id = j.trip_id
where j.agency_id is not null
  and not exists (
    select 1 from public.orders o
    where o.jamaah_id = j.id and o.type = 'umrah'
  );

-- ============================================================================
-- DONE. Verifikasi:
--   select count(*) from public.clients;
--   select count(*) from public.orders;
--   select type, count(*) from public.orders group by type;
-- ============================================================================
