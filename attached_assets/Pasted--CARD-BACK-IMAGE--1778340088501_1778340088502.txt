-- ═══════════════════════════════════════════════════════════════════════════
-- CARD BACK IMAGE — Jalankan di Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tambah kolom card_back_image_url di agency_members ────────────────
alter table public.agency_members
  add column if not exists card_back_image_url text;

-- ── 2. Buat storage bucket "card-backs" (public) ─────────────────────────
insert into storage.buckets (id, name, public)
values ('card-backs', 'card-backs', true)
on conflict (id) do nothing;

-- ── 3. RLS policies untuk bucket card-backs ──────────────────────────────

-- Siapa pun yang login bisa baca (bucket sudah public, ini sebagai fallback)
create policy "card_backs_select"
  on storage.objects for select
  using (bucket_id = 'card-backs');

-- Owner agency ATAU member itu sendiri bisa upload
create policy "card_backs_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'card-backs'
    and (
      -- owner bisa upload untuk siapapun di agency-nya
      exists (
        select 1 from public.agency_members
        where user_id = auth.uid()
          and role = 'owner'
      )
      -- atau member itu sendiri (folder = userId mereka)
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Owner ATAU member itu sendiri bisa update (upsert)
create policy "card_backs_update"
  on storage.objects for update
  using (
    bucket_id = 'card-backs'
    and (
      exists (
        select 1 from public.agency_members
        where user_id = auth.uid()
          and role = 'owner'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Owner ATAU member itu sendiri bisa hapus
create policy "card_backs_delete"
  on storage.objects for delete
  using (
    bucket_id = 'card-backs'
    and (
      exists (
        select 1 from public.agency_members
        where user_id = auth.uid()
          and role = 'owner'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
