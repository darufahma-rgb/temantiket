import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Copy, Check, Download, MessageCircle, ChevronDown, ChevronUp,
  Plane, RefreshCw, Pencil, Info, Wand2, Share2,
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
  extractItinerary, buildWhatsAppText, buildSmartTips,
  calcTransitMinutes, fmtMinutes,
  type ItineraryData, type FlightLeg,
} from "@/lib/itineraryAI";

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

const PLACEHOLDER = `Tempel kode Galileo atau teks itinerary di sini...

Contoh Galileo:
1 QR 978 Y 15MAR 4 CGKDOH HK1 2355 0430 16MAR
2 QR 301 Y 16MAR 4 DOHCAI HK1 0700 0910

Contoh Trip.com:
Booking Reference: ABCDEF
Jakarta (CGK) → Doha (DOH) → Cairo (CAI)
Departure: 15 Mar 2026, 23:55
Qatar Airways QR978 | Economy | Baggage: 30kg

Atau paste seluruh teks dari email / halaman Trip.com.`;

// ── Canvas Travel Card renderer ────────────────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
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

async function renderTravelCard(
  canvas: HTMLCanvasElement,
  data: ItineraryData,
  egpRate: number,
): Promise<void> {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background gradient ──
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, "#050E1F");
  bg.addColorStop(0.5, "#0A1A35");
  bg.addColorStop(1, "#06111E");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid texture
  ctx.strokeStyle = "rgba(14,165,233,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Accent glow top-right
  const glow = ctx.createRadialGradient(W * 0.85, 80, 0, W * 0.85, 80, 350);
  glow.addColorStop(0, "rgba(14,165,233,0.18)");
  glow.addColorStop(1, "rgba(14,165,233,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Logo / header ──
  const logo = await loadImage("/temantiket-logo.png");
  const logoH = 52;
  const logoW = logo ? (logo.naturalWidth / logo.naturalHeight) * logoH : 0;
  let cursorY = 52;
  if (logo) {
    ctx.drawImage(logo, 54, cursorY, logoW, logoH);
  } else {
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillStyle = "#0EA5E9";
    ctx.fillText("temantiket", 54, cursorY + 36);
  }

  // "ITINERARY" badge — top right
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.letterSpacing = "3px";
  const badge = "ITINERARY PENERBANGAN";
  const badgeW = ctx.measureText(badge).width + 32;
  const badgeX = W - badgeW - 48;
  roundRect(ctx, badgeX, cursorY + 6, badgeW, 40, 8);
  ctx.fillStyle = "rgba(14,165,233,0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(14,165,233,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#7DD3FC";
  ctx.fillText(badge, badgeX + 16, cursorY + 32);
  ctx.letterSpacing = "0px";
  cursorY += 92;

  // PNR + passenger
  if (data.pnr || data.passengerName) {
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.7)";
    const paxLine = [data.passengerName, data.pnr ? `PNR: ${data.pnr}` : ""].filter(Boolean).join("  ·  ");
    ctx.fillText(paxLine, 54, cursorY);
    cursorY += 34;
  }

  // Divider line
  ctx.strokeStyle = "rgba(14,165,233,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(54, cursorY); ctx.lineTo(W - 54, cursorY); ctx.stroke();
  cursorY += 28;

  // ── Each leg ──────────────────────────────────────────────────────────────
  const legH = data.legs.length === 1 ? 280 : data.legs.length === 2 ? 230 : 190;

  for (let i = 0; i < data.legs.length; i++) {
    const leg = data.legs[i];

    // Card bg
    roundRect(ctx, 40, cursorY, W - 80, legH, 20);
    const cardBg = ctx.createLinearGradient(40, cursorY, W - 40, cursorY + legH);
    cardBg.addColorStop(0, "rgba(14,165,233,0.10)");
    cardBg.addColorStop(1, "rgba(14,165,233,0.03)");
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = "rgba(14,165,233,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Flight label + airline
    const legLabel = data.legs.length > 1 ? `Penerbangan ${i + 1}` : "Penerbangan";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "#7DD3FC";
    ctx.fillText(`${legLabel.toUpperCase()}  ·  ${leg.flightNumber ?? ""}  ${leg.airline ? `· ${leg.airline}` : ""}`, 66, cursorY + 32);

    // Airport codes — BIG
    const codeY = cursorY + legH * 0.52;
    ctx.font = `bold ${data.legs.length <= 1 ? 80 : 68}px system-ui, sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(leg.fromCode ?? "???", 66, codeY);

    // Center plane icon  (drawn as text)
    ctx.font = `${data.legs.length <= 1 ? 36 : 30}px system-ui, sans-serif`;
    ctx.fillStyle = "#0EA5E9";
    ctx.textAlign = "center";
    ctx.fillText("✈", W / 2, codeY - 8);

    // Dashed route line
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(14,165,233,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(66 + ctx.measureText(leg.fromCode ?? "???").width + 20, codeY - 28);
    ctx.lineTo(W / 2 - 30, codeY - 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 + 30, codeY - 28);
    const toCodeW = (() => {
      ctx.save();
      ctx.font = `bold ${data.legs.length <= 1 ? 80 : 68}px system-ui, sans-serif`;
      const w = ctx.measureText(leg.toCode ?? "???").width;
      ctx.restore();
      return w;
    })();
    ctx.lineTo(W - 66 - toCodeW, codeY - 28);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = "right";
    ctx.font = `bold ${data.legs.length <= 1 ? 80 : 68}px system-ui, sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(leg.toCode ?? "???", W - 66, codeY);

    // City names
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.75)";
    ctx.textAlign = "left";
    if (leg.fromCity) ctx.fillText(leg.fromCity, 66, codeY + 28);
    ctx.textAlign = "right";
    if (leg.toCity) ctx.fillText(leg.toCity, W - 66, codeY + 28);
    ctx.textAlign = "left";

    // Times
    const timeY = cursorY + legH * 0.75;
    ctx.font = `bold ${data.legs.length <= 1 ? 34 : 28}px system-ui, sans-serif`;
    ctx.fillStyle = "#38BDF8";
    ctx.textAlign = "left";
    ctx.fillText(leg.departTime ?? "—", 66, timeY);
    ctx.textAlign = "right";
    ctx.fillText(leg.arriveTime ?? "—", W - 66, timeY);
    ctx.textAlign = "left";

    // Date + duration
    const dtY = timeY + 28;
    ctx.font = "400 16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.6)";
    ctx.textAlign = "left";
    ctx.fillText(fmtDate(leg.departDate), 66, dtY);
    ctx.textAlign = "right";
    ctx.fillText(fmtDate(leg.arriveDate), W - 66, dtY);
    if (leg.duration) {
      ctx.textAlign = "center";
      ctx.font = "500 15px system-ui, sans-serif";
      ctx.fillStyle = "rgba(125,211,252,0.8)";
      ctx.fillText(`⏱ ${leg.duration}`, W / 2, dtY);
    }
    ctx.textAlign = "left";

    cursorY += legH + 12;

    // Transit bar
    if (i < data.legs.length - 1) {
      const next = data.legs[i + 1];
      const transitMin = calcTransitMinutes(leg, next);
      const city = leg.toCity ?? leg.toCode ?? "Transit";
      const transitLabel = transitMin !== null
        ? `🔄  Transit ${city} · ${fmtMinutes(transitMin)}`
        : `🔄  Transit: ${city}`;

      roundRect(ctx, 80, cursorY, W - 160, 46, 10);
      ctx.fillStyle = "rgba(234,179,8,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(234,179,8,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillStyle = "#FDE68A";
      ctx.textAlign = "center";
      ctx.fillText(transitLabel, W / 2, cursorY + 30);
      ctx.textAlign = "left";
      cursorY += 58;
    }
  }

  cursorY += 6;

  // ── Smart tips ────────────────────────────────────────────────────────────
  const tips = buildSmartTips(data.legs);
  if (tips.length > 0) {
    // Divider
    ctx.strokeStyle = "rgba(14,165,233,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(54, cursorY); ctx.lineTo(W - 54, cursorY); ctx.stroke();
    cursorY += 22;

    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillStyle = "#7DD3FC";
    ctx.fillText("💡  INFO PENTING", 54, cursorY);
    cursorY += 26;

    ctx.font = "400 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(186,230,253,0.75)";
    for (const tip of tips.slice(0, 3)) {
      ctx.fillText(`• ${tip}`, 62, cursorY);
      cursorY += 24;
    }
    cursorY += 8;
  }

  // ── Price ─────────────────────────────────────────────────────────────────
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

    roundRect(ctx, 40, cursorY, W - 80, 52, 14);
    const priceBg = ctx.createLinearGradient(40, cursorY, W - 40, cursorY + 52);
    priceBg.addColorStop(0, "rgba(14,165,233,0.15)");
    priceBg.addColorStop(1, "rgba(14,165,233,0.05)");
    ctx.fillStyle = priceBg;
    ctx.fill();
    ctx.strokeStyle = "rgba(14,165,233,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillStyle = "#38BDF8";
    ctx.textAlign = "center";
    ctx.fillText(`💰  ${priceText}`, W / 2, cursorY + 34);
    ctx.textAlign = "left";
    cursorY += 64;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = Math.max(cursorY + 20, H - 72);
  ctx.strokeStyle = "rgba(14,165,233,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(54, footerY - 16); ctx.lineTo(W - 54, footerY - 16); ctx.stroke();
  ctx.font = "400 16px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,211,252,0.5)";
  ctx.textAlign = "center";
  ctx.fillText("temantiket — mudah, cepat, amanah  ✈️", W / 2, footerY + 12);
  ctx.textAlign = "left";
}

