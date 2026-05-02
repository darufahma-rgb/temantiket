import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Copy, Check, Download, MessageCircle, ChevronDown, ChevronUp,
  Plane, RefreshCw, Pencil, Info, Wand2, Share2, ImagePlus, X, History, Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useRatesStore } from "@/store/ratesStore";
import {
  extractItinerary, extractItineraryFromImage, buildWhatsAppText, buildSmartTips,
  calcTransitMinutes, fmtMinutes,
  type ItineraryData, type FlightLeg,
} from "@/lib/itineraryAI";

// ── Itinerary History (localStorage) ──────────────────────────────────────

const ITINERARY_HISTORY_KEY = "temantiket.itinerary.history.v1";
const HISTORY_MAX = 20;

interface SavedItinerary {
  id: string;
  label: string;
  savedAt: number;
  data: ItineraryData;
}

function buildLabel(data: ItineraryData): string {
  if (data.legs.length === 0) return "Itinerary tanpa leg";
  const first = data.legs[0];
  const last  = data.legs[data.legs.length - 1];
  const route = [first.fromCode, last.toCode].filter(Boolean).join(" → ");
  const airline = first.airline?.split(" ")[0] ?? "";
  const fn = first.flightNumber ?? "";
  const parts = [route, [airline, fn].filter(Boolean).join(" ")].filter(Boolean);
  return parts.join(" — ") || "Itinerary";
}

function loadHistory(): SavedItinerary[] {
  try {
    return JSON.parse(localStorage.getItem(ITINERARY_HISTORY_KEY) ?? "[]") as SavedItinerary[];
  } catch { return []; }
}

