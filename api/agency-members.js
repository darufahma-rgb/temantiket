'use strict';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function makeAdminClient() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set');
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

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

    const caller = await getCallerUser(authHeader);
    if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

    const admin = makeAdminClient();

    const { data: callerMember, error: callerErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (callerErr || !callerMember) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });

    const { data: members, error: membersErr } = await admin
      .from('agency_members')
      .select('user_id, role, commission_pct, created_at, phone_wa, agent_notes, agent_status, card_back_image_url')
      .eq('agency_id', callerMember.agency_id)
      .order('created_at', { ascending: true });

    if (membersErr) return res.status(500).json({ error: membersErr.message });

    const { data: { users }, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (usersErr) return res.status(500).json({ error: usersErr.message });

    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

    const result = (members || []).map(m => {
      const u = userMap[m.user_id];
      const meta = u?.user_metadata ?? {};
      const fullName = (meta.full_name ?? meta.display_name ?? '').trim();
      return {
        user_id:             m.user_id,
        role:                m.role,
        commission_pct:      m.commission_pct,
        created_at:          m.created_at,
        phone_wa:            m.phone_wa ?? null,
        agent_notes:         m.agent_notes ?? null,
        agent_status:        m.agent_status ?? null,
        card_back_image_url: m.card_back_image_url ?? null,
        email:               u?.email ?? null,
        first_name:          meta.first_name ?? fullName.split(' ')[0] ?? null,
        last_name:           meta.last_name ?? fullName.split(' ').slice(1).join(' ') ?? null,
        profile_image_url:   meta.avatar_url ?? meta.profile_image_url ?? null,
      };
    });

    return res.status(200).json(result);
  } catch (e) {
    console.error('[agency-members GET]', e);
    return res.status(500).json({ error: e.message });
  }
}
