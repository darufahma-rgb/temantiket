'use strict';

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const ws = require('ws');

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// ── OpenRouter — Caption Generator & OCR ────────────────────────────────────
// Digunakan untuk: Caption Generator (marketing), OCR Paspor, teks ringan.
// OCR Paspor  → google/gemini-2.0-flash-001  (vision, murah, cepat)
// Caption     → openai/gpt-4.1               (terbaru, stabil)
// Teks umum   → google/gemini-2.0-flash-001  (murah, mendukung teks & vision)
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Model constants (OpenRouter format: "provider/model")
// ✓ Verified valid on OpenRouter as of 2025-05
const MODEL_OCR          = 'google/gemini-2.0-flash-001'; // vision — baca gambar paspor & poster
const MODEL_OCR_FALLBACK = 'google/gemini-flash-1.5';     // fallback jika primary gagal
const MODEL_CHAT         = 'openai/gpt-4.1';              // Caption Generator
const MODEL_TEXT         = 'google/gemini-2.0-flash-001'; // teks ringan / rapikan

// Header standar OpenRouter
function openrouterHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'HTTP-Referer': 'https://temantiket.replit.app',
    'X-Title': 'Temantiket',
  };
}

// ── OpenAI — AITEM (Asisten AI) ──────────────────────────────────────────────
// Digunakan HANYA untuk AITEM (AI Command Center / chat assistant).
// Tidak ada fallback ke OpenRouter di sini.
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const MODEL_ASSISTANT = 'gpt-4o-mini';  // AITEM

// Header standar OpenAI
function openaiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  };
}

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
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
}

// Race a Supabase (or any) promise against a hard timeout so requests
// never hang indefinitely when the Supabase network is slow.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message || `Operasi timeout setelah ${ms / 1000}s — coba lagi`)), ms)
    ),
  ]);
}

// Extract raw JWT from "Bearer <token>" or plain token string.
function extractToken(authHeader) {
  if (!authHeader) return null;
  const t = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  return t || null;
}

// Validate a caller JWT using the admin (service-role) client.
// Using admin.auth.getUser(token) is the correct server-side approach in
// @supabase/supabase-js v2 — it passes the JWT explicitly, bypassing the
// (empty) session store that caused "NOT_FOUND sin1::..." errors when the
// old approach relied on global headers + getUser() with no argument.
async function getCallerUser(authHeader, timeoutMs = 8000) {
  if (!authHeader || !SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const token = extractToken(authHeader);
  if (!token) return null;
  try {
    const admin = makeAdminClient();
    const { data, error } = await Promise.race([
      admin.auth.getUser(token),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auth check timed out')), timeoutMs)
      ),
    ]);
    if (error || !data?.user) {
      console.warn('[getCallerUser] auth.getUser gagal:', error?.message ?? 'user null');
      return null;
    }
    return data.user;
  } catch (e) {
    console.warn('[getCallerUser] exception:', e instanceof Error ? e.message : e);
    return null;
  }
}

