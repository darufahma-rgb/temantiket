/**
 * itineraryAI — ekstrak data penerbangan dari raw text atau gambar
 * (Galileo PNR, Amadeus, Trip.com, email itinerary, screenshot tiket)
 * menjadi struktur JSON terstandarisasi.
 *
 * Strategi:
 * 1. extractItinerary(text)      → OpenAI text → regex fallback
 * 2. extractItineraryFromImage() → OpenAI Vision (wajib key)
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
  departDate?: string;   // YYYY-MM-DD
  departTime?: string;   // HH:MM 24h
  arriveDate?: string;
  arriveTime?: string;
  duration?: string;     // "8j 35m" Indonesian format
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

// ── AI Prompts ─────────────────────────────────────────────────────────────

const BASE_SCHEMA = `{
  "pnr": "booking/PNR code or null",
  "passengerName": "full name or null",
  "legs": [
    {
      "airline": "full airline name e.g. Qatar Airways",
      "flightNumber": "e.g. QR978 (no space)",
      "fromCode": "IATA 3-letter origin code",
      "fromCity": "origin city name",
      "toCode": "IATA 3-letter destination code",
      "toCity": "destination city name",
      "departDate": "YYYY-MM-DD or null",
      "departTime": "HH:MM 24h or null",
      "arriveDate": "YYYY-MM-DD or null",
      "arriveTime": "HH:MM 24h or null",
      "duration": "Xj Ym format e.g. 8j 35m or null",
      "class": "Economy/Business/First or null",
      "baggage": "e.g. 30kg or null",
      "terminal": "departure terminal or null"
    }
  ],
  "totalPrice": number_or_null,
  "priceCurrency": "IDR/EGP/USD/SAR or null"
}`;

const TEXT_SYSTEM_PROMPT = `You are a precision flight itinerary extractor for an Indonesian travel agency (Temantiket).
Parse raw input that may be: Galileo PNR codes, Amadeus entries, Trip.com pages, airline e-ticket emails, or plain booking text.

Return ONLY valid JSON — no markdown fences, no explanation, no trailing text:
${BASE_SCHEMA}

CRITICAL RULES:
- Extract EVERY flight segment as a separate leg in the array (never merge legs).
- Galileo line format:  <seg#> <AL><FLT> <class> <DDMMM> <dow> <ORIG><DEST> <status><seats> <HHMM_dep> <HHMM_arr> [<DDMMM_arr>]
  Example: "1 QR 978 Y 15MAR 4 CGKDOH HK1 2355 0430 16MAR"
  → flightNumber=QR978, fromCode=CGK, toCode=DOH, departTime=23:55, arriveTime=04:30, arriveDate next day
- Amadeus: similar to Galileo — extract all segments.
- Trip.com / email: parse departure/arrival times carefully including "next day +1" indicators.
- Times are ALWAYS HH:MM 24-hour. "2355" → "23:55". "0430" → "04:30".
- Dates ALWAYS YYYY-MM-DD. "15MAR" → current or nearest future year.
- If arrival is next day, increment the arriveDate accordingly.
- flightNumber: combine airline code + number without space: "QR 978" → "QR978".
- duration: Indonesian format "Xj Ym". Convert "8h 35m" → "8j 35m".
- Set null for any field that is truly missing — never guess or hallucinate.
- legs must always be an array, even for a single flight.`;

const IMAGE_SYSTEM_PROMPT = `You are a precision OCR and flight data extractor. Analyze this screenshot of a flight ticket, booking confirmation, or itinerary page.

Extract ALL flight segments visible in the image and return ONLY valid JSON:
${BASE_SCHEMA}

CRITICAL RULES:
- Read every text visible in the image carefully — airline name, flight number, airports, dates, times.
- Times are ALWAYS HH:MM 24-hour format.
- Dates ALWAYS YYYY-MM-DD.
- If arrival is on the next day (indicated by "+1" or a different date), increment arriveDate.
- flightNumber: no space between airline code and number (QR978 not QR 978).
- Extract ALL legs/segments — if the image shows multiple flights, include all.
- For transit/connecting flights, create one leg per segment.
- Set null only for genuinely missing fields — never guess.
- Return ONLY the JSON, nothing else.`;

// ── OpenAI Text caller ──────────────────────────────────────────────────────

async function callOpenAIText(text: string, apiKey: string): Promise<ItineraryData> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TEXT_SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 8000) },
      ],
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${errBody.slice(0, 200)}`);
  }
  const json = await resp.json() as { choices: { message: { content: string } }[] };
  return parseOpenAIResponse(json.choices?.[0]?.message?.content ?? "{}", text);
}

// ── OpenAI Vision caller ───────────────────────────────────────────────────

async function callOpenAIVision(imageDataUrl: string, apiKey: string): Promise<ItineraryData> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: IMAGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all flight data from this screenshot and return the JSON." },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`OpenAI Vision ${resp.status}: ${errBody.slice(0, 200)}`);
  }
  const json = await resp.json() as { choices: { message: { content: string } }[] };
  return parseOpenAIResponse(json.choices?.[0]?.message?.content ?? "{}", "");
}

function parseOpenAIResponse(raw: string, originalText: string): ItineraryData {
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned) as ItineraryData;
  if (!Array.isArray(parsed.legs)) parsed.legs = [];
  parsed.legs = parsed.legs.map((leg) => {
    const clean: FlightLeg = {};
    (Object.keys(leg) as (keyof FlightLeg)[]).forEach((k) => {
      const v = leg[k];
      if (v !== null && v !== undefined && v !== "") (clean as Record<string, unknown>)[k] = v;
    });
    return clean;
  });
  return { ...parsed, rawText: originalText };
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
  DOH: "Transit Doha: ikuti petunjuk Transfer ke gate connecting flight",
  DXB: "Bandara Dubai sangat besar — transit butuh waktu ~45 menit ke gate",
  KUL: "Transit KLIA: gunakan Aerotrain ke Terminal 2 jika perlu",
  SIN: "Transit Changi: cek gate di papan display, antar terminal pakai Skytrain",
};

export function buildSmartTips(legs: FlightLeg[]): string[] {
  const tips: string[] = [];
  const addedTips = new Set<string>();
  const add = (tip: string) => { if (!addedTips.has(tip)) { addedTips.add(tip); tips.push(tip); } };

  for (const leg of legs) {
    if (leg.fromCode && AIRPORT_TIPS[leg.fromCode]) add(AIRPORT_TIPS[leg.fromCode]);
    if (leg.toCode && AIRPORT_TIPS[leg.toCode]) add(AIRPORT_TIPS[leg.toCode]);
  }

  for (let i = 0; i < legs.length - 1; i++) {
    const transitMin = calcTransitMinutes(legs[i], legs[i + 1]);
    const city = legs[i].toCity ?? legs[i].toCode ?? "transit";
    if (transitMin !== null) {
      if (transitMin < 75) {
        add(`Transit ${city} hanya ${fmtMinutes(transitMin)} — segera ke gate connecting flight`);
      } else if (transitMin > 360) {
        add(`Transit panjang di ${city} (${fmtMinutes(transitMin)}) — cek apakah perlu visa transit`);
      }
    }
  }

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

// ── WhatsApp text builder — clean format ───────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

export function buildWhatsAppText(data: ItineraryData, egpRate: number): string {
  const lines: string[] = [];

  lines.push("*ITINERARY PENERBANGAN*");
  lines.push("_Generated by Temantiket — Cepat, Mudah, Amanah_");
  lines.push("");

  if (data.pnr) lines.push(`Kode Booking : *${data.pnr}*`);
  if (data.passengerName) lines.push(`Penumpang    : *${data.passengerName}*`);

  if (data.legs.length > 0) {
    const first = data.legs[0];
    const last = data.legs[data.legs.length - 1];
    const routeCodes = data.legs.map((l, i) => (i === 0 ? l.fromCode : l.toCode)).filter(Boolean).join(" - ");
    const routeCities = data.legs.map((l, i) => (i === 0 ? l.fromCity : l.toCity)).filter(Boolean).join(" - ");
    lines.push(`Rute         : *${routeCodes}*`);
    if (routeCities) lines.push(`               ${routeCities}`);
    if (first.departDate) lines.push(`Tanggal      : ${fmtDate(first.departDate)}${last.arriveDate && last.arriveDate !== first.departDate ? ` s/d ${fmtDate(last.arriveDate)}` : ""}`);
  }

  for (let i = 0; i < data.legs.length; i++) {
    const leg = data.legs[i];
    lines.push("");
    lines.push(`──────────────────────`);
    const legLabel = data.legs.length > 1 ? `PENERBANGAN ${i + 1}` : "PENERBANGAN";
    lines.push(`*${legLabel}${leg.flightNumber ? ` · ${leg.flightNumber}` : ""}*`);

    if (leg.airline) lines.push(`Maskapai  : ${leg.airline}`);
    if (leg.class) lines.push(`Kelas     : ${leg.class}`);
    if (leg.baggage) lines.push(`Bagasi    : ${leg.baggage}`);
    if (leg.terminal) lines.push(`Terminal  : ${leg.terminal}`);

    lines.push("");
    lines.push(`Berangkat`);
    lines.push(`  ${leg.fromCode ?? "—"} - ${leg.fromCity ?? ""}`);
    if (leg.departDate || leg.departTime) {
      lines.push(`  ${fmtDate(leg.departDate)}   *${leg.departTime ?? "—"}*`);
    }

    lines.push(`Tiba`);
    lines.push(`  ${leg.toCode ?? "—"} - ${leg.toCity ?? ""}`);
    if (leg.arriveDate || leg.arriveTime) {
      lines.push(`  ${fmtDate(leg.arriveDate)}   *${leg.arriveTime ?? "—"}*`);
    }

    if (leg.duration) lines.push(`Durasi    : ${leg.duration}`);

    if (i < data.legs.length - 1) {
      const next = data.legs[i + 1];
      const transitMin = calcTransitMinutes(leg, next);
      const city = leg.toCity ?? leg.toCode ?? "";
      lines.push("");
      if (transitMin !== null) {
        lines.push(`*[TRANSIT ${city.toUpperCase()} — ${fmtMinutes(transitMin)}]*`);
      } else if (city) {
        lines.push(`*[TRANSIT ${city.toUpperCase()}]*`);
      }
    }
  }

  if (data.totalPrice && data.totalPrice > 0) {
    lines.push("");
    lines.push(`──────────────────────`);
    const currency = data.priceCurrency ?? "IDR";
    if (currency === "IDR") {
      const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(data.totalPrice);
      const egpAmt = egpRate > 0 ? Math.round(data.totalPrice / egpRate) : null;
      lines.push(`Total : *${idr}*${egpAmt ? `  (≈ EGP ${egpAmt.toLocaleString("id-ID")})` : ""}`);
    } else if (currency === "EGP") {
      const egpFmt = `EGP ${data.totalPrice.toLocaleString("id-ID")}`;
      const idrAmt = egpRate > 0 ? Math.round(data.totalPrice * egpRate) : null;
      const idrFmt = idrAmt ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(idrAmt) : null;
      lines.push(`Total : *${egpFmt}*${idrFmt ? `  (≈ ${idrFmt})` : ""}`);
    } else {
      lines.push(`Total : *${currency} ${data.totalPrice.toLocaleString("id-ID")}*`);
    }
  }

  const tips = buildSmartTips(data.legs);
  if (tips.length > 0) {
    lines.push("");
    lines.push(`──────────────────────`);
    lines.push(`*INFO PENTING*`);
    tips.forEach((tip) => lines.push(`- ${tip}`));
  }

  lines.push("");
  lines.push(`_Temantiket — mudah, cepat, amanah_`);
  lines.push(`_Generated by Temantiket_`);

  return lines.join("\n");
}

// ── Main entry (text) ──────────────────────────────────────────────────────

export async function extractItinerary(
  rawText: string,
): Promise<{ data: ItineraryData; usedAI: boolean }> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  if (apiKey && apiKey.length > 10) {
    try {
      const data = await callOpenAIText(rawText, apiKey);
      return { data, usedAI: true };
    } catch (err) {
      console.warn("[itineraryAI] OpenAI gagal, fallback ke regex:", err);
    }
  }
  return { data: regexFallback(rawText), usedAI: false };
}

// ── Image OCR entry ────────────────────────────────────────────────────────

export async function extractItineraryFromImage(
  imageDataUrl: string,
): Promise<{ data: ItineraryData; usedAI: boolean }> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  if (!apiKey || apiKey.length <= 10) {
    throw new Error("VITE_OPENAI_API_KEY belum di-set. Upload gambar membutuhkan OpenAI API key.");
  }
  const data = await callOpenAIVision(imageDataUrl, apiKey);
  return { data, usedAI: true };
}
