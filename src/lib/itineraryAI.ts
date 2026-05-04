/**
 * itineraryAI — ekstrak data penerbangan dari raw text atau gambar
 * (Galileo PNR, Amadeus, Trip.com, email itinerary, screenshot tiket)
 * menjadi struktur JSON terstandarisasi.
 *
 * Strategi:
 * 1. parseGalileoPNR(text)       → parser regex untuk Galileo booking confirmation (RLOC/GFAX)
 * 2. parseGalileoDisplay(text)   → parser regex untuk Galileo availability/pricing display
 * 3. extractItinerary(text)      → OpenAI text → regex fallback
 * 4. extractItineraryFromImage() → OpenAI Vision (wajib key)
 */

import { parseFlightText, KNOWN_AIRPORTS, KNOWN_AIRLINES } from "@/features/orders/flightParser";
import { getAIHeaders } from "@/lib/aiFetch";

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
  baggage?: string;
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

// ── Galileo PNR / Booking Confirmation Parser ──────────────────────────────
//
// Format setelah booking dikonfirmasi (RLOC/GFAX):
//
//   RECORD LOCATOR: ABC123   atau   RLOC ABC123   atau   RLOC: ABC123
//
//   1.1SMITH/JOHN MR
//   2.1JONES/JANE MRS
//
//    1 GF  70N 03JUN 3 CAIBAH HK1  1715 2015         E  1
//    2 GF 284N 03JUN 3 BAHGOI HK1  2115 0340+1       E  1
//    3 GF 285O 03SEP 4 GOIBAH HK1  0440 0610         E  1
//    4 GF  79O 04SEP 5 BAHCAI HK1  0110 0430         E  1
//
// Variasi format yang didukung:
//   A. Class menempel ke flight# (70N), airports 6-char concatenated (CAIBAH):
//      <seg#> <AL> <FLT#><class> <DDMMM> <DOW> <ORIGDEST6> <status><seats> <dep4> <arr4>[+1]
//   B. Class terpisah, airports 6-char concatenated, next-day via tanggal kedua:
//      <seg#> <AL> <FLT#> <class> <DDMMM> <DOW> <ORIGDEST6> <status><seats> <dep4> <arr4> [<DDMMM>]
//   C. Amadeus-style (mirip Galileo B):
//      <seg#> <AL> <FLT#> <class> <DDMMM> <DOW> <ORIGDEST6> <status> <dep4> <arr4>[+1]

// PNR: class nempel ke flight# + airports concatenated 6-char + +1 / tanggal arr
const PNR_SEG_A =
  /^\s*(\d+)\s+([A-Z]{2})\s{1,4}(\d{1,4})([A-Z])\s+(\d{1,2}[A-Z]{3})\s+\d\s+([A-Z]{3})([A-Z]{3})\s+[A-Z]{2,3}\d+\s+(\d{4})\s+(\d{4})(\+1)?/;

// PNR/Amadeus: class terpisah + airports concatenated + next-day lewat tanggal
const PNR_SEG_B =
  /^\s*(\d+)\s+([A-Z]{2})\s+(\d{1,4})\s+([A-Z])\s+(\d{1,2}[A-Z]{3})\s+\d\s+([A-Z]{3})([A-Z]{3})\s+[A-Z]{2,3}\d+\s+(\d{4})\s+(\d{4})(?:\s+(\d{1,2}[A-Z]{3}))?/;

