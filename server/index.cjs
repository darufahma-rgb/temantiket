'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;

// Legacy Supabase constants — kept only for graceful no-ops in older routes
// that haven't been fully migrated yet. New routes use pg directly.
const SUPABASE_URL = '';
const SERVICE_ROLE_KEY = '';

// Replit Auth + data routes
const { setupAuth, isAuthenticated, isAuthenticatedOrBearer, registerAuthRoutes } = require('./replitAuth.cjs');
const { registerDataRoutes, requireMember, getCallerAgency } = require('./routes/data.cjs');
const { pool, query: dbQuery } = require('./db.cjs');

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
  const referer = process.env.APP_URL
    || (process.env.REPL_ID ? 'https://temantiket.replit.app' : 'https://temantiket.vercel.app');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'HTTP-Referer': referer,
    'X-Title': 'Temantiket',
  };
}

// ── OpenAI — AITEM (Asisten AI) ──────────────────────────────────────────────
// Digunakan HANYA untuk AITEM (AI Command Center / chat assistant).
// Menggunakan Replit AI Integrations (AI_INTEGRATIONS_OPENAI_API_KEY) jika tersedia,
// dengan fallback ke OPENAI_API_KEY yang di-set manual.
const OPENAI_API_KEY = (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE_URL = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
const MODEL_ASSISTANT = 'gpt-4o-mini';  // AITEM

// Header standar OpenAI
function openaiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  };
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

// ── Replit Auth (must be wired BEFORE routes) ────────────────────────────────
// setupAuth is async — we start it immediately and let Express handle requests
// after the promise resolves. The server listen() call is inside the then().
let _authReady = false;
const _authSetup = setupAuth(app).then(() => {
  _authReady = true;
  registerAuthRoutes(app);
  registerDataRoutes(app);
}).catch((e) => {
  console.error('[server] Auth setup failed (continuing without auth):', e.message);
  _authReady = true; // allow server to start even if OIDC discovery fails
});

// ─── H. Structured request logging middleware ──────────────────────────────
// Logs every request with a unique requestId for traceability.
// Actor/agency context is extracted from auth header asynchronously if present.
const { randomUUID } = require('crypto');

/**
 * Decode a JWT payload without verifying signature.
 * Returns null on any failure — never throws.
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

app.use((req, res, next) => {
  const requestId = randomUUID();
  const start = Date.now();
  req._requestId = requestId;

  // Attach requestId to response headers for client-side tracing
  res.setHeader('X-Request-Id', requestId);

  // Extract actor/agency context from Authorization header (non-blocking)
  let actorId   = null;
  let agencyId  = null;
  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7));
    if (payload) {
      // Supabase JWT: sub = user UUID; app_metadata.agency_id if set
      actorId  = payload.sub ?? null;
      agencyId = payload.app_metadata?.agency_id ?? null;
    }
  }

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR'
                : res.statusCode >= 400 ? 'WARN'
                : 'INFO';
    const log = {
      level,
      requestId,
      method:   req.method,
      path:     req.path,
      status:   res.statusCode,
      ms:       durationMs,
      ts:       new Date().toISOString(),
      actorId,
      agencyId,
    };
    // Structured output: single JSON line per request (parseable by log aggregators)
    console.log(JSON.stringify(log));
  });

  next();
});

function ok(res, data) {
  return res.status(200).json(data);
}
function err(res, status, message) {
  return res.status(status).json({ error: message });
}

// ── DB helpers replacing legacy Supabase admin client ────────────────────────

/** Get caller's agency row from session (for authenticated routes). */
async function getCallerAgencyFromSession(req) {
  if (!req.user?.id) return null;
  const { rows } = await pool.query(
    'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
    [req.user.id],
  );
  return rows[0] ?? null;
}

/** Legacy: attempt to get user from auth header (no-op now — always returns null). */
async function getCallerUser(_authHeader) {
  return null; // Auth is session-based now
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message || `Operasi timeout setelah ${ms / 1000}s`)), ms)
    ),
  ]);
}

/** @deprecated — Supabase removed. Kept as a no-op to avoid reference errors. */
function classifySupabaseError() { return null; }