// Classify a Supabase DB/storage error and return a human-readable hint.
function classifySupabaseError(err, context) {
  if (!err) return null;
  const msg  = (err.message  ?? '').toLowerCase();
  const code = (err.code     ?? '').toLowerCase();
  const hint = (err.hint     ?? '').toLowerCase();
  const details = (err.details ?? '').toLowerCase();

  // API-gateway 404 — usually means wrong SERVICE_ROLE_KEY (different project)
  // or the Supabase project is paused / URL is wrong.
  if (
    msg.includes('not_found') || msg.includes('not found') ||
    code === 'not_found' || code === 'pgrst301' ||
    details.includes('not found') || hint.includes('not found')
  ) {
    return (
      `[${context}] Supabase API returned NOT_FOUND. ` +
      `Kemungkinan penyebab: (1) SUPABASE_SERVICE_ROLE_KEY bukan dari project yang sama dengan VITE_SUPABASE_URL, ` +
      `atau (2) project Supabase sedang di-pause. ` +
      `Cek Secrets Replit — SUPABASE_SERVICE_ROLE_KEY harus dari project ${SUPABASE_URL}.`
    );
  }

  // Column missing (migration belum dijalankan)
  if (
    msg.includes('card_back_image_url') || msg.includes('column') ||
    code === '42703' || code === 'pgrst204'
  ) {
    return (
      `[${context}] Kolom card_back_image_url belum ada di tabel agency_members. ` +
      `Jalankan supabase/card-back-image-migration.sql di Supabase SQL Editor.`
    );
  }

  return null;
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
    // Check prerequisites FIRST — before any network calls — so we fail fast
    // with a clear error instead of hanging forever waiting for getCallerUser.
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503,
        'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. ' +
        'Tambahkan key ini di Secrets / Environment Variables Replit, lalu restart server.'
      );
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader).catch(() => null);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    const { data: callerMembership, error: memberErr } = await withTimeout(
      admin.from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle(),
      10000, 'DB timeout — cek koneksi Supabase dan coba lagi'
    );
    if (memberErr) return err(res, 500, `DB error: ${memberErr.message}`);
    if (!callerMembership) return err(res, 403, 'Caller belum ter-link ke agency manapun');
    if (callerMembership.role !== 'owner') return err(res, 403, 'Hanya owner yang bisa invite');

    const { email, password, displayName } = req.body || {};
    const rawRole = req.body.role;
    const role = rawRole === 'agent' ? 'agent' : rawRole === 'owner' ? 'owner' : 'staff';

    // Extra agent fields (agent-only, optional)
    const commissionPct = typeof req.body.commissionPct === 'number'
      ? Math.max(0, Math.min(100, req.body.commissionPct)) : null;
    const whatsappNumber = (req.body.whatsappNumber ?? '').toString().trim() || null;
    const agentStatus    = req.body.agentStatus === 'inactive' ? 'inactive' : 'active';
    const agentNotes     = (req.body.agentNotes ?? '').toString().trim() || null;

    if (!email || !password) return err(res, 400, 'email & password wajib diisi');
    if (typeof password !== 'string' || password.length < 8) {
      return err(res, 400, 'Password minimal 8 karakter');
    }

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await withTimeout(
      admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: fullName },
      }),
      15000, 'Timeout saat membuat user — coba lagi'
    );
    if (createErr || !created.user) {
      // Supabase returns "User already registered" when email is taken
      const isDuplicate = createErr?.message?.toLowerCase().includes('already registered')
        || createErr?.message?.toLowerCase().includes('already exists');
      if (isDuplicate) {
        return err(res, 409, `Email "${email}" sudah terdaftar sebagai user lain`);
      }
      return err(res, 500, `Gagal buat user: ${createErr?.message ?? 'unknown'}`);
    }
    const newUserId = created.user.id;

    // Insert membership — include commission_pct if provided
    const membershipRow = {
      agency_id: callerMembership.agency_id, user_id: newUserId, role,
      ...(commissionPct !== null ? { commission_pct: commissionPct } : {}),
    };
    const { error: addErr } = await withTimeout(
      admin.from('agency_members').insert(membershipRow),
      10000, 'Timeout saat menyimpan membership'
    );
    if (addErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return err(res, 500, `Gagal tambah membership (auth user di-rollback): ${addErr.message}`);
    }

    // Upsert profile — include extra agent fields gracefully
    const profileRow = { id: newUserId, email, full_name: fullName };
    if (whatsappNumber) profileRow.phone_wa = whatsappNumber;
    if (agentNotes)     profileRow.notes    = agentNotes;
    if (role === 'agent') profileRow.is_active = (agentStatus !== 'inactive');

    const { error: profileErr } = await withTimeout(
      admin.from('profiles').upsert(profileRow, { onConflict: 'id' }),
      10000, 'Timeout saat menyimpan profil'
    );
    const warnings = [];
    if (profileErr) warnings.push(`profile: ${profileErr.message}`);

    // Auto-create wallet seed record for new agents so their wallet exists
    // in the database immediately. Non-critical: failure only adds a warning.
    if (role === 'agent') {
      const walletSeedId = `wtx-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { error: walletErr } = await withTimeout(
        admin.from('agent_wallet_transactions').insert({
          id:           walletSeedId,
          agency_id:    callerMembership.agency_id,
          agent_id:     newUserId,
          type:         'adjustment',
          points_delta: 0,
          amount_idr:   0,
          description:  'Wallet dibuat otomatis saat registrasi agen',
          created_by:   caller.id,
          created_at:   new Date().toISOString(),
        }),
        10000, 'Timeout saat membuat wallet agen'
      );
      if (walletErr) warnings.push(`wallet_seed: ${walletErr.message}`);
    }

    return ok(res, {
      ok: true, userId: newUserId, email, role, fullName,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (e) {
    return err(res, 500, e?.message || 'Terjadi kesalahan internal');
  }
});

/* ──────────────────────────────────────────────
   POST /api/remove-member
   Owner removes staff/agent dari agency
────────────────────────────────────────────── */
app.post('/api/remove-member', async (req, res) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503,
        'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. ' +
        'Tambahkan key ini di Secrets / Environment Variables Replit, lalu restart server.'
      );
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader).catch(() => null);
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
   POST /api/award-completion-points
   Owner menandai order selesai → agen mendapat 20 poin di agent_points.
   Menggunakan service role untuk upsert karena RLS hanya izinkan trigger.
────────────────────────────────────────────── */
app.post('/api/award-completion-points', async (req, res) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503,
        'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. Tambahkan di Secrets Replit lalu restart server.'
      );
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader).catch(() => null);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    const { data: callerMembership, error: memberErr } = await withTimeout(
      admin.from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle(),
      10000, 'DB timeout — cek koneksi Supabase'
    );
    if (memberErr || !callerMembership) return err(res, 403, 'Tidak terdaftar di agency');
    if (!['owner', 'staff'].includes(callerMembership.role)) {
      return err(res, 403, 'Hanya owner atau staff yang bisa award poin');
    }

    const { orderId, agentId } = req.body || {};
    if (!orderId || !agentId) return err(res, 400, 'orderId dan agentId diperlukan');

    const agencyId = callerMembership.agency_id;

    // Validasi: agentId harus role "agent" di agency ini
    const { data: targetMember, error: targetErr } = await withTimeout(
      admin.from('agency_members').select('role').eq('user_id', agentId).eq('agency_id', agencyId).maybeSingle(),
      8000, 'DB timeout saat verifikasi agen'
    );
    if (targetErr || !targetMember) return err(res, 404, 'Agen tidak ditemukan di agency ini');
    if (targetMember.role !== 'agent') {
      return ok(res, { ok: true, awarded: 0, reason: 'not_agent', role: targetMember.role });
    }

    const { error: upsertErr } = await withTimeout(
      admin.from('agent_points').upsert(
        { agency_id: agencyId, agent_id: agentId, order_id: orderId, points: 20, reason: 'order_completed' },
        { onConflict: 'order_id' }
      ),
      10000, 'DB timeout saat upsert poin'
    );
    if (upsertErr) return err(res, 500, upsertErr.message);

    return ok(res, { ok: true, points: 20 });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/revoke-order-points
   Cabut poin agen jika order dikembalikan dari status Completed.
   Hanya owner/staff yang bisa. Menggunakan service role untuk DELETE.
────────────────────────────────────────────── */
app.post('/api/revoke-order-points', async (req, res) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503, 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader).catch(() => null);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    const { data: callerMembership, error: memberErr } = await withTimeout(
      admin.from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle(),
      10000, 'DB timeout'
    );
    if (memberErr || !callerMembership) return err(res, 403, 'Tidak terdaftar di agency');
    if (!['owner', 'staff'].includes(callerMembership.role)) {
      return err(res, 403, 'Hanya owner atau staff yang bisa revoke poin');
    }

    const { orderId } = req.body || {};
    if (!orderId) return err(res, 400, 'orderId diperlukan');

    const { error: delErr } = await withTimeout(
      admin.from('agent_points')
        .delete()
        .eq('order_id', orderId)
        .eq('agency_id', callerMembership.agency_id),
      10000, 'DB timeout saat revoke poin'
    );
    if (delErr) return err(res, 500, delErr.message);

    return ok(res, { ok: true, revoked: orderId });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/export/invoice
   PDF invoice generation (ported from Vercel serverless function)
────────────────────────────────────────────── */
app.post('/api/export/invoice', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const data = req.body;
    if (!data || !data.order) return err(res, 400, 'Missing order data');

    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const { default: fontkit } = await import('@pdf-lib/fontkit');

    // ── A4 dimensions ────────────────────────────────────────────────────────
    const W = 595.28, H = 841.89;

    // ── Presisi Blue palette ──────────────────────────────────────────────────
    const DARK        = rgb(0.055, 0.086, 0.165);
    const SKY         = rgb(0.031, 0.545, 0.757);
    const WHITE       = rgb(1, 1, 1);
    const MUTED       = rgb(0.41, 0.45, 0.52);
    const ROW_ALT     = rgb(0.952, 0.967, 0.990);
    const BLUE_LINE   = rgb(0.76, 0.86, 0.94);
    const LOGO_SUB    = rgb(0.50, 0.69, 0.82);
    const HEADER_SUB  = rgb(0.62, 0.77, 0.88);
    const TOTAL_LABEL = rgb(0.54, 0.70, 0.82);
    const TOTAL_META  = rgb(0.47, 0.62, 0.73);
    const RED         = rgb(0.91, 0.26, 0.21);
    const CONFIRMED   = rgb(0.16, 0.74, 0.43);
    const PENDING     = rgb(0.93, 0.67, 0.13);

    const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
    const fmtEGP = (v) => new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2 }).format(v);

    // ── Drawing helpers ───────────────────────────────────────────────────────
    function drawRect(page, x, y, w, h, fill, opacity = 1) {
      page.drawRectangle({ x, y, width: w, height: h, color: fill, opacity });
    }
    function txt(page, text, x, y, size, font, color = DARK, maxWidth) {
      let t = String(text ?? '');
      if (maxWidth) {
        while (t.length > 4 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -4) + '…';
      }
      page.drawText(t, { x, y, size, font, color });
    }
    function txtRight(page, text, rightX, y, size, font, color = DARK) {
      const w = font.widthOfTextAtSize(String(text), size);
      page.drawText(String(text), { x: rightX - w, y, size, font, color });
    }
    function txtCenter(page, text, cx, y, size, font, color = DARK) {
      const w = font.widthOfTextAtSize(String(text), size);
      page.drawText(String(text), { x: cx - w / 2, y, size, font, color });
    }
    function sepLine(page, x1, y, x2) {
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: BLUE_LINE });
    }

    // ── Plane icon (white, SVG polygon paths) ─────────────────────────────────
    function drawTemantiketIcon(page, ix, iy, scale) {
      const opts = { x: ix, y: iy, scale, color: WHITE, borderWidth: 0 };
      page.drawSvgPath('M26 9 L34 9 L34 53 L26 53 Z', opts);
      page.drawSvgPath('M25 26 L3 39 L6 45 L25 34 Z', opts);
      page.drawSvgPath('M35 26 L57 39 L54 45 L35 34 Z', opts);
      page.drawSvgPath('M27 47 L16 57 L19 57 L27 51 Z', opts);
      page.drawSvgPath('M33 47 L44 57 L41 57 L33 51 Z', opts);
    }

    function orderTypeLabel(type) {
      const m = { flight: 'Tiket Pesawat', umrah: 'Umrah & Haji', visa_voa: 'Visa VOA', visa_student: 'Visa Pelajar' };
      return m[type] ?? type;
    }
    function buildDetailRows(order, meta) {
      const rows = [];
      if (order.type === 'flight') {
        const from = `${meta.fromCity ?? meta.fromCode ?? '—'} (${meta.fromCode ?? '—'})`;
        const to   = `${meta.toCity   ?? meta.toCode   ?? '—'} (${meta.toCode   ?? '—'})`;
        if (meta.fromCode || meta.toCode) rows.push(['Rute Penerbangan', `${from} → ${to}`]);
        if (meta.airline)      rows.push(['Maskapai', `${meta.airline}${meta.flightNumber ? ` · ${meta.flightNumber}` : ''}`]);
        if (meta.departDate)   rows.push(['Tanggal Berangkat', String(meta.departDate)]);
        if (meta.departTime)   rows.push(['Waktu Berangkat',   String(meta.departTime)]);
        if (meta.arriveTime)   rows.push(['Waktu Tiba',        String(meta.arriveTime)]);
        if (meta.passengerName) rows.push(['Nama Penumpang',   String(meta.passengerName)]);
        if (meta.pnr)          rows.push(['Kode PNR',          String(meta.pnr)]);
      } else if (order.type === 'umrah') {
        if (meta.projectName)  rows.push(['Paket Umrah',  String(meta.projectName)]);
        if (meta.timeline)     rows.push(['Jadwal',        String(meta.timeline)]);
        if (meta.pax)          rows.push(['Jumlah Pax',    `${meta.pax} orang`]);
        if (meta.hotelMakkah)  rows.push(['Hotel Makkah',  String(meta.hotelMakkah)]);
        if (meta.hotelMadinah) rows.push(['Hotel Madinah', String(meta.hotelMadinah)]);
      } else if (order.type === 'visa_voa' || order.type === 'visa_student') {
        if (meta.passengerName)  rows.push(['Nama',       String(meta.passengerName)]);
        if (meta.passportNumber) rows.push(['No. Paspor', String(meta.passportNumber)]);
        if (meta.destination)    rows.push(['Tujuan',     String(meta.destination)]);
      }
      if (order.title) rows.push(['Keterangan Order', order.title]);
      rows.push(['Status', order.status]);
      return rows;
    }

    // ── PDF generation ────────────────────────────────────────────────────────
    async function generateInvoicePdf(invoiceData) {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      // Load SK Modernist; fall back to Helvetica
      let bold, regular;
      const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      try {
        const boldBytes = fs.readFileSync(path.join(__dirname, '../public/fonts/Sk-Modernist-Bold.otf'));
        const regBytes  = fs.readFileSync(path.join(__dirname, '../public/fonts/Sk-Modernist-Regular.otf'));
        bold    = await pdfDoc.embedFont(boldBytes);
        regular = await pdfDoc.embedFont(regBytes);
      } catch {
        bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }

      const page = pdfDoc.addPage([W, H]);
      const { order, client, invoiceNumber, invoiceDate } = invoiceData;
      const meta = (order.metadata ?? {});

      // ── Custom template overlay ─────────────────────────────────────────────
      if (invoiceData.templateDataUrl) {
        try {
          const base64    = invoiceData.templateDataUrl.split(',')[1];
          const imgBytes  = Buffer.from(base64, 'base64');
          const isJpeg    = invoiceData.templateDataUrl.startsWith('data:image/jpeg') || invoiceData.templateDataUrl.startsWith('data:image/jpg');
          const img       = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
          page.drawImage(img, { x: 0, y: 0, width: W, height: H });
          drawRect(page, 30, 160, W - 60, H - 240, WHITE, 0.88);
          txtRight(page, invoiceNumber, W - 40, H - 50, 13, bold, DARK);
          txtRight(page, invoiceDate,   W - 40, H - 67, 9, regular, MUTED);
          let y = H - 115;
          txt(page, 'KEPADA:', 50, y, 8, regular, MUTED);
          txt(page, client?.name ?? '—', 50, y - 16, 14, bold, DARK);
          y -= 50;
          sepLine(page, 40, y, W - 40);
          y -= 24;
          const rows2 = buildDetailRows(order, meta);
          rows2.forEach(([label, value], i) => {
            const ry = y - i * 21;
            txt(page, label, 50, ry, 8.5, regular, MUTED);
            txt(page, value, 240, ry, 8.5, bold, DARK, W - 290);
          });
          y -= rows2.length * 21 + 20;
          sepLine(page, 40, y, W - 40);
          y -= 28;
          const tf = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
          txt(page, 'TOTAL:', 50, y, 10, bold, DARK);
          txtRight(page, tf, W - 50, y, 14, bold, SKY);
          if (order.notes) {
            y -= 36;
            txt(page, `Catatan: ${order.notes}`, 50, y, 8, oblique, MUTED, W - 100);
          }
          const wm = 'by Temantiket';
          const wmW = regular.widthOfTextAtSize(wm, 8);
          page.drawText(wm, { x: W / 2 - wmW / 2, y: 26, size: 8, font: regular, color: rgb(0.68, 0.71, 0.76), opacity: 0.55 });
          return await pdfDoc.save();
        } catch { /* fall through to built-in */ }
      }

      // ── PRESISI BLUE built-in template ────────────────────────────────────────

      // Header
      const HEADER_H = 128;
      drawRect(page, 0, H - HEADER_H, W, HEADER_H, DARK);
      drawRect(page, 0, H - HEADER_H, W, 3, SKY);                       // bottom sky accent
      drawRect(page, W - 210, H - HEADER_H, 210, HEADER_H, SKY, 0.065); // right glow
      page.drawLine({ start: { x: W - 170, y: H }, end: { x: W - 28,  y: H - HEADER_H }, thickness: 52, color: WHITE, opacity: 0.032 });
      page.drawLine({ start: { x: W - 220, y: H }, end: { x: W - 80,  y: H - HEADER_H }, thickness: 28, color: WHITE, opacity: 0.022 });

      // Logo icon + brand text
      drawTemantiketIcon(page, 38, H - 44, 0.48);
      txt(page, 'temantiket', 73, H - 50, 22, bold, WHITE);
      txt(page, 'mudah, cepat, amanah', 73, H - 68, 7.5, regular, LOGO_SUB);

      // INVOICE label
      drawRect(page, 37, H - 99, 3, 22, SKY);
      txt(page, 'INVOICE', 46, H - 93, 8.5, bold, SKY);

      // Invoice number, date, status badge
      txtRight(page, invoiceNumber, W - 40, H - 44, 13, bold, WHITE);
      txtRight(page, `Tanggal: ${invoiceDate}`, W - 40, H - 61, 8.5, regular, HEADER_SUB);
      const statusLabel = (order.status || '').toUpperCase();
      const statusColor = order.status === 'Confirmed' ? CONFIRMED : order.status === 'Cancelled' ? RED : PENDING;
      const sBadgeW = bold.widthOfTextAtSize(statusLabel, 7.5) + 20;
      const sBadgeX = W - 40 - sBadgeW;
      drawRect(page, sBadgeX, H - 98, sBadgeW, 17, statusColor, 0.22);
      txt(page, statusLabel, sBadgeX + (sBadgeW - bold.widthOfTextAtSize(statusLabel, 7.5)) / 2, H - 93, 7.5, bold, statusColor);

      // Client section
      const clientY = H - 150;
      txt(page, 'INVOICE UNTUK:', 40, clientY, 7.5, regular, MUTED);
      txt(page, client?.name ?? 'Klien tidak diketahui', 40, clientY - 18, 15, bold, DARK);
      if (client?.phone) txt(page, client.phone, 40, clientY - 36, 9, regular, MUTED);
      const rightCol = W - 40;
      txtRight(page, 'No. Order:', rightCol, clientY, 8, regular, MUTED);
      txtRight(page, (order.id || '').slice(0, 13) + '…', rightCol, clientY - 15, 8, bold, DARK);
      txtRight(page, 'Tipe:', rightCol, clientY - 30, 8, regular, MUTED);
      txtRight(page, orderTypeLabel(order.type), rightCol, clientY - 45, 8, bold, DARK);
      sepLine(page, 40, clientY - 57, W - 40);

      // Detail table
      let rowY = clientY - 77;
      drawRect(page, 40, rowY - 20, W - 80, 22, DARK);
      drawRect(page, 40, rowY - 20, 4,      22, SKY);
      txt(page, 'DETAIL PEMESANAN', 55, rowY - 13, 8, bold, WHITE);
      txtRight(page, 'INFORMASI', W - 55, rowY - 13, 8, bold, WHITE);
      rowY -= 20;

      const rows = buildDetailRows(order, meta);
      rows.forEach(([label, value], i) => {
        const ry = rowY - i * 22;
        if (i % 2 === 1) drawRect(page, 40, ry - 16, W - 80, 22, ROW_ALT);
        txt(page, label, 55, ry, 8.5, regular, MUTED);
        txt(page, value, W / 2 + 4, ry, 8.5, bold, DARK, W / 2 - 68);
      });
      rowY -= rows.length * 22 + 10;
      sepLine(page, 40, rowY, W - 40);
      rowY -= 30;

      // Total box
      const totalFormatted = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
      const boxH = 60;
      drawRect(page, 40, rowY - boxH, W - 80, boxH, DARK);
      drawRect(page, 40, rowY - boxH, 5,      boxH, SKY);
      drawRect(page, 40, rowY - 2,   W - 80, 2,    SKY);
      txt(page, 'TOTAL PEMBAYARAN', 57, rowY - 18, 8, regular, TOTAL_LABEL);
      txt(page, totalFormatted,     57, rowY - 40, 20, bold,   WHITE);
      txtRight(page, `Mata Uang: ${order.currency}`,  W - 55, rowY - 22, 7.5, regular, TOTAL_META);
      txtRight(page, 'Metode: Transfer Bank / Tunai', W - 55, rowY - 36, 7.5, regular, TOTAL_META);
      rowY -= boxH + 22;

      // Notes
      if (order.notes) {
        txt(page, 'Catatan:', 40, rowY, 8, regular, MUTED);
        txt(page, order.notes, 40, rowY - 14, 8, oblique, DARK, W - 80);
        rowY -= 40;
      }

      // Footer
      const footerY = 72;
      sepLine(page, 40, footerY + 32, W - 40);
      txtCenter(page, invoiceData.agencyName ?? 'Temantiket',        W / 2, footerY + 18, 9, bold,    MUTED);
      txtCenter(page, invoiceData.agencyPhone ?? '+62 813-1150-6025', W / 2, footerY +  4, 8, regular, MUTED);
      txtCenter(page, 'Terima kasih atas kepercayaan Anda!',          W / 2, footerY - 10, 8, oblique, MUTED);

      // Watermark
      const wm = 'by Temantiket';
      const wmW = regular.widthOfTextAtSize(wm, 8);
      page.drawText(wm, { x: W / 2 - wmW / 2, y: 26, size: 8, font: regular, color: rgb(0.68, 0.71, 0.76), opacity: 0.55 });

      return await pdfDoc.save();
    }

    const pdfBytes = await generateInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice.pdf"');
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('[api/export/invoice]', e);
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/export/igh
   IGH (Umrah offer) PDF generation (ported from Vercel serverless function)
   Uses dynamic import for ESM pdf-lib + @pdf-lib/fontkit
────────────────────────────────────────────── */
app.post('/api/export/igh', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const { data, layout, adminSettings, baseUrl: bodyBaseUrl } = req.body ?? {};
    if (!data) return err(res, 400, 'Missing data');

    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host  = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
    const baseUrl = bodyBaseUrl || (host ? `${proto}://${host}` : '');
    if (!baseUrl) return err(res, 400, 'Cannot resolve base URL for assets');

    // Forward to the ESM Vercel function handler by re-importing it as a module
    // Since api/export/igh.js is ESM with 'export default', we use dynamic import
    const ighModule = await import('../api/export/igh.js');
    const handler = ighModule.default;
    await handler(req, res);
  } catch (e) {
    console.error('[api/export/igh]', e);
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/ocr-passport
   Dedicated passport OCR via OpenAI vision.
   Requires valid Supabase JWT + agency membership.
────────────────────────────────────────────── */
app.post('/api/ocr-passport', async (req, res) => {
  try {
    console.log(`[ocr-passport] OPENROUTER_API_KEY detected: ${!!OPENROUTER_API_KEY}`);
    if (!OPENROUTER_API_KEY) {
      return err(res, 503, 'OPENROUTER_API_KEY tidak ditemukan. Pastikan sudah diset di environment variables.');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();
    const { data: membership, error: memErr } = await admin
      .from('agency_members').select('agency_id').eq('user_id', caller.id).maybeSingle();
    if (memErr || !membership) return err(res, 403, 'Tidak terdaftar di agency manapun');

    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return err(res, 400, 'imageDataUrl required');
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      return err(res, 400, 'imageDataUrl must be a data URL (data:image/...;base64,...)');
    }
    if (imageDataUrl.length > 6 * 1024 * 1024) {
      return err(res, 400, 'Image terlalu besar (>6 MB), tolong di-compress dulu');
    }

    // Model: google/gemini-2.0-flash-001 via OpenRouter
    // ✓ Vision-capable (bisa lihat gambar paspor)
    // ✓ Sangat murah (~$0.10/1M token)
    // ✓ Respons cepat (<2 detik)
    // Note: bytedance/seed-2.0-mini adalah model TEKS saja (tidak mendukung vision/gambar),
    //       sehingga tidak bisa dipakai untuk OCR paspor. Seed-2.0-mini dipakai di tugas teks ringan.
    const SYSTEM_PROMPT = `You are an OCR engine specialized in reading the Machine Readable Zone (MRZ) of international passports (ICAO 9303 TD3 format, two lines of 44 characters each).

Look at the bottom of the passport photo for the MRZ strip. Extract EXACTLY these 5 fields and return ONLY a JSON object (no prose, no markdown fences) with this exact shape:

{
  "name": "FULL NAME AS PRINTED (given names then surname, single space separated)",
  "passportNumber": "DOCUMENT NUMBER (alphanumeric, no '<' fillers)",
  "birthDate": "YYYY-MM-DD",
  "gender": "L for male, P for female",
  "expiryDate": "YYYY-MM-DD",
  "mrzValid": true
}

Rules:
- Only return the 5 fields above plus mrzValid. Do not return nationality or any other field.
- If a field is unreadable, set it to null (do NOT guess).
- For 2-digit years in MRZ: if year > 30 it means 19xx, otherwise 20xx for birth date. Expiry is always 20xx.
- Set mrzValid to true only if you successfully read all check digits and they all match.
- gender must be exactly "L" (laki-laki) or "P" (perempuan), null if unreadable.
- Return ONLY the JSON object, nothing else.`;

    // Try primary model first, fall back to MODEL_OCR_FALLBACK on invalid model error
    const ocrModelsToTry = [MODEL_OCR, MODEL_OCR_FALLBACK];
    let lastOcrError = '';
    let ocrRaw = null;
    let ocrUsedModel = MODEL_OCR;

    for (const tryModel of ocrModelsToTry) {
      console.log(`[ocr-passport] Calling OpenRouter — model: "${tryModel}"`);
      const ocrRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: openrouterHeaders(),
        body: JSON.stringify({
          model: tryModel,
          temperature: 0,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Read the MRZ from this passport and return the JSON.' },
                { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
              ],
            },
          ],
        }),
      });

      const bodyText = await ocrRes.text();

      if (!ocrRes.ok) {
        console.error(`[ocr-passport] Model "${tryModel}" HTTP ${ocrRes.status} error — provider response: ${bodyText.slice(0, 400)}`);
        lastOcrError = `OCR API error (${tryModel}) HTTP ${ocrRes.status}: ${bodyText.slice(0, 300)}`;
        if (
          bodyText.includes('not a valid model') ||
          bodyText.includes('model_not_found') ||
          bodyText.includes('No endpoints found')
        ) {
          console.warn(`[ocr-passport] Model "${tryModel}" tidak valid — aktivasi fallback ke model berikutnya`);
          continue;
        }
        return err(res, 502, lastOcrError);
      }

      let completion;
      try { completion = JSON.parse(bodyText); }
      catch { lastOcrError = `OCR model "${tryModel}" returned non-JSON response`; continue; }

      // Check for API-level error inside a 200 response body
      if (completion.error) {
        const errDetail = typeof completion.error === 'string'
          ? completion.error
          : JSON.stringify(completion.error);
        console.error(`[ocr-passport] Model "${tryModel}" API-level error — provider says: ${errDetail}`);
        lastOcrError = errDetail.slice(0, 300);
        if (
          errDetail.includes('not a valid model') ||
          errDetail.includes('model_not_found') ||
          errDetail.includes('No endpoints found')
        ) {
          console.warn(`[ocr-passport] Model "${tryModel}" tidak valid — aktivasi fallback ke model berikutnya`);
          continue;
        }
        return err(res, 502, `OCR error: ${lastOcrError}`);
      }

      const candidate = completion?.choices?.[0]?.message?.content;
      if (!candidate || typeof candidate !== 'string') {
        lastOcrError = `OCR model "${tryModel}" returned empty response`;
        continue;
      }

      ocrRaw = candidate;
      ocrUsedModel = tryModel;
      console.log(`[ocr-passport] Success — model: "${tryModel}"`);
      break;
    }

    if (!ocrRaw) {
      return err(res, 502, lastOcrError || 'Semua model OCR gagal — coba lagi');
    }

    let parsed;
    try { parsed = JSON.parse(ocrRaw); }
    catch { return err(res, 502, `OCR model returned invalid JSON: ${ocrRaw.slice(0, 100)}`); }

    const out = { source: 'openrouter', model: ocrUsedModel, mrzValid: parsed.mrzValid === true };
    if (typeof parsed.name === 'string' && parsed.name.trim()) out.name = parsed.name.trim();
    if (typeof parsed.passportNumber === 'string' && parsed.passportNumber.trim()) {
      out.passportNumber = parsed.passportNumber.replace(/[<\s]/g, '').toUpperCase();
    }
    if (typeof parsed.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.birthDate)) {
      out.birthDate = parsed.birthDate;
    }
    if (typeof parsed.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate)) {
      out.expiryDate = parsed.expiryDate;
    }
    if (parsed.gender === 'L' || parsed.gender === 'P') out.gender = parsed.gender;

    return ok(res, out);
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/ai/chat
   Caption Generator & fitur OpenRouter lainnya.
   Hanya menggunakan OpenRouter — TIDAK ada OpenAI di sini.
   Jika caller tidak set model di body, server inject MODEL_CHAT.
