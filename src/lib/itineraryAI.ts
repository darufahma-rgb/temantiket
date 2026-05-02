/**
 * itineraryAI — ekstrak data penerbangan dari raw text atau gambar
 * (Galileo PNR, Amadeus, Trip.com, email itinerary, screenshot tiket)
 * menjadi struktur JSON terstandarisasi.
 *
 * Strategi:
 * 1. parseGalileoDisplay(text)   → parser regex khusus Galileo display format
 * 2. extractItinerary(text)      → OpenAI text → regex fallback
 * 3. extractItineraryFromImage() → OpenAI Vision (wajib key)
 */

import { parseFlightText, KNOWN_AIRPORTS, KNOWN_AIRLINES } from "@/features/orders/flightParser";

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

// ── Galileo Display Parser ──────────────────────────────────────────────────
//
// Format Galileo availability/pricing display:
//
//   <seg#>  <AL>  <FLT#>  <class>  <DDMMM>  <ORIG>  <DEST>  <HHMMdep>  <HHMMarr>[#]  <DOW>  ...
//
// Contoh:
//   1  GF  70   N  03JUN  CAI  BAH  1715  2015   WE  32N  NCLIT3EG
//   2  GF  284  N  03JUN  BAH  GOI  2115  0340#  WE  32Q  NCLIT3EG
//   3  GF  285  O  03SEP  GOI  BAH  0440  0610   TH  32N  OCLIT3EG
//   4  GF  79   O  04SEP  BAH  CAI  0110  0430   FR  32N  OCLIT3EG
//
// Aturan journey:
//   - Setiap baris = 1 segmen penerbangan
//   - Setiap 2 baris berurutan = 1 arah perjalanan
//   - Baris 1-2 = Penerbangan Pergi  (origin = baris1.ORIG, dest = baris2.DEST, transit = baris1.DEST)
//   - Baris 3-4 = Penerbangan Pulang (origin = baris3.ORIG, dest = baris4.DEST, transit = baris3.DEST)
//   - '#' setelah waktu tiba = hari berikutnya

