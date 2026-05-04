'use strict';

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
// Prefer Replit AI Integration key, fall back to user-supplied OPENAI_API_KEY
const OPENAI_API_KEY = (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE_URL = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

function ok(res, data) {
  return res.status(200).json(data);
}
function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function makeAdminClient() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi di server');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set. Tambahkan di Secrets panel Replit.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getCallerUser(authHeader) {
  if (!authHeader) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/* ──────────────────────────────────────────────
   POST /api/bootstrap
   One-time setup: buat user + agency + owner membership
────────────────────────────────────────────── */
app.post('/api/bootstrap', async (req, res) => {
  try {
    const { email, password, agencyName, displayName } = req.body || {};
    if (!email || !password || !agencyName) {
      return err(res, 400, 'email, password, agencyName required');
    }
    if (typeof password !== 'string' || password.length < 8) {
      return err(res, 400, 'Password minimal 8 karakter');
    }

    const admin = makeAdminClient();

    const { count, error: countErr } = await admin
      .from('agencies').select('*', { count: 'exact', head: true });
    if (countErr) return err(res, 500, countErr.message);
    if ((count ?? 0) > 0) {
      return err(res, 403, 'Bootstrap sudah dilakukan. Mintalah owner untuk invite.');
    }

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) {
      return err(res, 500, createErr?.message ?? 'Gagal buat user');
    }
    const userId = created.user.id;

    const { data: agency, error: agencyErr } = await admin
      .from('agencies').insert({ name: agencyName, owner_id: userId }).select().single();
    if (agencyErr || !agency) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return err(res, 500, agencyErr?.message ?? 'Gagal buat agency');
    }

    const { error: memberErr } = await admin.from('agency_members').insert({
      agency_id: agency.id, user_id: userId, role: 'owner',
    });
    if (memberErr) {
      await admin.from('agencies').delete().eq('id', agency.id);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return err(res, 500, memberErr.message);
    }

    await admin.from('profiles').upsert(
      { id: userId, email, full_name: fullName },
      { onConflict: 'id' }
    );

    return ok(res, { ok: true, agencyId: agency.id, userId });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/invite-member
   Owner invites staff/agent: buat auth user + profiles + agency_members
────────────────────────────────────────────── */
app.post('/api/invite-member', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    const { data: callerMembership, error: memberErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memberErr) return err(res, 500, `DB error: ${memberErr.message}`);
    if (!callerMembership) return err(res, 403, 'Caller belum ter-link ke agency manapun');
    if (callerMembership.role !== 'owner') return err(res, 403, 'Hanya owner yang bisa invite');

    const { email, password, displayName } = req.body || {};
    const rawRole = req.body.role;
    const role = rawRole === 'agent' ? 'agent' : rawRole === 'owner' ? 'owner' : 'staff';

    if (!email || !password) return err(res, 400, 'email & password wajib diisi');
    if (typeof password !== 'string' || password.length < 8) {
      return err(res, 400, 'Password minimal 8 karakter');
    }

    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = existingList?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      return err(res, 409, `Email "${email}" sudah terdaftar sebagai user lain`);
    }

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) {
      return err(res, 500, `Gagal buat user: ${createErr?.message ?? 'unknown'}`);
    }
    const newUserId = created.user.id;

    const { error: addErr } = await admin.from('agency_members').insert({
      agency_id: callerMembership.agency_id, user_id: newUserId, role,
    });
    if (addErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return err(res, 500, `Gagal tambah membership (auth user di-rollback): ${addErr.message}`);
    }

    const { error: profileErr } = await admin.from('profiles').upsert(
      { id: newUserId, email, full_name: fullName },
      { onConflict: 'id' }
    );
    if (profileErr) {
      return ok(res, {
        ok: true, userId: newUserId, email, role, fullName,
        warning: `User dibuat tapi gagal isi profile: ${profileErr.message}`,
      });
    }

    return ok(res, { ok: true, userId: newUserId, email, role, fullName });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/remove-member
   Owner removes staff/agent dari agency
────────────────────────────────────────────── */
app.post('/api/remove-member', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    const { data: callerMembership, error: memberErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memberErr || !callerMembership) return err(res, 403, 'Tidak terdaftar di agency');
    if (callerMembership.role !== 'owner') return err(res, 403, 'Hanya owner yang bisa hapus anggota');

    const { userId } = req.body || {};
    if (!userId || typeof userId !== 'string') return err(res, 400, 'userId required');
    if (userId === caller.id) return err(res, 400, 'Tidak bisa hapus diri sendiri');

    const { data: target, error: targetErr } = await admin
      .from('agency_members').select('role')
      .eq('agency_id', callerMembership.agency_id).eq('user_id', userId).maybeSingle();
    if (targetErr || !target) return err(res, 404, 'User tidak ditemukan di agency ini');
    if (target.role === 'owner') return err(res, 400, 'Tidak bisa hapus sesama owner');

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return err(res, 500, delErr.message);

    return ok(res, { ok: true });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/ai/chat
   Server-side OpenAI proxy — keeps OPENAI_API_KEY off the browser bundle.
   Accepts a full OpenAI chat-completions request body and proxies it.
────────────────────────────────────────────── */
app.post('/api/ai/chat', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return err(res, 503, 'OPENAI_API_KEY belum di-set. Tambahkan di Replit Secrets.');
    }
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    res.status(response.status).set('Content-Type', 'application/json').send(text);
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   Serve static frontend in production
────────────────────────────────────────────── */
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  const staticDir = __dirname;
  app.use(express.static(staticDir));
  app.get('*', (req, res) => {
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('index.html not found');
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  const mode = isProd ? 'production' : 'development';
  console.log(`[server] API running on port ${PORT} (${mode})`);
  if (!SERVICE_ROLE_KEY) {
    console.warn('[server] ⚠️  SUPABASE_SERVICE_ROLE_KEY tidak di-set — fitur invite/remove member tidak akan berfungsi');
  }
  if (!SUPABASE_URL) {
    console.warn('[server] ⚠️  VITE_SUPABASE_URL tidak ditemukan');
  }
});
