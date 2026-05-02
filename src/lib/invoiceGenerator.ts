/**
 * Temantiket Invoice Generator — Fase 27
 * Generates professional A4 PDF invoices using pdf-lib.
 * Supports built-in branded template OR custom uploaded image template.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type { Order } from "@/features/orders/ordersRepo";
import type { Client } from "@/store/clientsStore";

// ─── A4 dimensions (points: 1pt = 1/72 inch) ────────────────────────────────
const W = 595.28;
const H = 841.89;

// ─── Brand colours ────────────────────────────────────────────────────────────
const SKY   = rgb(0.031, 0.545, 0.757);  // #088BC1
const DARK  = rgb(0.055, 0.086, 0.165);  // #0E1629
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.45, 0.47, 0.52);
const LIGHT = rgb(0.96, 0.97, 0.99);
const BORDER = rgb(0.87, 0.89, 0.93);
const RED   = rgb(0.95, 0.3, 0.25);

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
  /** Custom template image as data URL (optional). */
  templateDataUrl?: string | null;
}

// ─── Helper: clamp y so text never goes below page ───────────────────────────
function drawRect(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number, y: number, w: number, h: number,
  fill: ReturnType<typeof rgb>, opacity = 1,
) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, opacity });
}

function txt(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number, y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = DARK,
  maxWidth?: number,
) {
  let t = text;
  if (maxWidth) {
    while (t.length > 4 && font.widthOfTextAtSize(t, size) > maxWidth) {
      t = t.slice(0, -4) + "…";
    }
  }
  page.drawText(t, { x, y, size, font, color });
}

function txtRight(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  rightX: number, y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = DARK,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function txtCenter(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  cx: number, y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = DARK,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color });
}

function line(
  page: ReturnType<PDFDocument["addPage"]>,
  x1: number, y1: number, x2: number, y2: number,
  color = BORDER,
) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color });
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([W, H]);

  const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── Custom template image background ────────────────────────────────────────
  if (data.templateDataUrl) {
    try {
      const base64 = data.templateDataUrl.split(",")[1];
      const imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const isJpeg = data.templateDataUrl.startsWith("data:image/jpeg") ||
                     data.templateDataUrl.startsWith("data:image/jpg");
      const img = isJpeg
        ? await pdfDoc.embedJpg(imageBytes)
        : await pdfDoc.embedPng(imageBytes);
      page.drawImage(img, { x: 0, y: 0, width: W, height: H });

      // Overlay data at fixed positions for custom templates
      await overlayOnTemplate(page, data, bold, regular, oblique);

      // Watermark
      drawWatermark(page, oblique);
      return await pdfDoc.save();
    } catch {
      // fall through to built-in template
    }
  }

  // ── Built-in professional template ──────────────────────────────────────────
  await drawBuiltinTemplate(page, pdfDoc, data, bold, regular, oblique);
  drawWatermark(page, oblique);

  return await pdfDoc.save();
}

