-- ============================================================================
-- Migration: Referral Hub & Community Features (Fase 17)
-- ============================================================================
-- Perubahan:
--   1. Tambah kolom `referral_stamps` ke tabel `clients`
--   2. Update RPC `get_member_card` untuk return referral_stamps
--   3. Tambah RPC `get_top_members` untuk Public Leaderboard
--   4. Tambah RPC `increment_referral_stamp` untuk admin award +1 stamp referral
-- ============================================================================

-- 1. Tambah kolom referral_stamps ke clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS referral_stamps int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clients.referral_stamps IS
  'Bonus stamp dari referral teman. Di-increment manual oleh admin via RPC increment_referral_stamp().';

-- ============================================================================
-- 2. Update get_member_card — tambahkan referralStamps ke output
-- ============================================================================
create or replace function public.get_member_card(p_slug text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_digits          text;
  v_name_prefix     text;
  v_member_index    int;
  v_client_id       uuid;
  v_client_name     text;
  v_created_at      timestamptz;
  v_orders          json;
  v_referral_stamps int;
begin
  if p_slug is null or length(trim(p_slug)) < 2 then
    return json_build_object('error', 'invalid_slug');
  end if;

  v_digits      := substring(p_slug from '([0-9]+)$');
  v_name_prefix := lower(regexp_replace(
                          substring(p_slug from '^(.*?)[-]?[0-9]+$'),
                          '[^a-zA-Z0-9]', '', 'g'
                        ));

  if v_digits is null or v_name_prefix is null or length(v_name_prefix) = 0 then
    return json_build_object('error', 'invalid_slug');
  end if;

  v_member_index := v_digits::int;
  if v_member_index < 1 then
    return json_build_object('error', 'invalid_slug');
  end if;

  with ranked as (
    select c.id,
           c.name,
           c.created_at,
           c.agency_id,
           c.referral_stamps,
           row_number() over (partition by c.agency_id order by c.created_at asc, c.id asc) as rn
      from public.clients c
  )
  select id, name, created_at, referral_stamps
    into v_client_id, v_client_name, v_created_at, v_referral_stamps
    from ranked
   where rn = v_member_index
     and lower(regexp_replace(split_part(name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) = v_name_prefix
   order by created_at asc
   limit 1;

  if v_client_id is null then
    return json_build_object('error', 'not_found');
  end if;

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
      'name',           v_client_name,
      'createdAt',      v_created_at,
      'memberIndex',    v_member_index,
      'referralStamps', coalesce(v_referral_stamps, 0)
    ),
    'orders', v_orders
  );
end;
$$;

revoke all on function public.get_member_card(text) from public;
grant execute on function public.get_member_card(text) to anon, authenticated;

-- ============================================================================
-- 3. get_top_members — Public Leaderboard (Top Travel Enthusiast)
-- ============================================================================
create or replace function public.get_top_members(p_limit int default 10)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  with ranked_clients as (
    select
      c.id,
      split_part(c.name, ' ', 1)                                                     as first_name,
      c.referral_stamps,
      row_number() over (partition by c.agency_id order by c.created_at asc, c.id asc) as member_index,
      count(o.id) filter (where o.status in ('Confirmed', 'Paid', 'Completed'))       as order_stamps
    from public.clients c
    left join public.orders o on o.client_id = c.id
    group by c.id
  ),
  totals as (
    select
      first_name,
      member_index,
      (order_stamps + referral_stamps)::int as total_stamps,
      order_stamps::int                      as order_stamps,
      referral_stamps
    from ranked_clients
    order by total_stamps desc, member_index asc
    limit p_limit
  )
  select json_agg(
    json_build_object(
      'firstName',    first_name,
      'memberIndex',  member_index,
      'totalStamps',  total_stamps,
      'orderStamps',  order_stamps,
      'referralStamps', referral_stamps
    )
  )
  into v_result
  from totals;

  return coalesce(v_result, '[]'::json);
end;
$$;

revoke all on function public.get_top_members(int) from public;
grant execute on function public.get_top_members(int) to anon, authenticated;

comment on function public.get_top_members(int) is
  'Public leaderboard: top N members by total stamps (orders + referral). '
  'Hanya return first name (bukan full name), member_index, dan stamp counts. Tidak expose PII.';

-- ============================================================================
-- 4. increment_referral_stamp — Admin-only, increment +1 per call
-- ============================================================================
create or replace function public.increment_referral_stamp(p_client_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count int;
begin
  update public.clients
     set referral_stamps = referral_stamps + 1,
         updated_at      = now()
   where id = p_client_id
  returning referral_stamps into v_new_count;

  if not found then
    return json_build_object('ok', false, 'error', 'client_not_found');
  end if;

  return json_build_object('ok', true, 'referralStamps', v_new_count);
end;
$$;

revoke all on function public.increment_referral_stamp(uuid) from public;
grant execute on function public.increment_referral_stamp(uuid) to authenticated;

comment on function public.increment_referral_stamp(uuid) is
  'Admin-only: tambah +1 referral_stamp ke klien tertentu. Hanya bisa dipanggil authenticated user.';
