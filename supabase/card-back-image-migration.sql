-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Kartu Staff Digital — Gambar Belakang
-- Jalankan di Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
--
-- Script ini idempotent — aman dijalankan ulang berkali-kali.
-- DROP POLICY IF EXISTS dipakai karena PostgreSQL tidak mendukung
-- CREATE POLICY IF NOT EXISTS.
--
-- CATATAN ARSITEKTUR:
--   Penyimpanan URL ke DB dilakukan via server route /api/save-card-back-url
--   (menggunakan service-role key) sehingga RLS agency_members tidak perlu
--   dikendurkan. Policy di bawah adalah lapisan tambahan opsional; yang wajib
--   adalah bucket 'card-backs' dan kolom card_back_image_url.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tambah kolom card_back_image_url ke tabel agency_members
alter table public.agency_members
  add column if not exists card_back_image_url text;

-- 2. Buat bucket Storage 'card-backs' (public = true agar URL publik tersedia
--    sebagai fallback; signed URL tetap digunakan untuk display)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-backs',
  'card-backs',
  true,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. RLS policies untuk bucket card-backs
--    Drop dulu sebelum create agar aman dijalankan ulang

drop policy if exists "card_backs_select" on storage.objects;
drop policy if exists "card_backs_insert" on storage.objects;
drop policy if exists "card_backs_update" on storage.objects;
drop policy if exists "card_backs_delete" on storage.objects;

-- Anggota agency yang sama boleh melihat file
create policy "card_backs_select" on storage.objects
  for select
  using (
    bucket_id = 'card-backs'
    and exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
    )
  );

-- Anggota agency boleh upload/update card-back mereka sendiri,
-- atau owner boleh upload untuk siapapun di agency-nya
create policy "card_backs_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'card-backs'
    and (
      -- staff/agent mengupload milik sendiri: path = {userId}/card-back.jpg
      (storage.foldername(name))[1] = auth.uid()::text
      or
      -- owner mengupload untuk staff di agency-nya
      exists (
        select 1 from public.agency_members me
        where me.user_id = auth.uid()
          and me.role = 'owner'
          and exists (
            select 1 from public.agency_members target
            where target.user_id::text = (storage.foldername(name))[1]
              and target.agency_id = me.agency_id
          )
      )
    )
  );

create policy "card_backs_update" on storage.objects
  for update
  using (
    bucket_id = 'card-backs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or
      exists (
        select 1 from public.agency_members me
        where me.user_id = auth.uid()
          and me.role = 'owner'
          and exists (
            select 1 from public.agency_members target
            where target.user_id::text = (storage.foldername(name))[1]
              and target.agency_id = me.agency_id
          )
      )
    )
  );

-- DELETE policy diperlukan agar upsert (upload ulang file yang sama) tidak gagal
create policy "card_backs_delete" on storage.objects
  for delete
  using (
    bucket_id = 'card-backs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or
      exists (
        select 1 from public.agency_members me
        where me.user_id = auth.uid()
          and me.role = 'owner'
          and exists (
            select 1 from public.agency_members target
            where target.user_id::text = (storage.foldername(name))[1]
              and target.agency_id = me.agency_id
          )
      )
    )
  );

-- 4. RLS policy opsional: izinkan member update card_back_image_url sendiri
--    langsung via anon key (sebagai lapisan backup di luar server route).
--    Jika policy members_update_owner sudah ada, policy ini menambah izin
--    untuk self-update tanpa perlu izin owner.
drop policy if exists "members_update_card_back_self" on public.agency_members;

create policy "members_update_card_back_self" on public.agency_members
  for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 5. Verifikasi (opsional — jalankan query ini terpisah untuk mengecek):
-- select column_name from information_schema.columns
--   where table_name = 'agency_members' and column_name = 'card_back_image_url';
--
-- select policyname from pg_policies
--   where tablename = 'objects' and policyname like 'card_backs%';
--
-- select policyname from pg_policies
--   where tablename = 'agency_members' and policyname like 'members_update%';
