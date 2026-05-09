-- Migration: get_public_promo_posters(p_slug)
-- Fungsi SECURITY DEFINER yang bisa dipanggil oleh anon user.
-- Lookup promo_posters setting untuk agency yang memiliki member dengan slug tersebut.
-- Hanya return poster yang active = true.
--
-- Jalankan di Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.get_public_promo_posters(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_index integer;
  v_agency_id    uuid;
  v_posters      jsonb;
BEGIN
  -- Validasi slug format: harus ada 4-digit suffix
  IF p_slug !~ '^[a-z0-9]+-[0-9]{4}$' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Ekstrak member index dari slug (4 digit terakhir)
  v_member_index := (regexp_match(p_slug, '-([0-9]{4})$'))[1]::integer;
  IF v_member_index IS NULL OR v_member_index < 1 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Cari agency_id dari client ke-N (ordered by created_at, 1-indexed)
  SELECT c.agency_id INTO v_agency_id
  FROM public.clients c
  ORDER BY c.created_at ASC
  LIMIT 1
  OFFSET (v_member_index - 1);

  IF v_agency_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Ambil promo_posters dari agency_settings
  SELECT s.value INTO v_posters
  FROM public.agency_settings s
  WHERE s.agency_id = v_agency_id
    AND s.key = 'promo_posters'
  LIMIT 1;

  IF v_posters IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Filter hanya yang active = true
  RETURN (
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'order')::int NULLS LAST), '[]'::jsonb)
    FROM jsonb_array_elements(v_posters) AS item
    WHERE (item->>'active')::boolean IS TRUE
  );
END;
$$;

-- Izinkan anon dan authenticated user memanggil fungsi ini
GRANT EXECUTE ON FUNCTION public.get_public_promo_posters(text) TO anon, authenticated;
