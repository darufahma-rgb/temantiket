import { PDFDocument, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── INVOICE helpers ────────────────────────────────────────────────────────────

const W = 595.28;
const H = 841.89;

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
    if (meta.airline)       rows.push(['Maskapai', `${meta.airline}${meta.flightNumber ? ` · ${meta.flightNumber}` : ''}`]);
    if (meta.departDate)    rows.push(['Tanggal Berangkat', String(meta.departDate)]);
    if (meta.departTime)    rows.push(['Waktu Berangkat',   String(meta.departTime)]);
    if (meta.arriveTime)    rows.push(['Waktu Tiba',        String(meta.arriveTime)]);
    if (meta.passengerName) rows.push(['Nama Penumpang',    String(meta.passengerName)]);
    if (meta.pnr)           rows.push(['Kode PNR',          String(meta.pnr)]);
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

async function generateInvoicePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let bold, regular;
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  try {
    const boldBytes = readFileSync(join(__dirname, '../../public/fonts/Sk-Modernist-Bold.otf'));
    const regBytes  = readFileSync(join(__dirname, '../../public/fonts/Sk-Modernist-Regular.otf'));
    bold    = await pdfDoc.embedFont(boldBytes);
    regular = await pdfDoc.embedFont(regBytes);
  } catch {
    bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const page = pdfDoc.addPage([W, H]);
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = (order.metadata ?? {});

  if (data.templateDataUrl) {
    try {
      const base64   = data.templateDataUrl.split(',')[1];
      const imgBytes = Buffer.from(base64, 'base64');
      const isJpeg   = data.templateDataUrl.startsWith('data:image/jpeg') || data.templateDataUrl.startsWith('data:image/jpg');
      const img      = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
      page.drawImage(img, { x: 0, y: 0, width: W, height: H });
      drawRect(page, 30, 160, W - 60, H - 240, WHITE, 0.88);
      txtRight(page, invoiceNumber, W - 40, H - 50, 13, bold, DARK);
      txtRight(page, invoiceDate,   W - 40, H - 67, 9,  regular, MUTED);
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
      if (order.notes) { y -= 36; txt(page, `Catatan: ${order.notes}`, 50, y, 8, oblique, MUTED, W - 100); }
      const wm = 'by Temantiket';
      const wmW = regular.widthOfTextAtSize(wm, 8);
      page.drawText(wm, { x: W / 2 - wmW / 2, y: 26, size: 8, font: regular, color: rgb(0.68, 0.71, 0.76), opacity: 0.55 });
      return await pdfDoc.save();
    } catch { /* fall through */ }
  }

  const HEADER_H = 128;
  drawRect(page, 0, H - HEADER_H, W, HEADER_H, DARK);
  drawRect(page, 0, H - HEADER_H, W, 3, SKY);
  drawRect(page, W - 210, H - HEADER_H, 210, HEADER_H, SKY, 0.065);
  page.drawLine({ start: { x: W - 170, y: H }, end: { x: W - 28,  y: H - HEADER_H }, thickness: 52, color: WHITE, opacity: 0.032 });
  page.drawLine({ start: { x: W - 220, y: H }, end: { x: W - 80,  y: H - HEADER_H }, thickness: 28, color: WHITE, opacity: 0.022 });

  drawTemantiketIcon(page, 38, H - 44, 0.48);
  txt(page, 'temantiket',           73, H - 50, 22,  bold,    WHITE);
  txt(page, 'mudah, cepat, amanah', 73, H - 68, 7.5, regular, LOGO_SUB);
  drawRect(page, 37, H - 99, 3, 22, SKY);
  txt(page, 'INVOICE', 46, H - 93, 8.5, bold, SKY);
  txtRight(page, invoiceNumber,             W - 40, H - 44, 13,  bold,    WHITE);
  txtRight(page, `Tanggal: ${invoiceDate}`, W - 40, H - 61, 8.5, regular, HEADER_SUB);

  const statusLabel = (order.status || '').toUpperCase();
  const statusColor = order.status === 'Confirmed' ? CONFIRMED : order.status === 'Cancelled' ? RED : PENDING;
  const sBadgeW = bold.widthOfTextAtSize(statusLabel, 7.5) + 20;
  const sBadgeX = W - 40 - sBadgeW;
  drawRect(page, sBadgeX, H - 98, sBadgeW, 17, statusColor, 0.22);
  txt(page, statusLabel, sBadgeX + (sBadgeW - bold.widthOfTextAtSize(statusLabel, 7.5)) / 2, H - 93, 7.5, bold, statusColor);

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

  let rowY = clientY - 77;
  drawRect(page, 40, rowY - 20, W - 80, 22, DARK);
  drawRect(page, 40, rowY - 20, 4, 22, SKY);
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

  const totalFormatted = order.currency === 'EGP' ? fmtEGP(Number(order.totalPrice)) : fmtIDR(Number(order.totalPrice));
  const boxH = 60;
  drawRect(page, 40, rowY - boxH, W - 80, boxH, DARK);
  drawRect(page, 40, rowY - boxH, 5, boxH, SKY);
  drawRect(page, 40, rowY - 2, W - 80, 2, SKY);
  txt(page, 'TOTAL PEMBAYARAN', 57, rowY - 18, 8,  regular, TOTAL_LABEL);
  txt(page, totalFormatted,     57, rowY - 40, 20, bold,    WHITE);
  txtRight(page, `Mata Uang: ${order.currency}`,  W - 55, rowY - 22, 7.5, regular, TOTAL_META);
  txtRight(page, 'Metode: Transfer Bank / Tunai', W - 55, rowY - 36, 7.5, regular, TOTAL_META);
  rowY -= boxH + 22;

  if (order.notes) {
    txt(page, 'Catatan:', 40, rowY, 8, regular, MUTED);
    txt(page, order.notes, 40, rowY - 14, 8, oblique, DARK, W - 80);
    rowY -= 40;
  }

  const footerY = 72;
  sepLine(page, 40, footerY + 32, W - 40);
  txtCenter(page, data.agencyName ?? 'Temantiket',         W / 2, footerY + 18, 9, bold,    MUTED);
  txtCenter(page, data.agencyPhone ?? '+62 813-1150-6025', W / 2, footerY +  4, 8, regular, MUTED);
  txtCenter(page, 'Terima kasih atas kepercayaan Anda!',   W / 2, footerY - 10, 8, oblique, MUTED);

  const wm = 'by Temantiket';
  const wmW = regular.widthOfTextAtSize(wm, 8);
  page.drawText(wm, { x: W / 2 - wmW / 2, y: 26, size: 8, font: regular, color: rgb(0.68, 0.71, 0.76), opacity: 0.55 });

  return await pdfDoc.save();
}

// ── IGH helpers ────────────────────────────────────────────────────────────────

const IGH_BRAND_BLUE = rgb(0x08 / 255, 0x8B / 255, 0xC1 / 255);
const IGH_GREY_MUTED = rgb(0.45, 0.45, 0.45);
const IGH_DARK       = rgb(0.13, 0.13, 0.13);
const IGH_WHITE      = rgb(1, 1, 1);
const IGH_WA_GREEN   = rgb(0x25 / 255, 0xD3 / 255, 0x66 / 255);

const IGH_TPL_W_PX = 740;
const IGH_PAGE_W   = 413.9506;
const IGH_PAGE_H   = 572.532;
const IGH_SCALE    = IGH_PAGE_W / IGH_TPL_W_PX;

const DEFAULT_IGH_LAYOUT = {
  projectName: { xPx: 55, topPx: 257, size: 22, lineGapPx: 4 },
  metaInfo: { customerXPx: 335, dateXPx: 538, topPx: 259, size: 13 },
  hotel: { makkahXPx: 51, madinahXPx: 407, topPx: 395, size: 22, subtitleOffsetPx: 38 },
  pricing: { paxXPx: 47, priceXPx: 272, topPx: 518, size: 22, yOffsetPdf: -8 },
  groupPricing: { topPx: 510, rowSpacingPx: 28, paxCenterXPx: 95, quadCenterXPx: 280, tripleCenterXPx: 465, doubleCenterXPx: 650, quadXOffsetPx: 0, tripleXOffsetPx: 0, doubleXOffsetPx: 0, cellHeightPx: 24, size: 14, currencySymbol: '$' },
  checklist: { leftXPx: 212, rightXPx: 576, firstBaselinePx: 715, rowSpacingPx: 28, yOffsetPx: 0, size: 10, sudahTermasukAlign: 'center', belumTermasukAlign: 'center', listBullet: '•' },
  fonts: { family: 'Poppins', overrides: {} },
  pdfCurrency: 'USD',
  footer: { topPx: 891, waXPx: 290, waIconSizePt: 9, size: 7, showWhatsapp: true },
  whatsappPosition: { xPx: 290, yPx: 891 },
  mainHeaderGap: 25, headerSubtitleOffset: { xPx: 0, yPx: 0 },
  subtitleWidthPx: 285, subtitleFontSize: 11, dateDisplayMode: 'Short', priceDisplayMode: 'compact',
};

const GROUP_LAYOUT = {
  projectName: { xPx: 55, topPx: 90, size: 26, lineGapPx: 4 },
  metaInfo: { customerXPx: 365, dateXPx: 55, topPx: 273, size: 12 },
  hotel: { makkahXPx: 55, madinahXPx: 384, topPx: 343, size: 22, subtitleOffsetPx: 38 },
  pricing: { paxXPx: 47, priceXPx: 272, topPx: 518, size: 22, yOffsetPdf: -8 },
  groupPricing: { topPx: 440, rowSpacingPx: 28, paxCenterXPx: 126, quadCenterXPx: 306, tripleCenterXPx: 476, doubleCenterXPx: 631, quadXOffsetPx: 0, tripleXOffsetPx: 0, doubleXOffsetPx: 0, cellHeightPx: 24, size: 14, currencySymbol: '$' },
  checklist: { leftXPx: 200, rightXPx: 542, firstBaselinePx: 775, rowSpacingPx: 26, yOffsetPx: 0, size: 10, sudahTermasukAlign: 'center', belumTermasukAlign: 'center', listBullet: '•' },
  fonts: { family: 'Poppins', overrides: {} },
  pdfCurrency: 'USD',
  footer: { topPx: 891, waXPx: 290, waIconSizePt: 9, size: 7, showWhatsapp: true },
  whatsappPosition: { xPx: 290, yPx: 891 },
  mainHeaderGap: 25, headerSubtitleOffset: { xPx: 0, yPx: 0 },
  subtitleWidthPx: 285, subtitleFontSize: 11, dateDisplayMode: 'Short', priceDisplayMode: 'compact',
};

function ighMergeConfig(base, override) {
  if (!override) return base;
  return {
    projectName: { ...base.projectName, ...(override.projectName ?? {}) },
    metaInfo: { ...base.metaInfo, ...(override.metaInfo ?? {}) },
    hotel: { ...base.hotel, ...(override.hotel ?? {}) },
    pricing: { ...base.pricing, ...(override.pricing ?? {}) },
    groupPricing: { ...base.groupPricing, ...(override.groupPricing ?? {}) },
    checklist: { ...base.checklist, ...(override.checklist ?? {}) },
    footer: { ...base.footer, ...(override.footer ?? {}) },
    fonts: { ...base.fonts, ...(override.fonts ?? {}), overrides: { ...(base.fonts.overrides ?? {}), ...(override.fonts?.overrides ?? {}) } },
    customTemplate: 'customTemplate' in (override ?? {}) ? (override.customTemplate ?? null) : (base.customTemplate ?? null),
    pdfCurrency: 'pdfCurrency' in (override ?? {}) ? (override.pdfCurrency ?? base.pdfCurrency ?? 'USD') : (base.pdfCurrency ?? 'USD'),
    mainHeaderGap: override.mainHeaderGap ?? base.mainHeaderGap ?? base.headerSubtitleGap,
    headerSubtitleGap: override.headerSubtitleGap ?? base.headerSubtitleGap,
    headerSubtitleOffset: override.headerSubtitleOffset ? { ...(base.headerSubtitleOffset ?? { xPx: 0, yPx: 0 }), ...override.headerSubtitleOffset } : base.headerSubtitleOffset,
    subtitleWidthPx: 'subtitleWidthPx' in (override ?? {}) ? (override.subtitleWidthPx ?? base.subtitleWidthPx ?? 285) : (base.subtitleWidthPx ?? 285),
    subtitleFontSize: 'subtitleFontSize' in (override ?? {}) ? (override.subtitleFontSize ?? base.subtitleFontSize ?? 11) : (base.subtitleFontSize ?? 11),
    dateDisplayMode: 'dateDisplayMode' in (override ?? {}) ? (override.dateDisplayMode ?? base.dateDisplayMode ?? 'Short') : (base.dateDisplayMode ?? 'Short'),
    whatsappPosition: override.whatsappPosition ? { ...(base.whatsappPosition ?? { xPx: 0, yPx: 0 }), ...override.whatsappPosition } : base.whatsappPosition,
    priceDisplayMode: 'priceDisplayMode' in (override ?? {}) ? (override.priceDisplayMode ?? base.priceDisplayMode ?? 'compact') : (base.priceDisplayMode ?? 'compact'),
  };
}

function ighFontUrls(baseUrl, family) {
  const map = {
    Montserrat:     { regular: '/fonts/Montserrat-Regular.ttf', semiBold: '/fonts/Montserrat-SemiBold.ttf', bold: '/fonts/Montserrat-Bold.ttf' },
    Poppins:        { regular: '/fonts/Poppins-Regular.ttf',    semiBold: '/fonts/Poppins-SemiBold.ttf',    bold: '/fonts/Poppins-Bold.ttf' },
    'Sk-Modernist': { regular: '/fonts/Sk-Modernist-Regular.otf', semiBold: '/fonts/Sk-Modernist-Bold.otf', bold: '/fonts/Sk-Modernist-Bold.otf' },
  };
  const paths = map[family] ?? map['Poppins'];
  return { regular: baseUrl + paths.regular, semiBold: baseUrl + paths.semiBold, bold: baseUrl + paths.bold };
}

function ighPxRect(l, t, w, h) {
  return { x: l * IGH_SCALE, y: IGH_PAGE_H - t * IGH_SCALE - h * IGH_SCALE, width: w * IGH_SCALE, height: h * IGH_SCALE };
}

function ighTruncate(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid) + '…', size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

function ighDrawText(page, text, opts) {
  let size = opts.size;
  const minSize = opts.minSize ?? Math.max(8, opts.size - 6);
  const maxW = opts.maxWidthPx ? opts.maxWidthPx * IGH_SCALE : Infinity;
  while (size > minSize && opts.font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  const value = opts.font.widthOfTextAtSize(text, size) > maxW ? ighTruncate(text, opts.font, size, maxW) : text;
  page.drawText(value, { x: opts.leftPx * IGH_SCALE, y: IGH_PAGE_H - opts.topPx * IGH_SCALE - size * 0.78, size, font: opts.font, color: opts.color });
}

function ighDrawTextAligned(page, text, opts) {
  const size = opts.size;
  const maxW = opts.maxWidthPx ? opts.maxWidthPx * IGH_SCALE : Infinity;
  const value = opts.font.widthOfTextAtSize(text, size) > maxW ? ighTruncate(text, opts.font, size, maxW) : text;
  const textW = opts.font.widthOfTextAtSize(value, size);
  const anchorXPt = opts.anchorXPx * IGH_SCALE;
  const x = opts.align === 'left' ? anchorXPt : opts.align === 'right' ? anchorXPt - textW : anchorXPt - textW / 2;
  page.drawText(value, { x, y: IGH_PAGE_H - opts.topPx * IGH_SCALE - size * 0.78, size, font: opts.font, color: opts.color });
}

function ighDrawTextCentered(page, text, opts) {
  const r = ighPxRect(opts.leftPx, opts.topPx, opts.widthPx, opts.heightPx);
  const maxW = r.width - 16;
  const minSize = opts.minSize ?? 10;
  let size = opts.size;
  let textW = opts.font.widthOfTextAtSize(text, size);
  while (textW > maxW && size > minSize) { size -= 0.5; textW = opts.font.widthOfTextAtSize(text, size); }
  let value = text;
  if (textW > maxW) { value = ighTruncate(text, opts.font, size, maxW); textW = opts.font.widthOfTextAtSize(value, size); }
  const cap = size * 0.70;
  page.drawText(value, { x: r.x + (r.width - textW) / 2, y: r.y + (r.height - cap) / 2 + (opts.yOffsetPdf ?? 0), size, font: opts.font, color: opts.color });
}

function ighWrapAtSize(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function ighPick(override, fallback) {
  const v = (override ?? '').trim();
  return v.length > 0 ? override : fallback;
}

function ighFmtCurrency(n, currency, mode = 'compact') {
  if (!n || !Number.isFinite(n) || n <= 0) return '—';
  if (currency === 'IDR') {
    if (mode === 'full') return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} M`;
    if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} jt`;
    return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
  }
  const rounded = Math.round(n);
  if (currency === 'SAR') return `SAR ${rounded.toLocaleString('en-US')}`;
  return `$${rounded.toLocaleString('en-US')}`;
}

function ighConvertViaIdr(valueDisplay, valueIDR, sourceCur, targetCur, kursUSD = 1, kursSAR = 1) {
  if (sourceCur === targetCur) return valueDisplay;
  let idr;
  if (typeof valueIDR === 'number' && Number.isFinite(valueIDR) && valueIDR > 0) idr = valueIDR;
  else if (typeof valueDisplay === 'number' && Number.isFinite(valueDisplay) && valueDisplay > 0) {
    if (sourceCur === 'IDR') idr = valueDisplay;
    else if (sourceCur === 'USD') idr = valueDisplay * (kursUSD || 1);
    else idr = valueDisplay * (kursSAR || 1);
  } else return undefined;
  if (targetCur === 'IDR') return idr;
  if (targetCur === 'USD') return idr / (kursUSD || 1);
  return idr / (kursSAR || 1);
}

function ighSplitOverride(override, fallback) {
  const v = (override ?? '').trim();
  if (!v) return fallback;
  return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function ighMaskChecklistDividers(page, centerXPx, baselinesPx) {
  const COL_WIDTH_PX = 235, DIGIT_RESERVE_PX = 26, LINE_OFFSET_PX = 4, MASK_HEIGHT_PX = 6;
  const leftEdgePx = centerXPx - COL_WIDTH_PX / 2 + DIGIT_RESERVE_PX;
  const widthPx = COL_WIDTH_PX - DIGIT_RESERVE_PX - 2;
  for (const baselinePx of baselinesPx) {
    const r = ighPxRect(leftEdgePx, baselinePx + LINE_OFFSET_PX, widthPx, MASK_HEIGHT_PX);
    page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, color: IGH_WHITE, borderWidth: 0 });
  }
}

function ighDrawList(page, items, firstBaselinePx, rowSpacingPx, maxRows, anchorXPx, font, baseSize = 10, align = 'center', bullet = '•') {
  const cleaned = items.map((s) => s.trim()).filter(Boolean).slice(0, maxRows);
  const COL_WIDTH = 235, maxW = (COL_WIDTH - 8) * IGH_SCALE, anchorXPt = anchorXPx * IGH_SCALE;
  const prefix = bullet ? `${bullet} ` : '';
  const prefixW = font.widthOfTextAtSize(prefix, baseSize);
  const lineAdvancePx = (baseSize * 1.25) / IGH_SCALE;
  const interItemGapPx = Math.max(rowSpacingPx - lineAdvancePx, lineAdvancePx * 0.4);
  let cursorPx = firstBaselinePx;
  for (let i = 0; i < cleaned.length; i++) {
    const bodyMaxW = Math.max(0, maxW - prefixW);
    const wrapped = ighWrapAtSize(cleaned[i], font, baseSize, bodyMaxW);
    const longestW = wrapped.reduce((mx, ln) => Math.max(mx, font.widthOfTextAtSize(ln, baseSize)), 0);
    const blockW = prefixW + longestW;
    let blockLeftPt;
    if (align === 'left') blockLeftPt = anchorXPt;
    else if (align === 'right') blockLeftPt = anchorXPt - blockW;
    else blockLeftPt = anchorXPt - blockW / 2;
    const textXPt = blockLeftPt + prefixW;
    for (let li = 0; li < wrapped.length; li++) {
      const y = IGH_PAGE_H - cursorPx * IGH_SCALE;
      if (li === 0 && prefix) {
        page.drawText(prefix, { x: blockLeftPt, y, size: baseSize, font, color: IGH_DARK });
        page.drawText(wrapped[li], { x: textXPt, y, size: baseSize, font, color: IGH_DARK });
      } else {
        page.drawText(wrapped[li], { x: textXPt, y, size: baseSize, font, color: IGH_DARK });
      }
      cursorPx += lineAdvancePx;
    }
    cursorPx += interItemGapPx - lineAdvancePx;
  }
}

function ighWhatsappDigits(raw) { return (raw ?? '').replace(/\D+/g, ''); }
function ighFormatWhatsappDisplay(raw) {
  const d = ighWhatsappDigits(raw);
  if (!d) return '';
  if (d.startsWith('62')) {
    const rest = d.slice(2);
    const a = rest.slice(0, 3), b = rest.slice(3, 7), c = rest.slice(7);
    return `+62 ${a}${b ? `-${b}` : ''}${c ? `-${c}` : ''}`.trim();
  }
  return `+${d}`;
}

function ighDrawWhatsappFooter(page, pdf, opts) {
  const baseX = opts.leftXPx * IGH_SCALE;
  const baseY = IGH_PAGE_H - opts.topPx * IGH_SCALE;
  const r = opts.iconSizePt / 2;
  const cx = baseX + r, cy = baseY + r * 0.4;
  page.drawCircle({ x: cx, y: cy, size: r, color: IGH_WA_GREEN, borderWidth: 0 });
  const phonePath = 'M 1.05 1.95 c 0.30 0.40 0.78 0.92 1.45 1.55 c 0.67 0.63 1.20 1.05 1.55 1.30 c 0.20 0.14 0.40 0.10 0.58 -0.05 l 0.50 -0.50 c 0.20 -0.20 0.45 -0.22 0.70 -0.10 l 1.45 0.75 c 0.25 0.13 0.30 0.40 0.15 0.65 c -0.40 0.65 -1.00 1.10 -1.85 1.20 c -0.85 0.10 -1.95 -0.20 -3.05 -0.95 c -1.10 -0.75 -2.10 -1.85 -2.85 -3.05 c -0.75 -1.10 -1.05 -2.20 -0.95 -3.05 c 0.10 -0.85 0.55 -1.45 1.20 -1.85 c 0.25 -0.15 0.52 -0.10 0.65 0.15 l 0.75 1.45 c 0.12 0.25 0.10 0.50 -0.10 0.70 l -0.50 0.50 c -0.15 0.18 -0.19 0.38 -0.05 0.58 z';
  const pathScale = (2 * r * 0.55) / 7;
  page.drawSvgPath(phonePath, { x: cx - 3.5 * pathScale, y: cy + 3.5 * pathScale, scale: pathScale, color: IGH_WHITE, borderWidth: 0 });
  const textX = cx + r + 4, textY = cy - opts.textSizePt * 0.32;
  page.drawText(opts.displayNumber, { x: textX, y: textY, size: opts.textSizePt, font: opts.font, color: IGH_DARK });
  const textWidth = opts.font.widthOfTextAtSize(opts.displayNumber, opts.textSizePt);
  const linkAnnot = pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [baseX, cy - r - 1, textX + textWidth + 1, cy + r + 1], Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(`https://wa.me/${ighWhatsappDigits(opts.displayNumber)}`) },
  });
  const linkRef = pdf.context.register(linkAnnot);
  const existing = page.node.lookup(PDFName.of('Annots'));
  if (existing && 'push' in existing) existing.push(linkRef);
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([linkRef]));
}

