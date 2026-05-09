-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Kartu Staff Digital — Gambar Belakang
-- Jalankan di Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
--
-- Script ini idempotent — aman dijalankan ulang berkali-kali.
-- DROP POLICY IF EXISTS dipakai karena PostgreSQL tidak mendukung
-- CREATE POLICY IF NOT EXISTS.
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
-- atau owner boleh upload untuk siapa saja di agency-nya
create policy "card_backs_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'card-backs'
    and (
      -- staff mengupload milik sendiri: path = {userId}/card-back.jpg
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

-- 4. Verifikasi (opsional):
-- select column_name from information_schema.columns
--   where table_name = 'agency_members' and column_name = 'card_back_image_url';
--
-- select policyname from pg_policies
--   where tablename = 'objects' and policyname like 'card_backs%';
