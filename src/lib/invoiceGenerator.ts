/**
 * Temantiket Invoice Generator — Presisi Blue Edition
 * Generates premium A4 PDF invoices using pdf-lib + SK Modernist font.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Order } from "@/features/orders/ordersRepo";
import type { Client } from "@/store/clientsStore";

// ─── A4 dimensions (points: 1pt = 1/72 inch) ────────────────────────────────
const W = 595.28;
const H = 841.89;

// ─── Brand colour palette ────────────────────────────────────────────────────
const DARK        = rgb(0.055, 0.086, 0.165);  // #0E1629 deep navy
const SKY         = rgb(0.031, 0.545, 0.757);  // #0B8BC1 sky blue
const WHITE       = rgb(1, 1, 1);
const MUTED       = rgb(0.41, 0.45, 0.52);     // body text muted
const ROW_ALT     = rgb(0.952, 0.967, 0.990);  // alternating row tint
const BLUE_LINE   = rgb(0.76, 0.86, 0.94);     // separator line
const LOGO_SUB    = rgb(0.50, 0.69, 0.82);     // header tagline
const HEADER_SUB  = rgb(0.62, 0.77, 0.88);     // date in header
const TOTAL_LABEL = rgb(0.54, 0.70, 0.82);     // "TOTAL PEMBAYARAN" label
const TOTAL_META  = rgb(0.47, 0.62, 0.73);     // meta in total box
const RED         = rgb(0.91, 0.26, 0.21);
const CONFIRMED   = rgb(0.16, 0.74, 0.43);
const PENDING     = rgb(0.93, 0.67, 0.13);

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
const fmtEGP = (v: number) =>
  new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 }).format(v);

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  order: Order;
  client: Client | null;
  agencyName?: string;
  agencyPhone?: string;
  agencyInstagram?: string;
  templateDataUrl?: string | null;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawRect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  fill: ReturnType<typeof rgb>, opacity = 1,
) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, opacity });
}

function txt(
  page: PDFPage,
  text: string,
  x: number, y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = DARK,
  maxWidth?: number,
) {
  let t = String(text ?? "");
  if (maxWidth) {
    while (t.length > 4 && font.widthOfTextAtSize(t, size) > maxWidth) {
      t = t.slice(0, -4) + "…";
    }
  }
  page.drawText(t, { x, y, size, font, color });
}

function txtRight(
  page: PDFPage,
  text: string,
  rightX: number, y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = DARK,
) {
  const w = font.widthOfTextAtSize(String(text), size);
  page.drawText(String(text), { x: rightX - w, y, size, font, color });
}

function txtCenter(
  page: PDFPage,
  text: string,
  cx: number, y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = DARK,
) {
  const w = font.widthOfTextAtSize(String(text), size);
  page.drawText(String(text), { x: cx - w / 2, y, size, font, color });
}

function sepLine(page: PDFPage, x1: number, y: number, x2: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: BLUE_LINE });
}

// ─── Temantiket plane icon (white) ───────────────────────────────────────────
// Drawn using simple polygon paths matching the SVG brand mark.
// ix, iy = top-left position in PDF coords; scale in pt/SVG-unit.
function drawTemantiketIcon(page: PDFPage, ix: number, iy: number, scale: number) {
  const c = WHITE;
  const opts = (d: string) => ({ x: ix, y: iy, scale, color: c, borderWidth: 0 } as const);
  // Fuselage (body) — thin vertical rectangle approximating the ellipse
  page.drawSvgPath("M26 9 L34 9 L34 53 L26 53 Z", opts("body"));
  // Left wing
  page.drawSvgPath("M25 26 L3 39 L6 45 L25 34 Z", opts("lw"));
  // Right wing
  page.drawSvgPath("M35 26 L57 39 L54 45 L35 34 Z", opts("rw"));
  // Left tail fin
  page.drawSvgPath("M27 47 L16 57 L19 57 L27 51 Z", opts("lt"));
  // Right tail fin
  page.drawSvgPath("M33 47 L44 57 L41 57 L33 51 Z", opts("rt"));
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Load SK Modernist fonts (fall back to Helvetica if unavailable)
  let bold: PDFFont;
  let regular: PDFFont;
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  try {
    const [boldBytes, regBytes] = await Promise.all([
      fetch("/fonts/Sk-Modernist-Bold.otf").then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
      fetch("/fonts/Sk-Modernist-Regular.otf").then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
    ]);
    bold    = await pdfDoc.embedFont(boldBytes);
    regular = await pdfDoc.embedFont(regBytes);
  } catch {
    bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const page = pdfDoc.addPage([W, H]);

  // ── Custom template image background ────────────────────────────────────────
  if (data.templateDataUrl) {
    try {
      const base64 = data.templateDataUrl.split(",")[1];
      const imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const isJpeg = data.templateDataUrl.startsWith("data:image/jpeg") ||
                     data.templateDataUrl.startsWith("data:image/jpg");
      const img = isJpeg ? await pdfDoc.embedJpg(imageBytes) : await pdfDoc.embedPng(imageBytes);
      page.drawImage(img, { x: 0, y: 0, width: W, height: H });
      await overlayOnTemplate(page, data, bold, regular, oblique);
      drawWatermark(page, regular);
      return await pdfDoc.save();
    } catch {
      // fall through to built-in template
    }
  }

  // ── Built-in premium template ────────────────────────────────────────────────
  drawBuiltinTemplate(page, data, bold, regular, oblique);
  drawWatermark(page, regular);
  return await pdfDoc.save();
}

// ─── Built-in "Presisi Blue" template ────────────────────────────────────────
function drawBuiltinTemplate(
  page: PDFPage,
  data: InvoiceData,
  bold: PDFFont,
  regular: PDFFont,
  oblique: PDFFont,
) {
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const HEADER_H = 128;
  drawRect(page, 0, H - HEADER_H, W, HEADER_H, DARK);
  // Bottom sky accent bar
  drawRect(page, 0, H - HEADER_H, W, 3, SKY);
  // Right-side subtle glow
  drawRect(page, W - 210, H - HEADER_H, 210, HEADER_H, SKY, 0.065);
  // Diagonal swoosh (top-right, semi-transparent)
  page.drawLine({
    start: { x: W - 170, y: H },
    end:   { x: W - 28,  y: H - HEADER_H },
    thickness: 52,
    color: WHITE,
    opacity: 0.032,
  });
  page.drawLine({
    start: { x: W - 220, y: H },
    end:   { x: W - 80,  y: H - HEADER_H },
    thickness: 28,
    color: WHITE,
    opacity: 0.022,
  });

  // Logo icon (white plane)
  drawTemantiketIcon(page, 38, H - 44, 0.48);

  // Brand name
  txt(page, "temantiket", 73, H - 50, 22, bold, WHITE);
  txt(page, "mudah, cepat, amanah", 73, H - 68, 7.5, regular, LOGO_SUB);

  // "INVOICE" label with left accent bar
  drawRect(page, 37, H - 99, 3, 22, SKY);
  txt(page, "INVOICE", 46, H - 93, 8.5, bold, SKY);

  // Invoice number & date (right)
  txtRight(page, invoiceNumber, W - 40, H - 44, 13, bold, WHITE);
  txtRight(page, `Tanggal: ${invoiceDate}`, W - 40, H - 61, 8.5, regular, HEADER_SUB);

  // Status badge
  const statusLabel = order.status.toUpperCase();
  const statusColor = order.status === "Confirmed" ? CONFIRMED
    : order.status === "Cancelled" ? RED
    : PENDING;
  const sBadgeW = bold.widthOfTextAtSize(statusLabel, 7.5) + 20;
  const sBadgeX = W - 40 - sBadgeW;
  drawRect(page, sBadgeX, H - 98, sBadgeW, 17, statusColor, 0.22);
  const sTxtX = sBadgeX + (sBadgeW - bold.widthOfTextAtSize(statusLabel, 7.5)) / 2;
  txt(page, statusLabel, sTxtX, H - 93, 7.5, bold, statusColor);

  // ── CLIENT SECTION ──────────────────────────────────────────────────────────
  const clientY = H - 150;
  txt(page, "INVOICE UNTUK:", 40, clientY, 7.5, regular, MUTED);
  txt(page, client?.name ?? "Klien tidak diketahui", 40, clientY - 18, 15, bold, DARK);
  if (client?.phone) txt(page, client.phone, 40, clientY - 36, 9, regular, MUTED);

  // Right column: order meta
  const rightCol = W - 40;
  txtRight(page, "No. Order:", rightCol, clientY, 8, regular, MUTED);
  txtRight(page, order.id.slice(0, 13) + "…", rightCol, clientY - 15, 8, bold, DARK);
  txtRight(page, "Tipe:", rightCol, clientY - 30, 8, regular, MUTED);
  txtRight(page, orderTypeLabel(order.type), rightCol, clientY - 45, 8, bold, DARK);

  // Section separator
  sepLine(page, 40, clientY - 57, W - 40);

  // ── DETAIL TABLE ─────────────────────────────────────────────────────────────
  let rowY = clientY - 77;

  // Table header bar
  drawRect(page, 40, rowY - 20, W - 80, 22, DARK);
  drawRect(page, 40, rowY - 20, 4,      22, SKY);   // left sky accent
  txt(page, "DETAIL PEMESANAN", 55, rowY - 13, 8, bold, WHITE);
  txtRight(page, "INFORMASI", W - 55, rowY - 13, 8, bold, WHITE);
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

  // ── TOTAL PAYMENT BOX ────────────────────────────────────────────────────────
  const totalFormatted = order.currency === "EGP"
    ? fmtEGP(Number(order.totalPrice))
    : fmtIDR(Number(order.totalPrice));

  const boxH = 60;
  drawRect(page, 40, rowY - boxH, W - 80, boxH, DARK);
  drawRect(page, 40, rowY - boxH, 5, boxH, SKY);                            // left accent
  drawRect(page, 40, rowY - 2,   W - 80, 2,   SKY);                        // top accent

  txt(page, "TOTAL PEMBAYARAN", 57, rowY - 18, 8, regular, TOTAL_LABEL);
  txt(page, totalFormatted,     57, rowY - 40, 20, bold,    WHITE);
  txtRight(page, `Mata Uang: ${order.currency}`,     W - 55, rowY - 22, 7.5, regular, TOTAL_META);
  txtRight(page, "Metode: Transfer Bank / Tunai",    W - 55, rowY - 36, 7.5, regular, TOTAL_META);

  rowY -= boxH + 22;

  // ── NOTES ────────────────────────────────────────────────────────────────────
  if (order.notes) {
    txt(page, "Catatan:", 40, rowY, 8, regular, MUTED);
    txt(page, order.notes, 40, rowY - 14, 8, oblique, DARK, W - 80);
    rowY -= 40;
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  const footerY = 72;
  sepLine(page, 40, footerY + 32, W - 40);
  txtCenter(page, data.agencyName ?? "Temantiket",                     W / 2, footerY + 18, 9, bold,    MUTED);
  txtCenter(page, data.agencyPhone ?? "+62 813-1150-6025",             W / 2, footerY +  4, 8, regular, MUTED);
  txtCenter(page, "Terima kasih atas kepercayaan Anda!",               W / 2, footerY - 10, 8, oblique, MUTED);
}

// ─── Custom template overlay ──────────────────────────────────────────────────
async function overlayOnTemplate(
  page: PDFPage,
  data: InvoiceData,
  bold: PDFFont,
  regular: PDFFont,
  oblique: PDFFont,
) {
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;

  drawRect(page, 30, 160, W - 60, H - 240, WHITE, 0.88);

  txtRight(page, invoiceNumber, W - 40, H - 50, 13, bold, DARK);
  txtRight(page, invoiceDate,   W - 40, H - 67,  9, regular, MUTED);

  let y = H - 115;
  txt(page, "KEPADA:", 50, y, 8, regular, MUTED);
  txt(page, client?.name ?? "—", 50, y - 16, 14, bold, DARK);
  y -= 50;

  sepLine(page, 40, y, W - 40);
  y -= 24;

  const rows = buildDetailRows(order, meta);
  rows.forEach(([label, value], i) => {
    const ry = y - i * 21;
    txt(page, label, 50, ry, 8.5, regular, MUTED);
    txt(page, value, 240, ry, 8.5, bold, DARK, W - 290);
  });
  y -= rows.length * 21 + 20;
  sepLine(page, 40, y, W - 40);
  y -= 28;

  const totalFormatted = order.currency === "EGP"
    ? fmtEGP(Number(order.totalPrice))
    : fmtIDR(Number(order.totalPrice));
  txt(page, "TOTAL:", 50, y, 10, bold, DARK);
  txtRight(page, totalFormatted, W - 50, y, 14, bold, SKY);

  if (order.notes) {
    y -= 36;
    txt(page, `Catatan: ${order.notes}`, 50, y, 8, oblique, MUTED, W - 100);
  }
  void oblique;
}

// ─── Watermark ────────────────────────────────────────────────────────────────
function drawWatermark(page: PDFPage, font: PDFFont) {
  const text = "by Temantiket";
  const size = 8;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: W / 2 - w / 2, y: 26,
    size, font,
    color: rgb(0.68, 0.71, 0.76),
    opacity: 0.55,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function orderTypeLabel(type: string): string {
  const m: Record<string, string> = {
    flight:       "Tiket Pesawat",
    umrah:        "Umrah & Haji",
    visa_voa:     "Visa VOA",
    visa_student: "Visa Pelajar",
  };
  return m[type] ?? type;
}

function buildDetailRows(order: Order, meta: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = [];

  if (order.type === "flight") {
    const from = `${meta.fromCity ?? meta.fromCode ?? "—"} (${meta.fromCode ?? "—"})`;
    const to   = `${meta.toCity   ?? meta.toCode   ?? "—"} (${meta.toCode   ?? "—"})`;
    if (meta.fromCode || meta.toCode) rows.push(["Rute Penerbangan", `${from} → ${to}`]);
    if (meta.airline)      rows.push(["Maskapai", `${meta.airline}${meta.flightNumber ? ` · ${meta.flightNumber}` : ""}`]);
    if (meta.departDate)   rows.push(["Tanggal Berangkat", String(meta.departDate)]);
    if (meta.departTime)   rows.push(["Waktu Berangkat",   String(meta.departTime)]);
    if (meta.arriveTime)   rows.push(["Waktu Tiba",        String(meta.arriveTime)]);
    if (meta.passengerName) rows.push(["Nama Penumpang",   String(meta.passengerName)]);
    if (meta.pnr)          rows.push(["Kode PNR",          String(meta.pnr)]);
  } else if (order.type === "umrah") {
    if (meta.projectName)  rows.push(["Paket Umrah",   String(meta.projectName)]);
    if (meta.timeline)     rows.push(["Jadwal",         String(meta.timeline)]);
    if (meta.pax)          rows.push(["Jumlah Pax",     `${meta.pax} orang`]);
    if (meta.hotelMakkah)  rows.push(["Hotel Makkah",   String(meta.hotelMakkah)]);
    if (meta.hotelMadinah) rows.push(["Hotel Madinah",  String(meta.hotelMadinah)]);
  } else if (order.type === "visa_voa" || order.type === "visa_student") {
    if (meta.passengerName)  rows.push(["Nama",       String(meta.passengerName)]);
    if (meta.passportNumber) rows.push(["No. Paspor", String(meta.passportNumber)]);
    if (meta.destination)    rows.push(["Tujuan",     String(meta.destination)]);
  }

  if (order.title) rows.push(["Keterangan Order", order.title]);
  rows.push(["Status", order.status]);
  return rows;
}

// ─── Invoice number generator ─────────────────────────────────────────────────
const COUNTER_KEY = "temantiket.invoice.counter.v1";

export function nextInvoiceNumber(): string {
  const raw = localStorage.getItem(COUNTER_KEY);
  const counter = raw ? parseInt(raw, 10) + 1 : 1;
  localStorage.setItem(COUNTER_KEY, String(counter));
  const now = new Date();
  const yyyymmdd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `INV-${yyyymmdd}-${String(counter).padStart(4, "0")}`;
}

export function peekNextInvoiceNumber(): string {
  const raw = localStorage.getItem(COUNTER_KEY);
  const counter = raw ? parseInt(raw, 10) + 1 : 1;
  const now = new Date();
  const yyyymmdd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `INV-${yyyymmdd}-${String(counter).padStart(4, "0")}`;
}

export function todayString(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });
}
