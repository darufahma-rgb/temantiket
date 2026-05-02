'use strict';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function makeAdminClient() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel Environment Variables.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getCallerUser(authHeader) {
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

    const caller = await getCallerUser(authHeader);
    if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

    const admin = makeAdminClient();

    const { data: callerMembership, error: memberErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memberErr || !callerMembership) return res.status(403).json({ error: 'Tidak terdaftar di agency' });
    if (callerMembership.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang bisa hapus anggota' });

    const { userId } = req.body || {};
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId required' });
    if (userId === caller.id) return res.status(400).json({ error: 'Tidak bisa hapus diri sendiri' });

    const { data: target, error: targetErr } = await admin
      .from('agency_members').select('role')
      .eq('agency_id', callerMembership.agency_id).eq('user_id', userId).maybeSingle();
    if (targetErr || !target) return res.status(404).json({ error: 'User tidak ditemukan di agency ini' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Tidak bisa hapus sesama owner' });

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return res.status(500).json({ error: delErr.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