const GALILEO_ROW_RE =
  /^\s*(\d+)\s+([A-Z]{2})\s+(\d+)\s+([A-Z])\s+(\d{1,2}[A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{3})\s+(\d{4})\s+(\d{4})(#?)/;

const GALILEO_PRICE_RE = /TOTAL\s+AMOUNT\s+([\d.,]+)\s+([A-Z]{3})/i;

const MONTH_MAP: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function parseDDMMM(raw: string): string | undefined {
  const m = raw.toUpperCase().match(/^(\d{1,2})([A-Z]{3})$/);
  if (!m) return;
  const day = parseInt(m[1], 10);
  const mon = MONTH_MAP[m[2]];
  if (!mon) return;
  const year = new Date().getFullYear();
  // If month already passed this year, assume next year
  const now = new Date();
  const candidate = new Date(year, mon - 1, day);
  const actualYear = candidate < now && (now.getTime() - candidate.getTime()) > 30 * 24 * 3600 * 1000
    ? year + 1 : year;
  return `${actualYear}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function toHHMM(raw: string): string {
  return `${raw.slice(0, 2)}:${raw.slice(2)}`;
}

/**
 * Parse Galileo GDS display/pricing format.
 * Returns ItineraryData if ≥1 segment found, else null.
 */
export function parseGalileoDisplay(text: string): ItineraryData | null {
  const lines = text.split("\n");
  const segments: FlightLeg[] = [];
  let totalPrice: number | undefined;
  let priceCurrency: ItineraryData["priceCurrency"];

  for (const line of lines) {
    // Price line
    const priceM = line.match(GALILEO_PRICE_RE);
    if (priceM && !totalPrice) {
      const raw = priceM[1].replace(/,/g, ".");
      totalPrice = parseFloat(raw);
      const cur = priceM[2].toUpperCase();
      if (cur === "EGP" || cur === "IDR" || cur === "USD" || cur === "SAR") {
        priceCurrency = cur as ItineraryData["priceCurrency"];
      }
    }

    // Segment line
    const m = line.match(GALILEO_ROW_RE);
    if (!m) continue;

    const [, , airlineCode, flightNo, classCode, dateStr, origCode, destCode, depRaw, arrRaw, nextDayFlag] = m;

    const departDate = parseDDMMM(dateStr);
    const arriveDate = nextDayFlag === "#" && departDate ? addOneDay(departDate) : departDate;

    const leg: FlightLeg = {
      airline: KNOWN_AIRLINES[airlineCode] ?? airlineCode,
      flightNumber: `${airlineCode}${flightNo}`,
      fromCode: origCode,
      fromCity: KNOWN_AIRPORTS[origCode],
      toCode: destCode,
      toCity: KNOWN_AIRPORTS[destCode],
      departDate,
      departTime: toHHMM(depRaw),
      arriveDate,
      arriveTime: toHHMM(arrRaw),
      class: classCode,
    };

    segments.push(leg);
  }

  if (segments.length === 0) return null;

  return {
    legs: segments,
    totalPrice,
    priceCurrency,
    rawText: text,
  };
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
Parse raw input that may be: Galileo GDS display, Amadeus entries, Trip.com pages, airline e-ticket emails, or plain booking text.

Return ONLY valid JSON — no markdown fences, no explanation, no trailing text:
${BASE_SCHEMA}

CRITICAL RULES:
- Extract EVERY flight segment row as a separate leg in the array (NEVER merge multiple rows into one leg).
- Each row in Galileo = exactly 1 flight segment = 1 leg.

GALILEO DISPLAY FORMAT (space-separated airports):
  <seg#>  <AL>  <FLT#>  <class>  <DDMMM>  <ORIG>  <DEST>  <HHMMdep>  <HHMMarr>[#]  <DOW>  <seats>  <fareBasis>
  Example:
    1  GF  70   N  03JUN  CAI  BAH  1715  2015   WE  32N  NCLIT3EG
    2  GF  284  N  03JUN  BAH  GOI  2115  0340#  WE  32Q  NCLIT3EG
    3  GF  285  O  03SEP  GOI  BAH  0440  0610   TH  32N  OCLIT3EG
    4  GF  79   O  04SEP  BAH  CAI  0110  0430   FR  32N  OCLIT3EG
  → Row 1: GF70, CAI→BAH, dep 17:15, arr 20:15, 03JUN
  → Row 2: GF284, BAH→GOI, dep 21:15, arr 03:40 NEXT DAY (# means next day), 03JUN depart
  → Row 3: GF285, GOI→BAH, dep 04:40, arr 06:10, 03SEP
  → Row 4: GF79, BAH→CAI, dep 01:10, arr 04:30, 04SEP
  "#" after arrival time = arrives next day → increment arriveDate by 1 day.
  Journey pairing: rows 1-2 = outbound trip, rows 3-4 = return trip.

GALILEO PNR FORMAT (concatenated airports, older style):
  Example: "1 QR 978 Y 15MAR 4 CGKDOH HK1 2355 0430 16MAR"
  → flightNumber=QR978, fromCode=CGK, toCode=DOH, departTime=23:55, arriveTime=04:30

- Times are ALWAYS HH:MM 24-hour. "2355" → "23:55". "0340" → "03:40".
- Dates ALWAYS YYYY-MM-DD. "03JUN" → current or nearest future year.
- If arrival is next day (#), increment the arriveDate accordingly.
- flightNumber: combine airline code + number without space: "GF 70" → "GF70".
- duration: Indonesian format "Xj Ym". Convert "8h 35m" → "8j 35m".
- Set null for any field that is truly missing — never guess or hallucinate.
- legs must always be an array, even for a single flight.
- Extract price from "TOTAL AMOUNT XXXXX.XX EGP" or similar lines.`;

const IMAGE_SYSTEM_PROMPT = `You are a precision OCR and flight data extractor. Analyze this screenshot of a flight ticket, booking confirmation, Galileo GDS display, or itinerary page.

Extract ALL flight segments visible in the image and return ONLY valid JSON:
${BASE_SCHEMA}

CRITICAL RULES:
- Read every text visible in the image carefully — airline name, flight number, airports, dates, times.
- Each row/line in a Galileo display = exactly 1 flight segment = 1 leg. Do NOT merge rows.
- Times are ALWAYS HH:MM 24-hour format.
- Dates ALWAYS YYYY-MM-DD.
- If arrival is on the next day (indicated by "#" or "+1" or a different date), increment arriveDate.
- flightNumber: no space between airline code and number (GF70 not GF 70).
- Extract ALL legs/segments — if the image shows multiple flights (4 rows = 4 legs), include all 4.
- For Galileo display: each row has format: seg# | airline | flt# | class | date | origin | dest | depTime | arrTime[#] | DOW | ...
- "#" after arrival time = next day arrival.
- Set null only for genuinely missing fields — never guess.
- Return ONLY the JSON, nothing else.`;

// ── OpenAI Text caller (via server proxy) ──────────────────────────────────

async function callOpenAIText(text: string): Promise<ItineraryData> {
  const resp = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

// ── OpenAI Vision caller (via server proxy) ────────────────────────────────

async function callOpenAIVision(imageDataUrl: string): Promise<ItineraryData> {
  const resp = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
            { type: "text", text: "Extract all flight data from this screenshot and return the JSON. Each row = 1 leg." },
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
    // Enrich city names from KNOWN_AIRPORTS if missing
    if (clean.fromCode && !clean.fromCity && KNOWN_AIRPORTS[clean.fromCode]) {
      clean.fromCity = KNOWN_AIRPORTS[clean.fromCode];
    }
    if (clean.toCode && !clean.toCity && KNOWN_AIRPORTS[clean.toCode]) {
      clean.toCity = KNOWN_AIRPORTS[clean.toCode];
    }
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

// ── Journey grouping ───────────────────────────────────────────────────────
//
// Aturan: setiap 2 leg berurutan = 1 arah perjalanan (outbound/return).
// Transit antar leg dalam 1 arah: waktu antara tiba & berangkat < 24 jam.
// Jika jarak antara leg[i] dan leg[i+1] > 24 jam → pisah journey baru.

const TRANSIT_MAX_HOURS = 24; // lebih dari ini = jeda antar journey, bukan transit

function isConnectingFlight(prev: FlightLeg, next: FlightLeg): boolean {
  const mins = calcTransitMinutes(prev, next);
  if (mins === null) {
    // Tidak ada info waktu — anggap connecting jika airport cocok
    return prev.toCode === next.fromCode;
  }
  return mins >= 0 && mins <= TRANSIT_MAX_HOURS * 60;
}

/**
 * Kelompokkan legs menjadi journey (perjalanan arah).
 * Return array of journey, dimana setiap journey = array legs.
 */
export function groupLegsIntoJourneys(legs: FlightLeg[]): FlightLeg[][] {
  if (legs.length === 0) return [];
  const journeys: FlightLeg[][] = [];
  let current: FlightLeg[] = [legs[0]];

  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1];
    const curr = legs[i];
    if (isConnectingFlight(prev, curr)) {
      current.push(curr);
    } else {
      journeys.push(current);
      current = [curr];
    }
  }
  journeys.push(current);
  return journeys;
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
  BAH: "Bandara Bahrain relatif kompak — transit biasanya 30 menit cukup",
  KUL: "Transit KLIA: gunakan Aerotrain ke Terminal 2 jika perlu",
  SIN: "Transit Changi: cek gate di papan display, antar terminal pakai Skytrain",
  AMM: "Transit Amman (Queen Alia): ikuti sign Transfer, check gate di board",
  DXB2: "Bandara Dubai sangat besar — transit butuh waktu ~45 menit ke gate",
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
    if (transitMin !== null && transitMin <= TRANSIT_MAX_HOURS * 60) {
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

// ── WhatsApp text builder ──────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

const JOURNEY_LABELS = ["PERGI", "PULANG", "TRANSIT", "LEG 4"];

export function buildWhatsAppText(data: ItineraryData, egpRate: number): string {
  const lines: string[] = [];

  lines.push("*ITINERARY PENERBANGAN*");
  lines.push("_Generated by Temantiket — Cepat, Mudah, Amanah_");
  lines.push("");

  if (data.pnr) lines.push(`Kode Booking : *${data.pnr}*`);
  if (data.passengerName) lines.push(`Penumpang    : *${data.passengerName}*`);

  // ── Journey grouping ──
  const journeys = groupLegsIntoJourneys(data.legs);
  const isRoundTrip = journeys.length >= 2;

  if (journeys.length > 0) {
    const firstLeg = journeys[0][0];
    const lastJourney = journeys[journeys.length - 1];
    const lastLeg = lastJourney[lastJourney.length - 1];

    if (isRoundTrip) {
      // For round trip: show departure origin → final destination
      const outOrigin = firstLeg.fromCode ?? "—";
      const outDest = journeys[0][journeys[0].length - 1].toCode ?? "—";
      lines.push(`Rute         : *${outOrigin} ⇄ ${outDest}* (Pulang-Pergi)`);
    } else {
      const routeCodes = data.legs.map((l, i) => (i === 0 ? l.fromCode : l.toCode)).filter(Boolean).join(" → ");
      lines.push(`Rute         : *${routeCodes}*`);
    }

    if (firstLeg.departDate) {
      const returnDate = lastLeg.arriveDate ?? lastLeg.departDate;
      lines.push(`Tanggal      : ${fmtDate(firstLeg.departDate)}${returnDate && returnDate !== firstLeg.departDate ? ` s/d ${fmtDate(returnDate)}` : ""}`);
    }
  }

  // ── Per-journey sections ──
  journeys.forEach((journeyLegs, journeyIdx) => {
    const journeyLabel = journeys.length > 1
      ? JOURNEY_LABELS[journeyIdx] ?? `LEG ${journeyIdx + 1}`
      : null;

    lines.push("");
    lines.push(`══════════════════════`);
    if (journeyLabel) {
      const jFirst = journeyLegs[0];
      const jLast = journeyLegs[journeyLegs.length - 1];
      const routeStr = journeyLegs.length > 1
        ? `${jFirst.fromCode ?? "—"} → ${jLast.toCode ?? "—"} via ${journeyLegs.slice(0, -1).map(l => l.toCode).filter(Boolean).join(", ")}`
        : `${jFirst.fromCode ?? "—"} → ${jLast.toCode ?? "—"}`;
      lines.push(`*✈ PENERBANGAN ${journeyLabel}*`);
      lines.push(`_${routeStr}_`);
    }

    journeyLegs.forEach((leg, legIdx) => {
      const segLabel = journeyLegs.length > 1 ? `SEGMEN ${legIdx + 1}` : "PENERBANGAN";
      lines.push("");
      lines.push(`*${segLabel}${leg.flightNumber ? ` · ${leg.flightNumber}` : ""}*`);

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

      // Transit info (only within same journey, not between journeys)
      if (legIdx < journeyLegs.length - 1) {
        const next = journeyLegs[legIdx + 1];
        const transitMin = calcTransitMinutes(leg, next);
        const city = leg.toCity ?? leg.toCode ?? "";
        lines.push("");
        if (transitMin !== null) {
          lines.push(`*[TRANSIT ${city.toUpperCase()} — ${fmtMinutes(transitMin)}]*`);
        } else if (city) {
          lines.push(`*[TRANSIT ${city.toUpperCase()}]*`);
        }
      }
    });
  });

  if (data.totalPrice && data.totalPrice > 0) {
    lines.push("");
    lines.push(`══════════════════════`);
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
    lines.push(`══════════════════════`);
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
  // 1. Try Galileo display parser first (fastest, no API needed)
  const galileo = parseGalileoDisplay(rawText);
  if (galileo && galileo.legs.length > 0) {
    console.info(`[itineraryAI] Galileo parser: ${galileo.legs.length} segmen ditemukan`);
    return { data: galileo, usedAI: false };
  }

  // 2. Try AI (GPT-4o-mini)
  try {
    const data = await callOpenAIText(rawText);
    return { data, usedAI: true };
  } catch (err) {
    console.warn("[itineraryAI] OpenAI gagal, fallback ke regex:", err);
  }

  // 3. Regex fallback
  return { data: regexFallback(rawText), usedAI: false };
}

// ── Image OCR entry ────────────────────────────────────────────────────────

export async function extractItineraryFromImage(
  imageDataUrl: string,
): Promise<{ data: ItineraryData; usedAI: boolean }> {
  const data = await callOpenAIVision(imageDataUrl);
  return { data, usedAI: true };
}