────────────────────────────────────────────── */
app.post('/api/ai/chat', async (req, res) => {
  try {
    console.log(`[Caption Generator] OPENROUTER_API_KEY detected: ${!!OPENROUTER_API_KEY}`);
    if (!OPENROUTER_API_KEY) {
      return err(res, 503, 'OPENROUTER_API_KEY tidak ditemukan. Pastikan sudah diset di environment variables.');
    }

    // Inject model default jika caller tidak set.
    const requestedModel = req.body.model || MODEL_CHAT;

    // OpenRouter mengharuskan format "provider/model".
    // Jika model dikirim tanpa slash (bare name), prepend "openai/" sebagai safety net.
    const resolvedModel = (typeof requestedModel === 'string' && !requestedModel.includes('/'))
      ? `openai/${requestedModel}`
      : requestedModel;

    console.log(`[Caption Generator] Using OpenRouter with model: ${resolvedModel}`);

    const bodyWithModel = { ...req.body, model: resolvedModel };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: openrouterHeaders(),
        body: JSON.stringify(bodyWithModel),
        signal: controller.signal,
      });
      const text = await response.text();
      res.status(response.status).set('Content-Type', 'application/json').send(text);
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') return err(res, 504, 'AI request timeout (90 s) — coba lagi.');
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/ai/assistant
   AITEM (Asisten AI / AI Command Center).
   Hanya menggunakan OpenAI — TIDAK ada OpenRouter di sini.
   Mendukung function calling (tools) untuk kontrol penuh Temantiket.
────────────────────────────────────────────── */
app.post('/api/ai/assistant', async (req, res) => {
  try {
    console.log(`[AITEM] OPENAI_API_KEY detected: ${!!OPENAI_API_KEY}`);
    if (!OPENAI_API_KEY) {
      return err(res, 503, 'OPENAI_API_KEY tidak ditemukan. Pastikan sudah diset di environment variables.');
    }

    // Inject model default jika caller tidak set.
    // Model harus format OpenAI (bukan "provider/model" — itu format OpenRouter).
    const requestedModel = req.body.model || MODEL_ASSISTANT;

    // Jika model mengandung slash (format OpenRouter), strip prefix dan ambil nama model saja.
    const resolvedModel = (typeof requestedModel === 'string' && requestedModel.includes('/'))
      ? requestedModel.split('/').slice(1).join('/')
      : requestedModel;

    console.log(`[AITEM] Using OpenAI with model: ${resolvedModel}`);

    const bodyWithModel = { ...req.body, model: resolvedModel };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(),
        body: JSON.stringify(bodyWithModel),
        signal: controller.signal,
      });
      const text = await response.text();
      res.status(response.status).set('Content-Type', 'application/json').send(text);
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') return err(res, 504, 'AITEM request timeout (90 s) — coba lagi.');
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/credit-wallet-tx
   Insert a wallet transaction using service-role key so RLS never blocks
   cross-agent credits (e.g. owner crediting a field agent's wallet).
   Validates the caller is an authenticated member of the agency, then
   upserts to agent_wallet_transactions. Idempotent via tx ID conflict.
────────────────────────────────────────────── */
app.post('/api/credit-wallet-tx', async (req, res) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503, 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. Tambahkan di Secrets Replit lalu restart server.');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader, 8000).catch(() => null);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    // Verify caller belongs to the stated agency
    const { data: membership, error: memErr } = await withTimeout(
      admin.from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle(),
      8000, 'DB timeout saat verifikasi membership'
    );
    if (memErr || !membership) {
      console.error('[credit-wallet-tx] membership lookup error:', memErr?.message);
      return err(res, 403, 'Tidak terdaftar di agency manapun');
    }

    const { id, agencyId, agentId, type, pointsDelta, amountIDR, description, createdBy, createdAt } = req.body ?? {};

    // Basic field validation
    if (!id || !agencyId || !agentId || !type || amountIDR === undefined) {
      return err(res, 400, 'Field wajib: id, agencyId, agentId, type, amountIDR');
    }

    // Agency must match the caller's agency (prevent cross-tenant abuse)
    if (membership.agency_id !== agencyId) {
      console.error(`[credit-wallet-tx] agency mismatch: caller=${membership.agency_id} req=${agencyId}`);
      return err(res, 403, 'Agency ID tidak sesuai dengan akun yang login');
    }

    // Role guard: agent hanya boleh kredit wallet sendiri (bukan wallet orang lain).
    // Owner dan staff boleh kredit wallet siapapun di agency yang sama.
    if (membership.role === 'agent' && agentId !== caller.id) {
      console.error(`[credit-wallet-tx] agent ${caller.id} mencoba kredit wallet ${agentId}`);
      return err(res, 403, 'Agen hanya bisa mengkreditkan wallet sendiri');
    }

    // Upsert — idempotent on tx id
    const { error: upsertErr } = await withTimeout(
      admin.from('agent_wallet_transactions').upsert(
        {
          id,
          agency_id:    agencyId,
          agent_id:     agentId,
          type,
          points_delta: pointsDelta ?? 0,
          amount_idr:   amountIDR,
          description:  description ?? '',
          created_by:   createdBy ?? caller.id,
          created_at:   createdAt ?? new Date().toISOString(),
        },
        { onConflict: 'id' }
      ),
      12000, 'Timeout saat insert wallet transaction ke Supabase'
    );

    if (upsertErr) {
      console.error('[credit-wallet-tx] upsert error:', upsertErr.message, upsertErr);
      return err(res, 500, `Gagal insert wallet: ${upsertErr.message}`);
    }

    console.log(`[credit-wallet-tx] OK — id=${id} agent=${agentId} amount=${amountIDR} type=${type}`);
    return ok(res, { ok: true, id });
  } catch (e) {
    console.error('[credit-wallet-tx] exception:', e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   POST /api/award-commission-points
   Award 20 points to agent when commission is earned.
   Uses service-role key to bypass RLS (agent_points is INSERT-only via trigger).
────────────────────────────────────────────── */
app.post('/api/award-commission-points', async (req, res) => {
  try {
    const caller = await getCallerUser(req.headers.authorization, 8000);
    if (!caller) return err(res, 401, 'Unauthorized');

    const { agencyId, agentId, orderId } = req.body ?? {};
    if (!agencyId || !agentId || !orderId) {
      return err(res, 400, 'agencyId, agentId, dan orderId wajib diisi');
    }

    const adminClient = makeAdminClient();

    // Verifikasi bahwa agentId benar-benar berperan "agent" di agency ini.
    // Mencegah owner/staff mendapat poin komisi secara tidak sengaja.
    const { data: memberRow, error: memberErr } = await withTimeout(
      adminClient
        .from('agency_members')
        .select('role')
        .eq('user_id', agentId)
        .eq('agency_id', agencyId)
        .single(),
      6000,
      'Timeout saat verifikasi role agen'
    );
    if (memberErr || !memberRow) {
      console.warn('[award-commission-points] member tidak ditemukan:', agentId);
      return err(res, 404, 'Member tidak ditemukan di agency ini');
    }
    if (memberRow.role !== 'agent') {
      console.warn('[award-commission-points] user bukan agent, diabaikan:', agentId, memberRow.role);
      return ok(res, { awarded: 0, reason: 'not_agent', role: memberRow.role });
    }

    // Gunakan upsert (bukan insert) dengan onConflict 'order_id' agar idempoten —
    // pemanggilan ganda untuk order yang sama tidak menyebabkan poin double-credit.
    const { error: insertErr } = await withTimeout(
      adminClient.from('agent_points').upsert(
        {
          agency_id:  agencyId,
          agent_id:   agentId,
          order_id:   orderId,
          points:     20,
          reason:     'commission_received',
          awarded_at: new Date().toISOString(),
        },
        { onConflict: 'order_id' }
      ),
      10000,
      'Timeout saat award commission points'
    );

    if (insertErr) {
      console.warn('[award-commission-points] upsert gagal:', insertErr.message);
      return err(res, 500, insertErr.message);
    }

    return ok(res, { awarded: 20, reason: 'commission_received' });
  } catch (e) {
    console.error('[award-commission-points] error:', e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   POST /api/upload-card-back
   Upload gambar belakang kartu langsung ke Storage menggunakan service-role key.
   - Auto-creates bucket 'card-backs' jika belum ada
   - Uploads image buffer (dari base64) via admin client — tidak butuh storage RLS
   - Updates agency_members.card_back_image_url via admin client — tidak butuh DB RLS
   - Single round-trip: tidak ada signed URL dance

   Authorization: Bearer <access_token>
   Body: { targetUserId, agencyId, imageBase64 }  (imageBase64 = data URL from FileReader)
   Returns: { ok: true, url: "<canonical public URL>" }
────────────────────────────────────────────── */
app.post('/api/upload-card-back', async (req, res) => {
  const ROUTE = '[upload-card-back]';
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503, 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. Tambahkan di Secrets Replit lalu restart server.');
    }
    if (!SUPABASE_URL) {
      return err(res, 503, 'VITE_SUPABASE_URL belum dikonfigurasi di server.');
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');
    const caller = await getCallerUser(authHeader, 8000).catch(() => null);
    if (!caller) return err(res, 401, 'Sesi tidak valid atau expired — silakan login ulang.');
    console.log(`${ROUTE} caller validated — caller.id=${caller.id}`);

    // ── Validate body ─────────────────────────────────────────────────────────
    const { targetUserId, agencyId, imageBase64 } = req.body ?? {};
    if (!targetUserId || !agencyId || !imageBase64) {
      return err(res, 400, 'targetUserId, agencyId, dan imageBase64 wajib diisi');
    }
    if (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) {
      return err(res, 400, 'imageBase64 harus berupa data URL (data:image/...)');
    }

    const admin = makeAdminClient();

    // ── Verify caller is member of the agency ─────────────────────────────────
    const { data: callerMembership, error: memErr } = await withTimeout(
      admin.from('agency_members').select('agency_id, role').eq('user_id', caller.id).eq('agency_id', agencyId).maybeSingle(),
      8000, 'DB timeout saat verifikasi membership'
    );
    if (memErr || !callerMembership) {
      console.error(`${ROUTE} membership error:`, memErr?.message);
      return err(res, 403, 'Tidak terdaftar di agency yang diminta');
    }

    // ── Role guard ────────────────────────────────────────────────────────────
    if (callerMembership.role !== 'owner' && targetUserId !== caller.id) {
      return err(res, 403, 'Hanya owner yang bisa upload gambar kartu member lain');
    }

    // ── Verify target user exists ─────────────────────────────────────────────
    const { data: targetRow, error: targetErr } = await withTimeout(
      admin.from('agency_members').select('user_id').eq('user_id', targetUserId).eq('agency_id', agencyId).maybeSingle(),
      8000, 'DB timeout saat verifikasi target user'
    );
    if (targetErr || !targetRow) {
      console.error(`${ROUTE} target lookup:`, targetErr?.message);
      return err(res, 404, `User ${targetUserId} tidak ditemukan di agency ini. Pastikan targetUserId adalah Supabase auth UUID.`);
    }

    // ── Auto-create bucket if missing ────────────────────────────────────────
    const BUCKET = 'card-backs';
    try {
      const { error: bucketErr } = await withTimeout(
        admin.storage.createBucket(BUCKET, {
          public: true,
          fileSizeLimit: 10485760,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        }),
        8000, 'Timeout saat membuat bucket'
      );
      if (bucketErr) {
        const msg = bucketErr.message ?? '';
        const alreadyExists = msg.toLowerCase().includes('already exist') || msg.toLowerCase().includes('duplicate');
        if (!alreadyExists) {
          console.warn(`${ROUTE} createBucket warning (continuing):`, msg);
        } else {
          console.log(`${ROUTE} bucket already exists — OK`);
        }
      } else {
        console.log(`${ROUTE} bucket '${BUCKET}' created`);
      }
    } catch (bucketEx) {
      console.warn(`${ROUTE} createBucket exception (continuing):`, bucketEx?.message ?? bucketEx);
    }

    // ── Decode base64 image ────────────────────────────────────────────────────
    // Strip the data URL prefix: "data:image/jpeg;base64,/9j/4AA..."
    const commaIdx = imageBase64.indexOf(',');
    if (commaIdx === -1) return err(res, 400, 'imageBase64 format tidak valid — koma tidak ditemukan');
    const base64Data = imageBase64.slice(commaIdx + 1);
    const imageBuffer = Buffer.from(base64Data, 'base64');
    if (imageBuffer.length === 0) return err(res, 400, 'Gambar kosong setelah decode base64');
    console.log(`${ROUTE} image decoded — byteLength=${imageBuffer.length}`);

    // ── Upload to Storage via admin client (bypasses all storage RLS) ─────────
    const storagePath = `${targetUserId}/card-back.jpg`;
    console.log(`${ROUTE} uploading to storage — bucket=${BUCKET} path=${storagePath}`);
    const { error: uploadErr } = await withTimeout(
      admin.storage.from(BUCKET).upload(storagePath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      }),
      25000, 'Storage upload timeout'
    );
    if (uploadErr) {
      console.error(`${ROUTE} storage upload error:`, uploadErr.message);
      return err(res, 500, `Storage upload gagal: ${uploadErr.message}`);
    }
    console.log(`${ROUTE} storage upload OK`);

    // ── Build canonical public URL ─────────────────────────────────────────────
    const canonicalUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    // ── Update agency_members.card_back_image_url via admin (bypasses DB RLS) ─
    console.log(`${ROUTE} updating DB — table=agency_members user_id=${targetUserId}`);
    const { data: updateData, error: updateErr } = await withTimeout(
      admin.from('agency_members')
        .update({ card_back_image_url: canonicalUrl })
        .eq('user_id', targetUserId)
        .eq('agency_id', agencyId)
        .select('user_id, card_back_image_url'),
      12000, 'DB timeout saat update card_back_image_url'
    );
    if (updateErr) {
      const isColMissing = updateErr.code === '42703' || (updateErr.message ?? '').toLowerCase().includes('column');
      console.error(`${ROUTE} DB update error code=${updateErr.code}:`, updateErr.message);
      if (isColMissing) {
        return err(res, 500,
          'Kolom card_back_image_url belum ada di tabel agency_members. ' +
          'Jalankan SQL berikut di Supabase SQL Editor:\n' +
          'ALTER TABLE public.agency_members ADD COLUMN IF NOT EXISTS card_back_image_url TEXT;'
        );
      }
      return err(res, 500, `DB update gagal: ${updateErr.message}`);
    }
    if (!updateData || updateData.length === 0) {
      console.error(`${ROUTE} 0 rows updated — kemungkinan kolom card_back_image_url belum ada`);
      return err(res, 500,
        'Gambar terupload tapi database tidak diperbarui (0 baris). ' +
        'Kemungkinan kolom card_back_image_url belum ada. Jalankan di Supabase SQL Editor:\n' +
        'ALTER TABLE public.agency_members ADD COLUMN IF NOT EXISTS card_back_image_url TEXT;'
      );
    }

    const savedRow = updateData[0];
    console.log(`${ROUTE} SUCCESS — user_id=${savedRow.user_id} url=${savedRow.card_back_image_url}`);
    return ok(res, { ok: true, url: savedRow.card_back_image_url ?? canonicalUrl });

  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   POST /api/card-back-signed-url
   DEPRECATED — kept for backward compatibility only.
   New flow uses /api/upload-card-back (server-side upload, no signed URL needed).
   Buat Supabase Storage signed upload URL untuk card-backs/{targetUserId}/card-back.jpg
   menggunakan service-role key (bypass storage RLS policy).

   Mengapa diperlukan:
   - Storage bucket 'card-backs' mungkin tidak punya INSERT policy untuk anon/auth user.
   - Dengan signed upload URL dari service-role, client bisa upload langsung ke Storage
     tanpa perlu storage RLS policy sama sekali.
   - Permission check tetap dilakukan di sini (caller harus member agency + role guard).

   Authorization: Bearer <access_token>
   Body: { targetUserId, agencyId }
   Returns: { signedUrl, token, path }
────────────────────────────────────────────── */
app.post('/api/card-back-signed-url', async (req, res) => {
  const ROUTE = '[card-back-signed-url]';
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503,
        'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. ' +
        'Tambahkan di Secrets Replit lalu restart server.'
      );
    }
    if (!SUPABASE_URL) {
      return err(res, 503, 'VITE_SUPABASE_URL belum dikonfigurasi di server.');
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader, 8000).catch(() => null);
    if (!caller) {
      return err(res, 401,
        'Sesi tidak valid atau expired — silakan login ulang. ' +
        'Pastikan SUPABASE_SERVICE_ROLE_KEY dan VITE_SUPABASE_URL dari project Supabase yang sama.'
      );
    }
    console.log(`${ROUTE} caller validated — caller.id=${caller.id}`);

    // ── Validate request body ─────────────────────────────────────────────────
    const { targetUserId, agencyId } = req.body ?? {};
    if (!targetUserId || !agencyId) {
      return err(res, 400, 'targetUserId dan agencyId wajib diisi');
    }

    const admin = makeAdminClient();

    // ── Verify caller is member of the agency ─────────────────────────────────
    const { data: callerMembership, error: memErr } = await withTimeout(
      admin.from('agency_members')
        .select('agency_id, role')
        .eq('user_id', caller.id)
        .eq('agency_id', agencyId)
        .maybeSingle(),
      8000, 'DB timeout saat verifikasi membership'
    );
    if (memErr) {
      console.error(`${ROUTE} membership lookup error:`, memErr.message);
      return err(res, 500, `DB error (membership): ${memErr.message}`);
    }
    if (!callerMembership) {
      return err(res, 403, 'Tidak terdaftar di agency yang diminta');
    }

    // ── Role guard ────────────────────────────────────────────────────────────
    if (callerMembership.role !== 'owner' && targetUserId !== caller.id) {
      return err(res, 403, 'Hanya owner yang bisa upload gambar kartu member lain');
    }

    // ── Verify target user exists in this agency ──────────────────────────────
    const { data: targetRow, error: targetErr } = await withTimeout(
      admin.from('agency_members')
        .select('user_id')
        .eq('user_id', targetUserId)
        .eq('agency_id', agencyId)
        .maybeSingle(),
      8000, 'DB timeout saat verifikasi target user'
    );
    if (targetErr) {
      console.error(`${ROUTE} target lookup error:`, targetErr.message);
      return err(res, 500, `DB error (target): ${targetErr.message}`);
    }
    if (!targetRow) {
      return err(res, 404,
        `User ${targetUserId} tidak ditemukan di agency ini. ` +
        'Pastikan targetUserId adalah Supabase auth UUID dari tabel agency_members.'
      );
    }

    // ── Create signed upload URL (service-role bypasses storage RLS) ──────────
    const storagePath = `${targetUserId}/card-back.jpg`;
    console.log(`${ROUTE} creating signed upload URL — bucket=card-backs path=${storagePath}`);

    const { data: signedData, error: signedErr } = await withTimeout(
      admin.storage.from('card-backs').createSignedUploadUrl(storagePath, { upsert: true }),
      8000, 'Storage timeout saat membuat signed upload URL'
    );

    if (signedErr || !signedData) {
      console.error(`${ROUTE} createSignedUploadUrl FAILED:`, signedErr?.message);
      // Provide actionable error message
      const isNoPolicy = signedErr?.message?.includes('row-level security') ||
                         signedErr?.message?.includes('policy');
      const isMissing  = signedErr?.message?.toLowerCase().includes('not found') ||
                         signedErr?.message?.toLowerCase().includes('bucket');
      const detail = isMissing
        ? "Bucket 'card-backs' belum dibuat di Supabase Storage dashboard."
        : isNoPolicy
          ? "Storage policy untuk bucket 'card-backs' belum dikonfigurasi."
          : signedErr?.message ?? 'Unknown error';
      return err(res, 500, `Gagal membuat upload URL: ${detail}`);
    }

    console.log(`${ROUTE} signed upload URL created — path=${signedData.path}`);
    return ok(res, {
      signedUrl: signedData.signedUrl,
      token:     signedData.token,
      path:      signedData.path,
    });

  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   POST /api/save-card-back-url
   Simpan card_back_image_url ke agency_members menggunakan service-role key
   sehingga RLS tidak memblokir staff/agent yang update milik sendiri.

   Authorization: Bearer <access_token>
   Body: { targetUserId, agencyId }
   - targetUserId: UUID pemilik kartu (boleh beda dari caller jika caller = owner)
   - agencyId: UUID agency

   Rules:
   - Caller harus authenticated member di agencyId yang sama.
   - Agent/staff hanya boleh update card_back_image_url milik sendiri.
   - Owner boleh update card_back_image_url siapapun di agency-nya.
────────────────────────────────────────────── */
app.post('/api/save-card-back-url', async (req, res) => {
  const ROUTE = '[save-card-back-url]';
  try {
    // ── 1. Prerequisites ───────────────────────────────────────────────────
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503,
        'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server. ' +
        'Tambahkan di Secrets Replit lalu restart server.'
      );
    }
    if (!SUPABASE_URL) {
      return err(res, 503, 'VITE_SUPABASE_URL belum dikonfigurasi di server.');
    }

    // ── 2. Auth: validate caller JWT ───────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader, 8000).catch(() => null);
    if (!caller) {
      console.error(`${ROUTE} JWT validation gagal — caller null`);
      return err(res, 401,
        'Sesi tidak valid atau expired — silakan login ulang. ' +
        'Jika masalah berlanjut, pastikan SUPABASE_SERVICE_ROLE_KEY dan VITE_SUPABASE_URL berasal dari project Supabase yang sama.'
      );
    }
    console.log(`${ROUTE} caller validated — caller.id=${caller.id}`);

    // ── 3. Validate request body ────────────────────────────────────────────
    const { targetUserId, agencyId } = req.body ?? {};
    if (!targetUserId || !agencyId) {
      return err(res, 400, 'targetUserId dan agencyId wajib diisi');
    }
    console.log(`${ROUTE} table=agency_members targetUserId=${targetUserId} agencyId=${agencyId}`);

    const admin = makeAdminClient();

    // ── 4. Verify caller is a member of the requested agency ───────────────
    const { data: callerMembership, error: memErr } = await withTimeout(
      admin.from('agency_members')
        .select('agency_id, role')
        .eq('user_id', caller.id)
        .eq('agency_id', agencyId)
        .maybeSingle(),
      8000, 'DB timeout saat verifikasi membership'
    );
    if (memErr) {
      const hint = classifySupabaseError(memErr, ROUTE + ' membership');
      console.error(`${ROUTE} membership lookup error — code=${memErr.code} msg=${memErr.message}`, memErr);
      return err(res, 500, hint ?? `DB error (membership): ${memErr.message}`);
    }
    if (!callerMembership) {
      console.error(`${ROUTE} caller ${caller.id} bukan member di agency ${agencyId}`);
      return err(res, 403, 'Tidak terdaftar di agency yang diminta');
    }

    // ── 5. Role guard: staff/agent can only update their own card ──────────
    if (callerMembership.role !== 'owner' && targetUserId !== caller.id) {
      console.error(`${ROUTE} role=${callerMembership.role} caller=${caller.id} mencoba update card back milik ${targetUserId}`);
      return err(res, 403, 'Hanya owner yang bisa update gambar kartu member lain');
    }

    // ── 6. Verify target user exists in this agency ────────────────────────
    // Note: we already checked targetUserId format — now confirm the DB row.
    const { data: targetMembership, error: targetErr } = await withTimeout(
      admin.from('agency_members')
        .select('user_id, card_back_image_url')
        .eq('user_id', targetUserId)
        .eq('agency_id', agencyId)
        .maybeSingle(),
      8000, 'DB timeout saat verifikasi target user'
    );
    if (targetErr) {
      const hint = classifySupabaseError(targetErr, ROUTE + ' target');
      console.error(`${ROUTE} target lookup error — code=${targetErr.code} msg=${targetErr.message}`, targetErr);
      return err(res, 500, hint ?? `DB error (target): ${targetErr.message}`);
    }
    if (!targetMembership) {
      console.error(`${ROUTE} target userId=${targetUserId} tidak ada di agency_members untuk agencyId=${agencyId}`);
      return err(res, 404,
        `User dengan ID ${targetUserId} tidak ditemukan di agency ini. ` +
        `Pastikan ID yang dikirim adalah user_id asli dari tabel agency_members, bukan route slug atau request ID.`
      );
    }
    console.log(`${ROUTE} target row confirmed — user_id=${targetMembership.user_id}`);

    // ── 7. Build canonical Storage URL ────────────────────────────────────
    // Path di bucket: card-backs/{targetUserId}/card-back.jpg
    // Canonical public URL: {SUPABASE_URL}/storage/v1/object/public/card-backs/{path}
    const storagePath  = `${targetUserId}/card-back.jpg`;
    const canonicalUrl = `${SUPABASE_URL}/storage/v1/object/public/card-backs/${storagePath}`;
    console.log(`${ROUTE} table=agency_members column=card_back_image_url storageUrl=${canonicalUrl}`);

    // ── 8. UPDATE agency_members.card_back_image_url ───────────────────────
    const { data: updateData, error: updateErr } = await withTimeout(
      admin.from('agency_members')
        .update({ card_back_image_url: canonicalUrl })
        .eq('user_id', targetUserId)
        .eq('agency_id', agencyId)
        .select('user_id, card_back_image_url'),
      10000, 'DB timeout saat update card_back_image_url'
    );

    if (updateErr) {
      const hint = classifySupabaseError(updateErr, ROUTE + ' update');
      console.error(`${ROUTE} UPDATE error — table=agency_members column=card_back_image_url user_id=${targetUserId} code=${updateErr.code} msg=${updateErr.message}`, updateErr);
      return err(res, 500, hint ?? `Gagal update database: ${updateErr.message}`);
    }

    // 0 rows updated means the WHERE clause matched nothing — row exists (we
    // verified above) but the UPDATE still returned empty. Most likely the
    // card_back_image_url column is missing (migration not run yet).
    if (!updateData || updateData.length === 0) {
      console.error(`${ROUTE} 0 rows updated — table=agency_members user_id=${targetUserId} agencyId=${agencyId}. Kolom card_back_image_url mungkin belum ada.`);
      return err(res, 500,
        'Database update dikirim tapi 0 baris yang diperbarui. ' +
        'Kemungkinan kolom card_back_image_url belum ada di tabel agency_members. ' +
        'Jalankan supabase/card-back-image-migration.sql di Supabase SQL Editor lalu coba lagi.'
      );
    }

    const savedRow = updateData[0];
    console.log(`${ROUTE} SUCCESS — table=agency_members user_id=${savedRow.user_id} card_back_image_url=${savedRow.card_back_image_url}`);
    return ok(res, { ok: true, url: savedRow.card_back_image_url ?? canonicalUrl });

  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   GET /api/health-check
   Provider-agnostic health check: Vercel / Replit / Local.
   Validates Supabase config + DB + storage connectivity.
   Safe to call from frontend — never leaks service-role key.
   Returns: { ok, provider, serviceRole, projectUrl, database, storage, bucketStatus, errors }
────────────────────────────────────────────── */
function detectProvider() {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL) return 'vercel';
  if (process.env.REPL_ID || process.env.REPLIT_DB_URL || process.env.REPL_SLUG) return 'replit';
  return 'local';
}
function envLabel(provider) {
  if (provider === 'vercel') return 'Vercel Environment Variables';
  if (provider === 'replit') return 'Replit Secrets';
  return 'environment variables';
}

app.get('/api/health-check', async (req, res) => {
  const ROUTE = '[health-check]';
  const BUCKETS_TO_CHECK = ['jamaah-photos', 'jamaah-docs', 'card-backs', 'pdf-templates'];
  const provider = detectProvider();
  const label = envLabel(provider);

  const result = {
    ok:           true,
    provider,
    serviceRole:  false,
    projectUrl:   null,    // VITE_ var — already in frontend bundle, safe to expose
    database:     false,
    storage:      false,
    bucketStatus: {},      // { bucketName: 'ok' | 'missing' }
    errors:       [],
  };

  // ── 1. Environment / config check ────────────────────────────────────────
  if (!SUPABASE_URL) {
    result.ok = false;
    result.errors.push(`VITE_SUPABASE_URL tidak dikonfigurasi di ${label}.`);
  } else {
    result.projectUrl = SUPABASE_URL;
  }

  if (!SERVICE_ROLE_KEY) {
    result.ok = false;
    result.errors.push(`SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di ${label}.`);
  } else {
    result.serviceRole = true;
  }

  if (!result.serviceRole || !result.projectUrl) {
    console.warn(`${ROUTE} config invalid (provider: ${provider}) — skip DB/storage checks`);
    return res.status(503).json(result);
  }

  // ── 2. Database connectivity check ───────────────────────────────────────
  try {
    const admin = makeAdminClient();
    const { error: dbErr } = await withTimeout(
      admin.from('agencies').select('id').limit(1),
      8000,
      'DB health check timed out setelah 8s — cek koneksi Supabase',
    );
    if (dbErr) {
      result.ok = false;
      const hint = classifySupabaseError(dbErr, 'health-check/db');
      result.errors.push(`Database tidak bisa diakses: ${dbErr.message}`);
      if (hint) result.errors.push(hint);
      console.error(`${ROUTE} DB check FAILED:`, dbErr.message);
    } else {
      result.database = true;
      console.log(`${ROUTE} DB check OK`);
    }
  } catch (e) {
    result.ok = false;
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Database exception: ${msg}`);
    console.error(`${ROUTE} DB check exception:`, msg);
  }

  // ── 3. Storage bucket check ───────────────────────────────────────────────
  try {
    const admin = makeAdminClient();
    const { data: buckets, error: listErr } = await withTimeout(
      admin.storage.listBuckets(),
      8000,
      'Storage health check timed out setelah 8s',
    );
    if (listErr) {
      result.ok = false;
      result.errors.push(`Storage tidak bisa diakses: ${listErr.message}`);
      console.error(`${ROUTE} storage list FAILED:`, listErr.message);
    } else {
      const bucketIds = new Set((buckets ?? []).map((b) => b.id));
      let allOk = true;
      for (const name of BUCKETS_TO_CHECK) {
        const exists = bucketIds.has(name);
        result.bucketStatus[name] = exists ? 'ok' : 'missing';
        if (!exists) {
          allOk = false;
          result.errors.push(`Bucket '${name}' tidak ditemukan — buat di Supabase Storage dashboard`);
          console.warn(`${ROUTE} bucket MISSING: ${name}`);
        }
      }
      result.storage = allOk;
      if (!allOk) result.ok = false;
      console.log(`${ROUTE} storage check — buckets: ${JSON.stringify(result.bucketStatus)}`);
    }
  } catch (e) {
    result.ok = false;
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Storage exception: ${msg}`);
    console.error(`${ROUTE} storage check exception:`, msg);
  }

  console.log(`${ROUTE} done — ok=${result.ok} db=${result.database} storage=${result.storage} errors=${result.errors.length}`);
  return res.status(result.ok ? 200 : 503).json(result);
});

/* ──────────────────────────────────────────────
   Serve static frontend in production
────────────────────────────────────────────── */
/* ──────────────────────────────────────────────
   POST /api/backfill-field-fees
   Backfill wallet transactions for already-Completed orders whose field-agent
   fees (VOA / pelaksana / kurir) were never written to the wallet ledger.
   Idempotent: uses deterministic tx IDs so re-running is always safe.
   Caller must be owner or staff of the agency.
   Body: { agentId? }  — optional, filter to one agent only.
────────────────────────────────────────────── */
app.post('/api/backfill-field-fees', async (req, res) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      return err(res, 503, 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.');
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return err(res, 401, 'Missing Authorization header');

    const caller = await getCallerUser(authHeader, 8000).catch(() => null);
    if (!caller) return err(res, 401, 'Sesi tidak valid — login ulang dulu');

    const admin = makeAdminClient();

    const { data: membership, error: memErr } = await withTimeout(
      admin.from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle(),
      8000, 'DB timeout saat verifikasi membership'
    );
    if (memErr || !membership) return err(res, 403, 'Tidak terdaftar di agency manapun');
    if (membership.role === 'agent') return err(res, 403, 'Hanya owner/staff yang dapat melakukan backfill fee');

    const agencyId = membership.agency_id;
    const { agentId: filterAgentId } = req.body ?? {};

    // Fetch all Completed orders for this agency
    const { data: orders, error: ordersErr } = await withTimeout(
      admin.from('orders')
        .select('id, type, status, metadata')
        .eq('agency_id', agencyId)
        .eq('status', 'Completed'),
      20000, 'Timeout saat fetch orders untuk backfill'
    );
    if (ordersErr) return err(res, 500, `Gagal fetch orders: ${ordersErr.message}`);

    const results = { credited: 0, skipped: 0, errors: 0 };
    const now = new Date().toISOString();

    for (const order of (orders ?? [])) {
      const meta = order.metadata ?? {};

      // ── VOA field agent fee ──
      const voaAgentId  = meta.voaFieldAgentId;
      const voaFee      = Number(meta.voaAgentFee ?? 0);
      if (voaAgentId && voaFee > 0) {
        if (meta.voaFeeCredited) {
          results.skipped++;
        } else if (!filterAgentId || filterAgentId === voaAgentId) {
          const txId = `voa-${order.id}`;
          const { error: txErr } = await admin.from('agent_wallet_transactions').upsert({
            id:           txId,
            agency_id:    agencyId,
            agent_id:     voaAgentId,
            type:         'voa_agent_fee',
            points_delta: 0,
            amount_idr:   voaFee,
            description:  `Fee lapangan VOA — order #${String(order.id).slice(0, 8)}`,
            created_by:   caller.id,
            created_at:   now,
          }, { onConflict: 'id' });
          if (txErr) {
            console.error(`[backfill] VOA tx error order ${order.id}:`, txErr.message);
            results.errors++;
          } else {
            await admin.from('orders').update({ metadata: { ...meta, voaFeeCredited: true } }).eq('id', order.id);
            results.credited++;
          }
        }
      }

      // ── Pelaksana visa_student fee ──
      const pelaksanaId = meta.pelaksanaId;
      const pelFee      = Number(meta.pelaksanaFee ?? (order.type === 'visa_student' && pelaksanaId ? 200000 : 0));
      if (order.type === 'visa_student' && pelaksanaId && pelFee > 0) {
        if (meta.pelaksanaFeeCredited) {
          results.skipped++;
        } else if (!filterAgentId || filterAgentId === pelaksanaId) {
          const txId = `pelaksana-${order.id}`;
          const { error: txErr } = await admin.from('agent_wallet_transactions').upsert({
            id:           txId,
            agency_id:    agencyId,
            agent_id:     pelaksanaId,
            type:         'pelaksana_fee',
            points_delta: 0,
            amount_idr:   pelFee,
            description:  `Fee pelaksana visa student — order #${String(order.id).slice(0, 8)}`,
            created_by:   caller.id,
            created_at:   now,
          }, { onConflict: 'id' });
          if (txErr) {
            console.error(`[backfill] pelaksana tx error order ${order.id}:`, txErr.message);
            results.errors++;
          } else {
            await admin.from('orders').update({ metadata: { ...meta, pelaksanaFeeCredited: true } }).eq('id', order.id);
            results.credited++;
          }
        }
      }

      // ── Kurir setoran fee ──
      const kurirAgentId = meta.kurirAgentId;
      const kurirFee     = Number(meta.kurirFee ?? 0);
      if (kurirAgentId && kurirFee > 0) {
        if (meta.kurirFeeCredited) {
          results.skipped++;
        } else if (!filterAgentId || filterAgentId === kurirAgentId) {
          const txId = `kurir-${order.id}`;
          const { error: txErr } = await admin.from('agent_wallet_transactions').upsert({
            id:           txId,
            agency_id:    agencyId,
            agent_id:     kurirAgentId,
            type:         'kurir_fee',
            points_delta: 0,
            amount_idr:   kurirFee,
            description:  `Fee kurir setoran — order #${String(order.id).slice(0, 8)}`,
            created_by:   caller.id,
            created_at:   now,
          }, { onConflict: 'id' });
          if (txErr) {
            console.error(`[backfill] kurir tx error order ${order.id}:`, txErr.message);
            results.errors++;
          } else {
            await admin.from('orders').update({ metadata: { ...meta, kurirFeeCredited: true } }).eq('id', order.id);
            results.credited++;
          }
        }
      }
    }

    console.log(`[backfill-field-fees] done: credited=${results.credited} skipped=${results.skipped} errors=${results.errors}`);
    return ok(res, { ok: true, ...results });
  } catch (e) {
    console.error('[backfill-field-fees] exception:', e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

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

// Keep the event loop alive — @supabase/auth-js calls .unref() on its internal
// timers, which would otherwise allow Node to exit when there are no active
// HTTP connections.
setInterval(() => {}, 1 << 30);

app.listen(PORT, '0.0.0.0', () => {
  const mode = isProd ? 'production' : 'development';
  console.log(`[server] API running on port ${PORT} (${mode})`);
  console.log(`[server] ── Caption Generator & OCR (OpenRouter) ──`);
  console.log(`[server]   OPENROUTER_API_KEY detected: ${!!OPENROUTER_API_KEY}`);
  if (OPENROUTER_API_KEY) {
    console.log(`[server]   OCR model     : ${MODEL_OCR}`);
    console.log(`[server]   Caption model : ${MODEL_CHAT}`);
    console.log(`[server]   Text model    : ${MODEL_TEXT}`);
  } else {
    console.warn('[server] ⚠️  OPENROUTER_API_KEY tidak ditemukan — fitur OCR dan Caption Generator tidak akan berfungsi');
  }
  console.log(`[server] ── AITEM / Asisten AI (OpenAI) ──`);
  console.log(`[server]   OPENAI_API_KEY detected: ${!!OPENAI_API_KEY}`);
  if (OPENAI_API_KEY) {
    console.log(`[server]   Assistant model : ${MODEL_ASSISTANT}`);
  } else {
    console.warn('[server] ⚠️  OPENAI_API_KEY tidak ditemukan — fitur AITEM tidak akan berfungsi');
  }
  if (!SERVICE_ROLE_KEY) {
    console.warn('[server] ⚠️  SUPABASE_SERVICE_ROLE_KEY tidak di-set — fitur invite/remove member tidak akan berfungsi');
  }
  if (!SUPABASE_URL) {
    console.warn('[server] ⚠️  VITE_SUPABASE_URL tidak ditemukan');
  }
});
