/**
 * GET /api/auth/user
 *
 * Explicit Vercel serverless function — belt-and-suspenders alongside
 * api/[...path].js catch-all. Having a dedicated file guarantees Vercel
 * always routes this exact path to a function, regardless of rewrite order.
 *
 * Returns:
 *   200  { id, email, displayName, profileImageUrl, role, agencyId, agencyName, commissionPct }
 *   401  { error: "..." }   — missing/invalid Bearer token
 *   404  { code: "NO_MEMBERSHIP", error: "..." }   — authenticated but no agency
 *   404  { code: "NEEDS_SERVICE_ROLE", error: "..." } — needs admin key for migration
 *   500  { error: "..." }   — server/DB error
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = (process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL  || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function makeAdminClient() {
  if (!SUPABASE_URL)     throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel Environment Variables.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getCallerUser(authHeader) {
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const caller = await getCallerUser(authHeader);
  if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Supabase tidak dikonfigurasi' });
  }

  try {
    const meta = caller.user_metadata ?? {};
    const fullName = (meta.full_name ?? meta.display_name ?? '').trim();
    const displayName = fullName || caller.email?.split('@')[0] || 'User';

    // ── Step 1: cari membership by Supabase UID ──────────────────────────────
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: memberByUid, error: memErr } = await userClient
      .from('agency_members')
      .select('agency_id, role, commission_pct, agencies(name)')
      .eq('user_id', caller.id)
      .maybeSingle();

    if (memErr) return res.status(500).json({ error: memErr.message });

    if (memberByUid) {
      return res.status(200).json({
        id:              caller.id,
        email:           caller.email ?? '',
        displayName,
        profileImageUrl: meta.avatar_url ?? meta.profile_image_url ?? null,
        role:            memberByUid.role ?? null,
        agencyId:        memberByUid.agency_id ?? null,
        agencyName:      memberByUid.agencies?.name ?? null,
        commissionPct:   Number(memberByUid.commission_pct ?? 0),
      });
    }

    // ── Step 2: tidak ditemukan by UID — coba safe-link by email ─────────────
    if (!caller.email) {
      return res.status(404).json({ code: 'NO_MEMBERSHIP', error: 'Tidak ada agency/membership yang terhubung.' });
    }

    if (!SERVICE_ROLE_KEY) {
      return res.status(404).json({
        code: 'NEEDS_SERVICE_ROLE',
        error: 'Akun ditemukan tapi perlu admin migration. Set SUPABASE_SERVICE_ROLE_KEY lalu redeploy.',
      });
    }

    const admin = makeAdminClient();

    // Cari old user_id lewat profiles.email
    const { data: profileByEmail } = await admin
      .from('profiles')
      .select('id')
      .eq('email', caller.email)
      .maybeSingle();

    let oldUserId = profileByEmail?.id ?? null;

    // Fallback: scan auth.users
    if (!oldUserId) {
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matchUser = authUsers?.users?.find(
        (u) => u.email?.toLowerCase() === caller.email.toLowerCase() && u.id !== caller.id,
      );
      if (matchUser) oldUserId = matchUser.id;
    }

    if (!oldUserId || oldUserId === caller.id) {
      return res.status(404).json({ code: 'NO_MEMBERSHIP', error: 'Tidak ada agency/membership yang terhubung.' });
    }

    // Cek apakah old user punya membership
    const { data: oldMembership } = await admin
      .from('agency_members')
      .select('agency_id, role, commission_pct, agencies(name)')
      .eq('user_id', oldUserId)
      .maybeSingle();

    if (!oldMembership) {
      return res.status(404).json({ code: 'NO_MEMBERSHIP', error: 'Tidak ada agency/membership yang terhubung.' });
    }

    console.log(`[auth/user] Safe-linking: email=${caller.email}, old=${oldUserId}, new=${caller.id}`);

    // Migrasikan agency_members ke Supabase UID baru
    const { error: updateErr } = await admin
      .from('agency_members')
      .update({ user_id: caller.id })
      .eq('user_id', oldUserId);

    if (updateErr) {
      console.error('[auth/user] Migration failed:', updateErr.message);
      return res.status(500).json({ error: `Gagal migrasi membership: ${updateErr.message}` });
    }

    // Upsert profile baru
    await admin.from('profiles').upsert({
      id: caller.id,
      email: caller.email,
      full_name: fullName || caller.email.split('@')[0],
    }, { onConflict: 'id' });

    // Hapus profile lama
    if (oldUserId !== caller.id) {
      await admin.from('profiles').delete().eq('id', oldUserId);
    }

    console.log(`[auth/user] Migration complete: email=${caller.email}`);

    return res.status(200).json({
      id:              caller.id,
      email:           caller.email ?? '',
      displayName,
      profileImageUrl: meta.avatar_url ?? meta.profile_image_url ?? null,
      role:            oldMembership.role ?? null,
      agencyId:        oldMembership.agency_id ?? null,
      agencyName:      oldMembership.agencies?.name ?? null,
      commissionPct:   Number(oldMembership.commission_pct ?? 0),
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
