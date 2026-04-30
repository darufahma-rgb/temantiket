-- Tambah RLS policy untuk INSERT & DELETE pada tabel agency_members.
--
-- Konteks: schema awal sengaja ngebatesin invite-member lewat Edge Function
-- (service_role bypass RLS). Tapi kalau Edge Function gak ke-deploy /
-- SUPABASE_SERVICE_ROLE_KEY belum di-set di Functions secrets, alur invite
-- bisa stuck mid-process. Policy ini jadi safety net: owner BOLEH insert
-- staff baru ke agency-nya sendiri, dan BOLEH delete non-owner member.
--
-- Aman karena:
--  1. Helper public.is_owner(agency_id) sudah cek caller adalah owner di
--     agency tsb (baca `auth.uid()` + agency_members).
--  2. WITH CHECK memastikan row baru cuma boleh untuk agency caller.
--  3. Owner gak bisa demote/hapus owner lain (kondisi role <> 'owner').
--
-- Idempoten: pakai `if not exists` pattern lewat DO block supaya aman
-- dijalankan ulang.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agency_members'
      and policyname = 'members_insert_owner'
  ) then
    create policy "members_insert_owner" on public.agency_members
      for insert
      with check (public.is_owner(agency_id) and role in ('owner','staff'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agency_members'
      and policyname = 'members_delete_owner'
  ) then
    create policy "members_delete_owner" on public.agency_members
      for delete
      using (public.is_owner(agency_id) and role <> 'owner');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agency_members'
      and policyname = 'members_update_owner'
  ) then
    create policy "members_update_owner" on public.agency_members
      for update
      using (public.is_owner(agency_id))
      with check (public.is_owner(agency_id));
  end if;
end $$;