// ── Social Share Card renderer (1080×1080 square) ─────────────────────────

async function renderSocialCard(canvas: HTMLCanvasElement, data: ItineraryData): Promise<void> {
  const S = 1080;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  // Background
  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#050E1F");
  bg.addColorStop(0.6, "#0A1A35");
  bg.addColorStop(1, "#061522");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Diagonal accent stripe
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#0EA5E9";
  ctx.beginPath();
  ctx.moveTo(S * 0.55, 0); ctx.lineTo(S, 0); ctx.lineTo(S * 0.45, S); ctx.lineTo(0, S);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Glow top-left
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 480);
  glow.addColorStop(0, "rgba(14,165,233,0.14)");
  glow.addColorStop(1, "rgba(14,165,233,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  // Logo
  const logo = await loadImage("/temantiket-logo.png");
  const logoH = 44;
  const logoW = logo ? (logo.naturalWidth / logo.naturalHeight) * logoH : 0;
  if (logo) ctx.drawImage(logo, 48, 44, logoW, logoH);

  // "Itinerary Gue Udah Jadi!" headline
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillStyle = "#7DD3FC";
  ctx.letterSpacing = "1px";
  ctx.textAlign = "right";
  ctx.fillText("✈️  ITINERARY GUE UDAH JADI!", S - 48, 72);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  // ── Route display ─────────────────────────────────────────────────────
  const firstLeg = data.legs[0];
  const lastLeg = data.legs[data.legs.length - 1];
  const fromCode = firstLeg?.fromCode ?? "???";
  const toCode = lastLeg?.toCode ?? "???";
  const fromCity = firstLeg?.fromCity ?? "";
  const toCity = lastLeg?.toCity ?? "";

  // Collect all transit codes
  const allCodes = data.legs.map((l, i) => (i === 0 ? l.fromCode : l.toCode)).filter(Boolean) as string[];

  // Big route codes center
  const centerY = S * 0.45;
  ctx.font = "black 96px system-ui, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(fromCode, 60, centerY);

  ctx.textAlign = "right";
  ctx.fillText(toCode, S - 60, centerY);

  // Arrow + planes in center
  ctx.font = "44px system-ui, sans-serif";
  ctx.fillStyle = "#0EA5E9";
  ctx.textAlign = "center";
  ctx.fillText("✈", S / 2, centerY - 12);

  // Dashed line
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(14,165,233,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const fromW = (() => { ctx.save(); ctx.font = "black 96px system-ui, sans-serif"; const w = ctx.measureText(fromCode).width; ctx.restore(); return w; })();
  ctx.moveTo(60 + fromW + 16, centerY - 32);
  ctx.lineTo(S / 2 - 34, centerY - 32);
  ctx.stroke();
  ctx.beginPath();
  const toW = (() => { ctx.save(); ctx.font = "black 96px system-ui, sans-serif"; const w = ctx.measureText(toCode).width; ctx.restore(); return w; })();
  ctx.moveTo(S / 2 + 34, centerY - 32);
  ctx.lineTo(S - 60 - toW - 16, centerY - 32);
  ctx.stroke();
  ctx.setLineDash([]);

  // City names
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillStyle = "rgba(186,230,253,0.75)";
  ctx.textAlign = "left";
  ctx.fillText(fromCity, 60, centerY + 30);
  ctx.textAlign = "right";
  ctx.fillText(toCity, S - 60, centerY + 30);

  // Transit stops (if any)
  if (data.legs.length > 1) {
    const midCodes = allCodes.slice(1, -1).join(" · ");
    if (midCodes) {
      ctx.font = "400 18px system-ui, sans-serif";
      ctx.fillStyle = "rgba(253,230,138,0.85)";
      ctx.textAlign = "center";
      ctx.fillText(`🔄  Transit: ${midCodes}`, S / 2, centerY + 66);
    }
  }

  // Date + flight number
  const dateY = centerY + (data.legs.length > 1 ? 106 : 80);
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "#38BDF8";
  ctx.textAlign = "center";
  const dateStr = firstLeg?.departDate
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(firstLeg.departDate + "T00:00:00"))
    : "";
  const flightStr = [firstLeg?.airline, firstLeg?.flightNumber].filter(Boolean).join(" · ");
  ctx.fillText([dateStr, flightStr].filter(Boolean).join("  ·  "), S / 2, dateY);

  // ── Divider ────────────────────────────────────────────────────────────
  const divY = S * 0.7;
  ctx.strokeStyle = "rgba(14,165,233,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(48, divY); ctx.lineTo(S - 48, divY); ctx.stroke();

  // ── CTA section ────────────────────────────────────────────────────────
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText("Itinerary udah rapi, tiket & visa", S / 2, divY + 48);
  ctx.fillText("diurus sama Temantiket! 🙌", S / 2, divY + 84);

  ctx.font = "400 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(186,230,253,0.7)";
  ctx.fillText("Mau itinerary estetik kayak gini?", S / 2, divY + 126);
  ctx.fillText("Chat Temantiket sekarang ✈️", S / 2, divY + 152);

  // Bottom tag
  ctx.font = "400 16px system-ui, sans-serif";
  ctx.fillStyle = "rgba(125,211,252,0.45)";
  ctx.fillText("temantiket — mudah, cepat, amanah", S / 2, S - 44);
  ctx.textAlign = "left";
}

