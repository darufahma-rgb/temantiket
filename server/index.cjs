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
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
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
    const { error: addErr } = await admin.from('agency_members').insert(membershipRow);
    if (addErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return err(res, 500, `Gagal tambah membership (auth user di-rollback): ${addErr.message}`);
    }

    // Upsert profile — include extra agent fields gracefully
    const profileRow = { id: newUserId, email, full_name: fullName };
    if (whatsappNumber) profileRow.phone_wa = whatsappNumber;
    if (agentNotes)     profileRow.notes    = agentNotes;
    if (role === 'agent') profileRow.is_active = (agentStatus !== 'inactive');

    const { error: profileErr } = await admin.from('profiles').upsert(profileRow, { onConflict: 'id' });
    const warnings = [];
    if (profileErr) warnings.push(`profile: ${profileErr.message}`);

    return ok(res, {
      ok: true, userId: newUserId, email, role, fullName,
      ...(warnings.length ? { warnings } : {}),
    });
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

      // built-in template
      drawRect(page, 0, H - 105, W, 105, DARK);
      drawRect(page, 0, H - 108, W, 3, SKY);
      txt(page, 'temantiket', 40, H - 45, 22, bold, WHITE);
      txt(page, 'mudah, cepat, amanah', 40, H - 63, 8, regular, rgb(0.6, 0.75, 0.85));
      drawRect(page, 38, H - 90, 3, 20, SKY);
      txt(page, 'INVOICE', 48, H - 90, 9, bold, SKY);
      txtRight(page, invoiceNumber, W - 40, H - 42, 13, bold, WHITE);
      txtRight(page, `Tanggal: ${invoiceDate}`, W - 40, H - 58, 9, regular, rgb(0.7, 0.8, 0.9));
      const statusLabel = (order.status || '').toUpperCase();
      const statusColor = order.status === 'Confirmed' ? rgb(0.2, 0.75, 0.45) : order.status === 'Cancelled' ? RED : rgb(0.95, 0.7, 0.1);
      const sBadgeW = bold.widthOfTextAtSize(statusLabel, 8) + 16;
      drawRect(page, W - 40 - sBadgeW, H - 82, sBadgeW, 16, statusColor, 0.2);
      txtRight(page, statusLabel, W - 40 - (sBadgeW / 2) + (bold.widthOfTextAtSize(statusLabel, 8) / 2) + (sBadgeW / 2), H - 78, 8, bold, statusColor);

      const clientY = H - 155;
      txt(page, 'INVOICE UNTUK:', 40, clientY, 7.5, regular, MUTED);
      txt(page, client?.name ?? 'Klien tidak diketahui', 40, clientY - 17, 15, bold, DARK);
      if (client?.phone) txt(page, `📞 ${client.phone}`, 40, clientY - 33, 9, regular, MUTED);
      const rightCol = W - 40;
      txtRight(page, 'No. Order:', rightCol, clientY, 8, regular, MUTED);
      txtRight(page, (order.id || '').slice(0, 12) + '…', rightCol, clientY - 14, 8, bold, DARK);
      txtRight(page, 'Tipe:', rightCol, clientY - 28, 8, regular, MUTED);
      txtRight(page, orderTypeLabel(order.type), rightCol, clientY - 42, 8, bold, DARK);
      line(page, 40, clientY - 55, W - 40, clientY - 55);

      let rowY = clientY - 75;
      drawRect(page, 40, rowY - 2, W - 80, 22, DARK);
      txt(page, 'DETAIL PEMESANAN', 52, rowY + 4, 8, bold, WHITE);
      txtRight(page, 'INFORMASI', W - 52, rowY + 4, 8, bold, WHITE);
      rowY -= 2;
      const rows = buildDetailRows(order, meta);
      rows.forEach(([label, value], i) => {
        const ry = rowY - (i * 22);
        if (i % 2 === 1) drawRect(page, 40, ry - 16, W - 80, 22, LIGHT);
        txt(page, label, 52, ry, 8.5, regular, MUTED);
        txt(page, value, W / 2, ry, 8.5, bold, DARK, W / 2 - 60);
      });
      rowY -= rows.length * 22 + 8;
      line(page, 40, rowY, W - 40, rowY);
      rowY -= 30;

      const totalFormatted = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
      const boxH = 56;
      drawRect(page, 40, rowY - boxH, W - 80, boxH, DARK);
      drawRect(page, 40, rowY - boxH, 5, boxH, SKY);
      txt(page, 'TOTAL PEMBAYARAN', 56, rowY - 18, 8, regular, rgb(0.6, 0.72, 0.82));
      txt(page, totalFormatted, 56, rowY - 38, 18, bold, WHITE);
      txtRight(page, `Mata Uang: ${order.currency}`, W - 52, rowY - 22, 8, regular, rgb(0.5, 0.65, 0.75));
      txtRight(page, 'Metode: Transfer Bank / Tunai', W - 52, rowY - 36, 8, regular, rgb(0.5, 0.65, 0.75));
      rowY -= boxH + 20;

      if (order.notes) {
        txt(page, 'Catatan:', 40, rowY, 8, regular, MUTED);
        txt(page, order.notes, 40, rowY - 14, 8, oblique, DARK, W - 80);
        rowY -= 38;
      }

      const footerY = 70;
      line(page, 40, footerY + 30, W - 40, footerY + 30);
      txtCenter(page, invoiceData.agencyName ?? 'Temantiket', W / 2, footerY + 16, 9, bold, MUTED);
      txtCenter(page, invoiceData.agencyPhone ?? '+62 813-1150-6025  ·  @temantiket', W / 2, footerY + 3, 8, regular, MUTED);
      txtCenter(page, 'Terima kasih atas kepercayaan Anda!', W / 2, footerY - 12, 8, oblique, MUTED);
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
    if (!OPENAI_API_KEY) {
      return err(res, 503, 'OPENAI_API_KEY belum di-set. Tambahkan di Replit Secrets.');
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

    const openaiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text();
      return err(res, 502, `OpenAI error: ${errTxt.slice(0, 300)}`);
    }

    const completion = await openaiRes.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      return err(res, 502, 'OpenAI returned empty response');
    }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return err(res, 502, 'OpenAI returned invalid JSON'); }

    const out = { source: 'openai', mrzValid: parsed.mrzValid === true };
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