function saveToHistory(data: ItineraryData) {
  try {
    const existing = loadHistory();
    const id = `itin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: SavedItinerary = { id, label: buildLabel(data), savedAt: Date.now(), data };
    const next = [entry, ...existing.filter((e) => e.label !== entry.label)].slice(0, HISTORY_MAX);
    localStorage.setItem(ITINERARY_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}

function deleteFromHistory(id: string): SavedItinerary[] {
  try {
    const next = loadHistory().filter((e) => e.id !== id);
    localStorage.setItem(ITINERARY_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}

function fmtRelTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  return `${days} hari lalu`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

const PLACEHOLDER = `Tempel kode Galileo, Amadeus, atau teks itinerary di sini...

━━ FORMAT 1: Galileo Booking Confirmation (setelah booking dikonfirmasi) ━━
RECORD LOCATOR: GF3X7K

1.1RAHMAN/AHMAD MR

 1 GF  70N 03JUN 3 CAIBAH HK1  1715 2015         E  1
 2 GF 284N 03JUN 3 BAHGOI HK1  2115 0340+1       E  1
 3 GF 285O 03SEP 4 GOIBAH HK1  0440 0610         E  1
 4 GF  79O 04SEP 5 BAHCAI HK1  0110 0430         E  1

━━ FORMAT 2: Galileo Display/Pricing (sebelum booking) ━━
MORE 1          TOTAL AMOUNT  29283.80 EGP
1  GF  70   N  03JUN  CAI  BAH  1715  2015  WE  32N
2  GF  284  N  03JUN  BAH  GOI  2115  0340# WE  32Q
3  GF  285  O  03SEP  GOI  BAH  0440  0610  TH  32N
4  GF  79   O  04SEP  BAH  CAI  0110  0430  FR  32N

━━ FORMAT 3: Galileo PNR lama / Amadeus ━━
1 QR 978 Y 15MAR 4 CGKDOH HK1 2355 0430 16MAR
2 QR 301 Y 16MAR 4 DOHCAI HK1 0700 0910

Atau paste teks dari email / halaman Trip.com / booking confirmation.
(+1 atau # setelah jam tiba = tiba hari berikutnya)`;

// ── Canvas helpers ─────────────────────────────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Travel Card (1080×1350) ────────────────────────────────────────────────

async function renderTravelCard(canvas: HTMLCanvasElement, data: ItineraryData, egpRate: number): Promise<void> {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#040D1C");
  bg.addColorStop(0.45, "#071626");
  bg.addColorStop(1, "#040D1C");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial accent — top-right
  const glowTR = ctx.createRadialGradient(W, 0, 0, W, 0, 520);
  glowTR.addColorStop(0, "rgba(14,165,233,0.22)");
  glowTR.addColorStop(0.5, "rgba(14,165,233,0.06)");
  glowTR.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowTR;
  ctx.fillRect(0, 0, W, H);

  // Bottom-left soft glow
  const glowBL = ctx.createRadialGradient(0, H, 0, 0, H, 400);
  glowBL.addColorStop(0, "rgba(56,189,248,0.10)");
  glowBL.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowBL;
  ctx.fillRect(0, 0, W, H);

  // Subtle horizontal lines texture
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── Header bar ──
  roundRect(ctx, 0, 0, W, 100, 0);
  ctx.fillStyle = "rgba(14,165,233,0.08)";
  ctx.fill();

  const logo = await loadImage("/temantiket-icon.svg");
  const logoH = 44;
  const logoW = logo ? logoH : 0;
  let cursorY = 28;
  if (logo) {
    ctx.drawImage(logo, 48, cursorY, logoW, logoH);
  } else {
    ctx.font = "bold 28px Georgia, serif";
    ctx.fillStyle = "#38BDF8";
    ctx.fillText("temantiket", 48, cursorY + 32);
  }

  // "ITINERARY PENERBANGAN" badge — top right
  const badge = "ITINERARY PENERBANGAN";
  ctx.font = "600 13px system-ui, sans-serif";
  const badgeTextW = ctx.measureText(badge).width;
  const badgeW = badgeTextW + 28;
  const badgeH = 34;
  const badgeX = W - badgeW - 48;
  const badgeY = cursorY + 5;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fillStyle = "rgba(14,165,233,0.20)";
  ctx.fill();
  ctx.strokeStyle = "rgba(14,165,233,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#7DD3FC";
  ctx.fillText(badge, badgeX + 14, badgeY + 22);

  cursorY = 116;

  // ── Passenger / PNR ──
  if (data.pnr || data.passengerName) {
    const parts = [data.passengerName, data.pnr ? `PNR: ${data.pnr}` : ""].filter(Boolean);
    ctx.font = "400 20px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.60)";
    ctx.textAlign = "center";
    ctx.fillText(parts.join("   ·   "), W / 2, cursorY);
    ctx.textAlign = "left";
    cursorY += 32;
  }

  // Divider
  ctx.strokeStyle = "rgba(14,165,233,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(48, cursorY); ctx.lineTo(W - 48, cursorY); ctx.stroke();
  cursorY += 32;

  // ── Flight legs ──
  const legCardH = data.legs.length === 1 ? 270 : data.legs.length === 2 ? 224 : 196;

  for (let i = 0; i < data.legs.length; i++) {
    const leg = data.legs[i];

    // Card background
    roundRect(ctx, 44, cursorY, W - 88, legCardH, 18);
    const cardBg = ctx.createLinearGradient(44, cursorY, W - 44, cursorY + legCardH);
    cardBg.addColorStop(0, "rgba(14,165,233,0.11)");
    cardBg.addColorStop(1, "rgba(14,165,233,0.04)");
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = "rgba(14,165,233,0.28)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Leg label + flight number
    const legLabelParts: string[] = [];
    if (data.legs.length > 1) legLabelParts.push(`PENERBANGAN ${i + 1}`);
    if (leg.flightNumber) legLabelParts.push(leg.flightNumber);
    if (leg.airline) legLabelParts.push(leg.airline);
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = "#7DD3FC";
    ctx.textAlign = "left";
    ctx.fillText(legLabelParts.join("  ·  "), 70, cursorY + 30);

    // FROM / TO big codes
    const bigFontSize = data.legs.length <= 1 ? 86 : data.legs.length === 2 ? 72 : 60;
    const codeY = cursorY + legCardH * 0.55;

    // FROM
    ctx.font = `700 ${bigFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(leg.fromCode ?? "???", 70, codeY);

    // TO
    ctx.textAlign = "right";
    ctx.fillText(leg.toCode ?? "???", W - 70, codeY);
    ctx.textAlign = "left";

    // Center plane
    ctx.font = `${Math.round(bigFontSize * 0.42)}px system-ui, sans-serif`;
    ctx.fillStyle = "#0EA5E9";
    ctx.textAlign = "center";
    ctx.fillText("✈", W / 2, codeY - 8);

    // Dashed route line
    const fromW = (() => { ctx.save(); ctx.font = `700 ${bigFontSize}px system-ui, sans-serif`; const w = ctx.measureText(leg.fromCode ?? "???").width; ctx.restore(); return w; })();
    const toW = (() => { ctx.save(); ctx.font = `700 ${bigFontSize}px system-ui, sans-serif`; const w = ctx.measureText(leg.toCode ?? "???").width; ctx.restore(); return w; })();
    const lineY = codeY - Math.round(bigFontSize * 0.34);
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(14,165,233,0.40)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(70 + fromW + 14, lineY); ctx.lineTo(W / 2 - 28, lineY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 28, lineY); ctx.lineTo(W - 70 - toW - 14, lineY); ctx.stroke();
    ctx.setLineDash([]);

    // City names
    const cityFontSize = data.legs.length <= 1 ? 18 : 16;
    ctx.font = `400 ${cityFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(186,230,253,0.65)";
    ctx.textAlign = "left";
    if (leg.fromCity) ctx.fillText(leg.fromCity, 70, codeY + 26);
    ctx.textAlign = "right";
    if (leg.toCity) ctx.fillText(leg.toCity, W - 70, codeY + 26);

    // Times
    const timeFontSize = data.legs.length <= 1 ? 38 : 30;
    const timeY = cursorY + legCardH * 0.78;
    ctx.font = `700 ${timeFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = "#38BDF8";
    ctx.textAlign = "left";
    ctx.fillText(leg.departTime ?? "—", 70, timeY);
    ctx.textAlign = "right";
    ctx.fillText(leg.arriveTime ?? "—", W - 70, timeY);

    // Dates
    const dtY = timeY + (data.legs.length <= 1 ? 30 : 26);
    ctx.font = "400 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.50)";
    ctx.textAlign = "left";
    ctx.fillText(fmtDate(leg.departDate), 70, dtY);
    ctx.textAlign = "right";
    ctx.fillText(fmtDate(leg.arriveDate), W - 70, dtY);

    // Duration — center
    if (leg.duration) {
      ctx.font = "500 14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(125,211,252,0.75)";
      ctx.textAlign = "center";
      ctx.fillText(`${leg.duration}`, W / 2, dtY);
    }

    ctx.textAlign = "left";
    cursorY += legCardH + 14;

    // Transit bar
    if (i < data.legs.length - 1) {
      const next = data.legs[i + 1];
      const transitMin = calcTransitMinutes(leg, next);
      const city = leg.toCity ?? leg.toCode ?? "Transit";
      const transitLabel = transitMin !== null
        ? `Transit ${city}  ·  ${fmtMinutes(transitMin)}`
        : `Transit: ${city}`;

      roundRect(ctx, 88, cursorY, W - 176, 42, 8);
      ctx.fillStyle = "rgba(234,179,8,0.10)";
      ctx.fill();
      ctx.strokeStyle = "rgba(234,179,8,0.30)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "#FDE68A";
      ctx.textAlign = "center";
      ctx.fillText(transitLabel, W / 2, cursorY + 28);
      ctx.textAlign = "left";
      cursorY += 54;
    }
  }

  cursorY += 8;

  // ── Smart tips ──
  const tips = buildSmartTips(data.legs);
  if (tips.length > 0) {
    ctx.strokeStyle = "rgba(14,165,233,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, cursorY); ctx.lineTo(W - 48, cursorY); ctx.stroke();
    cursorY += 24;

    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "#7DD3FC";
    ctx.fillText("INFO PENTING", 48, cursorY);
    cursorY += 26;

    ctx.font = "400 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.65)";
    for (const tip of tips.slice(0, 3)) {
      ctx.fillText(`– ${tip}`, 56, cursorY);
      cursorY += 22;
    }
    cursorY += 8;
  }

  // ── Price ──
  if (data.totalPrice && data.totalPrice > 0) {
    const currency = data.priceCurrency ?? "IDR";
    let priceText = "";
    if (currency === "IDR") {
      priceText = fmtIDR(data.totalPrice);
      const egpAmt = egpRate > 0 ? Math.round(data.totalPrice / egpRate) : null;
      if (egpAmt) priceText += `  ≈  EGP ${egpAmt.toLocaleString("id-ID")}`;
    } else if (currency === "EGP") {
      priceText = `EGP ${data.totalPrice.toLocaleString("id-ID")}`;
      if (egpRate > 0) priceText += `  ≈  ${fmtIDR(Math.round(data.totalPrice * egpRate))}`;
    } else {
      priceText = `${currency} ${data.totalPrice.toLocaleString("id-ID")}`;
    }

    roundRect(ctx, 44, cursorY, W - 88, 50, 12);
    const priceBg = ctx.createLinearGradient(44, cursorY, W - 44, cursorY + 50);
    priceBg.addColorStop(0, "rgba(14,165,233,0.14)");
    priceBg.addColorStop(1, "rgba(14,165,233,0.05)");
    ctx.fillStyle = priceBg;
    ctx.fill();
    ctx.strokeStyle = "rgba(14,165,233,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillStyle = "#38BDF8";
    ctx.textAlign = "center";
    ctx.fillText(priceText, W / 2, cursorY + 32);
    ctx.textAlign = "left";
    cursorY += 62;
  }

  // ── Footer ──
  const footerY = Math.max(cursorY + 24, H - 66);

  // Footer separator
  ctx.strokeStyle = "rgba(14,165,233,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(48, footerY); ctx.lineTo(W - 48, footerY); ctx.stroke();

  // Small logo in footer
  if (logo) {
    const fLogoH = 26;
    const fLogoW = (logo.naturalWidth / logo.naturalHeight) * fLogoH;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(logo, 48, footerY + 16, fLogoW, fLogoH);
    ctx.globalAlpha = 1;
  }

  ctx.font = "400 14px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,211,252,0.40)";
  ctx.textAlign = "right";
  ctx.fillText("Generated by Temantiket — Cepat, Mudah, Amanah", W - 48, footerY + 32);
  ctx.textAlign = "left";
}

// ── Social Share Card (1080×1080) ──────────────────────────────────────────

async function renderSocialCard(canvas: HTMLCanvasElement, data: ItineraryData): Promise<void> {
  const S = 1080;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  // Background
  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#040D1C");
  bg.addColorStop(0.6, "#071626");
  bg.addColorStop(1, "#050E1E");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Diagonal accent
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = "#0EA5E9";
  ctx.beginPath();
  ctx.moveTo(S * 0.58, 0); ctx.lineTo(S, 0); ctx.lineTo(S * 0.42, S); ctx.lineTo(0, S);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Glow
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 460);
  glow.addColorStop(0, "rgba(14,165,233,0.13)");
  glow.addColorStop(1, "rgba(14,165,233,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  const logo = await loadImage("/temantiket-icon.svg");
  const logoH = 40;
  const logoW = logo ? logoH : 0;
  if (logo) ctx.drawImage(logo, 48, 40, logoW, logoH);

  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillStyle = "#7DD3FC";
  ctx.textAlign = "right";
  ctx.fillText("ITINERARY PENERBANGAN", S - 48, 64);
  ctx.textAlign = "left";

  const firstLeg = data.legs[0];
  const lastLeg = data.legs[data.legs.length - 1];
  const fromCode = firstLeg?.fromCode ?? "???";
  const toCode = lastLeg?.toCode ?? "???";
  const fromCity = firstLeg?.fromCity ?? "";
  const toCity = lastLeg?.toCity ?? "";

  const centerY = S * 0.44;
  ctx.font = "700 100px system-ui, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(fromCode, 56, centerY);
  ctx.textAlign = "right";
  ctx.fillText(toCode, S - 56, centerY);

  ctx.font = "42px system-ui, sans-serif";
  ctx.fillStyle = "#0EA5E9";
  ctx.textAlign = "center";
  ctx.fillText("✈", S / 2, centerY - 10);

  const fromW2 = (() => { ctx.save(); ctx.font = "700 100px system-ui, sans-serif"; const w = ctx.measureText(fromCode).width; ctx.restore(); return w; })();
  const toW2 = (() => { ctx.save(); ctx.font = "700 100px system-ui, sans-serif"; const w = ctx.measureText(toCode).width; ctx.restore(); return w; })();
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = "rgba(14,165,233,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(56 + fromW2 + 16, centerY - 34); ctx.lineTo(S / 2 - 36, centerY - 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(S / 2 + 36, centerY - 34); ctx.lineTo(S - 56 - toW2 - 16, centerY - 34); ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "400 22px system-ui, sans-serif";
  ctx.fillStyle = "rgba(186,230,253,0.70)";
  ctx.textAlign = "left";
  ctx.fillText(fromCity, 56, centerY + 32);
  ctx.textAlign = "right";
  ctx.fillText(toCity, S - 56, centerY + 32);

  if (data.legs.length > 1) {
    const allCodes = data.legs.map((l, i) => (i === 0 ? l.fromCode : l.toCode)).filter(Boolean) as string[];
    const midCodes = allCodes.slice(1, -1).join("  ·  ");
    if (midCodes) {
      ctx.font = "400 17px system-ui, sans-serif";
      ctx.fillStyle = "rgba(253,230,138,0.80)";
      ctx.textAlign = "center";
      ctx.fillText(`Transit: ${midCodes}`, S / 2, centerY + 72);
    }
  }

  const dateY = centerY + (data.legs.length > 1 ? 112 : 86);
  ctx.font = "500 19px system-ui, sans-serif";
  ctx.fillStyle = "#38BDF8";
  ctx.textAlign = "center";
  const dateStr = firstLeg?.departDate
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(firstLeg.departDate + "T00:00:00"))
    : "";
  const flightStr = [firstLeg?.airline, firstLeg?.flightNumber].filter(Boolean).join(" · ");
  ctx.fillText([dateStr, flightStr].filter(Boolean).join("   ·   "), S / 2, dateY);

  const divY = S * 0.70;
  ctx.strokeStyle = "rgba(14,165,233,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(48, divY); ctx.lineTo(S - 48, divY); ctx.stroke();

  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText("Itinerary udah rapi, tiket & visa", S / 2, divY + 52);
  ctx.fillText("diurus sama Temantiket!", S / 2, divY + 88);

  ctx.font = "400 17px system-ui, sans-serif";
  ctx.fillStyle = "rgba(186,230,253,0.65)";
  ctx.fillText("Mau itinerary estetik kayak gini?", S / 2, divY + 130);
  ctx.fillText("Hubungi Temantiket sekarang ✈", S / 2, divY + 156);

  if (logo) {
    const fLogoH = 24;
    const fLogoW = (logo.naturalWidth / logo.naturalHeight) * fLogoH;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(logo, S / 2 - fLogoW / 2, S - 54, fLogoW, fLogoH);
    ctx.globalAlpha = 1;
  }
  ctx.font = "400 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,211,252,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("Generated by Temantiket — Cepat, Mudah, Amanah", S / 2, S - 24);
  ctx.textAlign = "left";
}

// ── Leg editor ─────────────────────────────────────────────────────────────

function LegEditor({ leg, index, onChange }: { leg: FlightLeg; index: number; onChange: (l: FlightLeg) => void }) {
  const u = <K extends keyof FlightLeg>(k: K, v: FlightLeg[K]) => onChange({ ...leg, [k]: v });
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">{index + 1}</div>
        <h3 className="text-[13px] font-semibold">Penerbangan {index + 1}</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <LegField label="Maskapai" value={leg.airline ?? ""} onChange={(v) => u("airline", v)} placeholder="Qatar Airways" />
        <LegField label="No. Penerbangan" value={leg.flightNumber ?? ""} onChange={(v) => u("flightNumber", v)} placeholder="QR978" />
        <LegField label="Kelas" value={leg.class ?? ""} onChange={(v) => u("class", v)} placeholder="Economy" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <LegField label="Asal (IATA)" value={leg.fromCode ?? ""} onChange={(v) => u("fromCode", v.toUpperCase())} placeholder="CGK" mono />
        <LegField label="Kota Asal" value={leg.fromCity ?? ""} onChange={(v) => u("fromCity", v)} placeholder="Jakarta" />
        <LegField label="Tujuan (IATA)" value={leg.toCode ?? ""} onChange={(v) => u("toCode", v.toUpperCase())} placeholder="DOH" mono />
        <LegField label="Kota Tujuan" value={leg.toCity ?? ""} onChange={(v) => u("toCity", v)} placeholder="Doha" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <LegField label="Tgl Berangkat" value={leg.departDate ?? ""} onChange={(v) => u("departDate", v)} type="date" />
        <LegField label="Jam Berangkat" value={leg.departTime ?? ""} onChange={(v) => u("departTime", v)} placeholder="23:55" />
        <LegField label="Tgl Tiba" value={leg.arriveDate ?? ""} onChange={(v) => u("arriveDate", v)} type="date" />
        <LegField label="Jam Tiba" value={leg.arriveTime ?? ""} onChange={(v) => u("arriveTime", v)} placeholder="04:30" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <LegField label="Durasi" value={leg.duration ?? ""} onChange={(v) => u("duration", v)} placeholder="8j 35m" />
        <LegField label="Bagasi" value={leg.baggage ?? ""} onChange={(v) => u("baggage", v)} placeholder="30kg" />
        <LegField label="Terminal" value={leg.terminal ?? ""} onChange={(v) => u("terminal", v)} placeholder="T3" />
      </div>
    </div>
  );
}

function LegField({ label, value, onChange, placeholder, type = "text", mono = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cn("h-8 text-sm", mono && "font-mono")} />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

type Tab = "wa" | "card" | "share";

export default function ItineraryGenerator() {
  const rates = useRatesStore((s) => s.rates);
  const egpRate = rates.EGP ?? 515;

  const [rawInput, setRawInput] = useState("");
  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [usedAI, setUsedAI] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("wa");
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isRenderingCard, setIsRenderingCard] = useState(false);
  const [isRenderingShare, setIsRenderingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedItinerary[]>(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const waText = itinerary ? buildWhatsAppText(itinerary, egpRate) : "";
  const smartTips = itinerary ? buildSmartTips(itinerary.legs) : [];

  // ── Auto-save itinerary to history when set ──
  useEffect(() => {
    if (itinerary && itinerary.legs.length > 0) {
      const next = saveToHistory(itinerary);
      setHistory(next);
    }
  }, [itinerary]);

  // ── Text processing ──
  const handleProcess = async () => {
    if (!rawInput.trim()) { toast.error("Tempel teks itinerary terlebih dahulu"); return; }
    setIsProcessing(true);
    try {
      const { data, usedAI: ai } = await extractItinerary(rawInput);
      setItinerary({ ...data, rawText: rawInput });
      setUsedAI(ai);
      if (data.legs.length === 0) {
        toast.warning("Tidak ada data penerbangan yang berhasil diekstrak. Isi form secara manual.", { duration: 5000 });
      } else {
        toast.success(
          ai ? `AI berhasil ekstrak ${data.legs.length} penerbangan` : `Parser berhasil ekstrak ${data.legs.length} penerbangan`,
          { description: ai ? "Powered by GPT-4o-mini" : "Gunakan form untuk koreksi manual" },
        );
      }
    } catch (e) {
      toast.error("Gagal memproses", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Image OCR ──
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("File harus berupa gambar (PNG, JPG, WEBP)"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Gambar terlalu besar (maks 8MB)"); return; }

    setIsOcrProcessing(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPreviewImageUrl(dataUrl);

      const { data, usedAI: ai } = await extractItineraryFromImage(dataUrl);
      setItinerary({ ...data, rawText: `[OCR dari gambar: ${file.name}]` });
      setUsedAI(ai);

      if (data.legs.length === 0) {
        toast.warning("Tidak ada data penerbangan terdeteksi di gambar. Coba gambar yang lebih jelas.", { duration: 6000 });
      } else {
        toast.success(`OCR berhasil ekstrak ${data.legs.length} penerbangan dari gambar`, {
          description: "Powered by GPT-4o Vision",
        });
        setActiveTab("wa");
      }
    } catch (e) {
      toast.error("Gagal proses gambar", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleImageUpload(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleImageUpload(file);
  };

  // ── Leg management ──
  const handleAddLeg = () => { if (!itinerary) return; setItinerary({ ...itinerary, legs: [...itinerary.legs, {}] }); };
  const handleUpdateLeg = (index: number, leg: FlightLeg) => {
    if (!itinerary) return;
    const legs = [...itinerary.legs]; legs[index] = leg; setItinerary({ ...itinerary, legs });
  };
  const handleRemoveLeg = (index: number) => {
    if (!itinerary) return;
    setItinerary({ ...itinerary, legs: itinerary.legs.filter((_, i) => i !== index) });
  };

  // ── WA actions ──
  const handleCopyWA = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true); toast.success("Teks WhatsApp disalin!");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Gagal menyalin"); }
  };
  const handleOpenWA = () => window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener,noreferrer");

  // ── Canvas render ──
  const renderCanvas = useCallback(async () => {
    if (!itinerary || !canvasRef.current) return;
    setIsRenderingCard(true);
    try { await renderTravelCard(canvasRef.current, itinerary, egpRate); }
    catch (e) { console.error(e); toast.error("Gagal render Travel Card"); }
    finally { setIsRenderingCard(false); }
  }, [itinerary, egpRate]);

  useEffect(() => {
    if (activeTab === "card" && itinerary) void renderCanvas();
  }, [activeTab, itinerary, renderCanvas]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `itinerary-temantiket-${itinerary?.pnr ?? Date.now()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    toast.success("Travel Card didownload!");
  };

  // ── Social share ──
  const renderSocialShare = useCallback(async () => {
    if (!itinerary || !shareCanvasRef.current) return;
    setIsRenderingShare(true);
    try { await renderSocialCard(shareCanvasRef.current, itinerary); }
    catch (e) { console.error(e); toast.error("Gagal render Social Share Card"); }
    finally { setIsRenderingShare(false); }
  }, [itinerary]);

  useEffect(() => {
    if (activeTab === "share" && itinerary) void renderSocialShare();
  }, [activeTab, itinerary, renderSocialShare]);

  const handleShareDownload = () => {
    if (!shareCanvasRef.current) return;
    const link = document.createElement("a");
    link.download = `share-temantiket-${itinerary?.pnr ?? Date.now()}.png`;
    link.href = shareCanvasRef.current.toDataURL("image/png");
    link.click();
    toast.success("Social Card didownload!");
  };

  const buildShareGroupText = (): string => {
    const first = itinerary?.legs[0];
    const last = itinerary?.legs[(itinerary?.legs.length ?? 1) - 1];
    const route = [first?.fromCode, last?.toCode].filter(Boolean).join(" - ");
    const date = first?.departDate
      ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(first.departDate + "T00:00:00"))
      : "";
    return [
      `*Itinerary Penerbangan*`,
      ``,
      `Baru dapet itinerary rapi dari *Temantiket*`,
      route ? `Rute: *${route}*` : "",
      date ? `Tanggal: ${date}` : "",
      ``,
      `Mau itinerary rapi kayak gini juga? Rekomen untuk umrah & tiket hemat!`,
      ``,
      `_Temantiket — mudah, cepat, amanah_`,
    ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  };

  const handleShareWAGroup = () => window.open(`https://wa.me/?text=${encodeURIComponent(buildShareGroupText())}`, "_blank", "noopener,noreferrer");
  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareGroupText());
      setShareCopied(true); toast.success("Teks share disalin!");
      setTimeout(() => setShareCopied(false), 2000);
    } catch { toast.error("Gagal menyalin"); }
  };

  const hasApiKey = true;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-sky-500" /> AI Itinerary Generator
        </h1>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Paste teks Galileo/Amadeus/Trip.com, atau upload screenshot tiket — AI ekstrak & generate otomatis.
        </p>
      </div>

      {/* Input box */}
      <div
        className="rounded-2xl border border-border bg-white p-4 space-y-3"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Plane className="h-3 w-3" /> Import Data Penerbangan
          </Label>
          {/* Upload screenshot button */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isOcrProcessing}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
              hasApiKey
                ? "bg-sky-500 text-white border-sky-500 hover:bg-sky-600"
                : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80",
            )}
          >
            {isOcrProcessing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Memproses…</>
              : <><ImagePlus className="h-3.5 w-3.5" /> Upload Screenshot</>}
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInputChange} />
        </div>

        {/* Image preview */}
        {previewImageUrl && (
          <div className="relative rounded-lg overflow-hidden border border-border bg-secondary/30 max-h-48 flex items-center justify-center">
            <img src={previewImageUrl} alt="Preview" className="max-h-48 object-contain" />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {isOcrProcessing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                <span className="text-white text-[12px] font-medium">AI sedang membaca gambar…</span>
              </div>
            )}
          </div>
        )}

        <Textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={PLACEHOLDER}
          className="min-h-[160px] font-mono text-[12.5px] resize-y"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleProcess} disabled={isProcessing || !rawInput.trim()} className="gap-2 bg-sky-500 hover:bg-sky-600">
            {isProcessing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Memproses…</>
              : <><Wand2 className="h-3.5 w-3.5" />Proses dengan AI</>}
          </Button>
          {(rawInput || previewImageUrl) && (
            <Button variant="outline" size="sm" onClick={() => { setRawInput(""); setItinerary(null); setPreviewImageUrl(null); }}>
              Reset
            </Button>
          )}
          {!itinerary && (
            <button
              type="button"
              onClick={() => setItinerary({ legs: [{}] })}
              className="text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Isi manual tanpa AI
            </button>
          )}
        </div>

        {/* AI mode badge */}
        {itinerary && (
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
            usedAI ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-sky-50 text-sky-700 border-sky-200",
          )}>
            {usedAI ? <Sparkles className="h-3 w-3" /> : <Info className="h-3 w-3" />}
            {usedAI ? "AI GPT-4o Vision/Mini" : "Parser Regex"}
          </div>
        )}

        {!hasApiKey && (
          <p className="text-[11px] text-amber-600 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            <span>OCR gambar aktif via AI server. Hubungi administrator jika tidak berfungsi.</span>
          </p>
        )}
      </div>

      {/* Results */}
      <AnimatePresence>
        {itinerary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Passenger / meta */}
            <div className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13.5px] font-bold">Info Penumpang & Booking</h2>
                <Button variant="outline" size="sm" onClick={() => setEditOpen((v) => !v)}>
                  <Pencil className="h-3 w-3 mr-1.5" />
                  {editOpen ? "Tutup Editor" : "Edit Manual"}
                  {editOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Nama Penumpang</Label>
                  <Input value={itinerary.passengerName ?? ""} onChange={(e) => setItinerary({ ...itinerary, passengerName: e.target.value })} placeholder="Nama lengkap" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Kode Booking (PNR)</Label>
                  <Input value={itinerary.pnr ?? ""} onChange={(e) => setItinerary({ ...itinerary, pnr: e.target.value.toUpperCase() })} placeholder="ABCDEF" className="h-8 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Bagasi</Label>
                  <select
                    value={itinerary.baggage ?? ""}
                    onChange={(e) => setItinerary({ ...itinerary, baggage: e.target.value || undefined })}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">— Pilih bagasi —</option>
                    <option value="20kg">20 kg</option>
                    <option value="23kg">23 kg</option>
                    <option value="25kg">25 kg</option>
                    <option value="30kg">30 kg</option>
                    <option value="32kg">32 kg</option>
                    <option value="40kg">40 kg</option>
                    <option value="46kg">46 kg</option>
                    <option value="2x23kg">2 × 23 kg</option>
                    <option value="2x30kg">2 × 30 kg</option>
                    <option value="Tanpa bagasi">Tanpa bagasi</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Total Harga</Label>
                  <Input type="number" value={itinerary.totalPrice ?? ""} onChange={(e) => setItinerary({ ...itinerary, totalPrice: Number(e.target.value) || undefined })} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Mata Uang</Label>
                  <select value={itinerary.priceCurrency ?? "IDR"} onChange={(e) => setItinerary({ ...itinerary, priceCurrency: e.target.value as ItineraryData["priceCurrency"] })} className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                    <option value="IDR">IDR</option>
                    <option value="EGP">EGP</option>
                    <option value="USD">USD</option>
                    <option value="SAR">SAR</option>
                  </select>
                </div>
              </div>

              {itinerary.totalPrice && itinerary.totalPrice > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {itinerary.priceCurrency === "EGP" && (
                    <span className="inline-flex items-center gap-1 text-[12px] bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full border border-sky-200">
                      Kurs live: ≈ {fmtIDR(Math.round(itinerary.totalPrice * egpRate))}
                      <span className="text-[10px] opacity-70">(EGP {egpRate.toLocaleString("id-ID")})</span>
                    </span>
                  )}
                  {itinerary.priceCurrency === "IDR" && egpRate > 0 && (
                    <span className="inline-flex items-center gap-1 text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                      Kurs live: ≈ EGP {Math.round(itinerary.totalPrice / egpRate).toLocaleString("id-ID")}
                    </span>
                  )}
                  {itinerary.priceCurrency === "USD" && (
                    <span className="inline-flex items-center gap-1 text-[12px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
                      ≈ {fmtIDR(Math.round(itinerary.totalPrice * (rates.USD ?? 16000)))}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Leg editors */}
            <AnimatePresence>
              {editOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  {itinerary.legs.map((leg, i) => (
                    <div key={i} className="relative">
                      <LegEditor leg={leg} index={i} onChange={(l) => handleUpdateLeg(i, l)} />
                      {itinerary.legs.length > 1 && (
                        <button type="button" onClick={() => handleRemoveLeg(i)} className="absolute top-3 right-3 text-[11px] text-red-500 hover:text-red-700 hover:underline">
                          Hapus
                        </button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={handleAddLeg}>
                    <Plane className="h-3 w-3 mr-1.5" /> Tambah Leg Penerbangan
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Smart tips */}
            {smartTips.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <h3 className="text-[12px] font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
                  <Info className="h-3.5 w-3.5" /> Smart Info Otomatis
                </h3>
                <ul className="space-y-1">
                  {smartTips.map((tip, i) => <li key={i} className="text-[12px] text-amber-800">– {tip}</li>)}
                </ul>
              </div>
            )}

            {/* Output tabs */}
            <div className="rounded-2xl border border-border bg-white overflow-hidden">
              <div className="flex border-b border-border overflow-x-auto">
                {([
                  ["wa", "WhatsApp"],
                  ["card", "Travel Card"],
                  ["share", "Share WA Group"],
                ] as [Tab, string][]).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={cn(
                      "flex-1 min-w-[100px] py-3 text-[12.5px] font-semibold transition-colors whitespace-nowrap px-3",
                      activeTab === t
                        ? "bg-sky-50 text-sky-600 border-b-2 border-sky-500"
                        : "text-muted-foreground hover:bg-secondary/50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* WhatsApp tab */}
              {activeTab === "wa" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={handleCopyWA} className="gap-1.5 bg-sky-500 hover:bg-sky-600">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Tersalin!" : "Salin Teks"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleOpenWA} className="gap-1.5 bg-[#25D366] text-white border-[#25D366] hover:bg-[#1ebe57] hover:border-[#1ebe57]">
                      <MessageCircle className="h-3.5 w-3.5" /> Buka WhatsApp
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap text-[12.5px] font-mono bg-secondary/30 rounded-xl p-4 border border-border max-h-[500px] overflow-auto leading-relaxed">
                    {waText}
                  </pre>
                </div>
              )}

              {/* Travel Card tab */}
              {activeTab === "card" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={renderCanvas} disabled={isRenderingCard} variant="outline" className="gap-1.5">
                      <RefreshCw className={cn("h-3.5 w-3.5", isRenderingCard && "animate-spin")} />
                      Render Ulang
                    </Button>
                    <Button size="sm" onClick={handleDownload} disabled={isRenderingCard} className="gap-1.5 bg-sky-500 hover:bg-sky-600">
                      <Download className="h-3.5 w-3.5" /> Download PNG (1080×1350)
                    </Button>
                    <span className="text-[11px] text-muted-foreground">Instagram Portrait · siap posting</span>
                  </div>
                  <div className="relative rounded-xl overflow-hidden bg-secondary/30 border border-border flex items-center justify-center min-h-[300px]">
                    {isRenderingCard && (
                      <div className="absolute inset-0 flex items-center justify-center bg-secondary/60 z-10 rounded-xl">
                        <RefreshCw className="h-6 w-6 animate-spin text-sky-500" />
                      </div>
                    )}
                    <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: "12px" }} />
                  </div>
                </div>
              )}

              {/* Social Share tab */}
              {activeTab === "share" && (
                <div className="p-4 space-y-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-2">
                    <h3 className="text-[12px] font-bold text-emerald-800 flex items-center gap-1.5">
                      <Share2 className="h-3.5 w-3.5" /> Teks untuk WA Group
                    </h3>
                    <pre className="whitespace-pre-wrap text-[12px] font-mono text-emerald-900 leading-relaxed">
                      {buildShareGroupText()}
                    </pre>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleCopyShareText} variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700">
                        {shareCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {shareCopied ? "Tersalin!" : "Salin Teks"}
                      </Button>
                      <Button size="sm" onClick={handleShareWAGroup} className="gap-1.5 bg-[#25D366] hover:bg-[#1eb858] border-0">
                        <MessageCircle className="h-3.5 w-3.5" /> Share ke WA Group
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold">Social Card (1080×1080)</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={renderSocialShare} disabled={isRenderingShare} variant="outline" className="gap-1.5 h-7 text-[11px]">
                          <RefreshCw className={cn("h-3 w-3", isRenderingShare && "animate-spin")} /> Render
                        </Button>
                        <Button size="sm" onClick={handleShareDownload} disabled={isRenderingShare} className="gap-1.5 h-7 text-[11px] bg-sky-500 hover:bg-sky-600">
                          <Download className="h-3 w-3" /> Download
                        </Button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Download gambar → kirim ke WA Group bareng teks di atas buat social proof yang keren!
                    </p>
                    <div className="relative rounded-xl overflow-hidden bg-secondary/30 border border-border flex items-center justify-center min-h-[260px]">
                      {isRenderingShare && (
                        <div className="absolute inset-0 flex items-center justify-center bg-secondary/60 z-10 rounded-xl">
                          <RefreshCw className="h-6 w-6 animate-spin text-sky-500" />
                        </div>
                      )}
                      <canvas ref={shareCanvasRef} style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: "12px" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History panel — shown when there's history and no active itinerary */}
      {!itinerary && history.length > 0 && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold">
              <History className="h-4 w-4 text-sky-500" />
              Riwayat Itinerary
              <span className="text-[11px] font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                {history.length} tersimpan
              </span>
            </span>
            {historyOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {historyOpen && (
            <div className="border-t border-border divide-y divide-border">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{entry.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.data.pnr && (
                        <span className="text-[11px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {entry.data.pnr}
                        </span>
                      )}
                      {entry.data.passengerName && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {entry.data.passengerName}
                        </span>
                      )}
                      {entry.data.totalPrice && entry.data.priceCurrency && (
                        <span className="text-[11px] text-sky-600 font-medium">
                          {entry.data.priceCurrency} {entry.data.totalPrice.toLocaleString("id-ID")}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                        {fmtRelTime(entry.savedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2"
                      onClick={() => {
                        setItinerary(entry.data);
                        setActiveTab("wa");
                        toast.success("Itinerary dimuat dari riwayat");
                      }}
                    >
                      Muat
                    </Button>
                    <button
                      type="button"
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                      onClick={() => {
                        const next = deleteFromHistory(entry.id);
                        setHistory(next);
                        toast.success("Itinerary dihapus dari riwayat");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!itinerary && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-sky-400 mb-3" />
          <h3 className="text-base font-semibold mb-1">Cara Pakai</h3>
          <ol className="text-[13px] text-muted-foreground text-left max-w-sm mx-auto space-y-1.5 list-decimal list-inside">
            <li>Paste teks dari Galileo, Amadeus, Trip.com, atau email tiket</li>
            <li><strong>atau</strong> klik "Upload Screenshot" untuk OCR gambar tiket</li>
            <li>AI ekstrak semua data otomatis (flight, waktu, transit)</li>
            <li>Koreksi manual jika perlu lewat form editor</li>
            <li>Generate teks WhatsApp rapi atau Travel Card estetik</li>
            <li>Download PNG 1080×1350 siap posting Instagram</li>
          </ol>
          <div className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
            <Info className="h-3 w-3" />
            AI mode & OCR gambar aktif jika OPENAI_API_KEY telah dikonfigurasi di server
          </div>
        </div>
      )}
    </div>
  );
}
