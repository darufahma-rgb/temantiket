/**
 * itineraryAI — ekstrak data penerbangan dari raw text (Galileo PNR, Trip.com,
 * email itinerary, dsb) menjadi struktur JSON terstandarisasi.
 *
 * Strategi:
 * 1. Coba OpenAI gpt-4o-mini jika VITE_OPENAI_API_KEY tersedia.
 * 2. Fallback ke regex flightParser (sudah ada, sudah teruji).
 */

import { parseFlightText, KNOWN_AIRPORTS } from "@/features/orders/flightParser";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FlightLeg {
  airline?: string;
  flightNumber?: string;
  fromCode?: string;
  fromCity?: string;
  toCode?: string;
  toCity?: string;
  departDate?: string;  // YYYY-MM-DD
  departTime?: string;  // HH:MM 24h
  arriveDate?: string;
  arriveTime?: string;
  duration?: string;    // "8j 35m" (Indonesian format)
  class?: string;
  baggage?: string;
  terminal?: string;
}

export interface ItineraryData {
  pnr?: string;
  passengerName?: string;
  legs: FlightLeg[];
  totalPrice?: number;
  priceCurrency?: "IDR" | "EGP" | "USD" | "SAR";
  rawText?: string;
}

// ── AI Prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a flight itinerary data extractor for an Indonesian travel agency.
Given raw text (PNR code, Trip.com page, Galileo output, or itinerary email), extract ALL flight segments.

Return ONLY valid JSON (no markdown, no explanation):
{
  "pnr": "booking code or null",
  "passengerName": "full name or null",
  "legs": [
    {
      "airline": "full airline name",
      "flightNumber": "e.g. QR978",
      "fromCode": "IATA 3-letter code",
      "fromCity": "city name",
      "toCode": "IATA 3-letter code",
      "toCity": "city name",
      "departDate": "YYYY-MM-DD or null",
      "departTime": "HH:MM 24h or null",
      "arriveDate": "YYYY-MM-DD or null",
      "arriveTime": "HH:MM 24h or null",
      "duration": "Xj Ym format e.g. 8j 35m or null",
      "class": "Economy/Business/First or null",
      "baggage": "e.g. 30kg or null"
    }
  ],
  "totalPrice": number or null,
  "priceCurrency": "IDR/EGP/USD/SAR or null"
}