// ─── Built-in branded template ───────────────────────────────────────────────
async function drawBuiltinTemplate(
  page: ReturnType<PDFDocument["addPage"]>,
  _pdfDoc: PDFDocument,
  data: InvoiceData,
  bold: PDFFont,
  regular: PDFFont,
  oblique: PDFFont,
) {
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;

  // ── HEADER ──────────────────────────────────────────────────────────────────
  // Gradient simulation: two rects (dark then sky strip)
  drawRect(page, 0, H - 105, W, 105, DARK);
  drawRect(page, 0, H - 108, W, 3, SKY);

  // Diagonal accent
  page.drawLine({
    start: { x: W - 140, y: H },
    end: { x: W - 40, y: H - 105 },
    thickness: 35,
    color: rgb(1, 1, 1, 0.05),
    opacity: 0.05,
  });

  // Logo
  txt(page, "temantiket", 40, H - 45, 22, bold, WHITE);
  txt(page, "mudah, cepat, amanah", 40, H - 63, 8, regular, rgb(0.6, 0.75, 0.85));

  // Sky vertical bar before invoice label
  drawRect(page, 38, H - 90, 3, 20, SKY);
  txt(page, "INVOICE", 48, H - 90, 9, bold, SKY);

  // Invoice number & date (right side)
  txtRight(page, invoiceNumber, W - 40, H - 42, 13, bold, WHITE);
  txtRight(page, `Tanggal: ${invoiceDate}`, W - 40, H - 58, 9, regular, rgb(0.7, 0.8, 0.9));
  const statusLabel = order.status.toUpperCase();
  const statusColor = order.status === "Confirmed" ? rgb(0.2, 0.75, 0.45)
    : order.status === "Cancelled" ? RED
    : rgb(0.95, 0.7, 0.1);
  const sBadgeW = bold.widthOfTextAtSize(statusLabel, 8) + 16;
  drawRect(page, W - 40 - sBadgeW, H - 82, sBadgeW, 16, statusColor, 0.2);
  txtRight(page, statusLabel, W - 40 - (sBadgeW / 2) + (bold.widthOfTextAtSize(statusLabel, 8) / 2) + (sBadgeW / 2), H - 78, 8, bold, statusColor);

  // ── CLIENT SECTION ──────────────────────────────────────────────────────────
  const clientY = H - 155;
  txt(page, "INVOICE UNTUK:", 40, clientY, 7.5, regular, MUTED);
  txt(page, client?.name ?? "Klien tidak diketahui", 40, clientY - 17, 15, bold, DARK);
  if (client?.phone) txt(page, `📞 ${client.phone}`, 40, clientY - 33, 9, regular, MUTED);

  // Right: order meta
  const rightCol = W - 40;
  txtRight(page, "No. Order:", rightCol, clientY, 8, regular, MUTED);
  txtRight(page, order.id.slice(0, 12) + "…", rightCol, clientY - 14, 8, bold, DARK);
  txtRight(page, "Tipe:", rightCol, clientY - 28, 8, regular, MUTED);
  txtRight(page, orderTypeLabel(order.type), rightCol, clientY - 42, 8, bold, DARK);

  // Divider
  line(page, 40, clientY - 55, W - 40, clientY - 55);

  // ── DETAILS SECTION ─────────────────────────────────────────────────────────
  let rowY = clientY - 75;

  // Section title
  drawRect(page, 40, rowY - 2, W - 80, 22, DARK);
  txt(page, "DETAIL PEMESANAN", 52, rowY + 4, 8, bold, WHITE);
  txtRight(page, "INFORMASI", W - 52, rowY + 4, 8, bold, WHITE);
  rowY -= 2;

  const rows: [string, string][] = buildDetailRows(order, meta);

  rows.forEach(([label, value], i) => {
    const ry = rowY - (i * 22);
    if (i % 2 === 1) drawRect(page, 40, ry - 16, W - 80, 22, LIGHT);
    txt(page, label, 52, ry, 8.5, regular, MUTED);
    txt(page, value, W / 2, ry, 8.5, bold, DARK, W / 2 - 60);
  });

  rowY -= rows.length * 22 + 8;

  // Divider
  line(page, 40, rowY, W - 40, rowY);
  rowY -= 30;

  // ── PRICING ─────────────────────────────────────────────────────────────────
  const totalFormatted = order.currency === "EGP"
    ? fmtEGP(Number(order.totalPrice))
    : fmtIDR(Number(order.totalPrice));

  // Total box
  const boxH = 56;
  drawRect(page, 40, rowY - boxH, W - 80, boxH, DARK);
  // Sky accent bar
  drawRect(page, 40, rowY - boxH, 5, boxH, SKY);
  txt(page, "TOTAL PEMBAYARAN", 56, rowY - 18, 8, regular, rgb(0.6, 0.72, 0.82));
  txt(page, totalFormatted, 56, rowY - 38, 18, bold, WHITE);
  txtRight(page, `Mata Uang: ${order.currency}`, W - 52, rowY - 22, 8, regular, rgb(0.5, 0.65, 0.75));
  txtRight(page, `Metode: Transfer Bank / Tunai`, W - 52, rowY - 36, 8, regular, rgb(0.5, 0.65, 0.75));

  rowY -= boxH + 20;

  // ── NOTES ───────────────────────────────────────────────────────────────────
  if (order.notes) {
    txt(page, "Catatan:", 40, rowY, 8, regular, MUTED);
    txt(page, order.notes, 40, rowY - 14, 8, oblique, DARK, W - 80);
    rowY -= 38;
  }

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  const footerY = 70;
  line(page, 40, footerY + 30, W - 40, footerY + 30);
  txtCenter(page, data.agencyName ?? "Temantiket", W / 2, footerY + 16, 9, bold, MUTED);
  txtCenter(page, data.agencyPhone ?? "+62 813-1150-6025  ·  @temantiket", W / 2, footerY + 3, 8, regular, MUTED);
  txtCenter(page, "Terima kasih atas kepercayaan Anda!", W / 2, footerY - 12, 8, oblique, MUTED);
}

