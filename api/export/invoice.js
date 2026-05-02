'use strict';

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const W = 595.28;
const H = 841.89;

const SKY    = rgb(0.031, 0.545, 0.757);
const DARK   = rgb(0.055, 0.086, 0.165);
const WHITE  = rgb(1, 1, 1);
const MUTED  = rgb(0.45, 0.47, 0.52);
const LIGHT  = rgb(0.96, 0.97, 0.99);
const BORDER = rgb(0.87, 0.89, 0.93);
const RED    = rgb(0.95, 0.3, 0.25);

const fmtIDR = (v) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
const fmtEGP = (v) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2 }).format(v);

function drawRect(page, x, y, w, h, fill, opacity = 1) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, opacity });
}

function txt(page, text, x, y, size, font, color = DARK, maxWidth) {
  let t = String(text ?? '');
  if (maxWidth) {
    while (t.length > 4 && font.widthOfTextAtSize(t, size) > maxWidth) {
      t = t.slice(0, -4) + '…';
    }
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

async function drawBuiltinTemplate(page, data, bold, regular, oblique) {
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = (order.metadata ?? {});

  drawRect(page, 0, H - 105, W, 105, DARK);
  drawRect(page, 0, H - 108, W, 3, SKY);
  page.drawLine({ start: { x: W - 140, y: H }, end: { x: W - 40, y: H - 105 }, thickness: 35, color: rgb(1, 1, 1, 0.05), opacity: 0.05 });

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
  txtCenter(page, data.agencyName ?? 'Temantiket', W / 2, footerY + 16, 9, bold, MUTED);
  txtCenter(page, data.agencyPhone ?? '+62 813-1150-6025  ·  @temantiket', W / 2, footerY + 3, 8, regular, MUTED);
  txtCenter(page, 'Terima kasih atas kepercayaan Anda!', W / 2, footerY - 12, 8, oblique, MUTED);
}

async function overlayOnTemplate(page, data, bold, regular, oblique) {
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = order.metadata ?? {};

  drawRect(page, 30, 160, W - 60, H - 240, WHITE, 0.88);
  txtRight(page, invoiceNumber, W - 40, H - 50, 13, bold, DARK);
  txtRight(page, invoiceDate, W - 40, H - 67, 9, regular, MUTED);

  let y = H - 115;
  txt(page, 'KEPADA:', 50, y, 8, regular, MUTED);
  txt(page, client?.name ?? '—', 50, y - 16, 14, bold, DARK);
  y -= 50;
  line(page, 40, y, W - 40, y);
  y -= 24;

  const rows = buildDetailRows(order, meta);
  rows.forEach(([label, value], i) => {
    const ry = y - i * 21;
    txt(page, label, 50, ry, 8.5, regular, MUTED);
    txt(page, value, 240, ry, 8.5, bold, DARK, W - 290);
  });
  y -= rows.length * 21 + 20;
  line(page, 40, y, W - 40, y);
  y -= 28;

  const totalFormatted = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
  txt(page, 'TOTAL:', 50, y, 10, bold, DARK);
  txtRight(page, totalFormatted, W - 50, y, 14, bold, SKY);

  if (order.notes) {
    y -= 36;
    txt(page, `Catatan: ${order.notes}`, 50, y, 8, oblique, MUTED, W - 100);
  }
}

async function generateInvoicePdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([W, H]);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  if (data.templateDataUrl) {
    try {
      const parts = data.templateDataUrl.split(',');
      const base64 = parts[1];
      const imageBytes = Buffer.from(base64, 'base64');
      const isJpeg = data.templateDataUrl.startsWith('data:image/jpeg') || data.templateDataUrl.startsWith('data:image/jpg');
      const img = isJpeg ? await pdfDoc.embedJpg(imageBytes) : await pdfDoc.embedPng(imageBytes);
      page.drawImage(img, { x: 0, y: 0, width: W, height: H });
      await overlayOnTemplate(page, data, bold, regular, oblique);
      drawWatermark(page, oblique);
      return await pdfDoc.save();
    } catch {
      // fall through to built-in template
    }
  }

  await drawBuiltinTemplate(page, data, bold, regular, oblique);
  drawWatermark(page, oblique);
  return await pdfDoc.save();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    if (!data || !data.order) return res.status(400).json({ error: 'Missing order data' });
    const pdfBytes = await generateInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('[api/export/invoice]', e);
    res.status(500).json({ error: e.message });
  }
}
