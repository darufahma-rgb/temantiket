'use strict';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function makeAdminClient() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel Environment Variables.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, agencyName, displayName } = req.body || {};
    if (!email || !password || !agencyName) {
      return res.status(400).json({ error: 'email, password, agencyName required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter' });
    }

    const admin = makeAdminClient();

    const { count, error: countErr } = await admin
      .from('agencies').select('*', { count: 'exact', head: true });
    if (countErr) return res.status(500).json({ error: countErr.message });
    if ((count ?? 0) > 0) {
      return res.status(403).json({ error: 'Bootstrap sudah dilakukan. Mintalah owner untuk invite.' });
    }

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) {
      return res.status(500).json({ error: createErr?.message ?? 'Gagal buat user' });
    }
    const userId = created.user.id;

    const { data: agency, error: agencyErr } = await admin
      .from('agencies').insert({ name: agencyName, owner_id: userId }).select().single();
    if (agencyErr || !agency) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({ error: agencyErr?.message ?? 'Gagal buat agency' });
    }

    const { error: memberErr } = await admin.from('agency_members').insert({
      agency_id: agency.id, user_id: userId, role: 'owner',
    });
    if (memberErr) {
      await admin.from('agencies').delete().eq('id', agency.id);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({ error: memberErr.message });
    }

    await admin.from('profiles').upsert(
      { id: userId, email, full_name: fullName },
      { onConflict: 'id' }
    );

    return res.status(200).json({ ok: true, agencyId: agency.id, userId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
