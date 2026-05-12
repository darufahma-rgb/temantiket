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
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

    const caller = await getCallerUser(authHeader);
    if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

    const admin = makeAdminClient();

    const { data: callerMember, error: callerErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (callerErr || !callerMember) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });
    if (callerMember.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang bisa mengubah data anggota' });

    const targetUserId = req.query.id;
    if (!targetUserId) return res.status(400).json({ error: 'User ID diperlukan' });

    const b = req.body ?? {};
    const updates = {};
    if (b.role              !== undefined) updates.role               = b.role;
    if (b.commission_pct    !== undefined) updates.commission_pct     = b.commission_pct;
    if (b.phone_wa          !== undefined) updates.phone_wa           = b.phone_wa;
    if (b.agent_notes       !== undefined) updates.agent_notes        = b.agent_notes;
    if (b.agent_status      !== undefined) updates.agent_status       = b.agent_status;
    if (b.card_back_image_url !== undefined) updates.card_back_image_url = b.card_back_image_url;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });

    const { data, error: updateErr } = await admin
      .from('agency_members')
      .update(updates)
      .eq('user_id', targetUserId)
      .eq('agency_id', callerMember.agency_id)
      .select()
      .maybeSingle();

    if (updateErr) return res.status(500).json({ error: updateErr.message });
    if (!data) return res.status(404).json({ error: 'Member tidak ditemukan' });

    return res.status(200).json(data);
  } catch (e) {
    console.error('[agency-members PUT]', e);
    return res.status(500).json({ error: e.message });
  }
}
