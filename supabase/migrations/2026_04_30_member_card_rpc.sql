-- ============================================================================
-- Migration: Public Member Card RPC
-- ============================================================================
-- Tujuan:
--   Bikin endpoint READ-ONLY publik (anon) buat halaman /m/[slug].
--   Klien bisa cek poin / stamp tanpa harus login. Tidak ada cara
--   untuk MENGUBAH data lewat RPC ini.
--
-- Slug format:
--   `[lowercase first-name][memberIndex]`  → contoh: `danang10`
--   - first-name = kata pertama dari clients.name, lowercase, alfanumerik aja
--   - memberIndex = posisi kronologis client di agency (1-based, oldest=1)
--
-- Keamanan:
--   - SECURITY DEFINER → bypass RLS (controlled), tapi hanya query SELECT
--   - Field yg dikembalikan minimal: name, createdAt, memberIndex,
--     dan array order (type/status/createdAt/metadata.transitType only).
--   - Tidak return phone, email, paspor, alamat, harga, atau apapun yg PII/sensitif.
--   - GRANT EXECUTE ke anon, authenticated.
--
-- Cara pakai:
--   Buka Supabase Dashboard → SQL Editor → paste isi file ini → RUN.
-- ============================================================================

create or replace function public.get_member_card(p_slug text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_digits        text;
  v_name_prefix   text;
  v_member_index  int;
  v_client_id     uuid;
  v_client_name   text;
  v_created_at    timestamptz;
  v_orders        json;
begin
  if p_slug is null or length(trim(p_slug)) < 2 then
    return json_build_object('error', 'invalid_slug');
  end if;

  -- Pisah trailing digits (memberIndex) vs leading name prefix
  v_digits      := substring(p_slug from '([0-9]+)$');
  v_name_prefix := lower(regexp_replace(substring(p_slug from '^(.*?)[0-9]+$'), '[^a-zA-Z0-9]', '', 'g'));

  if v_digits is null or v_name_prefix is null or length(v_name_prefix) = 0 then
    return json_build_object('error', 'invalid_slug');
  end if;

  v_member_index := v_digits::int;
  if v_member_index < 1 then
    return json_build_object('error', 'invalid_slug');
  end if;

  -- Cari client: peringkat kronologis per-agency, match name prefix
  with ranked as (
    select c.id,
           c.name,
           c.created_at,
           c.agency_id,
           row_number() over (partition by c.agency_id order by c.created_at asc, c.id asc) as rn
      from public.clients c
  )
  select id, name, created_at
    into v_client_id, v_client_name, v_created_at
    from ranked
   where rn = v_member_index
     and lower(regexp_replace(split_part(name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) = v_name_prefix
   order by created_at asc
   limit 1;

  if v_client_id is null then
    return json_build_object('error', 'not_found');
  end if;

  -- Ambil order yg sudah sukses — projection minimal aja
  select coalesce(
           json_agg(
             json_build_object(
               'type',         o.type,
               'status',       o.status,
               'createdAt',    o.created_at,
               'transitType',  o.metadata->>'transitType'
             )
             order by o.created_at asc
           ),
           '[]'::json
         )
    into v_orders
    from public.orders o
   where o.client_id = v_client_id
     and o.status in ('Confirmed', 'Paid', 'Completed');

  return json_build_object(
    'client', json_build_object(
      'name',        v_client_name,
      'createdAt',   v_created_at,
      'memberIndex', v_member_index
    ),
    'orders', v_orders
  );
end;
$$;

revoke all on function public.get_member_card(text) from public;
grant execute on function public.get_member_card(text) to anon, authenticated;

comment on function public.get_member_card(text) is
  'Public read-only endpoint untuk halaman Member Card (/m/[slug]). '
  'Return data minimal: nama, createdAt, memberIndex, dan stamp orders. '
  'Tidak expose data PII (phone/email/paspor) atau finansial.';