Rules:
- legs is always an array even for single flight
- Return EVERY leg/segment if multiple
- dates: YYYY-MM-DD format only
- times: HH:MM 24h format only
- duration: Indonesian "Xj Ym" (jam=hours, menit=minutes)
- If price is in non-IDR, keep original currency
- null for missing fields`;

// ── OpenAI caller ──────────────────────────────────────────────────────────

async function callOpenAI(text: string, apiKey: string): Promise<ItineraryData> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.05,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 6000) },
      ],
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${errBody.slice(0, 200)}`);
  }
  const json = await resp.json() as { choices: { message: { content: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned) as ItineraryData;
  if (!Array.isArray(parsed.legs)) parsed.legs = [];
  // Clean up null fields
  parsed.legs = parsed.legs.map((leg) => {
    const clean: FlightLeg = {};
    (Object.keys(leg) as (keyof FlightLeg)[]).forEach((k) => {
      const v = leg[k];
      if (v !== null && v !== undefined && v !== "") (clean as Record<string, unknown>)[k] = v;
    });
    return clean;
  });
  return { ...parsed, rawText: text };
}

// ── Regex fallback ─────────────────────────────────────────────────────────

function regexFallback(text: string): ItineraryData {
  const single = parseFlightText(text);
  const leg: FlightLeg = {};
  if (single.airline) leg.airline = single.airline;
  if (single.flightNumber) leg.flightNumber = single.flightNumber;
  if (single.fromCode) { leg.fromCode = single.fromCode; leg.fromCity = single.fromCity ?? KNOWN_AIRPORTS[single.fromCode]; }
  if (single.toCode) { leg.toCode = single.toCode; leg.toCity = single.toCity ?? KNOWN_AIRPORTS[single.toCode]; }
  if (single.departDate) leg.departDate = single.departDate;
  if (single.departTime) leg.departTime = single.departTime;
  if (single.arriveDate) leg.arriveDate = single.arriveDate;
  if (single.arriveTime) leg.arriveTime = single.arriveTime;

  return {
    pnr: single.pnr,
    passengerName: single.passengerName,
    legs: Object.keys(leg).length > 0 ? [leg] : [],
    totalPrice: single.sellPrice ?? single.costPrice,
    priceCurrency: "IDR",
    rawText: text,
  };
}

// ── Transit calculation ────────────────────────────────────────────────────

/** Hitung menit transit antara dua leg. Return null jika data tidak cukup. */
export function calcTransitMinutes(prev: FlightLeg, next: FlightLeg): number | null {
  if (!prev.arriveDate || !prev.arriveTime || !next.departDate || !next.departTime) return null;
  const arrive = new Date(`${prev.arriveDate}T${prev.arriveTime}:00`);
  const depart = new Date(`${next.departDate}T${next.departTime}:00`);
  if (isNaN(arrive.getTime()) || isNaN(depart.getTime())) return null;
  const diff = (depart.getTime() - arrive.getTime()) / 60000;
  return diff > 0 ? Math.round(diff) : null;
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}

// ── Smart tips ─────────────────────────────────────────────────────────────

const AIRPORT_TIPS: Record<string, string> = {
  CGK: "Tiba di Soekarno-Hatta minimal 3 jam sebelum boarding internasional",
  HLP: "Tiba di Halim Perdanakusuma minimal 2 jam sebelum boarding",
  CAI: "Antrian imigrasi Cairo bisa panjang — tiba 3 jam lebih awal",
  JED: "Bawa buku vaksin meningitis & sertifikat kesehatan untuk Jeddah",
  MED: "Dokumen umrah/haji wajib lengkap sebelum boarding ke Madinah",
  RUH: "Pastikan e-Visa Saudi sudah terbit sebelum berangkat",
  DOH: "Transit Doha: ikuti petunjuk \"Transfer\" ke gate connecting flight",
  DXB: "Bandara Dubai sangat besar — transit butuh waktu ~45 menit ke gate",
  KUL: "Transit KLIA: gunakan Aerotrain ke Terminal 2 jika perlu",
  SIN: "Transit Changi: cek gate di papan display, antar terminal pakai Skytrain",
};

export function buildSmartTips(legs: FlightLeg[]): string[] {
  const tips: string[] = [];
  const addedTips = new Set<string>();

  const add = (tip: string) => { if (!addedTips.has(tip)) { addedTips.add(tip); tips.push(tip); } };

  // Per-airport tips
  for (const leg of legs) {
    if (leg.fromCode && AIRPORT_TIPS[leg.fromCode]) add(AIRPORT_TIPS[leg.fromCode]);
    if (leg.toCode && AIRPORT_TIPS[leg.toCode]) add(AIRPORT_TIPS[leg.toCode]);
  }

  // Transit tips
  for (let i = 0; i < legs.length - 1; i++) {
    const transitMin = calcTransitMinutes(legs[i], legs[i + 1]);
    const city = legs[i].toCity ?? legs[i].toCode ?? "transit";
    if (transitMin !== null) {
      if (transitMin < 75) {
        add(`⚡ Transit ${city} hanya ${fmtMinutes(transitMin)} — segera ke gate connecting flight`);
      } else if (transitMin > 360) {
        add(`🕐 Transit panjang di ${city} (${fmtMinutes(transitMin)}) — cek apakah perlu visa transit`);
      }
    }
  }

  // General tips (always add if space)
  const generals = [
    "Pastikan paspor berlaku minimal 6 bulan sebelum tanggal kepulangan",
    "Bagasi: cek batasan cairan (100ml) & benda tajam untuk kabin",
    "Screenshot atau cetak e-ticket sebagai backup",
  ];
  for (const g of generals) {
    if (tips.length >= 4) break;
    add(g);
  }

  return tips.slice(0, 5);
}

// ── WhatsApp text builder ──────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

export function buildWhatsAppText(data: ItineraryData, egpRate: number): string {
  const lines: string[] = [];
  lines.push("✈️ *ITINERARY PENERBANGAN*");
  if (data.pnr) lines.push(`📋 Kode Booking: *${data.pnr}*`);
  if (data.passengerName) lines.push(`👤 Penumpang: *${data.passengerName}*`);

  // Route summary
  if (data.legs.length > 0) {
    const first = data.legs[0];
    const last = data.legs[data.legs.length - 1];
    const routeCodes = data.legs.map((l, i) => i === 0 ? l.fromCode : l.toCode).filter(Boolean).join(" → ");
    const routeCities = data.legs.map((l, i) => i === 0 ? l.fromCity : l.toCity).filter(Boolean).join(" → ");
    lines.push(`\n*${routeCodes}*`);
    if (routeCities) lines.push(`_${routeCities}_`);
    if (first.departDate) lines.push(`📅 ${fmtDate(first.departDate)} — ${fmtDate(last.arriveDate ?? last.departDate)}`);
  }

  for (let i = 0; i < data.legs.length; i++) {
    const leg = data.legs[i];
    lines.push(`\n━━━━━━━━━━━━━━━`);
    lines.push(`*Penerbangan ${data.legs.length > 1 ? i + 1 : ""} ${leg.flightNumber ?? ""}*`.trim());
    if (leg.airline) lines.push(`✈️ ${leg.airline}`);
    if (leg.class) lines.push(`💺 Kelas: ${leg.class}`);
    if (leg.baggage) lines.push(`🧳 Bagasi: ${leg.baggage}`);

    lines.push(`\n🛫 *${leg.fromCode ?? "—"}* — ${leg.fromCity ?? ""}`);
    if (leg.departDate || leg.departTime) {
      lines.push(`   ${fmtDate(leg.departDate)} · ${leg.departTime ?? "—"}`);
    }
    lines.push(`🛬 *${leg.toCode ?? "—"}* — ${leg.toCity ?? ""}`);
    if (leg.arriveDate || leg.arriveTime) {
      lines.push(`   ${fmtDate(leg.arriveDate)} · ${leg.arriveTime ?? "—"}`);
    }
    if (leg.duration) lines.push(`⏱ Durasi: ${leg.duration}`);

    // Transit info
    if (i < data.legs.length - 1) {
      const next = data.legs[i + 1];
      const transitMin = calcTransitMinutes(leg, next);
      const city = leg.toCity ?? leg.toCode ?? "";
      if (transitMin !== null) {
        lines.push(`\n🔄 *Transit ${city}: ${fmtMinutes(transitMin)}*`);
      } else if (city) {
        lines.push(`\n🔄 *Transit: ${city}*`);
      }
    }
  }

  // Price
  if (data.totalPrice && data.totalPrice > 0) {
    lines.push(`\n━━━━━━━━━━━━━━━`);
    const currency = data.priceCurrency ?? "IDR";
    if (currency === "IDR") {
      const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(data.totalPrice);
      const egpAmt = egpRate > 0 ? Math.round(data.totalPrice / egpRate) : null;
      lines.push(`💰 Total: *${idr}*${egpAmt ? ` ≈ EGP ${egpAmt.toLocaleString("id-ID")}` : ""}`);
    } else if (currency === "EGP") {
      const egpFmt = `EGP ${data.totalPrice.toLocaleString("id-ID")}`;
      const idrAmt = egpRate > 0 ? Math.round(data.totalPrice * egpRate) : null;
      const idrFmt = idrAmt ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(idrAmt) : null;
      lines.push(`💰 Total: *${egpFmt}*${idrFmt ? ` ≈ ${idrFmt}` : ""}`);
    } else if (currency === "USD") {
      lines.push(`💰 Total: *USD ${data.totalPrice.toLocaleString("en-US")}*`);
    } else {
      lines.push(`💰 Total: *${currency} ${data.totalPrice.toLocaleString("id-ID")}*`);
    }
  }

  // Smart tips
  const tips = buildSmartTips(data.legs);
  if (tips.length > 0) {
    lines.push(`\n⚠️ *Info Penting:*`);
    tips.forEach((tip) => lines.push(`• ${tip}`));
  }

  lines.push(`\n_Temantiket — mudah, cepat, amanah_ ✈️`);
  return lines.join("\n");
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function extractItinerary(
  rawText: string,
): Promise<{ data: ItineraryData; usedAI: boolean }> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  if (apiKey && apiKey.length > 10) {
    try {
      const data = await callOpenAI(rawText, apiKey);
      return { data, usedAI: true };
    } catch (err) {
      console.warn("[itineraryAI] OpenAI gagal, fallback ke regex:", err);
    }
  }
  return { data: regexFallback(rawText), usedAI: false };
}
