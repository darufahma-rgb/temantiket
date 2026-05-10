-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Sistem Notifikasi Internal Temantiket
-- Jalankan di Supabase SQL Editor — idempotent, aman dijalankan ulang.
--
-- Tabel:
--   1. notifications          — notifikasi per-user (recipient-based)
--   2. notification_settings  — preferensi per-user
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. notifications ─────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  title       text not null,
  message     text not null default '',
  type        text not null default 'info'
              check (type in ('info','success','warning','urgent')),
  category    text not null default 'system'
              check (category in ('trip_reminder','new_message','payment','weekly_report','promo','task','broadcast','system')),
  priority    text not null default 'normal'
              check (priority in ('normal','important','urgent')),
  is_read     boolean not null default false,
  action_url  text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_id   on public.notifications(user_id);
create index if not exists idx_notifications_agency_id on public.notifications(agency_id);
create index if not exists idx_notifications_is_read   on public.notifications(user_id, is_read);
create index if not exists idx_notifications_created   on public.notifications(created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notif_user_read_own"  on public.notifications;
drop policy if exists "notif_user_mark_read" on public.notifications;
drop policy if exists "notif_user_delete"    on public.notifications;
drop policy if exists "notif_owner_insert"   on public.notifications;
drop policy if exists "notif_owner_delete"   on public.notifications;

-- User can read their own notifications
create policy "notif_user_read_own" on public.notifications
  for select using (user_id = auth.uid());

-- User can mark their own notifications read
create policy "notif_user_mark_read" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- User can delete their own notifications
create policy "notif_user_delete" on public.notifications
  for delete using (user_id = auth.uid());

-- Owner can insert notifications for any user in their agency (broadcast)
create policy "notif_owner_insert" on public.notifications
  for insert
  with check (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = notifications.agency_id
        and am.role = 'owner'
    )
    or user_id = auth.uid()  -- self-insert (system notifications)
  );


-- ── 2. notification_settings ─────────────────────────────────────────────────
create table if not exists public.notification_settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  trip_reminder         boolean not null default true,
  new_message           boolean not null default true,
  payment_confirmation  boolean not null default true,
  weekly_report         boolean not null default false,
  promo_info            boolean not null default false,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index if not exists idx_notif_settings_user_id on public.notification_settings(user_id);

alter table public.notification_settings enable row level security;

drop policy if exists "notif_settings_self" on public.notification_settings;

create policy "notif_settings_self" on public.notification_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 3. Enable Supabase Realtime for notifications ─────────────────────────────
-- NOTE: Realtime must also be enabled from Supabase Dashboard →
--       Database → Replication → supabase_realtime publication → Add table
--       (select "notifications" table)
--
-- OR run:
alter publication supabase_realtime add table public.notifications;

-- ── 4. Verifikasi ─────────────────────────────────────────────────────────────
-- select table_name from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('notifications', 'notification_settings');