async function buildIghPdf(data, layout, adminSettings, baseUrl) {
  const isGroup = data.mode === 'group';
  const modeDefault = isGroup ? GROUP_LAYOUT : DEFAULT_IGH_LAYOUT;
  const cfg = ighMergeConfig(modeDefault, layout);
  const priceMode = cfg.priceDisplayMode ?? 'compact';

  const TEMPLATE_URL       = baseUrl + '/igh-blank-template.pdf';
  const TEMPLATE_GROUP_URL = baseUrl + '/templates/IGH_Blank_Template_Group.pdf';
  const defaultTplUrl = isGroup ? TEMPLATE_GROUP_URL : TEMPLATE_URL;

  const fetchBytes = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gagal ambil ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const bytesCache = new Map();
  const fetchBytesCached = async (url) => {
    if (!bytesCache.has(url)) bytesCache.set(url, fetchBytes(url));
    return bytesCache.get(url);
  };

  let pdf;
  const customTpl = cfg.customTemplate;
  if (customTpl?.type === 'pdf') {
    try { pdf = await PDFDocument.load(await fetchBytes(customTpl.url)); }
    catch { pdf = await PDFDocument.load(await fetchBytesCached(defaultTplUrl)); }
  } else if (customTpl?.type === 'image') {
    pdf = await PDFDocument.create();
    const page = pdf.addPage([IGH_PAGE_W, IGH_PAGE_H]);
    try {
      const bytes = await fetchBytes(customTpl.url);
      const isPng = /\.png(\?|$)/i.test(customTpl.url) || /image\/png/i.test(customTpl.name ?? '');
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const ir = img.width / img.height, pr = IGH_PAGE_W / IGH_PAGE_H;
      let drawW, drawH;
      if (ir > pr) { drawH = IGH_PAGE_H; drawW = drawH * ir; }
      else { drawW = IGH_PAGE_W; drawH = drawW / ir; }
      page.drawImage(img, { x: (IGH_PAGE_W - drawW) / 2, y: (IGH_PAGE_H - drawH) / 2, width: drawW, height: drawH });
    } catch { /* empty background */ }
  } else {
    pdf = await PDFDocument.load(await fetchBytesCached(defaultTplUrl));
  }

  pdf.registerFontkit(fontkit);

  const usedFamilies = new Set([cfg.fonts.family]);
  for (const fam of Object.values(cfg.fonts.overrides ?? {})) { if (fam) usedFamilies.add(fam); }

  const familyFonts = {};
  await Promise.all(Array.from(usedFamilies).map(async (fam) => {
    const urls = ighFontUrls(baseUrl, fam);
    const [regBytes, sbBytes, boldBytes] = await Promise.all([
      fetchBytesCached(urls.regular), fetchBytesCached(urls.semiBold), fetchBytesCached(urls.bold),
    ]);
    familyFonts[fam] = {
      regular:  await pdf.embedFont(regBytes,  { subset: true }),
      semiBold: await pdf.embedFont(sbBytes,   { subset: true }),
      bold:     await pdf.embedFont(boldBytes, { subset: true }),
    };
  }));

  void (await pdf.embedFont(StandardFonts.Helvetica));
  const fontFor = (section, weight) => {
    const fam = cfg.fonts.overrides?.[section] ?? cfg.fonts.family;
    const set = familyFonts[fam] ?? familyFonts[cfg.fonts.family];
    return set[weight];
  };

  const page = pdf.getPage(0);

  // 1. Project name + timeline
  const projectName = ighPick(cfg.projectName.text, (data.projectName || '—').trim());
  const projMaxW = 285 * IGH_SCALE;
  const projBold = fontFor('projectName', 'bold');
  const projReg  = fontFor('projectName', 'regular');
  const projAlign = cfg.projectName.align ?? 'left';
  let projSize = cfg.projectName.size;
  let projLines = [];
  const manualSegments = projectName.split('\n');
  while (projSize > 14) {
    projLines = [];
    for (const seg of manualSegments) {
      if (!seg.trim()) { projLines.push(''); continue; }
      projLines.push(...ighWrapAtSize(seg, projBold, projSize, projMaxW));
    }
    if (projLines.length <= 4) break;
    projSize -= 1;
  }
  if (projLines.length > 4) projLines = projLines.slice(0, 4);
  const projLH = projSize + cfg.projectName.lineGapPx;
  let py = cfg.projectName.topPx;
  for (const ln of projLines) {
    if (ln) ighDrawTextAligned(page, ln, { anchorXPx: cfg.projectName.xPx, topPx: py, size: projSize, font: projBold, color: IGH_BRAND_BLUE, align: projAlign, maxWidthPx: 285 });
    py += projLH;
  }

  const subtitleGap   = cfg.mainHeaderGap ?? cfg.headerSubtitleGap ?? 6;
  const subtitleXOff  = cfg.headerSubtitleOffset?.xPx ?? 0;
  const subtitleYOff  = cfg.headerSubtitleOffset?.yPx ?? 0;
  const SUBTITLE_PT   = cfg.subtitleFontSize ?? 11;
  const subtitleMaxW  = (cfg.subtitleWidthPx ?? 285) * IGH_SCALE;
  const dateMode      = cfg.dateDisplayMode ?? 'Short';
  const timelineText  = (dateMode === 'Short' ? (data.timelineShort || data.timeline) : data.timeline) || '—';
  const subtitleLines = ighWrapAtSize(timelineText, projReg, SUBTITLE_PT, subtitleMaxW);
  let subtitleY       = py + subtitleGap + subtitleYOff;
  for (const ln of subtitleLines) {
    ighDrawTextAligned(page, ln, { anchorXPx: cfg.projectName.xPx + subtitleXOff, topPx: subtitleY, size: SUBTITLE_PT, font: projReg, color: IGH_GREY_MUTED, align: projAlign, maxWidthPx: cfg.subtitleWidthPx ?? 285 });
    subtitleY += SUBTITLE_PT * 1.25;
  }

  // 2. Header meta
  const metaReg   = fontFor('metaInfo', 'regular');
  const customerY = cfg.metaInfo.customerYPx ?? cfg.metaInfo.topPx;
  const dateY     = cfg.metaInfo.dateYPx ?? cfg.metaInfo.topPx;
  ighDrawText(page, ighPick(cfg.metaInfo.customerText, data.customerName || '—'), { leftPx: cfg.metaInfo.customerXPx, topPx: customerY, size: cfg.metaInfo.size, font: metaReg, color: IGH_BRAND_BLUE, maxWidthPx: 175 });
  ighDrawText(page, ighPick(cfg.metaInfo.dateText, data.date || '—'),             { leftPx: cfg.metaInfo.dateXPx,     topPx: dateY,      size: cfg.metaInfo.size, font: metaReg, color: IGH_BRAND_BLUE, maxWidthPx: 175 });

  // 3. Hotel
  const hotelBold     = fontFor('hotel', 'bold');
  const hotelReg      = fontFor('hotel', 'regular');
  const subtitleSize  = Math.max(7, Math.min(14, cfg.hotel.size * 0.45));
  ighDrawText(page, ighPick(cfg.hotel.makkahText,  data.hotelMakkah  || '—'), { leftPx: cfg.hotel.makkahXPx,  topPx: cfg.hotel.topPx, size: cfg.hotel.size, minSize: 12, font: hotelBold, color: IGH_BRAND_BLUE, maxWidthPx: 285 });
  ighDrawText(page, `${Math.max(0, data.makkahNights  || 0)} Malam`,          { leftPx: cfg.hotel.makkahXPx,  topPx: cfg.hotel.topPx + cfg.hotel.subtitleOffsetPx, size: subtitleSize, font: hotelReg, color: IGH_DARK });
  ighDrawText(page, ighPick(cfg.hotel.madinahText, data.hotelMadinah || '—'), { leftPx: cfg.hotel.madinahXPx, topPx: cfg.hotel.topPx, size: cfg.hotel.size, minSize: 12, font: hotelBold, color: IGH_BRAND_BLUE, maxWidthPx: 285 });
  ighDrawText(page, `${Math.max(0, data.madinahNights || 0)} Malam`,          { leftPx: cfg.hotel.madinahXPx, topPx: cfg.hotel.topPx + cfg.hotel.subtitleOffsetPx, size: subtitleSize, font: hotelReg, color: IGH_DARK });

  // 4. Pricing
  if (isGroup) {
    const gp = cfg.groupPricing;
    const groupBold = fontFor('groupPricing', 'bold');
    const rows = data.groupPricing ?? [];
    const targetCur = cfg.pdfCurrency ?? (gp.currencySymbol.trim().toLowerCase().startsWith('rp') ? 'IDR' : gp.currencySymbol.trim().toUpperCase().startsWith('SAR') ? 'SAR' : 'USD');
    const sourceCur = data.displayCurrency ?? 'USD';
    const kursUSD = data.kursIdrPerUsd ?? 1, kursSAR = data.kursIdrPerSar ?? 1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const topPx = gp.topPx + i * gp.rowSpacingPx;
      const COL_W = 110;
      const cell = (centerXPx, text) => ighDrawTextCentered(page, text, { leftPx: centerXPx - COL_W / 2, topPx, widthPx: COL_W, heightPx: gp.cellHeightPx, size: gp.size, minSize: 9, font: groupBold, color: IGH_BRAND_BLUE });
      cell(gp.paxCenterXPx, row.paxLabel || '—');
      cell(gp.quadCenterXPx   + gp.quadXOffsetPx,   ighFmtCurrency(ighConvertViaIdr(row.quad,   row.quadIDR,   sourceCur, targetCur, kursUSD, kursSAR), targetCur, priceMode));
      cell(gp.tripleCenterXPx + gp.tripleXOffsetPx, ighFmtCurrency(ighConvertViaIdr(row.triple, row.tripleIDR, sourceCur, targetCur, kursUSD, kursSAR), targetCur, priceMode));
      cell(gp.doubleCenterXPx + gp.doubleXOffsetPx, ighFmtCurrency(ighConvertViaIdr(row.double, row.doubleIDR, sourceCur, targetCur, kursUSD, kursSAR), targetCur, priceMode));
    }
  } else {
    const priceBold  = fontFor('pricing', 'bold');
    const PAX_BOX    = { leftPx: cfg.pricing.paxXPx,   topPx: cfg.pricing.topPx, widthPx: 114, heightPx: 61 };
    const PRICE_BOX  = { leftPx: cfg.pricing.priceXPx, topPx: cfg.pricing.topPx, widthPx: 406, heightPx: 61 };
    const targetCur  = cfg.pdfCurrency ?? 'IDR';
    const priceInTarget = ighConvertViaIdr(undefined, data.pricePerPaxIDR || 0, 'IDR', targetCur, data.kursIdrPerUsd ?? 1, data.kursIdrPerSar ?? 1);
    const paxText    = ighPick(cfg.pricing.paxText, String(Math.max(0, data.pax || 0)));
    const priceText  = ighPick(cfg.pricing.priceText, ighFmtCurrency(targetCur === 'IDR' ? (data.pricePerPaxIDR || 0) : priceInTarget, targetCur, priceMode));
    ighDrawTextCentered(page, paxText,   { ...PAX_BOX,   size: cfg.pricing.size + 4, minSize: 14, font: priceBold, color: IGH_WHITE, yOffsetPdf: cfg.pricing.yOffsetPdf });
    ighDrawTextCentered(page, priceText, { ...PRICE_BOX, size: cfg.pricing.size,     minSize: 12, font: priceBold, color: IGH_WHITE, yOffsetPdf: cfg.pricing.yOffsetPdf });
  }

  // 5. Checklist
  const listFont = fontFor('checklist', 'semiBold');
  const firstBaselinePxResolved = cfg.checklist.firstBaselinePx + cfg.checklist.yOffsetPx;
  const MAX_LIST_ROWS = 5;
  const ROW_BASELINES = Array.from({ length: MAX_LIST_ROWS }, (_, i) =>
    cfg.checklist.firstBaselinePx + i * cfg.checklist.rowSpacingPx + cfg.checklist.yOffsetPx
  );
  const includedItems = ighSplitOverride(cfg.checklist.includedText, data.included);
  const excludedItems = ighSplitOverride(cfg.checklist.excludedText, data.excluded);
  ighMaskChecklistDividers(page, cfg.checklist.leftXPx,  ROW_BASELINES);
  ighMaskChecklistDividers(page, cfg.checklist.rightXPx, ROW_BASELINES);
  const bulletSymbol = (cfg.checklist.listBullet ?? '•').trim();
  ighDrawList(page, includedItems, firstBaselinePxResolved, cfg.checklist.rowSpacingPx, MAX_LIST_ROWS, cfg.checklist.leftXPx,  listFont, cfg.checklist.size, cfg.checklist.sudahTermasukAlign ?? 'center', bulletSymbol);
  ighDrawList(page, excludedItems, firstBaselinePxResolved, cfg.checklist.rowSpacingPx, MAX_LIST_ROWS, cfg.checklist.rightXPx, listFont, cfg.checklist.size, cfg.checklist.belumTermasukAlign ?? 'center', bulletSymbol);

  // 6. Footer (WhatsApp)
  if (cfg.footer.showWhatsapp && adminSettings?.adminWhatsapp) {
    const digits = ighWhatsappDigits(adminSettings.adminWhatsapp);
    if (digits.length >= 8) {
      const waYPx = cfg.whatsappPosition?.yPx ?? cfg.footer.topPx;
      const waXPx = cfg.whatsappPosition?.xPx ?? cfg.footer.waXPx;
      ighDrawWhatsappFooter(page, pdf, {
        topPx: waYPx, leftXPx: waXPx,
        iconSizePt: cfg.footer.waIconSizePt, textSizePt: cfg.footer.size,
        font: fontFor('footer', 'semiBold'),
        displayNumber: ighFormatWhatsappDisplay(adminSettings.adminWhatsapp),
      });
    }
  }

  return pdf.save();
}

// ── Main router ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const type = req.query.type;

  try {
    if (type === 'invoice') {
      const data = req.body;
      if (!data || !data.order) return res.status(400).json({ error: 'Missing order data' });
      const pdfBytes = await generateInvoicePdf(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="invoice.pdf"');
      return res.status(200).send(Buffer.from(pdfBytes));
    }

    if (type === 'igh') {
      const { data, layout, adminSettings, baseUrl: bodyBaseUrl } = req.body ?? {};
      if (!data) return res.status(400).json({ error: 'Missing data' });
      const proto   = req.headers['x-forwarded-proto'] ?? 'https';
      const host    = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
      const baseUrl = bodyBaseUrl || (host ? `${proto}://${host}` : '');
      if (!baseUrl) return res.status(400).json({ error: 'Cannot resolve base URL for assets' });
      const pdfBytes = await buildIghPdf(data, layout, adminSettings, baseUrl);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="temantiket-penawaran.pdf"');
      return res.status(200).send(Buffer.from(pdfBytes));
    }

    return res.status(404).json({ error: `Unknown export type: ${type}` });
  } catch (e) {
    console.error(`[api/export/${type}]`, e);
    return res.status(500).json({ error: e.message });
  }
}
