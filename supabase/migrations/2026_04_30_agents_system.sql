-- ============================================================================
-- Migration: Agent (Mitra) Management System
-- ============================================================================
-- Tujuan:
--   1. Tambah role 'agent' di agency_members + commission_pct per-agent.
--   2. Tambah created_by_agent ke clients & orders utk attribution.
--   3. Tabel agent_points + trigger auto-award saat order → Completed.
--   4. RLS hardening: agent cuma boleh liat clients/orders yg dia bikin sendiri.
--   5. Helper SQL `is_agent()` utk policy.
--
-- Idempotent — semua `if not exists`, `do $$` blocks, `on conflict`.
-- Cara pakai: Supabase Dashboard → SQL Editor → paste → RUN.
-- ============================================================================

-- ── 1. Allow 'agent' role di agency_members ────────────────────────────────
do $$
begin
  -- Drop existing CHECK constraint kalau ada (nama default Postgres).
  if exists (
    select 1 from pg_constraint
    where conname = 'agency_members_role_check'
  ) then
    alter table public.agency_members drop constraint agency_members_role_check;
  end if;

  alter table public.agency_members
    add constraint agency_members_role_check
    check (role in ('owner', 'staff', 'agent'));
end$$;

alter table public.agency_members
  add column if not exists commission_pct numeric not null default 10;

-- ── 2. Helper: is_agent(agency) ─────────────────────────────────────────────
create or replace function public.is_agent(target_agency uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.agency_members
    where user_id = auth.uid()
      and agency_id = target_agency
      and role = 'agent'
  )
$$;

-- ── 3. created_by_agent column (clients + orders) ──────────────────────────
alter table public.clients
  add column if not exists created_by_agent uuid references auth.users(id) on delete set null;
alter table public.orders
  add column if not exists created_by_agent uuid references auth.users(id) on delete set null;

create index if not exists clients_created_by_agent_idx
  on public.clients(agency_id, created_by_agent);
create index if not exists orders_created_by_agent_idx
  on public.orders(agency_id, created_by_agent);

-- ── 4. agent_points table ──────────────────────────────────────────────────
create table if not exists public.agent_points (
  id          uuid primary key default uuid_generate_v4(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  agent_id    uuid not null references auth.users(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  points      int  not null default 10,
  reason      text not null default 'order_completed',
  awarded_at  timestamptz not null default now(),
  unique(order_id)  -- 1 order = 1 award (idempotent re-completion)
);
create index if not exists agent_points_agency_agent_idx
  on public.agent_points(agency_id, agent_id);
create index if not exists agent_points_awarded_idx
  on public.agent_points(agency_id, awarded_at desc);

-- RLS — semua member agency boleh liat (utk leaderboard + dashboard agent
-- liat skor sendiri). Insert HANYA via trigger (security definer).
alter table public.agent_points enable row level security;

drop policy if exists "agent_points_select" on public.agent_points;
create policy "agent_points_select" on public.agent_points
  for select using (public.is_member(agency_id));

-- (Sengaja gak bikin insert/update/delete policy — trigger pake security
-- definer jadi bypass RLS. User normal gak bisa manipulasi poin manual.)

-- ── 5. Trigger: auto-award points saat order → Completed ───────────────────
create or replace function public.award_points_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hanya award kalau:
  --   * Status sekarang 'Completed'
  --   * Order punya created_by_agent (bukan Direct)
  --   * Status sebelumnya BUKAN 'Completed' (idempotent — re-update gak double-award)
  --     atau ini INSERT pertama dgn status='Completed'.
  if new.status = 'Completed'
     and new.created_by_agent is not null
     and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'Completed')
  then
    insert into public.agent_points(agency_id, agent_id, order_id, points, reason)
    values (new.agency_id, new.created_by_agent, new.id, 10, 'order_completed')
    on conflict (order_id) do nothing;  -- safety net (unique constraint)
  end if;
  return new;
end;
$$;

drop trigger if exists tr_award_points_on_completion on public.orders;
create trigger tr_award_points_on_completion
  after insert or update of status on public.orders
  for each row execute function public.award_points_on_completion();

-- ── 6. RLS hardening — agent cuma akses data sendiri ───────────────────────
-- Kita drop & re-create select/update/delete policies utk clients & orders.
-- Owner/staff TETEP liat semua. Agent dibatasi ke `created_by_agent = auth.uid()`.
do $$
declare t text;
begin
  for t in select unnest(array['clients','orders']) loop
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
  end loop;
end$$;

-- CLIENTS
create policy "clients_select" on public.clients
  for select using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "clients_insert" on public.clients
  for insert with check (
    public.is_member(agency_id) and (
      -- Agent wajib tag dirinya sebagai creator (atau biarkan null lalu di-set client-side).
      not public.is_agent(agency_id)
      or created_by_agent is null
      or created_by_agent = auth.uid()
    )
  );
create policy "clients_update" on public.clients
  for update using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  ) with check (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "clients_delete" on public.clients
  for delete using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );

-- ORDERS
create policy "orders_select" on public.orders
  for select using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "orders_insert" on public.orders
  for insert with check (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id)
      or created_by_agent is null
      or created_by_agent = auth.uid()
    )
  );
create policy "orders_update" on public.orders
  for update using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  ) with check (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );
create policy "orders_delete" on public.orders
  for delete using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or created_by_agent = auth.uid()
    )
  );

-- ── 7. Realtime: subscribe agent_points ────────────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.agent_points';
exception when duplicate_object then null;
end$$;

-- ============================================================================
-- DONE. Verifikasi:
--   select role, count(*) from public.agency_members group by 1;
--   select * from public.agent_points order by awarded_at desc limit 10;
--
-- Test trigger:
--   1. Bikin order dgn created_by_agent = <some-agent-uid>, status='Draft'
--   2. Update status → 'Completed'
--   3. Cek public.agent_points → harus muncul 1 row baru (10 poin)
--   4. Re-update status (Cancelled → Completed) → tetap 1 row (idempotent)
-- ============================================================================
