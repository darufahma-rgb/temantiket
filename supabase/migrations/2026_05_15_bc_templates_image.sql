-- ============================================================================
-- Migration: Add image_url to bc_templates + create storage bucket
-- ============================================================================
-- Menambahkan kolom image_url ke tabel bc_templates untuk menyimpan gambar
-- thumbnail (1:1) per template. File disimpan di Supabase Storage bucket
-- "bc-template-images" yang bersifat public.
--
-- Idempotent — aman di-run ulang.
-- ============================================================================

-- 1. Tambah kolom image_url
ALTER TABLE public.bc_templates
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Buat storage bucket untuk gambar template (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bc-template-images',
  'bc-template-images',
  true,
  5242880, -- 5 MB max per file
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'];

-- 3. Storage RLS: semua orang bisa baca (bucket sudah public)
DROP POLICY IF EXISTS "bc_template_images_select" ON storage.objects;
CREATE POLICY "bc_template_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'bc-template-images');

-- 4. Storage RLS: hanya member non-agent bisa upload/update
DROP POLICY IF EXISTS "bc_template_images_insert" ON storage.objects;
CREATE POLICY "bc_template_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bc-template-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "bc_template_images_update" ON storage.objects;
CREATE POLICY "bc_template_images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'bc-template-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "bc_template_images_delete" ON storage.objects;
CREATE POLICY "bc_template_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'bc-template-images'
    AND auth.role() = 'authenticated'
  );

-- ============================================================================
-- DONE.
--   Jalankan SQL ini di Supabase SQL Editor untuk mengaktifkan fitur gambar
--   pada Template Broadcast.
-- ============================================================================