// ── Editable leg form ──────────────────────────────────────────────────────

function LegEditor({
  leg, index, onChange,
}: { leg: FlightLeg; index: number; onChange: (l: FlightLeg) => void }) {
  const u = <K extends keyof FlightLeg>(k: K, v: FlightLeg[K]) =>
    onChange({ ...leg, [k]: v });

  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
          {index + 1}
        </div>
        <h3 className="text-[13px] font-semibold">Penerbangan {index + 1}</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <LegField label="Maskapai" value={leg.airline ?? ""} onChange={(v) => u("airline", v)} placeholder="Qatar Airways" />
        <LegField label="No. Penerbangan" value={leg.flightNumber ?? ""} onChange={(v) => u("flightNumber", v)} placeholder="QR 978" />
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

      <div className="grid grid-cols-2 gap-2">
        <LegField label="Durasi" value={leg.duration ?? ""} onChange={(v) => u("duration", v)} placeholder="8j 35m" />
        <LegField label="Bagasi" value={leg.baggage ?? ""} onChange={(v) => u("baggage", v)} placeholder="30kg" />
      </div>
    </div>
  );
}

function LegField({
  label, value, onChange, placeholder, type = "text", mono = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("h-8 text-sm", mono && "font-mono")}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type Tab = "wa" | "card" | "share";

export default function ItineraryGenerator() {
  const rates = useRatesStore((s) => s.rates);
  const egpRate = rates.EGP ?? 515; // IDR per EGP

  const [rawInput, setRawInput] = useState("");
  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [usedAI, setUsedAI] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("wa");
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isRenderingCard, setIsRenderingCard] = useState(false);
  const [isRenderingShare, setIsRenderingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement>(null);

  // WA text — recompute when itinerary changes
  const waText = itinerary ? buildWhatsAppText(itinerary, egpRate) : "";
  const smartTips = itinerary ? buildSmartTips(itinerary.legs) : [];

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

  const handleAddLeg = () => {
    if (!itinerary) return;
    setItinerary({ ...itinerary, legs: [...itinerary.legs, {}] });
  };

  const handleUpdateLeg = (index: number, leg: FlightLeg) => {
    if (!itinerary) return;
    const legs = [...itinerary.legs];
    legs[index] = leg;
    setItinerary({ ...itinerary, legs });
  };

  const handleRemoveLeg = (index: number) => {
    if (!itinerary) return;
    const legs = itinerary.legs.filter((_, i) => i !== index);
    setItinerary({ ...itinerary, legs });
  };

  const handleCopyWA = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true);
      toast.success("Teks WhatsApp disalin!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const handleOpenWA = () => {
    const encoded = encodeURIComponent(waText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
  };

  // Render canvas when tab changes to "card" or itinerary changes
  const renderCanvas = useCallback(async () => {
    if (!itinerary || !canvasRef.current) return;
    setIsRenderingCard(true);
    try {
      await renderTravelCard(canvasRef.current, itinerary, egpRate);
    } catch (e) {
      console.error("[ItineraryGenerator] canvas render failed:", e);
      toast.error("Gagal render Travel Card");
    } finally {
      setIsRenderingCard(false);
    }
  }, [itinerary, egpRate]);

  useEffect(() => {
    if (activeTab === "card" && itinerary) {
      void renderCanvas();
    }
  }, [activeTab, itinerary, renderCanvas]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `itinerary-${itinerary?.pnr ?? Date.now()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    toast.success("Travel Card didownload!");
  };

  // ── Social Share handlers ─────────────────────────────────────────────────

  const renderSocialShare = useCallback(async () => {
    if (!itinerary || !shareCanvasRef.current) return;
    setIsRenderingShare(true);
    try {
      await renderSocialCard(shareCanvasRef.current, itinerary);
    } catch (e) {
      console.error("[ItineraryGenerator] social share render failed:", e);
      toast.error("Gagal render Social Share Card");
    } finally {
      setIsRenderingShare(false);
    }
  }, [itinerary]);

  useEffect(() => {
    if (activeTab === "share" && itinerary) {
      void renderSocialShare();
    }
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
    const route = [first?.fromCode, last?.toCode].filter(Boolean).join(" → ");
    const date = first?.departDate
      ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(first.departDate + "T00:00:00"))
      : "";
    return [
      `✈️ *Itinerary Gue Udah Jadi!*`,
      ``,
      `Gue baru dapet itinerary estetik dari *Temantiket* 🔥`,
      route ? `Route: *${route}*` : "",
      date ? `Tanggal: ${date}` : "",
      ``,
      `Mau itinerary rapi kayak gini juga? Rekomen banget buat umrah & tiket hemat! ✈️`,
      ``,
      `_Temantiket — mudah, cepat, amanah_`,
    ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  };

  const handleShareWAGroup = () => {
    const text = buildShareGroupText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareGroupText());
      setShareCopied(true);
      toast.success("Teks share disalin!");
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-sky-500" /> AI Itinerary Generator
        </h1>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Paste kode Galileo, teks Trip.com, atau itinerary email — AI ekstrak & generate otomatis.
        </p>
      </div>

      {/* Input box */}
      <div className="rounded-2xl border border-border bg-white p-4 space-y-3">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Plane className="h-3 w-3" /> Import Data Penerbangan
        </Label>
        <Textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={PLACEHOLDER}
          className="min-h-[180px] font-mono text-[12.5px] resize-y"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleProcess}
            disabled={isProcessing || !rawInput.trim()}
            className="gap-2"
          >
            {isProcessing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Memproses AI…</>
              : <><Wand2 className="h-3.5 w-3.5" />Proses dengan AI</>}
          </Button>
          {rawInput && (
            <Button variant="outline" size="sm" onClick={() => { setRawInput(""); setItinerary(null); }}>
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
            usedAI
              ? "bg-violet-50 text-violet-700 border-violet-200"
              : "bg-sky-50 text-sky-700 border-sky-200",
          )}>
            {usedAI ? <Sparkles className="h-3 w-3" /> : <Info className="h-3 w-3" />}
            {usedAI ? "AI GPT-4o-mini" : "Parser Regex (set VITE_OPENAI_API_KEY untuk AI)"}
          </div>
        )}
      </div>

      {/* Result section */}
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
                <h2 className="text-[13.5px] font-bold">Info Penumpang</h2>
                <Button variant="outline" size="sm" onClick={() => setEditOpen((v) => !v)}>
                  <Pencil className="h-3 w-3 mr-1.5" />
                  {editOpen ? "Tutup Editor" : "Edit Manual"}
                  {editOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Nama Penumpang</Label>
                  <Input
                    value={itinerary.passengerName ?? ""}
                    onChange={(e) => setItinerary({ ...itinerary, passengerName: e.target.value })}
                    placeholder="Nama lengkap"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Kode Booking (PNR)</Label>
                  <Input
                    value={itinerary.pnr ?? ""}
                    onChange={(e) => setItinerary({ ...itinerary, pnr: e.target.value.toUpperCase() })}
                    placeholder="ABCDEF"
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Total Harga</Label>
                  <Input
                    type="number"
                    value={itinerary.totalPrice ?? ""}
                    onChange={(e) => setItinerary({ ...itinerary, totalPrice: Number(e.target.value) || undefined })}
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Mata Uang</Label>
                  <select
                    value={itinerary.priceCurrency ?? "IDR"}
                    onChange={(e) => setItinerary({ ...itinerary, priceCurrency: e.target.value as ItineraryData["priceCurrency"] })}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="IDR">IDR</option>
                    <option value="EGP">EGP</option>
                    <option value="USD">USD</option>
                    <option value="SAR">SAR</option>
                  </select>
                </div>
              </div>

              {/* Currency conversion display */}
              {itinerary.totalPrice && itinerary.totalPrice > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {itinerary.priceCurrency === "EGP" && (
                    <span className="inline-flex items-center gap-1 text-[12px] bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full border border-sky-200">
                      💱 ≈ {fmtIDR(Math.round(itinerary.totalPrice * egpRate))}
                      <span className="text-[10px] opacity-70">(kurs live EGP {egpRate.toLocaleString("id-ID")})</span>
                    </span>
                  )}
                  {itinerary.priceCurrency === "IDR" && egpRate > 0 && (
                    <span className="inline-flex items-center gap-1 text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                      💱 ≈ EGP {Math.round(itinerary.totalPrice / egpRate).toLocaleString("id-ID")}
                      <span className="text-[10px] opacity-70">(kurs live)</span>
                    </span>
                  )}
                  {itinerary.priceCurrency === "USD" && (
                    <span className="inline-flex items-center gap-1 text-[12px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
                      💱 ≈ {fmtIDR(Math.round(itinerary.totalPrice * (rates.USD ?? 16000)))}
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
                        <button
                          type="button"
                          onClick={() => handleRemoveLeg(i)}
                          className="absolute top-3 right-3 text-[11px] text-red-500 hover:text-red-700 hover:underline"
                        >
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

            {/* Smart tips preview */}
            {smartTips.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <h3 className="text-[12px] font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
                  <Info className="h-3.5 w-3.5" /> Smart Info Otomatis
                </h3>
                <ul className="space-y-1">
                  {smartTips.map((tip, i) => (
                    <li key={i} className="text-[12px] text-amber-800">• {tip}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tabs */}
            <div className="rounded-2xl border border-border bg-white overflow-hidden">
              <div className="flex border-b border-border overflow-x-auto">
                {([
                  ["wa",    "💬 WhatsApp"],
                  ["card",  "🎨 Travel Card"],
                  ["share", "📲 Share WA Group"],
                ] as [Tab, string][]).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={cn(
                      "flex-1 min-w-[100px] py-3 text-[12.5px] font-semibold transition-colors whitespace-nowrap px-2",
                      activeTab === t
                        ? "bg-sky-50 text-sky-700 border-b-2 border-sky-500"
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
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleCopyWA} className="gap-1.5">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Tersalin!" : "Salin Teks"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleOpenWA} className="gap-1.5 bg-[#25D366] text-white border-[#25D366] hover:bg-[#1ebe57] hover:border-[#1ebe57]">
                      <MessageCircle className="h-3.5 w-3.5" /> Buka WhatsApp
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap text-[12.5px] font-mono bg-secondary/40 rounded-xl p-4 border border-border max-h-[480px] overflow-auto leading-relaxed">
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
                    <Button size="sm" onClick={handleDownload} disabled={isRenderingCard} className="gap-1.5">
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
                  {/* Teks share WA Group */}
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

                  {/* Social Card Image */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-foreground">
                        📸 Social Card (1080×1080 · IG Square / WA Group)
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={renderSocialShare} disabled={isRenderingShare} variant="outline" className="gap-1.5 h-7 text-[11px]">
                          <RefreshCw className={cn("h-3 w-3", isRenderingShare && "animate-spin")} />
                          Render
                        </Button>
                        <Button size="sm" onClick={handleShareDownload} disabled={isRenderingShare} className="gap-1.5 h-7 text-[11px]">
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

      {/* Empty state hint */}
      {!itinerary && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-sky-400 mb-3" />
          <h3 className="text-base font-semibold mb-1">Cara Pakai</h3>
          <ol className="text-[13px] text-muted-foreground text-left max-w-sm mx-auto space-y-1.5 list-decimal list-inside">
            <li>Paste teks dari Galileo, Trip.com, atau email tiket</li>
            <li>Klik "Proses dengan AI" — AI ekstrak semua data otomatis</li>
            <li>Koreksi manual jika perlu lewat form editor</li>
            <li>Generate teks WhatsApp rapi atau Travel Card estetik</li>
            <li>Download PNG 1080×1350 siap posting Instagram</li>
          </ol>
          <div className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
            <Info className="h-3 w-3" />
            Set <code className="bg-secondary px-1 py-0.5 rounded text-[10.5px] font-mono">VITE_OPENAI_API_KEY</code> untuk AI mode
          </div>
        </div>
      )}
    </div>
  );
}
