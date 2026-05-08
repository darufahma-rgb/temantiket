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
const MODEL_OCR  = 'google/gemini-2.0-flash';        // vision — baca gambar paspor & poster
const MODEL_OCR_FALLBACK = 'google/gemini-1.5-flash'; // fallback jika primary gagal
const MODEL_CHAT = 'openai/gpt-4.1';                 // Caption Generator
const MODEL_TEXT = 'google/gemini-2.0-flash';        // teks ringan / rapikan

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

async function getCallerUser(authHeader, timeoutMs = 8000) {
  if (!authHeader) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  // Race the Supabase auth call against a timeout so it never hangs forever
  const authCall = userClient.auth.getUser();
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Auth check timed out')), timeoutMs)
  );
  const { data, error } = await Promise.race([authCall, timeout]);
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
    if (callerMembership.role !== 'owner') return err(res, 403, 'Hanya owner yang bisa award poin');

    const { orderId, agentId } = req.body || {};
    if (!orderId || !agentId) return err(res, 400, 'orderId dan agentId diperlukan');

    const agencyId = callerMembership.agency_id;

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
    // Dynamically import ESM pdf-lib module
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

    const W = 595.28, H = 841.89;
    const SKY    = rgb(0.031, 0.545, 0.757);
    const DARK   = rgb(0.055, 0.086, 0.165);
    const WHITE  = rgb(1, 1, 1);
    const MUTED  = rgb(0.45, 0.47, 0.52);
    const LIGHT  = rgb(0.96, 0.97, 0.99);
    const BORDER = rgb(0.87, 0.89, 0.93);
    const RED    = rgb(0.95, 0.3, 0.25);

    const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
    const fmtEGP = (v) => new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2 }).format(v);

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
    function line(page, x1, y1, x2, y2, color = BORDER) {
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color });
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
        if (meta.departTime)   rows.push(['Waktu Berangkat', String(meta.departTime)]);
        if (meta.arriveTime)   rows.push(['Waktu Tiba', String(meta.arriveTime)]);
        if (meta.passengerName) rows.push(['Nama Penumpang', String(meta.passengerName)]);
        if (meta.pnr)          rows.push(['Kode PNR', String(meta.pnr)]);
      } else if (order.type === 'umrah') {
        if (meta.projectName)  rows.push(['Paket Umrah', String(meta.projectName)]);
        if (meta.timeline)     rows.push(['Jadwal', String(meta.timeline)]);
        if (meta.pax)          rows.push(['Jumlah Pax', `${meta.pax} orang`]);
        if (meta.hotelMakkah)  rows.push(['Hotel Makkah', String(meta.hotelMakkah)]);
        if (meta.hotelMadinah) rows.push(['Hotel Madinah', String(meta.hotelMadinah)]);
      } else if (order.type === 'visa_voa' || order.type === 'visa_student') {
        if (meta.passengerName) rows.push(['Nama', String(meta.passengerName)]);
        if (meta.passportNumber) rows.push(['No. Paspor', String(meta.passportNumber)]);
        if (meta.destination)   rows.push(['Tujuan', String(meta.destination)]);
      }
      if (order.title) rows.push(['Keterangan Order', order.title]);
      rows.push(['Status', order.status]);
      return rows;
    }
    function drawWatermark(page, font) {
      const text = 'by Temantiket';
      const size = 9;
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: W / 2 - w / 2, y: 28, size, font, color: rgb(0.7, 0.72, 0.76), opacity: 0.6 });
    }

    async function generateInvoicePdf(invoiceData) {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([W, H]);
      const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

      const { order, client, invoiceNumber, invoiceDate } = invoiceData;
      const meta = (order.metadata ?? {});

      if (invoiceData.templateDataUrl) {
        try {
          const parts = invoiceData.templateDataUrl.split(',');
          const base64 = parts[1];
          const imageBytes = Buffer.from(base64, 'base64');
          const isJpeg = invoiceData.templateDataUrl.startsWith('data:image/jpeg') || invoiceData.templateDataUrl.startsWith('data:image/jpg');
          const img = isJpeg ? await pdfDoc.embedJpg(imageBytes) : await pdfDoc.embedPng(imageBytes);
          page.drawImage(img, { x: 0, y: 0, width: W, height: H });
          // overlay
          drawRect(page, 30, 160, W - 60, H - 240, WHITE, 0.88);
          txtRight(page, invoiceNumber, W - 40, H - 50, 13, bold, DARK);
          txtRight(page, invoiceDate, W - 40, H - 67, 9, regular, MUTED);
          let y = H - 115;
          txt(page, 'KEPADA:', 50, y, 8, regular, MUTED);
          txt(page, client?.name ?? '—', 50, y - 16, 14, bold, DARK);
          y -= 50;
          line(page, 40, y, W - 40, y);
          y -= 24;
          const rows2 = buildDetailRows(order, meta);
          rows2.forEach(([label, value], i) => {
            const ry = y - i * 21;
            txt(page, label, 50, ry, 8.5, regular, MUTED);
            txt(page, value, 240, ry, 8.5, bold, DARK, W - 290);
          });
          y -= rows2.length * 21 + 20;
          line(page, 40, y, W - 40, y);
          y -= 28;
          const tf = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
          txt(page, 'TOTAL:', 50, y, 10, bold, DARK);
          txtRight(page, tf, W - 50, y, 14, bold, SKY);
          if (order.notes) {
            y -= 36;
            txt(page, `Catatan: ${order.notes}`, 50, y, 8, oblique, MUTED, W - 100);
          }
          drawWatermark(page, oblique);
          return await pdfDoc.save();
        } catch { /* fall through to built-in */ }
      }

      // ── Built-in template — modern clean design (blue accent) ──────────────
      const BLUE      = rgb(0.118, 0.435, 0.796);
      const BLUE_DARK = rgb(0.071, 0.290, 0.549);
      const BLUE_LITE = rgb(0.878, 0.925, 0.976);

      // White background
      drawRect(page, 0, 0, W, H, WHITE);

      // ── Decorative corner shapes ──────────────────────────────────────────
      // Top-right: large square + step
      drawRect(page, W - 88, H - 88, 88, 88, BLUE);
      drawRect(page, W - 130, H - 88, 44, 44, BLUE);
      // Bottom-left: large square + step
      drawRect(page, 0, 0, 82, 82, BLUE);
      drawRect(page, 82, 0, 40, 40, BLUE);
      // Left thin stripe (connecting corners)
      drawRect(page, 0, 82, 4, H - 82 - 88, BLUE_DARK);

      // ── Header ───────────────────────────────────────────────────────────
      // Brand — top-left (inside white area, clear of corner)
      txt(page, 'temantiket', 30, H - 50, 20, bold, DARK);
      txt(page, 'mudah, cepat, amanah', 30, H - 66, 7.5, regular, MUTED);

      // "INVOICE" — large, top-right (clear of corner decoration)
      txt(page, 'INVOICE', W - 270, H - 52, 36, bold, BLUE);
      txtRight(page, invoiceDate, W - 95, H - 75, 9, regular, DARK);

      // ── Client / TO block ─────────────────────────────────────────────────
      const toY = H - 135;
      // Right side: TO
      txt(page, 'TO.', W - 220, toY + 2, 7.5, regular, MUTED);
      txt(page, client?.name ?? 'Klien tidak diketahui', W - 220, toY - 17, 14, bold, DARK);
      if (client?.phone) txt(page, client.phone, W - 220, toY - 34, 8.5, regular, MUTED);
      // Left side: NO/ISN + type
      txt(page, `NO/ISN  ${invoiceNumber}`, 30, toY - 5, 9, bold, DARK);
      txt(page, orderTypeLabel(order.type), 30, toY - 20, 8, regular, MUTED);

      // ── Divider ───────────────────────────────────────────────────────────
      const divY = toY - 55;
      line(page, 30, divY, W - 30, divY, MUTED);

      // ── Table header ─────────────────────────────────────────────────────
      const tblHdrY = divY - 20;
      txt(page, 'KETERANGAN', 30, tblHdrY, 8, bold, DARK);
      txtRight(page, 'DETAIL', W - 30, tblHdrY, 8, bold, DARK);
      line(page, 30, tblHdrY - 9, W - 30, tblHdrY - 9, MUTED);

      // ── Table rows ───────────────────────────────────────────────────────
      const rows = buildDetailRows(order, meta);
      const ROW_H = 24;
      let rowY = tblHdrY - 9 - ROW_H + 6;
      rows.forEach(([label, value], i) => {
        if (i % 2 === 0) drawRect(page, 30, rowY - ROW_H + 16, W - 60, ROW_H, BLUE_LITE);
        txt(page, label, 34, rowY, 8.5, regular, MUTED);
        txtRight(page, value, W - 34, rowY, 8.5, bold, DARK);
        rowY -= ROW_H;
      });
      rowY -= 6;
      line(page, 30, rowY, W - 30, rowY, MUTED);

      // ── Payment method + total ────────────────────────────────────────────
      rowY -= 22;
      txt(page, 'Metode Pembayaran', 30, rowY, 9, bold, DARK);
      txt(page, 'Transfer Bank / Tunai', 30, rowY - 15, 8.5, regular, MUTED);

      // Grand total box (right-aligned, matches reference)
      const totalFormatted = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
      const gtBoxW = 250, gtBoxH = 38;
      const gtX = W - 30 - gtBoxW;
      const gtY = rowY - gtBoxH + 8;
      drawRect(page, gtX, gtY, gtBoxW, gtBoxH, BLUE);
      txt(page, 'TOTAL PEMBAYARAN', gtX + 14, gtY + 13, 8.5, bold, WHITE);
      txtRight(page, totalFormatted, W - 34, gtY + 11, 13, bold, WHITE);
      rowY -= gtBoxH + 16;

      // ── Notes / Catatan ──────────────────────────────────────────────────
      if (order.notes) {
        txt(page, 'Catatan', 30, rowY, 9, bold, DARK);
        txt(page, order.notes, 30, rowY - 15, 8, regular, MUTED, 260);
        rowY -= 40;
      }

      // ── Footer ───────────────────────────────────────────────────────────
      const footerY = 92;
      line(page, 30, footerY + 22, W - 30, footerY + 22, MUTED);
      txtCenter(page, invoiceData.agencyName ?? 'Temantiket', W / 2, footerY + 8, 9, bold, MUTED);
      txtCenter(page, invoiceData.agencyPhone ?? '+62 813-1150-6025  ·  @temantiket', W / 2, footerY - 5, 8, regular, MUTED);
      txtCenter(page, 'Terima kasih atas kepercayaan Anda!', W / 2, footerY - 18, 8, oblique, MUTED);
      drawWatermark(page, oblique);
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

    console.log(`[ocr-passport] Using OpenRouter with model: ${MODEL_OCR}`);
    const ocrRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: openrouterHeaders(),
      body: JSON.stringify({
        model: MODEL_OCR,
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

    if (!ocrRes.ok) {
      const errTxt = await ocrRes.text();
      return err(res, 502, `OCR API error (${MODEL_OCR}): ${errTxt.slice(0, 300)}`);
    }

    const completion = await ocrRes.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      return err(res, 502, 'OCR model returned empty response');
    }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return err(res, 502, 'OCR model returned invalid JSON'); }

    const out = { source: 'openrouter', model: MODEL_OCR, mrzValid: parsed.mrzValid === true };
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
    const { error: insertErr } = await withTimeout(
      adminClient.from('agent_points').insert({
        agency_id:  agencyId,
        agent_id:   agentId,
        order_id:   orderId,
        points:     20,
        reason:     'commission_received',
        awarded_at: new Date().toISOString(),
      }),
      10000,
      'Timeout saat award commission points'
    );

    if (insertErr) {
      console.warn('[award-commission-points] insert gagal:', insertErr.message);
      return err(res, 500, insertErr.message);
    }

    return ok(res, { awarded: 20, reason: 'commission_received' });
  } catch (e) {
    console.error('[award-commission-points] error:', e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
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
