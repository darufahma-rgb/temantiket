-- ============================================================================
-- Migration: Agent Marketing & Retention
-- ============================================================================
-- Tujuan:
--   1. Retention trigger: order baru auto-inherit `created_by_agent` dari
--      `clients.created_by_agent` kalau client udah punya pemilik agen.
--      Ini bikin "client locking" — sekali daftar lewat agen X, semua order
--      berikutnya buat klien itu otomatis kasih poin ke agen X (siapapun yg
--      input order-nya).
--
--   2. Tabel `reward_redemptions` — request tukar poin → hadiah dari mitra.
--      Workflow: agent submit request → admin lihat & approve → poin dipotong.
--      MVP: agent insert + select sendiri; admin (owner) lihat semua.
--
-- Idempotent — semua `if not exists` / `do $$` / `or replace`.
-- Cara pakai: jalanin SETELAH 2026_04_30_agents_system.sql sukses.
-- ============================================================================

-- ── 1. Trigger inherit_agent_from_client ───────────────────────────────────
-- BEFORE INSERT pada orders. Kalau order baru dibikin tanpa created_by_agent
-- tapi client-nya punya agen → set created_by_agent = client.created_by_agent.
-- Inilah inti retention logic — admin gak bisa "merebut" klien dari agen.
create or replace function public.inherit_agent_from_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_agent is null and new.client_id is not null then
    select c.created_by_agent into new.created_by_agent
    from public.clients c
    where c.id = new.client_id
      and c.agency_id = new.agency_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_inherit_agent_from_client on public.orders;
create trigger tr_inherit_agent_from_client
  before insert on public.orders
  for each row execute function public.inherit_agent_from_client();

-- ── 2. Tabel reward_redemptions ────────────────────────────────────────────
create table if not exists public.reward_redemptions (
  id            uuid primary key default uuid_generate_v4(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  agent_id      uuid not null references auth.users(id) on delete cascade,
  reward_key    text not null,                      -- mis. 'pulsa_50k', 'tshirt_mitra'
  reward_label  text not null,                      -- snapshot label (utk UI)
  cost_points   int  not null check (cost_points > 0),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  notes         text,
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null
);

create index if not exists reward_redemptions_agency_status_idx
  on public.reward_redemptions(agency_id, status, requested_at desc);
create index if not exists reward_redemptions_agent_idx
  on public.reward_redemptions(agency_id, agent_id, requested_at desc);

alter table public.reward_redemptions enable row level security;

-- Agent boleh INSERT request (untuk dirinya sendiri) & SELECT request sendiri.
-- Owner/staff (non-agent) boleh SELECT semua + UPDATE status (approve/reject).
drop policy if exists "rewards_select" on public.reward_redemptions;
create policy "rewards_select" on public.reward_redemptions
  for select using (
    public.is_member(agency_id) and (
      not public.is_agent(agency_id) or agent_id = auth.uid()
    )
  );

drop policy if exists "rewards_insert" on public.reward_redemptions;
create policy "rewards_insert" on public.reward_redemptions
  for insert with check (
    public.is_member(agency_id)
    and agent_id = auth.uid()
    and status = 'pending'    -- baru bisa request, bukan auto-approve
  );

drop policy if exists "rewards_update" on public.reward_redemptions;
create policy "rewards_update" on public.reward_redemptions
  for update using (
    public.is_member(agency_id) and not public.is_agent(agency_id)
  ) with check (
    public.is_member(agency_id) and not public.is_agent(agency_id)
  );

drop policy if exists "rewards_delete" on public.reward_redemptions;
create policy "rewards_delete" on public.reward_redemptions
  for delete using (
    public.is_member(agency_id) and not public.is_agent(agency_id)
  );

-- ── 3. Realtime: subscribe reward_redemptions ──────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.reward_redemptions';
exception when duplicate_object then null;
end$$;

-- ============================================================================
-- DONE. Verifikasi:
--   1. Insert client w/ created_by_agent = <agent-uid>
--   2. Insert order w/ client_id = <client-id> tapi tanpa created_by_agent
--   3. Cek: select created_by_agent from public.orders where id = <new-order>;
--      → harus auto-isi dgn <agent-uid>
--
--   select * from public.reward_redemptions order by requested_at desc;
-- ============================================================================