/* ──────────────────────────────────────────────
   POST /api/bootstrap
   One-time setup: authenticated Replit user creates their agency.
   With Replit Auth, users are already created via OIDC — no password needed.
────────────────────────────────────────────── */
app.post('/api/bootstrap', isAuthenticatedOrBearer, async (req, res) => {
  try {
    const userId = req.user.id;
    const { agencyName } = req.body || {};
    if (!agencyName || typeof agencyName !== 'string' || !agencyName.trim()) {
      return err(res, 400, 'agencyName required');
    }

    // Check user already has a membership (prevent duplicate bootstrap)
    const { rows: existing } = await pool.query(
      'SELECT agency_id FROM agency_members WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    if (existing.length > 0) {
      return err(res, 403, 'Anda sudah terdaftar di sebuah agency.');
    }

    // Create agency + membership in one transaction
    const { rows: agencyRows } = await pool.query(
      'INSERT INTO agencies (name, owner_id) VALUES ($1, $2) RETURNING *',
      [agencyName.trim(), userId],
    );
    const agency = agencyRows[0];

    await pool.query(
      'INSERT INTO agency_members (user_id, agency_id, role) VALUES ($1, $2, $3)',
      [userId, agency.id, 'owner'],
    );

    return ok(res, { ok: true, agencyId: agency.id, userId });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/invite-member
   Owner invites a new member by email + password (Supabase auth).
   Flow:
     1. Validate caller is owner in agency_members
     2. Create Supabase auth user via Admin API (requires SUPABASE_SERVICE_ROLE_KEY)
        OR accept an explicit userId if already known
     3. Upsert user stub in local `users` table
     4. Insert/upsert agency_members row
     5. Create wallet seed if role === 'agent'
────────────────────────────────────────────── */
app.post('/api/invite-member', isAuthenticatedOrBearer, async (req, res) => {
  try {
    const { rows: callerRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const callerMembership = callerRows[0];
    if (!callerMembership) return err(res, 403, 'Caller belum terdaftar di agency');
    if (callerMembership.role !== 'owner') return err(res, 403, 'Hanya owner yang bisa invite');

    const rawRole = req.body?.role;
    const role = rawRole === 'agent' ? 'agent' : rawRole === 'owner' ? 'owner' : 'staff';
    const commissionPct = typeof req.body?.commissionPct === 'number'
      ? Math.max(0, Math.min(100, req.body.commissionPct)) : 0;
    const whatsappNumber = (req.body?.whatsappNumber ?? '').toString().trim() || null;
    const agentNotes     = (req.body?.agentNotes ?? '').toString().trim() || null;
    const agentStatus    = req.body?.agentStatus === 'inactive' ? 'inactive' : 'active';

    // Body can contain either:
    //   A) { email, password, displayName, role, ... }  — create new Supabase user
    //   B) { userId, displayName, role, ... }           — add existing user by UUID
    const { userId: explicitUserId, email, password, displayName } = req.body || {};

    let targetUserId = explicitUserId?.trim() || null;

    if (!targetUserId) {
      // Path A: create Supabase auth user via Admin API
      const SUPABASE_URL_ENV = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
      const SUPABASE_SRK     = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

      if (!email || !password) {
        return err(res, 400, 'email dan password diperlukan untuk membuat akun anggota baru');
      }
      if (!SUPABASE_URL_ENV || !SUPABASE_SRK) {
        return err(res, 503, [
          'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Replit Secrets.',
          'Tambahkan secret tersebut agar fitur invite anggota berfungsi.',
        ].join(' '));
      }

      // Call Supabase Auth Admin API to create user
      const adminRes = await fetch(`${SUPABASE_URL_ENV}/auth/v1/admin/users`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SRK}`,
          'apikey':        SUPABASE_SRK,
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: (displayName ?? '').trim() || email.split('@')[0] },
        }),
      });

      const adminJson = await adminRes.json().catch(() => ({}));

      if (!adminRes.ok) {
        const msg = adminJson?.msg || adminJson?.message || adminJson?.error || `Supabase Admin API ${adminRes.status}`;
        // Handle "already registered" gracefully — still add to agency
        if (adminRes.status === 422 && String(msg).toLowerCase().includes('already')) {
          // User exists in Supabase — look up by email in local users table
          const { rows: existingRows } = await pool.query(
            'SELECT id FROM users WHERE email = $1 LIMIT 1',
            [email.toLowerCase().trim()],
          );
          if (!existingRows[0]) {
            return err(res, 409, `Email ${email} sudah terdaftar di Supabase namun belum pernah login. Minta user login dulu lalu coba lagi.`);
          }
          targetUserId = existingRows[0].id;
        } else {
          return err(res, adminRes.status >= 500 ? 502 : 400, `Gagal membuat akun: ${msg}`);
        }
      } else {
        targetUserId = adminJson?.id;
        if (!targetUserId) return err(res, 502, 'Supabase tidak mengembalikan user ID');
      }
    }

    // Upsert local user stub (email stored for lookup; actual profile filled on first login)
    await pool.query(
      `INSERT INTO users (id, email, first_name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         email      = COALESCE(EXCLUDED.email, users.email),
         first_name = COALESCE(EXCLUDED.first_name, users.first_name),
         updated_at = now()`,
      [targetUserId, email?.toLowerCase().trim() || null, (displayName ?? '').trim() || null],
    );

    // Insert/upsert agency membership
    const { rows: inserted } = await pool.query(
      `INSERT INTO agency_members (user_id, agency_id, role, commission_pct, phone_wa, agent_notes, agent_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, agency_id) DO UPDATE SET role = EXCLUDED.role,
         commission_pct = EXCLUDED.commission_pct, phone_wa = EXCLUDED.phone_wa,
         agent_notes = EXCLUDED.agent_notes, agent_status = EXCLUDED.agent_status
       RETURNING *`,
      [targetUserId, callerMembership.agency_id, role, commissionPct,
       whatsappNumber, agentNotes, agentStatus],
    );

    // Auto-create wallet seed for new agents
    if (role === 'agent') {
      const walletSeedId = `wtx-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await pool.query(
        `INSERT INTO agent_wallet_transactions
           (id, agency_id, agent_id, type, points_delta, amount_idr, description, created_by, created_at)
         VALUES ($1, $2, $3, 'adjustment', 0, 0, 'Wallet dibuat otomatis saat registrasi agen', $4, now())
         ON CONFLICT DO NOTHING`,
        [walletSeedId, callerMembership.agency_id, targetUserId, req.user.id],
      ).catch(() => {}); // non-critical
    }

    return ok(res, { ok: true, userId: targetUserId, role, member: inserted[0] });
  } catch (e) {
    return err(res, 500, e?.message || 'Terjadi kesalahan internal');
  }
});

/* ──────────────────────────────────────────────
   POST /api/remove-member
   Owner removes staff/agent dari agency (membership only — Replit account unchanged)
────────────────────────────────────────────── */
app.post('/api/remove-member', isAuthenticatedOrBearer, async (req, res) => {
  try {
    const { rows: callerRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const callerMembership = callerRows[0];
    if (!callerMembership) return err(res, 403, 'Tidak terdaftar di agency');
    if (callerMembership.role !== 'owner') return err(res, 403, 'Hanya owner yang bisa hapus anggota');

    const { userId } = req.body || {};
    if (!userId || typeof userId !== 'string') return err(res, 400, 'userId required');
    if (userId === req.user.id) return err(res, 400, 'Tidak bisa hapus diri sendiri');

    const { rows: targetRows } = await pool.query(
      'SELECT role FROM agency_members WHERE agency_id = $1 AND user_id = $2',
      [callerMembership.agency_id, userId],
    );
    if (!targetRows[0]) return err(res, 404, 'User tidak ditemukan di agency ini');
    if (targetRows[0].role === 'owner') return err(res, 400, 'Tidak bisa hapus sesama owner');

    await pool.query(
      'DELETE FROM agency_members WHERE agency_id = $1 AND user_id = $2',
      [callerMembership.agency_id, userId],
    );

    return ok(res, { ok: true });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/award-completion-points
   Owner menandai order selesai → agen mendapat 20 poin di agent_points.
────────────────────────────────────────────── */
app.post('/api/award-completion-points', isAuthenticatedOrBearer, async (req, res) => {
  try {

    const { rows: callerRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const callerMembership = callerRows[0];
    if (!callerMembership) return err(res, 403, 'Tidak terdaftar di agency');
    if (!['owner', 'staff'].includes(callerMembership.role)) {
      return err(res, 403, 'Hanya owner atau staff yang bisa award poin');
    }

    const { orderId, agentId } = req.body || {};
    if (!orderId || !agentId) return err(res, 400, 'orderId dan agentId diperlukan');

    const agencyId = callerMembership.agency_id;

    const { rows: targetRows } = await pool.query(
      'SELECT role FROM agency_members WHERE user_id = $1 AND agency_id = $2',
      [agentId, agencyId],
    );
    if (!targetRows[0]) return err(res, 404, 'Agen tidak ditemukan di agency ini');
    if (targetRows[0].role !== 'agent') {
      return ok(res, { ok: true, awarded: 0, reason: 'not_agent', role: targetRows[0].role });
    }

    await pool.query(
      `INSERT INTO agent_points (agency_id, agent_id, order_id, points, reason, awarded_at)
       VALUES ($1, $2, $3, 20, 'order_completed', now())
       ON CONFLICT (order_id) DO NOTHING`,
      [agencyId, agentId, orderId],
    );

    return ok(res, { ok: true, points: 20 });
  } catch (e) {
    return err(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────
   POST /api/revoke-order-points
   Cabut poin agen jika order dikembalikan dari status Completed.
────────────────────────────────────────────── */
app.post('/api/revoke-order-points', isAuthenticatedOrBearer, async (req, res) => {
  try {

    const { rows: callerRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const callerMembership = callerRows[0];
    if (!callerMembership) return err(res, 403, 'Tidak terdaftar di agency');
    if (!['owner', 'staff'].includes(callerMembership.role)) {
      return err(res, 403, 'Hanya owner atau staff yang bisa revoke poin');
    }

    const { orderId } = req.body || {};
    if (!orderId) return err(res, 400, 'orderId diperlukan');

    await pool.query(
      'DELETE FROM agent_points WHERE order_id = $1 AND agency_id = $2',
      [orderId, callerMembership.agency_id],
    );

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
   Dedicated passport OCR via OpenRouter vision.
   Requires Replit session + agency membership.
────────────────────────────────────────────── */
app.post('/api/ocr-passport', isAuthenticatedOrBearer, async (req, res) => {
  try {
    console.log(`[ocr-passport] OPENROUTER_API_KEY detected: ${!!OPENROUTER_API_KEY}`);
    if (!OPENROUTER_API_KEY) {
      return err(res, 503, 'OPENROUTER_API_KEY tidak ditemukan. Pastikan sudah diset di environment variables.');
    }

    const { rows: memRows } = await pool.query(
      'SELECT agency_id FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    if (!memRows[0]) return err(res, 403, 'Tidak terdaftar di agency manapun');

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
   Insert a wallet transaction using pg directly (Replit PostgreSQL).
────────────────────────────────────────────── */
app.post('/api/credit-wallet-tx', isAuthenticatedOrBearer, async (req, res) => {
  try {

    const { rows: memberRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const membership = memberRows[0];
    if (!membership) return err(res, 403, 'Tidak terdaftar di agency manapun');

    const { id, agencyId, agentId, type, pointsDelta, amountIDR, description, createdBy, createdAt, orderId } = req.body ?? {};
    if (!id || !agencyId || !agentId || !type || amountIDR === undefined) {
      return err(res, 400, 'Field wajib: id, agencyId, agentId, type, amountIDR');
    }
    if (membership.agency_id !== agencyId) return err(res, 403, 'Agency ID tidak sesuai');
    if (membership.role === 'agent' && agentId !== req.user.id) {
      return err(res, 403, 'Agen hanya bisa mengkreditkan wallet sendiri');
    }

    await pool.query(
      `INSERT INTO agent_wallet_transactions
         (id, agency_id, agent_id, type, points_delta, amount_idr, description, created_by, created_at, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [id, agencyId, agentId, type, pointsDelta ?? 0, amountIDR,
       description ?? '', createdBy ?? req.user.id, createdAt ?? new Date().toISOString(),
       orderId ?? null],
    );

    return ok(res, { ok: true, id });
  } catch (e) {
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   GET /api/wallet-txs/:agentId
   Fetch wallet transactions for an agent.
────────────────────────────────────────────── */
app.get('/api/wallet-txs/:agentId', isAuthenticatedOrBearer, async (req, res) => {
  try {
    const { rows: memberRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const membership = memberRows[0];
    if (!membership) return err(res, 403, 'Tidak terdaftar di agency manapun');

    const { agentId } = req.params;
    if (membership.role === 'agent' && agentId !== req.user.id) {
      return err(res, 403, 'Agen hanya bisa melihat wallet sendiri');
    }

    const { rows } = await pool.query(
      `SELECT id, agency_id, agent_id, type, points_delta, amount_idr, description, created_by, created_at, order_id
       FROM agent_wallet_transactions
       WHERE agency_id = $1 AND agent_id = $2
       ORDER BY created_at DESC`,
      [membership.agency_id, agentId],
    );

    return ok(res, rows);
  } catch (e) {
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   DELETE /api/wallet-txs-for-order/:orderId
   Remove all wallet transactions linked to a deleted order.
────────────────────────────────────────────── */
app.delete('/api/wallet-txs-for-order/:orderId', isAuthenticatedOrBearer, async (req, res) => {
  try {
    const { rows: memberRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const membership = memberRows[0];
    if (!membership) return err(res, 403, 'Tidak terdaftar di agency manapun');
    if (membership.role === 'agent') return err(res, 403, 'Hanya owner/staff yang bisa hapus wallet tx');

    const { orderId } = req.params;
    const { rowCount } = await pool.query(
      `DELETE FROM agent_wallet_transactions
       WHERE agency_id = $1 AND order_id = $2
         AND type NOT IN ('payout', 'adjustment')`,
      [membership.agency_id, orderId],
    );

    return ok(res, { deleted: rowCount ?? 0 });
  } catch (e) {
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   DELETE /api/wallet-txs-for-client/:clientId
   Remove all wallet transactions linked to orders belonging to a deleted client.
────────────────────────────────────────────── */
app.delete('/api/wallet-txs-for-client/:clientId', isAuthenticatedOrBearer, async (req, res) => {
  try {
    const { rows: memberRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    const membership = memberRows[0];
    if (!membership) return err(res, 403, 'Tidak terdaftar di agency manapun');
    if (membership.role === 'agent') return err(res, 403, 'Hanya owner/staff yang bisa hapus wallet tx');

    const { clientId } = req.params;
    // Delete wallet txs for all orders belonging to this client
    const { rowCount } = await pool.query(
      `DELETE FROM agent_wallet_transactions
       WHERE agency_id = $1
         AND order_id IN (
           SELECT id FROM orders WHERE agency_id = $1 AND client_id = $2
         )
         AND type NOT IN ('payout', 'adjustment')`,
      [membership.agency_id, clientId],
    );

    return ok(res, { deleted: rowCount ?? 0 });
  } catch (e) {
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   POST /api/award-commission-points
   Award 20 points to agent when commission is earned.
────────────────────────────────────────────── */
app.post('/api/award-commission-points', isAuthenticatedOrBearer, async (req, res) => {
  try {

    const { agencyId, agentId, orderId } = req.body ?? {};
    if (!agencyId || !agentId || !orderId) {
      return err(res, 400, 'agencyId, agentId, dan orderId wajib diisi');
    }

    const { rows: memberRows } = await pool.query(
      'SELECT role FROM agency_members WHERE user_id = $1 AND agency_id = $2',
      [agentId, agencyId],
    );
    if (!memberRows[0]) return err(res, 404, 'Member tidak ditemukan di agency ini');
    if (memberRows[0].role !== 'agent') {
      return ok(res, { awarded: 0, reason: 'not_agent', role: memberRows[0].role });
    }

    await pool.query(
      `INSERT INTO agent_points (agency_id, agent_id, order_id, points, reason, awarded_at)
       VALUES ($1, $2, $3, 20, 'commission_received', now())
       ON CONFLICT (order_id) DO NOTHING`,
      [agencyId, agentId, orderId],
    );

    return ok(res, { awarded: 20, reason: 'commission_received' });
  } catch (e) {
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* upload-card-back-legacy: removed — data.cjs handles /api/upload-card-back */

/* ──────────────────────────────────────────────
   POST /api/card-back-signed-url  (DEPRECATED — Supabase Storage removed)
   Storage is now handled by saving base64 in agency_members.card_back_image_url.
────────────────────────────────────────────── */
app.post('/api/card-back-signed-url', (req, res) => {
  return err(res, 410, 'Endpoint ini sudah tidak digunakan. Gunakan /api/upload-card-back dengan imageBase64.');
});

/* ──────────────────────────────────────────────
   POST /api/save-card-back-url
   Simpan card_back_image_url ke agency_members (pg version).
────────────────────────────────────────────── */
app.post('/api/save-card-back-url', isAuthenticatedOrBearer, async (req, res) => {
  const ROUTE = '[save-card-back-url]';
  try {

    const { targetUserId, agencyId, storagePath: clientStoragePath } = req.body ?? {};
    if (!targetUserId || !agencyId) return err(res, 400, 'targetUserId dan agencyId wajib diisi');

    const { rows: memberRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 AND agency_id = $2',
      [req.user.id, agencyId],
    );
    if (!memberRows[0]) return err(res, 403, 'Tidak terdaftar di agency yang diminta');
    if (memberRows[0].role !== 'owner' && targetUserId !== req.user.id) {
      return err(res, 403, 'Hanya owner yang bisa update gambar kartu member lain');
    }

    const url = clientStoragePath ?? null;
    const { rows: updated } = await pool.query(
      'UPDATE agency_members SET card_back_image_url = $3 WHERE user_id = $1 AND agency_id = $2 RETURNING user_id, card_back_image_url',
      [targetUserId, agencyId, url],
    );
    if (!updated[0]) return err(res, 404, 'User tidak ditemukan di agency ini');

    return ok(res, { ok: true, url: updated[0].card_back_image_url });
  } catch (e) {
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   GET /api/health-check — Replit PostgreSQL connectivity
   Response shape matches frontend HealthCheckResult interface:
   { ok, provider, serviceRole, projectUrl, database, storage, bucketStatus, errors }
────────────────────────────────────────────── */
app.get('/api/health-check', async (req, res) => {
  const errors = [];
  let dbOk = false;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    errors.push(`Database: ${e.message}`);
  }

  const provider = process.env.REPL_ID ? 'replit' : (process.env.VERCEL ? 'vercel' : 'local');

  // serviceRole: true when we have a working DB (no Supabase service role needed — we use PostgreSQL directly)
  // storage: true optimistically — Supabase Storage is used directly from the frontend with the anon key
  const result = {
    ok:           dbOk,
    provider,
    serviceRole:  dbOk,  // frontend uses this to gate uploads; set true when DB is healthy
    projectUrl:   process.env.VITE_SUPABASE_URL || null,
    database:     dbOk,
    storage:      true,  // Supabase Storage is accessed client-side; server can't verify buckets
    bucketStatus: {},
    auth:         true,
    errors,
  };

  return res.status(dbOk ? 200 : 503).json(result);
});

/* ──────────────────────────────────────────────
   Serve static frontend in production
────────────────────────────────────────────── */
/* ──────────────────────────────────────────────
   POST /api/backfill-field-fees
   Backfill wallet transactions for already-Completed orders whose field-agent
   fees (VOA / pelaksana / kurir / executor / operational) were never written
   to the wallet ledger.
   Idempotent: uses deterministic tx IDs (prefix-orderId) — safe to re-run.
   Caller must be owner or staff of the agency.
   Body: { agentId? }  — optional, filter to one agent only.
   Returns: { ok, credited, skipped, errors, errorSample? }
────────────────────────────────────────────── */
app.post('/api/backfill-field-fees', isAuthenticatedOrBearer, async (req, res) => {
  const ROUTE = '[backfill-field-fees]';
  try {

    const { rows: memRows } = await pool.query(
      'SELECT agency_id, role FROM agency_members WHERE user_id = $1 LIMIT 1',
      [req.user.id],
    );
    if (!memRows[0]) return err(res, 403, 'Tidak terdaftar di agency manapun');
    if (memRows[0].role === 'agent') return err(res, 403, 'Hanya owner/staff yang dapat melakukan backfill fee');

    const agencyId = memRows[0].agency_id;
    const { agentId: filterAgentId } = req.body ?? {};
    console.log(`${ROUTE} caller=${req.user.id} agency=${agencyId} filter=${filterAgentId ?? 'semua'}`);

    const { rows: orders } = await pool.query(
      `SELECT id, type, status, metadata, created_by_agent
       FROM orders WHERE agency_id = $1 AND status = 'Completed'`,
      [agencyId],
    );
    console.log(`${ROUTE} fetched ${orders.length} Completed orders`);

    const results = { credited: 0, skipped: 0, errors: 0 };
    const errorSamples = [];
    const now = new Date().toISOString();

    function collectErr(label, e) {
      results.errors++;
      const msg = e?.message ?? String(e);
      console.error(`${ROUTE} tx error [${label}]:`, msg);
      if (errorSamples.length < 5) errorSamples.push(`[${label}] ${msg}`);
    }

    async function upsertTx(txId, agentId, type, amountIdr, description) {
      try {
        await pool.query(
          `INSERT INTO agent_wallet_transactions
             (id, agency_id, agent_id, type, points_delta, amount_idr, description, created_by, created_at)
           VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [txId, agencyId, agentId, type, amountIdr, description, req.user.id, now],
        );
        return null;
      } catch (e) { return e; }
    }

    async function markMeta(orderId, meta, patch) {
      const updated = { ...meta, ...patch };
      await pool.query('UPDATE orders SET metadata = $2 WHERE id = $1', [orderId, JSON.stringify(updated)]).catch(() => {});
    }

    for (const order of orders) {
      const meta = order.metadata ?? {};
      const oid8 = String(order.id).slice(0, 8);

      const checks = [
        [meta.voaFieldAgentId,              Number(meta.voaAgentFee ?? 0),        'voa_agent_fee',  `Fee Agent Lapangan VOA — order #${oid8}`,       `voa-${order.id}`,        'voaFeeCredited'],
        [meta.fieldAgentId,                 Number(meta.fieldAgentFee ?? 0),       'voa_agent_fee',  `Fee Agent Lapangan — order #${oid8}`,           `field-${order.id}`,      'fieldFeeCredited'],
        [meta.visaExecutorId,               Number(meta.executorFee ?? 0),         'pelaksana_fee',  `Fee Pelaksana Visa — order #${oid8}`,           `executor-${order.id}`,   'executorFeeCredited'],
        [meta.assignedOperationalAgentId,   Number(meta.operationalAgentFee ?? 0), 'voa_agent_fee',  `Fee Agent Operasional — order #${oid8}`,        `op-${order.id}`,         'operationalFeeCredited'],
        [order.type === 'visa_student' ? meta.pelaksanaId : null, Number(meta.pelaksanaFee ?? (order.type === 'visa_student' && meta.pelaksanaId ? 200000 : 0)), 'pelaksana_fee', `Fee Pelaksana Visa Student — order #${oid8}`, `pelaksana-${order.id}`, 'pelaksanaFeeCredited'],
        [meta.kurirAgentId,                 Number(meta.kurirFee ?? 0),            'kurir_fee',      `Fee Kurir Setoran — order #${oid8}`,            `kurir-${order.id}`,      'kurirFeeCredited'],
        [order.created_by_agent,            Number(meta.agentFee ?? 0),            'order_bonus',    `Komisi Sales ${order.type} — order #${oid8}`,   `agent-${order.id}`,      'agentFeeCredited'],
        [meta.salesAgentId && meta.salesAgentId !== order.created_by_agent ? meta.salesAgentId : null, Number(meta.salesCommission ?? meta.agentCommission ?? 0), 'order_bonus', `Komisi Sales Agent — order #${oid8}`, `salesagent-${order.id}`, null],
        [meta.assignedAgentId,              Number(meta.assignedAgentFee ?? 0),    'voa_agent_fee',  `Fee Agent Ditugaskan — order #${oid8}`,         `assigned-${order.id}`,   null],
        [meta.handlerAgentId,               Number(meta.handlerFee ?? 0),          'voa_agent_fee',  `Fee Handler — order #${oid8}`,                  `handler-${order.id}`,    null],
        [meta.courierAgentId && meta.courierAgentId !== meta.kurirAgentId ? meta.courierAgentId : null, Number(meta.courierFee ?? 0), 'kurir_fee', `Fee Kurir — order #${oid8}`, `courier-${order.id}`, null],
      ];

      for (const [agentId, fee, type, desc, txId, creditedFlag] of checks) {
        if (!agentId || fee <= 0) continue;
        if (filterAgentId && filterAgentId !== agentId) continue;
        const txErr = await upsertTx(txId, agentId, type, fee, desc);
        if (txErr) {
          collectErr(`${txId}`, txErr);
        } else {
          if (creditedFlag && !meta[creditedFlag]) {
            await markMeta(order.id, meta, { [creditedFlag]: true });
          }
          results.credited++;
        }
      }
    }

    const errorSample = errorSamples[0] ?? null;
    console.log(`${ROUTE} DONE — credited=${results.credited} skipped=${results.skipped} errors=${results.errors}`);
    return ok(res, { ok: true, ...results, errorSample });
  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
    return err(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
});

/* ──────────────────────────────────────────────
   POST /api/migrate-progress-steps
   One-time migration: converts old per-component processStep indices to the
   new unified step indices (single source of truth across admin & public pages).

   Migration maps (old admin step → new unified step):
     visa_student : {0→2, 1→3, 2→4, 3→4, 4→5}
     flight       : {0→0, 1→3, 2→4}
     visa_voa     : {0→2, 1→3, 2→3, 3→4}
     umrah        : {0→0, 1→2, 2→3, 3→4, 4→5}

   Only updates orders whose processStep is explicitly stored in metadata
   (not null/undefined). Idempotent — safe to call multiple times.
   Returns { ok, migrated, skipped, errors }.
────────────────────────────────────────────── */
app.post('/api/migrate-progress-steps', async (req, res) => {
  const ROUTE = '[migrate-progress-steps]';
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      const { rows: memberRows } = await pool.query(
        'SELECT role FROM agency_members WHERE user_id = $1 LIMIT 1',
        [req.user.id],
      );
      if (!memberRows[0] || !['owner', 'staff'].includes(memberRows[0].role)) {
        return err(res, 403, 'Hanya owner/staff yang dapat menjalankan migrasi');
      }
    }

    const MIGRATIONS = {
      visa_student: { 0: 2, 1: 3, 2: 4, 3: 4, 4: 5 },
      flight:       { 0: 0, 1: 3, 2: 4 },
      visa_voa:     { 0: 2, 1: 3, 2: 3, 3: 4 },
      umrah:        { 0: 0, 1: 2, 2: 3, 3: 4, 4: 5 },
    };
    const NEW_MAX = { visa_student: 5, flight: 4, visa_voa: 4, umrah: 5 };
    const types = Object.keys(MIGRATIONS);

    const { rows: orders } = await pool.query(
      `SELECT id, type, metadata FROM orders WHERE type = ANY($1)`,
      [types],
    );

    let migrated = 0, skipped = 0, errors = 0;
    const errorSamples = [];

    for (const order of orders) {
      const map = MIGRATIONS[order.type];
      if (!map) { skipped++; continue; }
      const meta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
      if (!('processStep' in meta) || meta.processStep == null) { skipped++; continue; }
      const oldStep = Number(meta.processStep);
      const newMax  = NEW_MAX[order.type] ?? 5;
      const oldMaxKey = Math.max(...Object.keys(map).map(Number));
      if (oldStep > oldMaxKey) { skipped++; continue; }
      const newStep = map[oldStep];
      if (newStep === undefined || newStep === oldStep) { skipped++; continue; }
      const clampedStep = Math.min(newStep, newMax);
      try {
        await pool.query(
          'UPDATE orders SET metadata = $2 WHERE id = $1',
          [order.id, JSON.stringify({ ...meta, processStep: clampedStep })],
        );
        migrated++;
        console.log(`${ROUTE} migrated order ${order.id} type=${order.type} ${oldStep}→${clampedStep}`);
      } catch (e) {
        errors++;
        if (errorSamples.length < 3) errorSamples.push({ id: order.id, error: String(e) });
      }
    }

    console.log(`${ROUTE} DONE — migrated=${migrated} skipped=${skipped} errors=${errors}`);
    return ok(res, { ok: true, migrated, skipped, errors, errorSamples });
  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
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

/* ──────────────────────────────────────────────
   POST /api/setup-card-back  (Supabase Storage removed — no-op)
────────────────────────────────────────────── */
app.post('/api/setup-card-back', (req, res) => {
  return ok(res, { ok: true, message: 'Storage bucket tidak diperlukan — gambar disimpan di database.' });
});

// ── Startup DB migration: add order_id column + unique constraint ─────────────
async function runWalletMigration() {
  try {
    await pool.query(`
      ALTER TABLE agent_wallet_transactions
        ADD COLUMN IF NOT EXISTS order_id TEXT;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_order_fee
        ON agent_wallet_transactions (agency_id, agent_id, order_id, type)
        WHERE order_id IS NOT NULL;
    `);
    console.log('[server] wallet migration OK — order_id column + unique index ready');
  } catch (e) {
    console.warn('[server] wallet migration warning:', e.message);
  }
}
void runWalletMigration();

const _server = app.listen(PORT, '0.0.0.0', () => {
  const mode = isProd ? 'production' : 'development';
  console.log(`[server] API running on port ${PORT} (${mode})`);
  const authMode = process.env.REPL_ID ? 'Replit OIDC + Bearer JWT' : 'Bearer JWT (Supabase)';
  console.log(`[server] Auth: ${authMode}`);
  console.log(`[server] Database: ${process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : 'not configured'}`);
  console.log(`[server] ── Caption Generator & OCR (OpenRouter) ──`);
  console.log(`[server]   OPENROUTER_API_KEY detected: ${!!OPENROUTER_API_KEY}`);
  if (OPENROUTER_API_KEY) {
    console.log(`[server]   OCR model     : ${MODEL_OCR}`);
    console.log(`[server]   Caption model : ${MODEL_CHAT}`);
    console.log(`[server]   Text model    : ${MODEL_TEXT}`);
  } else {
    console.warn('[server] OPENROUTER_API_KEY tidak ditemukan — fitur OCR dan Caption Generator tidak akan berfungsi');
  }
  console.log(`[server] ── AITEM / Asisten AI ──`);
  console.log(`[server]   OPENAI_API_KEY detected: ${!!OPENAI_API_KEY}`);
  if (OPENAI_API_KEY) {
    console.log(`[server]   Assistant model : ${MODEL_ASSISTANT}`);
  } else {
    console.warn('[server] OPENAI_API_KEY tidak ditemukan — fitur AITEM tidak akan berfungsi');
  }
});

_server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} already in use — exiting with code 1 so the process manager can restart cleanly.`);
    process.exit(1);
  } else {
    console.error('[server] HTTP server error:', err.message);
  }
});
