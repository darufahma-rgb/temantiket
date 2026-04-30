-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: public.profiles table
-- Tujuan   : nyimpen full_name + email per user supaya UI "Anggota Agency" di
--            Settings bisa tampil nama beneran, bukan "User <uuid-prefix>".
--            auth.users ga bisa di-read langsung dari client (perlu service
--            role), jadi kita mirror data minimum yg dibutuhkan UI ke sini.
--
-- Idempotent: aman dijalankan ulang. Backfill existing users di akhir.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(lower(email));

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Drop dulu policies lama biar re-run gak fail "already exists".
drop policy if exists "profiles_select_same_agency" on public.profiles;
drop policy if exists "profiles_select_self"        on public.profiles;
drop policy if exists "profiles_update_self"        on public.profiles;
drop policy if exists "profiles_insert_self"        on public.profiles;

-- Self: bisa baca + update profile sendiri
create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- Same-agency: bisa baca profile siapapun yg satu agency dgn aku.
-- Pake helper is_member yg udah security-definer, jadi gak kena recursion.
create policy "profiles_select_same_agency" on public.profiles
  for select using (
    exists (
      select 1
        from public.agency_members am_target
        join public.agency_members am_self
          on am_self.agency_id = am_target.agency_id
       where am_target.user_id = profiles.id
         and am_self.user_id = auth.uid()
    )
  );

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- ── Backfill: pastiin tiap user yg udah ada di agency_members punya row ────
-- Ambil display_name dari user_metadata kalau ada, fallback ke email-prefix.
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1)
  )
from auth.users u
where u.id in (select user_id from public.agency_members)
on conflict (id) do nothing;
