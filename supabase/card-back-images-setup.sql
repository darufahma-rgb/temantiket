-- ============================================================
-- card-back-images-setup.sql
-- Run this in Supabase SQL Editor (once, idempotent).
-- ============================================================
--
-- STEP 1 (manual, dashboard only):
--   Go to Supabase → Storage → New Bucket
--   Name: card-back-images
--   ✅ Public bucket (so getPublicUrl() works without signed URLs)
--
-- STEP 2: Run this file in SQL Editor.
--   It creates the card_back_images table, RLS policies,
--   and Storage policies for the bucket.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.card_back_images (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_uuid  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_type   TEXT        NOT NULL CHECK (role_type IN ('agent', 'staff', 'owner', 'member')),
  image_path  TEXT        NOT NULL,
  image_url   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_uuid, role_type)
);

-- ── 2. Index ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS card_back_images_owner_role_idx
  ON public.card_back_images (owner_uuid, role_type);

-- ── 3. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS card_back_images_updated_at ON public.card_back_images;
CREATE TRIGGER card_back_images_updated_at
  BEFORE UPDATE ON public.card_back_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE public.card_back_images ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (needed to load card backs for display)
DROP POLICY IF EXISTS "card_back_images_read" ON public.card_back_images;
CREATE POLICY "card_back_images_read"
  ON public.card_back_images FOR SELECT
  USING (true);

-- Users can manage their own card back
DROP POLICY IF EXISTS "card_back_images_own" ON public.card_back_images;
CREATE POLICY "card_back_images_own"
  ON public.card_back_images FOR ALL
  USING  (auth.uid() = owner_uuid)
  WITH CHECK (auth.uid() = owner_uuid);

-- Agency owners and staff can manage card backs for any member in their agency
DROP POLICY IF EXISTS "card_back_images_agency_admin" ON public.card_back_images;
CREATE POLICY "card_back_images_agency_admin"
  ON public.card_back_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'staff')
    )
  );

-- ── 5. Storage bucket policies ───────────────────────────────
-- These apply to the 'card-back-images' bucket.
-- If using Supabase Dashboard to set policies, add:
--   SELECT  → public (anyone)
--   INSERT  → authenticated users
--   UPDATE  → authenticated users
--   DELETE  → authenticated users
--
-- Or run below (requires pg_policies on storage.objects):

DROP POLICY IF EXISTS "card_back_images_storage_select" ON storage.objects;
CREATE POLICY "card_back_images_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-back-images');

DROP POLICY IF EXISTS "card_back_images_storage_insert" ON storage.objects;
CREATE POLICY "card_back_images_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'card-back-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "card_back_images_storage_update" ON storage.objects;
CREATE POLICY "card_back_images_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'card-back-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "card_back_images_storage_delete" ON storage.objects;
CREATE POLICY "card_back_images_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'card-back-images'
    AND auth.role() = 'authenticated'
  );

-- ── Done ─────────────────────────────────────────────────────
-- Verify with:
--   SELECT * FROM card_back_images LIMIT 5;