// ─── Custom template overlay ──────────────────────────────────────────────────
async function overlayOnTemplate(
  page: ReturnType<PDFDocument["addPage"]>,
  data: InvoiceData,
  bold: PDFFont,
  regular: PDFFont,
  oblique: PDFFont,
) {
  const { order, client, invoiceNumber, invoiceDate } = data;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;

  // Semi-transparent white panel for readability
  drawRect(page, 30, 160, W - 60, H - 240, WHITE, 0.88);

  // Invoice number & date top-right
  txtRight(page, invoiceNumber, W - 40, H - 50, 13, bold, DARK);
  txtRight(page, invoiceDate, W - 40, H - 67, 9, regular, MUTED);

  let y = H - 115;

  txt(page, "KEPADA:", 50, y, 8, regular, MUTED);
  txt(page, client?.name ?? "—", 50, y - 16, 14, bold, DARK);
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

  const totalFormatted = order.currency === "EGP"
    ? fmtEGP(Number(order.totalPrice))
    : fmtIDR(Number(order.totalPrice));

  txt(page, "TOTAL:", 50, y, 10, bold, DARK);
  txtRight(page, totalFormatted, W - 50, y, 14, bold, SKY);

  if (order.notes) {
    y -= 36;
    txt(page, `Catatan: ${order.notes}`, 50, y, 8, oblique, MUTED, W - 100);
  }

  oblique;
}

// ─── Watermark ────────────────────────────────────────────────────────────────
function drawWatermark(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
) {
  const text = "by Temantiket";
  const size = 9;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: W / 2 - w / 2,
    y: 28,
    size,
    font,
    color: rgb(0.7, 0.72, 0.76),
    opacity: 0.6,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function orderTypeLabel(type: string): string {
  const m: Record<string, string> = {
    flight: "Tiket Pesawat",
    umrah: "Umrah & Haji",
    visa_voa: "Visa VOA",
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
    if (meta.airline)     rows.push(["Maskapai", `${meta.airline}${meta.flightNumber ? ` · ${meta.flightNumber}` : ""}`]);
    if (meta.departDate)  rows.push(["Tanggal Berangkat", String(meta.departDate)]);
    if (meta.departTime)  rows.push(["Waktu Berangkat", String(meta.departTime)]);
    if (meta.arriveTime)  rows.push(["Waktu Tiba", String(meta.arriveTime)]);
    if (meta.passengerName) rows.push(["Nama Penumpang", String(meta.passengerName)]);
    if (meta.pnr)         rows.push(["Kode PNR", String(meta.pnr)]);
  } else if (order.type === "umrah") {
    if (meta.projectName) rows.push(["Paket Umrah", String(meta.projectName)]);
    if (meta.timeline)    rows.push(["Jadwal", String(meta.timeline)]);
    if (meta.pax)         rows.push(["Jumlah Pax", `${meta.pax} orang`]);
    if (meta.hotelMakkah) rows.push(["Hotel Makkah", String(meta.hotelMakkah)]);
    if (meta.hotelMadinah) rows.push(["Hotel Madinah", String(meta.hotelMadinah)]);
  } else if (order.type === "visa_voa" || order.type === "visa_student") {
    if (meta.passengerName) rows.push(["Nama", String(meta.passengerName)]);
    if (meta.passportNumber) rows.push(["No. Paspor", String(meta.passportNumber)]);
    if (meta.destination)   rows.push(["Tujuan", String(meta.destination)]);
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