// PNR variant C: "1 . GF 70 N 03JUN CAIBAH HK1 1715 #0340 O*"
//   - Line number followed by " . " (space-dot-space)
//   - Class is separate (not glued to flight#)
//   - NO day-of-week digit before 6-char route
//   - Next-day flag "#" is a PREFIX before arrival time (e.g. #0340)
const PNR_SEG_C =
  /^\s*(\d+)\s+\.\s+([A-Z]{2})\s+(\d{1,4})\s+([A-Z])\s+(\d{1,2}[A-Z]{3})\s+([A-Z]{3})([A-Z]{3})\s+[A-Z]{2,3}\d+\s+(\d{4})\s+(#?)(\d{4})/;

// RLOC patterns
const RLOC_RE = /(?:RLOC|RECORD\s+LOCATOR|PNR|LOCATOR)\s*[:\-]?\s*([A-Z0-9]{5,8})/i;
// Fallback: standalone 6-char alphanum line (Galileo RLOC style)
const RLOC_STANDALONE_RE = /^\s*([A-Z]{1,2}[A-Z0-9]{4,5})\s*$/;

// Passenger name patterns
// "1.1SMITH/JOHN MR"  "2.1JONES/JANE MRS"  "1SMITH/JOHNMR"
const PAX_LINE_RE = /^\s*\d+[\.\-]\d+\s*([A-Z]{2,30})\/([A-Z][A-Z\s]{1,28}?)(?:\s+(?:MR|MRS|MS|MISS|MSTR|CHD|INF|JR|SR)\.?)?\s*$/;
const PAX_NAME_RE = /\b(?:NAME|PENUMPANG|PASSENGER)\s*[:\-]\s*([A-Z]{2,30}\/[A-Z][A-Z\s]{1,28})/i;

function parsePNRPassengers(lines: string[]): string | undefined {
  const names: string[] = [];
  for (const line of lines) {
    const m = line.match(PAX_LINE_RE);
    if (m) {
      // "SMITH/JOHN" → "JOHN SMITH"
      const last = m[1].trim();
      const first = m[2].trim().split(/\s+/)[0];
      names.push(`${first} ${last}`);
    }
  }
  if (names.length > 0) return names.join(", ");
  // Fallback: NAME: label
  const fullText = lines.join("\n");
  const nm = fullText.match(PAX_NAME_RE);
  if (nm) {
    const parts = nm[1].split("/");
    if (parts.length >= 2) return `${parts[1].trim().split(/\s+/)[0]} ${parts[0].trim()}`;
    return nm[1].trim();
  }
  return undefined;
}

function parsePNRRLOC(lines: string[]): string | undefined {
  for (const line of lines) {
    const m = line.match(RLOC_RE);
    if (m) return m[1].toUpperCase();
  }
  // Standalone: look for isolated 6-char alphanumeric line (typical Galileo RLOC)
  for (const line of lines) {
    const m = line.match(RLOC_STANDALONE_RE);
    if (m && /[A-Z]/.test(m[1]) && /[0-9]/.test(m[1])) {
      return m[1].toUpperCase();
    }
  }
  return undefined;
}

/**
 * Try to parse a single segment line with PNR_SEG_A (class glued to flt#).
 * Returns FlightLeg or null.
 */
function tryPNRSegA(line: string): FlightLeg | null {
  const m = line.match(PNR_SEG_A);
  if (!m) return null;
  const [, , airlineCode, flightNo, classCode, dateStr, origCode, destCode, depRaw, arrRaw, nextDay] = m;
  const departDate = parseDDMMM(dateStr);
  const arriveDate = nextDay === "+1" && departDate ? addOneDay(departDate) : departDate;
  return {
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
}

/**
 * Try to parse a single segment line with PNR_SEG_B (class separate, optional arr-date).
 * Returns FlightLeg or null.
 */
function tryPNRSegB(line: string): FlightLeg | null {
  const m = line.match(PNR_SEG_B);
  if (!m) return null;
  const [, , airlineCode, flightNo, classCode, dateStr, origCode, destCode, depRaw, arrRaw, arrDateStr] = m;
  const departDate = parseDDMMM(dateStr);
  const arriveDate = arrDateStr ? parseDDMMM(arrDateStr) : departDate;
  return {
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
}

/**
 * Try to parse variant C: "1 . GF 70 N 03JUN CAIBAH HK1 1715 #0340 O*"
 * — dot after line number, class separate, no DOW digit, "#" prefix for next-day arrival.
 */
function tryPNRSegC(line: string): FlightLeg | null {
  const m = line.match(PNR_SEG_C);
  if (!m) return null;
  const [, , airlineCode, flightNo, classCode, dateStr, origCode, destCode, depRaw, nextDayPrefix, arrRaw] = m;
  const departDate = parseDDMMM(dateStr);
  const arriveDate = nextDayPrefix === "#" && departDate ? addOneDay(departDate) : departDate;
  return {
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
}

/**
 * Parse Galileo PNR / booking confirmation format (RLOC/GFAX).
 * Handles concatenated airports (CAIBAH), class glued to flt# (70N), and +1/date next-day.
 * Returns ItineraryData if ≥1 segment found, else null.
 */
export function parseGalileoPNR(text: string): ItineraryData | null {
  const lines = text.split("\n");
  const segments: FlightLeg[] = [];

  for (const line of lines) {
    // Try format A (class glued), then B (class separate + DOW), then C (dot prefix + # next-day)
    const leg = tryPNRSegA(line) ?? tryPNRSegB(line) ?? tryPNRSegC(line);
    if (leg) segments.push(leg);
  }

  if (segments.length === 0) return null;

  const pnr = parsePNRRLOC(lines);
  const passengerName = parsePNRPassengers(lines);

  // Price extraction (rare in PNR but handle "TOTAL AMOUNT" if present)
  let totalPrice: number | undefined;
  let priceCurrency: ItineraryData["priceCurrency"];
  for (const line of lines) {
    const pm = line.match(GALILEO_PRICE_RE);
    if (pm && !totalPrice) {
      totalPrice = parseFloat(pm[1].replace(/,/g, "."));
      const cur = pm[2].toUpperCase();
      if (cur === "EGP" || cur === "IDR" || cur === "USD" || cur === "SAR") {
        priceCurrency = cur as ItineraryData["priceCurrency"];
      }
    }
  }

  return { pnr, passengerName, legs: segments, totalPrice, priceCurrency, rawText: text };
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

GALILEO PNR BOOKING CONFIRMATION (airports concatenated 6-char, class glued to flt# or separate):
  Format A — class glued to flight#, +1 for next day:
    <seg#> <AL> <FLT#><class> <DDMMM> <DOW> <ORIGDEST6> <status><seats> <dep4> <arr4>[+1]
    Example:
       1 GF  70N 03JUN 3 CAIBAH HK1  1715 2015         E  1
       2 GF 284N 03JUN 3 BAHGOI HK1  2115 0340+1       E  1
       3 GF 285O 03SEP 4 GOIBAH HK1  0440 0610         E  1
       4 GF  79O 04SEP 5 BAHCAI HK1  0110 0430         E  1
    → Seg 1: GF70, CAI→BAH (CAIBAH split at middle), dep 17:15, arr 20:15
    → Seg 2: GF284, BAH→GOI, dep 21:15, arr 03:40 NEXT DAY (+1)
  Format B — class separate, second date for next-day arrival:
    Example: "1 QR 978 Y 15MAR 4 CGKDOH HK1 2355 0430 16MAR"
    → flightNumber=QR978, fromCode=CGK, toCode=DOH, departTime=23:55, arriveTime=04:30, arriveDate=16MAR
  RLOC/Record Locator appears as: "RLOC: ABC123" or "RECORD LOCATOR: ABC123" or standalone "ABC123"
  Passenger appears as: "1.1SMITH/JOHN MR" or "NAME: SMITH/JOHN MR" → passengerName="JOHN SMITH"

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
    headers: await getAIHeaders(),
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
    headers: await getAIHeaders(),
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
  const hasTimeData = !!(prev.arriveDate && prev.arriveTime && next.departDate && next.departTime);
  const mins = calcTransitMinutes(prev, next);
  if (mins === null) {
    // Jika ada data waktu tapi null → gap > 24j → bukan transit, ini journey baru
    if (hasTimeData) return false;
    // Tidak ada data waktu sama sekali → pakai kecocokan airport code
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

function fmtDateLong(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

function fmtMonthOnly(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(iso + "T00:00:00"));
  } catch { return ""; }
}

function fmtTime(t?: string | null): string {
  if (!t) return "—";
  return t.replace(":", ".");
}

function fmtCityCode(city?: string | null, code?: string | null, terminal?: string | null): string {
  const t = terminal ? ` ${/^T\d/.test(terminal) ? terminal : "T" + terminal}` : "";
  if (city && code) return `${city} (${code}${t})`;
  if (code) return `${code}${t}`;
  return city ?? "—";
}

function fmtPrice(amount: number, currency: string): string {
  if (currency === "IDR") {
    return "Rp " + amount.toLocaleString("id-ID");
  }
  return `${currency} ${amount.toLocaleString("id-ID")}`;
}

export function buildWhatsAppText(data: ItineraryData, egpRate: number): string {
  const lines: string[] = [];

  const journeys = groupLegsIntoJourneys(data.legs);
  const isRoundTrip = journeys.length >= 2;
  const firstLeg = data.legs[0];
  const lastFirstJourney = journeys[0]?.[journeys[0].length - 1];

  // ── Dynamic title ──
  const fromCode = firstLeg?.fromCode ?? "";
  const toCode   = lastFirstJourney?.toCode ?? "";
  const bulan    = fmtMonthOnly(firstLeg?.departDate);
  const returnStr = isRoundTrip ? " Return" : "";
  lines.push(`Tiket Pesawat ${fromCode} - ${toCode}${returnStr} ${bulan}`.trim());
  lines.push("by Temantiket");
  lines.push("");

  // ── Per-journey blocks ──
  journeys.forEach((journeyLegs, journeyIdx) => {
    if (journeyIdx > 0) lines.push("");

    const first = journeyLegs[0];
    const last  = journeyLegs[journeyLegs.length - 1];

    // Departure date header
    const depDateStr = fmtDateLong(first.departDate);
    if (depDateStr) lines.push(depDateStr);

    // Berangkat line
    const depCity = fmtCityCode(first.fromCity, first.fromCode, first.terminal);
    lines.push(`Berangkat : ${fmtTime(first.departTime)} — Berangkat dari ${depCity} — ${first.flightNumber ?? ""}`);

    // Transit lines
    for (let i = 0; i < journeyLegs.length - 1; i++) {
      const leg     = journeyLegs[i];
      const nextLeg = journeyLegs[i + 1];
      const transitCity = leg.toCity ?? leg.toCode ?? "";
      const transitMin  = calcTransitMinutes(leg, nextLeg);
      const durStr = transitMin !== null ? ` — ${fmtMinutes(transitMin)}` : "";
      lines.push(`Transit : ${transitCity}${durStr} (tanpa ambil bagasi & check-in ulang)`);
    }

    // Arrival date header (new line only if date changes)
    const arrDate = last.arriveDate ?? last.departDate;
    const needsArrDateLine = arrDate && arrDate !== first.departDate;
    if (needsArrDateLine) {
      lines.push("");
      lines.push(fmtDateLong(arrDate));
    }

    // Landing line
    const arrCity   = fmtCityCode(last.toCity, last.toCode, null);
    const arrFlight = journeyLegs.length > 1 ? last.flightNumber : first.flightNumber;
    lines.push(`Landing : ${fmtTime(last.arriveTime)} — Tiba di ${arrCity} — ${arrFlight ?? ""}`);
  });

  // ── Bagasi & Harga ──
  lines.push("");
  lines.push(`Bagasi : ${data.baggage ?? ""}`);

  const currency = data.priceCurrency ?? "IDR";
  if (data.totalPrice && data.totalPrice > 0) {
    lines.push(`Harga : ${fmtPrice(data.totalPrice, currency)}`);
  } else {
    lines.push(`Harga : `);
  }

  lines.push("");
  lines.push("_by Temantiket_");

  return lines.join("\n");
}

// ── Main entry (text) ──────────────────────────────────────────────────────

export async function extractItinerary(
  rawText: string,
): Promise<{ data: ItineraryData; usedAI: boolean }> {
  // 1. Try Galileo PNR booking confirmation parser (RLOC/GFAX — concatenated airports)
  const pnrResult = parseGalileoPNR(rawText);
  if (pnrResult && pnrResult.legs.length > 0) {
    console.info(`[itineraryAI] Galileo PNR parser: ${pnrResult.legs.length} segmen, PNR=${pnrResult.pnr ?? "—"}, pax=${pnrResult.passengerName ?? "—"}`);
    return { data: pnrResult, usedAI: false };
  }

  // 2. Try Galileo display/pricing parser (space-separated airports)
  const displayResult = parseGalileoDisplay(rawText);
  if (displayResult && displayResult.legs.length > 0) {
    console.info(`[itineraryAI] Galileo display parser: ${displayResult.legs.length} segmen ditemukan`);
    return { data: displayResult, usedAI: false };
  }

  // 3. Try AI (GPT-4o-mini)
  try {
    const data = await callOpenAIText(rawText);
    return { data, usedAI: true };
  } catch (err) {
    console.warn("[itineraryAI] OpenAI gagal, fallback ke regex:", err);
  }

  // 4. Regex fallback
  return { data: regexFallback(rawText), usedAI: false };
}

// ── Image OCR entry ────────────────────────────────────────────────────────

export async function extractItineraryFromImage(
  imageDataUrl: string,
): Promise<{ data: ItineraryData; usedAI: boolean }> {
  const data = await callOpenAIVision(imageDataUrl);
  return { data, usedAI: true };
}
