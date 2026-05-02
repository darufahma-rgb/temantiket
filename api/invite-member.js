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
    if (memberErr) return res.status(500).json({ error: `DB error: ${memberErr.message}` });
    if (!callerMembership) return res.status(403).json({ error: 'Caller belum ter-link ke agency manapun' });
    if (callerMembership.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang bisa invite' });

    const { email, password, displayName } = req.body || {};
    const rawRole = req.body?.role;
    const role = rawRole === 'agent' ? 'agent' : rawRole === 'owner' ? 'owner' : 'staff';

    if (!email || !password) return res.status(400).json({ error: 'email & password wajib diisi' });
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter' });
    }

    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = existingList?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      return res.status(409).json({ error: `Email "${email}" sudah terdaftar sebagai user lain` });
    }

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) {
      return res.status(500).json({ error: `Gagal buat user: ${createErr?.message ?? 'unknown'}` });
    }
    const newUserId = created.user.id;

    const { error: addErr } = await admin.from('agency_members').insert({
      agency_id: callerMembership.agency_id, user_id: newUserId, role,
    });
    if (addErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return res.status(500).json({ error: `Gagal tambah membership: ${addErr.message}` });
    }

    const { error: profileErr } = await admin.from('profiles').upsert(
      { id: newUserId, email, full_name: fullName },
      { onConflict: 'id' }
    );
    if (profileErr) {
      return res.status(200).json({
        ok: true, userId: newUserId, email, role, fullName,
        warning: `User dibuat tapi gagal isi profile: ${profileErr.message}`,
      });
    }

    return res.status(200).json({ ok: true, userId: newUserId, email, role, fullName });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
