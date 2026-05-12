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

    const { data: membership, error: memErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memErr || !membership) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });

    const { id, agencyId, agentId, type, pointsDelta, amountIDR, description, createdBy, createdAt } = req.body ?? {};
    if (!id || !agencyId || !agentId || !type || amountIDR === undefined) {
      return res.status(400).json({ error: 'Field wajib: id, agencyId, agentId, type, amountIDR' });
    }
    if (membership.agency_id !== agencyId) return res.status(403).json({ error: 'Agency ID tidak sesuai' });
    if (membership.role === 'agent' && agentId !== caller.id) {
      return res.status(403).json({ error: 'Agen hanya bisa mengkreditkan wallet sendiri' });
    }

    const { error: insertErr } = await admin.from('agent_wallet_transactions').upsert({
      id,
      agency_id:    agencyId,
      agent_id:     agentId,
      type,
      points_delta: pointsDelta ?? 0,
      amount_idr:   amountIDR,
      description:  description ?? '',
      created_by:   createdBy ?? caller.id,
      created_at:   createdAt ?? new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true });

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('[credit-wallet-tx]', e);
    return res.status(500).json({ error: e.message });
  }
}
