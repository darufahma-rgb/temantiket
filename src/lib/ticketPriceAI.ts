/**
 * ticketPriceAI — ekstrak daftar harga tiket dari screenshot menggunakan
 * OpenAI gpt-4o-mini Vision API, atau dari text Galileo GDS tanpa AI.
 *
 * Fase 19.5: Global Universal Transit & Multi-Leg Recognition
 *   - Dynamic transit detection: arrival[n] == departure[n+1] → merge into single leg
 *   - Universal round-trip grouping: significant gap between groups → Return Trip
 *   - Flexible route display: [Origin] ↔ [Final Destination] (via [Transit])
 *   - Single price point: markup applied once per booking regardless of transit count
 *   - Multi-leg support: N transits (CAI-BAH-MCT-CGK etc.)
 *
 * Fase 20: Galileo Text Parser (no AI needed)
 *   - parseGalileoTextToTickets(text) — parses Galileo display or PNR text → ParsedTicketPrice[]
 *   - Reuses parseGalileoDisplay + parseGalileoPNR from itineraryAI.ts
 */
import { parseGalileoDisplay, parseGalileoPNR, type ItineraryData } from "@/lib/itineraryAI";
import { callAI } from "@/lib/aiFetch";

export type TripType = "one_way" | "return" | "multi_city";

// ── Fase 19.5: Multi-leg data structures ─────────────────────────────────────

export interface LegInfo {
  fromCode: string;
  toCode: string;
  fromCity?: string | null;
  toCity?: string | null;
  flightNumber?: string | null;
  etd?: string | null;
  eta?: string | null;
  date?: string | null;
}

export interface MultiLegData {
  v: 1;
  outboundLegs: LegInfo[];          // full outbound chain e.g. [CAI→BAH, BAH→GOI]
  returnLegs?: LegInfo[];           // full return chain e.g. [GOI→BAH, BAH→CAI]
  transitCodes: string[];           // intermediate airports outbound e.g. ["BAH"]
  returnTransitCodes?: string[];    // intermediate airports return e.g. ["BAH"]
  returnDate?: string | null;       // first return leg departure date
}

const ML_PREFIX = "__ML__:";

export function encodeMultiLeg(ml: MultiLegData, userNotes?: string): string {
  const base = `${ML_PREFIX}${JSON.stringify(ml)}`;
  return userNotes ? `${base}\n${userNotes}` : base;
}

export function decodeMultiLeg(notes: string | null): { ml: MultiLegData | null; userNotes: string | null } {
  if (!notes?.startsWith(ML_PREFIX)) return { ml: null, userNotes: notes };
  try {
    const rest = notes.slice(ML_PREFIX.length);
    const newlineIdx = rest.indexOf("\n");
    const jsonStr = newlineIdx >= 0 ? rest.slice(0, newlineIdx) : rest;
    const userNotes = newlineIdx >= 0 ? rest.slice(newlineIdx + 1) || null : null;
    const ml = JSON.parse(jsonStr) as MultiLegData;
    return { ml, userNotes };
  } catch {
    return { ml: null, userNotes: notes };
  }
}

export function isMultiLegNotes(notes: string | null): boolean {
  return !!notes?.startsWith(ML_PREFIX);
}

/** Build human-readable route string: "CAI ↔ GOI (via BAH)" or "CAI ↔ GOI (via BAH, MCT)" */
export function buildRouteLabel(ml: MultiLegData): string {
  const origin = ml.outboundLegs[0]?.fromCode ?? "???";
  const dest   = ml.outboundLegs[ml.outboundLegs.length - 1]?.toCode ?? "???";
  const vias   = ml.transitCodes.join(", ");
  const hasReturn = (ml.returnLegs?.length ?? 0) > 0;
  return `${origin} ${hasReturn ? "↔" : "→"} ${dest}${vias ? ` (via ${vias})` : ""}`;
}

// ── ParsedTicketPrice ─────────────────────────────────────────────────────────

export interface ParsedTicketPrice {
  airline: string;
  airlineCode: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  departDate: string | null;
  basePrice: number | null;
  currency: "IDR" | "EGP" | "USD" | "SAR";
  tripType: TripType;
  flightNumber: string | null;
  etd: string | null;
  eta: string | null;
  terminal: string | null;
  transitCode: string | null;
  transitCity: string | null;
  transitDuration: string | null;
  // Return leg (null for one_way)
  returnFromCode: string | null;
  returnToCode: string | null;
  returnFromCity: string | null;
  returnToCity: string | null;
  returnDate: string | null;
  returnFlightNumber: string | null;
  returnEtd: string | null;
  returnEta: string | null;
  returnTransitCode: string | null;
  returnTransitCity: string | null;
  returnTransitDuration: string | null;
  // Fase 19.5: multi-leg payload (populated by mergeTransitChains)
  multiLeg?: MultiLegData;
  // Confidence & warnings (populated by normalizeTicket)
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}

// ── Image helpers ─────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal baca file gambar."));
    reader.readAsDataURL(file);
  });
}

async function compressImage(dataUrl: string, maxEdge = 1800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.90));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a flight ticket data extractor for an Indonesian travel agency (Temantiket).

════════════════════════════════════════════════════════════
 RULE 0 — GALILEO GDS FORMAT: ONE TICKET ENTRY PER ROW
════════════════════════════════════════════════════════════
When you see numbered flight segment rows (e.g. "1 GF 70 N 03JUN CAI BAH 1715 2015"):
  • Return EXACTLY ONE ticket entry per numbered row.
  • Set tripType = "one_way" for each row.
  • fromCode = origin of THAT row. toCode = destination of THAT row (not the final destination of the whole trip).
  • flightNumber = ONLY the flight of that row (e.g. "GF70", never "GF70/GF284").
  • ALL rows in the same block share the same basePrice = TOTAL AMOUNT of that block.
  • DO NOT merge rows. DO NOT detect return trips. Our backend handles all grouping.

GALILEO EXAMPLE — 4 rows → return 4 separate one_way entries:
  1 GF  70  N  03JUN  CAI  BAH  1715  2015  WE
  2 GF 284  N  03JUN  BAH  GOI  2115  0340# WE
  3 GF 285  O  03SEP  GOI  BAH  0440  0610  TH
  4 GF  79  O  04SEP  BAH  CAI  0110  0430  FR
  TOTAL AMOUNT 29283.80 EGP

→ Return 4 ticket objects:
  { fromCode:"CAI", toCode:"BAH", flightNumber:"GF70",  etd:"17:15", eta:"20:15", departDate:"YYYY-06-03", basePrice:29283.80, currency:"EGP", tripType:"one_way", ... all return* fields: null }
  { fromCode:"BAH", toCode:"GOI", flightNumber:"GF284", etd:"21:15", eta:"03:40", departDate:"YYYY-06-03", basePrice:29283.80, currency:"EGP", tripType:"one_way", ... all return* fields: null }
  { fromCode:"GOI", toCode:"BAH", flightNumber:"GF285", etd:"04:40", eta:"06:10", departDate:"YYYY-09-03", basePrice:29283.80, currency:"EGP", tripType:"one_way", ... all return* fields: null }
  { fromCode:"BAH", toCode:"CAI", flightNumber:"GF79",  etd:"01:10", eta:"04:30", departDate:"YYYY-09-04", basePrice:29283.80, currency:"EGP", tripType:"one_way", ... all return* fields: null }

NOTE on next-day arrival: the "#" or "+1" suffix means the ARRIVAL is next day. The departDate is still the row's departure date. The eta time value does NOT include "#".
NOTE: "YYYY" = current year unless month already passed (then next year).

════════════════════════════════════════════════════════════
 RULE 1 — MORE N BLOCKS (Galileo multi-option)
════════════════════════════════════════════════════════════
If the screen shows "MORE 1", "MORE 2" etc., each MORE N block is a separate pricing option.
All segment rows under MORE 1 share that block's TOTAL AMOUNT.
All segment rows under MORE 2 share their TOTAL AMOUNT.
Return all segments from ALL MORE blocks as individual one_way entries.

════════════════════════════════════════════════════════════
 RULE 2 — NON-GALILEO SCREENSHOTS (booking sites, WhatsApp, Traveloka, airline)
════════════════════════════════════════════════════════════
For non-GDS screenshots that show complete trips (NOT individual numbered rows):
  • One ticket entry per complete trip / booking option.
  • If it's a round trip (clearly shows outbound + return), set tripType="return" and fill returnFrom/To/Date/Flight fields.
  • If it shows transit (A→B→C), set fromCode=A, toCode=C, transitCode=B, flightNumber=flight1/flight2.
  • tripType="one_way" for one-direction bookings.

════════════════════════════════════════════════════════════
 OUTPUT FORMAT
════════════════════════════════════════════════════════════
Return ONLY valid JSON {"tickets":[...]} — no markdown, no explanation.

Each ticket object (use null for unknown/not-applicable fields):
{
  "airline": "full name e.g. Gulf Air",
  "airlineCode": "2-letter IATA e.g. GF",
  "fromCode": "IATA 3-letter origin",
  "fromCity": "origin city name",
  "toCode": "IATA 3-letter destination",
  "toCity": "destination city name",
  "departDate": "YYYY-MM-DD or null",
  "basePrice": number or null,
  "currency": "IDR or EGP or USD or SAR",
  "tripType": "one_way or return",
  "flightNumber": "e.g. GF70 (single for Galileo rows) or GF70/GF284 (merged for non-Galileo), null if unknown",
  "etd": "HH:MM 24h departure time or null",
  "eta": "HH:MM 24h arrival time (no # suffix) or null",
  "terminal": null,
  "transitCode": "IATA transit airport or null",
  "transitCity": "transit city or null",
  "transitDuration": "e.g. 2h 30m or null",
  "returnFromCode": "return origin IATA or null",
  "returnToCode": "return destination IATA or null",
  "returnFromCity": "return origin city or null",
  "returnToCity": "return destination city or null",
  "returnDate": "YYYY-MM-DD or null",
  "returnFlightNumber": "return flight(s) or null",
  "returnEtd": "HH:MM or null",
  "returnEta": "HH:MM or null",
  "returnTransitCode": "return transit IATA or null",
  "returnTransitCity": "return transit city or null",
  "returnTransitDuration": "return layover duration or null"
}

AIRPORT CODES: CGK=Jakarta, SUB=Surabaya, JED=Jeddah, MED=Madinah, RUH=Riyadh, CAI=Cairo, DOH=Doha, DXB=Dubai, AUH=Abu Dhabi, KUL=Kuala Lumpur, SIN=Singapore, IST=Istanbul, KWI=Kuwait, MCT=Muscat, BAH=Bahrain, AMM=Amman, BKK=Bangkok, KNO=Medan, GOI=Goa (India).
AIRLINE CODES: QR=Qatar Airways, SV=Saudia, EK=Emirates, GA=Garuda, SQ=Singapore Airlines, EY=Etihad, TK=Turkish, MS=EgyptAir, AI=Air India, KU=Kuwait Airways, WY=Oman Air, GF=Gulf Air, MH=Malaysia Airlines, CX=Cathay Pacific.
CURRENCY: Rp/IDR=IDR, EGP/£E/جنيه=EGP, $=USD, SAR/SR/ريال=SAR. Default IDR if unclear.
Return {"tickets":[]} if no clear flight data found.`;

// ── OpenAI Vision call ────────────────────────────────────────────────────────

async function callOpenAIVision(dataUrl: string): Promise<ParsedTicketPrice[]> {
  const resp = await callAI({
    model: "openai/gpt-4.1-nano",
    temperature: 0.05,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract ALL flight ticket data. IMPORTANT: If rows share the same Total Amount AND the arrival airport of one row equals the departure airport of the next row, merge them into ONE ticket with transit. fromCode = first origin, toCode = FINAL destination (not the transit). Return JSON with 'tickets' array.",
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  }, { timeoutMs: 90_000 });

  const json = await resp.json() as { choices: { message: { content: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: { tickets?: ParsedTicketPrice[] } | ParsedTicketPrice[];
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("OpenAI mengembalikan format JSON yang tidak valid.");
  }

  const tickets = Array.isArray(parsed)
    ? parsed
    : ((parsed as { tickets?: ParsedTicketPrice[] }).tickets ?? []);

  return tickets.map(normalizeTicket);
}

/**
 * Strip next-day suffixes from a time string returned by AI or parsed from GDS text.
 * Handles: "03:40+1", "03:40 +1", "0340+1", "03:40(+1)", "03:40#", "03:40 #"
 * Returns "HH:MM" or null.
 */
function normalizeTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip next-day markers: +1, +2, (#), (+1), (+2), trailing #
  let s = String(raw).replace(/\s*(#|\(\+\d+\)|\+\d+)\s*$/, "").trim();
  // Handle HHMM → HH:MM (if no colon)
  if (/^\d{4}$/.test(s)) s = `${s.slice(0, 2)}:${s.slice(2)}`;
  return /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, "0") : null;
}

function normalizeTicket(t: Partial<ParsedTicketPrice>): ParsedTicketPrice {
  const tripType = (["one_way", "return", "multi_city"].includes(String(t.tripType ?? ""))
    ? t.tripType
    : "one_way") as TripType;

  const isReturn = tripType === "return" || tripType === "multi_city";

  const airline     = String(t.airline ?? "").trim() || "Unknown Airline";
  const airlineCode = String(t.airlineCode ?? "").trim().toUpperCase().slice(0, 2) || "??";
  const fromCode    = String(t.fromCode ?? "").trim().toUpperCase().slice(0, 3) || "???";
  const toCode      = String(t.toCode ?? "").trim().toUpperCase().slice(0, 3) || "???";
  const basePrice   = t.basePrice != null && !isNaN(Number(t.basePrice)) ? Number(t.basePrice) : null;
  const departDate  = /^\d{4}-\d{2}-\d{2}$/.test(String(t.departDate ?? "")) ? String(t.departDate) : null;
  const flightNumber = t.flightNumber ? String(t.flightNumber).trim().toUpperCase() : null;

  // ── Confidence & warnings ──────────────────────────────────────────────────
  const warnings: string[] = [];
  if (!basePrice)                  warnings.push("Harga tidak terdeteksi");
  if (airlineCode === "??")        warnings.push("Kode maskapai tidak dikenali");
  if (fromCode === "???")          warnings.push("Kode bandara asal tidak valid");
  if (toCode === "???")            warnings.push("Kode bandara tujuan tidak valid");
  if (!departDate)                 warnings.push("Tanggal keberangkatan tidak ditemukan");
  if (!flightNumber)               warnings.push("Nomor penerbangan tidak ditemukan");

  const criticalCount = [fromCode === "???", toCode === "???"].filter(Boolean).length;
  const majorCount    = [!basePrice, airlineCode === "??"].filter(Boolean).length;
  const confidence: "high" | "medium" | "low" =
    criticalCount > 0 ? "low" :
    majorCount > 0    ? "medium" : "high";

  return {
    airline,
    airlineCode,
    fromCode,
    fromCity:        String(t.fromCity ?? "").trim(),
    toCode,
    toCity:          String(t.toCity ?? "").trim(),
    departDate,
    basePrice,
    currency:        (["IDR","EGP","USD","SAR"].includes(String(t.currency ?? "")) ? t.currency : "IDR") as ParsedTicketPrice["currency"],
    tripType,
    flightNumber,
    etd:             normalizeTime(t.etd as string | null),
    eta:             normalizeTime(t.eta as string | null),
    terminal:        t.terminal ? String(t.terminal).trim() : null,
    transitCode:     t.transitCode ? String(t.transitCode).trim().toUpperCase().slice(0, 3) : null,
    transitCity:     t.transitCity ? String(t.transitCity).trim() : null,
    transitDuration: t.transitDuration ? String(t.transitDuration).trim() : null,
    returnFromCode:      isReturn && t.returnFromCode ? String(t.returnFromCode).trim().toUpperCase().slice(0, 3) : null,
    returnToCode:        isReturn && t.returnToCode   ? String(t.returnToCode).trim().toUpperCase().slice(0, 3)   : null,
    returnFromCity:      isReturn && t.returnFromCity ? String(t.returnFromCity).trim()                           : null,
    returnToCity:        isReturn && t.returnToCity   ? String(t.returnToCity).trim()                             : null,
    returnDate:          isReturn && /^\d{4}-\d{2}-\d{2}$/.test(String(t.returnDate ?? "")) ? String(t.returnDate) : null,
    returnFlightNumber:  isReturn && t.returnFlightNumber ? String(t.returnFlightNumber).trim().toUpperCase()     : null,
    returnEtd:           isReturn ? normalizeTime(t.returnEtd as string | null)                                   : null,
    returnEta:           isReturn ? normalizeTime(t.returnEta as string | null)                                   : null,
    returnTransitCode:   isReturn && t.returnTransitCode ? String(t.returnTransitCode).trim().toUpperCase().slice(0, 3) : null,
    returnTransitCity:   isReturn && t.returnTransitCity ? String(t.returnTransitCity).trim()                          : null,
    returnTransitDuration: isReturn && t.returnTransitDuration ? String(t.returnTransitDuration).trim()                : null,
    confidence,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ── Fase 19.5: Transit chain merger ──────────────────────────────────────────
// Detects when ticket[i].toCode == ticket[j].fromCode + same price + same airline
// → merges them into ONE multi-leg entry with single price point

/**
 * Calculate layover duration between an arrival time and the next departure time.
 * Both times are "HH:MM" strings. Returns "1h 05m" style string or null.
 * Assumes same-day or next-day (wraps around midnight).
 */
function calcLayover(arrivalTime: string | null | undefined, departureTime: string | null | undefined): string | null {
  if (!arrivalTime || !departureTime) return null;
  const [ah, am] = arrivalTime.split(":").map(Number);
  const [dh, dm] = departureTime.split(":").map(Number);
  if (isNaN(ah) || isNaN(am) || isNaN(dh) || isNaN(dm)) return null;
  let totalMinutes = (dh * 60 + dm) - (ah * 60 + am);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // next-day departure
  if (totalMinutes <= 0 || totalMinutes > 36 * 60) return null; // sanity check
  const hours = Math.floor(totalMinutes / 60);
  const mins  = totalMinutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function priceMatch(a: ParsedTicketPrice, b: ParsedTicketPrice): boolean {
  // Both unpiced (e.g. PNR-only text with no fare) → treat as matching
  if (a.basePrice == null && b.basePrice == null) return true;
  if (a.basePrice == null || b.basePrice == null) return false;
  return Math.abs(a.basePrice - b.basePrice) / Math.max(Math.abs(a.basePrice), 1) < 0.015; // within 1.5%
}

/** Days between two YYYY-MM-DD strings (positive = b is later). Returns null if either missing. */
function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return (db - da) / 86_400_000;
}

function buildMultiLegTicket(chain: ParsedTicketPrice[]): ParsedTicketPrice {
  const first = chain[0];
  const last  = chain[chain.length - 1];

  // Outbound legs
  const outboundLegs: LegInfo[] = chain.map((t) => ({
    fromCode:     t.fromCode,
    toCode:       t.toCode,
    fromCity:     t.fromCity || null,
    toCity:       t.toCity || null,
    flightNumber: t.flightNumber || null,
    etd:          t.etd || null,
    eta:          t.eta || null,
    date:         t.departDate || null,
  }));
  const transitCodes  = chain.slice(0, -1).map((t) => t.toCode);
  const transitCities = chain.slice(0, -1).map((t) => t.toCity || t.toCode);

  // Return legs — present if ALL tickets are return trips
  const allReturn = chain.every(
    (t) => (t.tripType === "return" || t.tripType === "multi_city") && t.returnFromCode
  );

  let returnLegs: LegInfo[] | undefined;
  let returnTransitCodes: string[] | undefined;
  let returnTransitCities: string[] = [];
  let returnTransitDuration: string | null = null;
  let returnDate: string | null = null;

  if (allReturn) {
    // Return chain is the REVERSE: last ticket's return leg first, then second-to-last, etc.
    const reversed = [...chain].reverse();
    returnLegs = reversed.map((t) => ({
      fromCode:     t.returnFromCode!,
      toCode:       t.returnToCode!,
      fromCity:     t.returnFromCity || null,
      toCity:       t.returnToCity || null,
      flightNumber: t.returnFlightNumber || null,
      etd:          t.returnEtd || null,
      eta:          t.returnEta || null,
      date:         t.returnDate || null,
    }));
    // Intermediate airports in the return journey (code + city name)
    returnTransitCodes = reversed.slice(0, -1).map((t) => t.returnToCode!).filter(Boolean);
    returnTransitCities = reversed.slice(0, -1).map((t) => t.returnToCity || t.returnToCode || "").filter(Boolean);
    returnTransitDuration = returnLegs.length >= 2 ? calcLayover(returnLegs[0].eta, returnLegs[1].etd) : null;
    returnDate = chain.find((t) => t.returnDate)?.returnDate ?? null;
  }

  const mlData: MultiLegData = {
    v: 1,
    outboundLegs,
    returnLegs,
    transitCodes,
    returnTransitCodes,
    returnDate,
  };

  // Combined flight numbers for display
  const outFlights = chain.map((t) => t.flightNumber).filter(Boolean).join("/");
  const retFlights = allReturn
    ? [...chain].reverse().map((t) => t.returnFlightNumber).filter(Boolean).join("/")
    : null;

  return {
    ...first,
    // Outbound: origin → final destination
    toCode:          last.toCode,
    toCity:          last.toCity,
    eta:             last.eta || null,
    flightNumber:    outFlights || null,
    // First transit in outbound chain
    transitCode:     transitCodes[0] ?? null,
    transitCity:     transitCities.length > 0 ? transitCities.join(", ") : null,
    transitDuration: chain.length >= 2 ? calcLayover(chain[0].eta, chain[1].etd) : null,
    tripType:        allReturn ? "return" : "one_way",
    // Return leg summary (backward compat for decodeReturnLeg path)
    returnFromCode:       allReturn ? last.toCode : null,
    returnToCode:         allReturn ? first.fromCode : null,
    returnFromCity:       allReturn ? last.toCity : null,
    returnToCity:         allReturn ? first.fromCity : null,
    returnDate:           returnDate,
    returnFlightNumber:   allReturn ? (retFlights || null) : null,
    returnEtd:            allReturn ? (returnLegs?.[0]?.etd ?? null) : null,
    returnEta:            allReturn ? (returnLegs?.[returnLegs.length - 1]?.eta ?? null) : null,
    returnTransitCode:    allReturn ? (returnTransitCodes?.[0] ?? null) : null,
    returnTransitCity:    allReturn ? (returnTransitCities.length > 0 ? returnTransitCities.join(", ") : null) : null,
    returnTransitDuration: allReturn ? returnTransitDuration : null,
    // Full multi-leg payload
    multiLeg: mlData,
  };
}

/**
 * mergeTransitChains — detect and merge consecutive transit-connected tickets.
 * Runs BEFORE round-trip grouping so that transit chains are first collapsed.
 *
 * Algorithm:
 *   For each ticket i, try to extend it into a chain by finding ticket j where
 *   chain.last.toCode == j.fromCode AND same airline AND same price.
 *   Repeat until no more extensions. If chain.length > 1, merge into one multi-leg ticket.
 */
function mergeTransitChains(tickets: ParsedTicketPrice[]): ParsedTicketPrice[] {
  if (tickets.length <= 1) return tickets;

  const used = new Set<number>();
  const result: ParsedTicketPrice[] = [];

  for (let i = 0; i < tickets.length; i++) {
    if (used.has(i)) continue;

    const chain: number[] = [i];
    used.add(i);

    // Greedy extension: find next ticket that connects to end of current chain
    let extended = true;
    while (extended) {
      extended = false;
      const lastInChain = tickets[chain[chain.length - 1]];

      for (let j = 0; j < tickets.length; j++) {
        if (used.has(j)) continue;
        const candidate = tickets[j];

        const isTransitLink   = lastInChain.toCode === candidate.fromCode;
        const sameAirline     = lastInChain.airlineCode === candidate.airlineCode;
        const matchPrice      = priceMatch(lastInChain, candidate);
        // Safety: don't chain if candidate's origin equals first ticket's origin (would loop)
        const noLoop          = candidate.fromCode !== tickets[chain[0]].fromCode;
        // Only chain legs that depart within 3 days of each other (short layover, not return trip)
        // IMPORTANT: if both dates are known we enforce the gap; if either is null we skip
        const gap             = daysBetween(lastInChain.departDate, candidate.departDate);
        const closeInTime     = gap !== null && gap >= 0 && gap <= 3;

        if (isTransitLink && sameAirline && matchPrice && noLoop && closeInTime) {
          chain.push(j);
          used.add(j);
          extended = true;
          break; // restart search from new end of chain
        }
      }
    }

    if (chain.length === 1) {
      result.push(tickets[i]);
    } else {
      result.push(buildMultiLegTicket(chain.map((idx) => tickets[idx])));
    }
  }

  return result;
}

/**
 * detectReturnSplit — checks whether a sequence of raw segments forms a
 * round-trip by comparing the FIRST origin to the LAST destination.
 *
 * Rule (from requirements):
 *   origin_first = segments[0].fromCode
 *   dest_last    = segments[last].toCode
 *   if origin_first === dest_last → RETURN (split at the largest date gap)
 *
 * Returns [outboundSegs, returnSegs] or null if not a return trip.
 */
function detectReturnSplit(
  rawTickets: ParsedTicketPrice[],
): [ParsedTicketPrice[], ParsedTicketPrice[]] | null {
  if (rawTickets.length < 2) return null;

  const firstOrigin = rawTickets[0].fromCode;
  const lastDest    = rawTickets[rawTickets.length - 1].toCode;

  if (!firstOrigin || !lastDest || firstOrigin !== lastDest) return null;

  // Find the split index = position of the largest date gap between
  // consecutive segments.  Segments before splitAt = outbound;
  // segments from splitAt onward = return.
  let maxGap  = -1;
  let splitAt = -1;

  for (let i = 1; i < rawTickets.length; i++) {
    const gap = daysBetween(rawTickets[i - 1].departDate, rawTickets[i].departDate);
    // When both dates are known, take the real gap.
    // When either date is missing, treat as 0 (same direction) so we don't
    // falsely split at an unknown-date boundary — better to pick any other real gap.
    const eff = gap !== null ? gap : 0;
    if (eff > maxGap) {
      maxGap  = eff;
      splitAt = i;
    }
  }

  // splitAt must be at least 1 (there must be at least 1 outbound segment)
  // and at most rawTickets.length-1 (at least 1 return segment).
  if (splitAt <= 0 || splitAt >= rawTickets.length) return null;

  // Both halves must be non-empty
  const outSegs = rawTickets.slice(0, splitAt);
  const retSegs = rawTickets.slice(splitAt);
  if (outSegs.length === 0 || retSegs.length === 0) return null;

  return [outSegs, retSegs];
}

/**
 * buildReturnMergedTicket — given outbound raw segments and return raw segments,
 * builds a single ParsedTicketPrice with tripType="return" and full MultiLegData.
 */
function buildReturnMergedTicket(
  outboundSegs: ParsedTicketPrice[],
  returnSegs: ParsedTicketPrice[],
): ParsedTicketPrice {
  const firstSeg = outboundSegs[0];

  const outLegs: LegInfo[] = outboundSegs.map((t) => ({
    fromCode: t.fromCode, toCode: t.toCode,
    fromCity: t.fromCity || null, toCity: t.toCity || null,
    flightNumber: t.flightNumber || null,
    etd: t.etd || null, eta: t.eta || null,
    date: t.departDate || null,
  }));
  const retLegs: LegInfo[] = returnSegs.map((t) => ({
    fromCode: t.fromCode, toCode: t.toCode,
    fromCity: t.fromCity || null, toCity: t.toCity || null,
    flightNumber: t.flightNumber || null,
    etd: t.etd || null, eta: t.eta || null,
    date: t.departDate || null,
  }));

  const transitCodes        = outboundSegs.slice(0, -1).map((t) => t.toCode);
  const transitCities       = outboundSegs.slice(0, -1).map((t) => t.toCity || t.toCode);
  const returnTransitCodes  = returnSegs.slice(0, -1).map((t) => t.toCode);
  const returnTransitCities = returnSegs.slice(0, -1).map((t) => t.toCity || t.toCode);

  const mergedML: MultiLegData = {
    v: 1,
    outboundLegs:      outLegs,
    returnLegs:        retLegs,
    transitCodes,
    returnTransitCodes,
    returnDate:        retLegs[0]?.date ?? null,
  };

  const outFlightNumber = outLegs.map((l) => l.flightNumber).filter(Boolean).join("/");
  const retFlightNumber = retLegs.map((l) => l.flightNumber).filter(Boolean).join("/");

  return {
    ...firstSeg,
    tripType:              "return",
    // Outbound: origin → final outbound destination
    toCode:                outLegs[outLegs.length - 1].toCode,
    toCity:                outLegs[outLegs.length - 1].toCity ?? firstSeg.toCity,
    eta:                   outLegs[outLegs.length - 1].eta ?? firstSeg.eta,
    flightNumber:          outFlightNumber || firstSeg.flightNumber,
    transitCode:           transitCodes[0] ?? null,
    transitCity:           transitCities.length > 0 ? transitCities.join(", ") : null,
    transitDuration:       outLegs.length >= 2 ? calcLayover(outLegs[0].eta, outLegs[1].etd) : null,
    // Return leg
    returnFromCode:        retLegs[0].fromCode,
    returnToCode:          retLegs[retLegs.length - 1].toCode,
    returnFromCity:        retLegs[0].fromCity ?? null,
    returnToCity:          retLegs[retLegs.length - 1].toCity ?? null,
    returnDate:            retLegs[0].date ?? null,
    returnFlightNumber:    retFlightNumber || null,
    returnEtd:             retLegs[0]?.etd ?? null,
    returnEta:             retLegs[retLegs.length - 1]?.eta ?? null,
    returnTransitCode:     returnTransitCodes[0] ?? null,
    returnTransitCity:     returnTransitCities.length > 0 ? returnTransitCities.join(", ") : null,
    returnTransitDuration: retLegs.length >= 2 ? calcLayover(retLegs[0].eta, retLegs[1].etd) : null,
    multiLeg:              mergedML,
  };
}

/**
 * groupGalileoLegsSequentially — dedicated grouper for Galileo display/PNR output.
 *
 * Galileo always lists segments in journey order (1, 2, 3, 4…).
 *
 * PRIMARY detection (Phase 0 — most reliable):
 *   Direct round-trip check on the raw segment list:
 *     origin_first = rawTickets[0].fromCode
 *     dest_last    = rawTickets[last].toCode
 *     If origin_first === dest_last → RETURN.  Split at the largest date gap.
 *
 * SECONDARY detection (Phases 1–3 — for one-way multi-leg and other cases):
 *   1. Walk segments sequentially and group into direction chains (transit link
 *      + departure date within 2 days → same direction).
 *   2. Build a multi-leg ticket per direction chain.
 *   3. If exactly 2 chains form a reversed route → RETURN.
 *
 * Example (4-segment CAI→BAH→GOI / GOI→BAH→CAI):
 *   Phase 0: firstOrigin=CAI, lastDest=CAI → RETURN detected immediately.
 *   Split at largest gap (03JUN→03SEP = 92 days, index 2).
 *   outbound = [CAI→BAH, BAH→GOI], return = [GOI→BAH, BAH→CAI]
 */
function groupGalileoLegsSequentially(rawTickets: ParsedTicketPrice[]): ParsedTicketPrice[] {
  if (rawTickets.length <= 1) return rawTickets;

  // ── Phase 0: direct return-trip detection (primary, most robust) ─────────
  // Check: if the first segment's origin equals the last segment's destination
  // then by definition this is a round trip — regardless of intermediate routing.
  const returnSplit = detectReturnSplit(rawTickets);
  if (returnSplit) {
    const [outboundSegs, returnSegs] = returnSplit;
    return [buildReturnMergedTicket(outboundSegs, returnSegs)];
  }

  // ── Phase 1: sequential direction-chain split (for one-way multi-leg) ───
  const directionChains: ParsedTicketPrice[][] = [];
  let currentChain: ParsedTicketPrice[] = [rawTickets[0]];

  for (let i = 1; i < rawTickets.length; i++) {
    const prev = rawTickets[i - 1];
    const curr = rawTickets[i];

    const isTransitLink = prev.toCode === curr.fromCode;
    const gap           = daysBetween(prev.departDate, curr.departDate);
    const sameDayOrNext = gap !== null && gap >= 0 && gap <= 2;

    if (isTransitLink && sameDayOrNext) {
      currentChain.push(curr);
    } else {
      directionChains.push(currentChain);
      currentChain = [curr];
    }
  }
  directionChains.push(currentChain);

  // ── Phase 2: build a multi-leg ticket per direction chain ────────────────
  const chainTickets: ParsedTicketPrice[] = directionChains.map((chain) =>
    chain.length === 1 ? chain[0] : buildMultiLegTicket(chain)
  );

  // ── Phase 3: fallback round-trip detection on chain tickets ─────────────
  // Handles cases like two single-leg one-way tickets that form a round trip.
  if (chainTickets.length === 2) {
    const [outbound, ret] = chainTickets;
    const isRoundTrip =
      outbound.fromCode === ret.toCode &&
      outbound.toCode   === ret.fromCode;

    if (isRoundTrip && priceMatch(outbound, ret)) {
      const outLegs: LegInfo[] = directionChains[0].map((t) => ({
        fromCode: t.fromCode, toCode: t.toCode,
        fromCity: t.fromCity || null, toCity: t.toCity || null,
        flightNumber: t.flightNumber || null,
        etd: t.etd || null, eta: t.eta || null,
        date: t.departDate || null,
      }));
      const retLegs: LegInfo[] = directionChains[1].map((t) => ({
        fromCode: t.fromCode, toCode: t.toCode,
        fromCity: t.fromCity || null, toCity: t.toCity || null,
        flightNumber: t.flightNumber || null,
        etd: t.etd || null, eta: t.eta || null,
        date: t.departDate || null,
      }));
      const transitCodes        = directionChains[0].slice(0, -1).map((t) => t.toCode);
      const transitCities       = directionChains[0].slice(0, -1).map((t) => t.toCity || t.toCode);
      const returnTransitCodes  = directionChains[1].slice(0, -1).map((t) => t.toCode);
      const returnTransitCities = directionChains[1].slice(0, -1).map((t) => t.toCity || t.toCode);

      const mergedML: MultiLegData = {
        v: 1,
        outboundLegs: outLegs,
        returnLegs:   retLegs,
        transitCodes,
        returnTransitCodes,
        returnDate: ret.departDate ?? null,
      };

      const outFlightNumber = outLegs.map((l) => l.flightNumber).filter(Boolean).join("/");
      const retFlightNumber = retLegs.map((l) => l.flightNumber).filter(Boolean).join("/");

      const merged: ParsedTicketPrice = {
        ...outbound,
        tripType:              "return",
        toCode:                outLegs[outLegs.length - 1].toCode,
        toCity:                outLegs[outLegs.length - 1].toCity ?? outbound.toCity,
        eta:                   outLegs[outLegs.length - 1].eta ?? outbound.eta,
        flightNumber:          outFlightNumber || outbound.flightNumber,
        transitCode:           transitCodes[0] ?? null,
        transitCity:           transitCities.length > 0 ? transitCities.join(", ") : null,
        transitDuration:       outLegs.length >= 2 ? calcLayover(outLegs[0].eta, outLegs[1].etd) : null,
        returnFromCode:        ret.fromCode,
        returnToCode:          ret.toCode,
        returnFromCity:        ret.fromCity ?? null,
        returnToCity:          ret.toCity ?? null,
        returnDate:            ret.departDate,
        returnFlightNumber:    retFlightNumber || ret.flightNumber,
        returnEtd:             retLegs[0]?.etd ?? null,
        returnEta:             retLegs[retLegs.length - 1]?.eta ?? null,
        returnTransitCode:     returnTransitCodes[0] ?? null,
        returnTransitCity:     returnTransitCities.length > 0 ? returnTransitCities.join(", ") : null,
        returnTransitDuration: retLegs.length >= 2 ? calcLayover(retLegs[0].eta, retLegs[1].etd) : null,
        multiLeg:              mergedML,
      };
      return [merged];
    }
  }

  // ── Fallback: run generic groupRoundTrips on the already-chained tickets ─
  return groupRoundTrips(chainTickets);
}

// ── Fallback client-side round-trip grouper ───────────────────────────────────
// If AI outputs individual legs, detect and merge round-trip pairs.

export function groupRoundTrips(tickets: ParsedTicketPrice[]): ParsedTicketPrice[] {
  // Phase 0: direct return-trip detection on raw segments (mirrors groupGalileoLegsSequentially Phase 0)
  // If the raw input is already a sequence of single-leg segments where first.from == last.to → RETURN.
  // This catches the case where AI returns 4 individual one-way tickets in journey order.
  if (tickets.length >= 2 && tickets.every((t) => t.tripType === "one_way" && !t.multiLeg)) {
    const returnSplit = detectReturnSplit(tickets);
    if (returnSplit) {
      const [outboundSegs, returnSegs] = returnSplit;
      return [buildReturnMergedTicket(outboundSegs, returnSegs)];
    }
  }

  // Phase 1: merge transit chains (Fase 19.5)
  const afterTransit = mergeTransitChains(tickets);

  // Phase 2: classic round-trip grouping
  const result: ParsedTicketPrice[] = [];
  const used = new Set<number>();

  for (let i = 0; i < afterTransit.length; i++) {
    if (used.has(i)) continue;
    const a = afterTransit[i];

    // Already fully grouped (return/multi_city with return leg data, or multi-leg)
    if ((a.tripType === "return" || a.tripType === "multi_city") &&
        (a.returnFromCode || a.multiLeg)) {
      result.push(a);
      used.add(i);
      continue;
    }

    let matched = false;

    for (let j = i + 1; j < afterTransit.length; j++) {
      if (used.has(j)) continue;
      const b = afterTransit[j];
      if (b.tripType !== "one_way") continue;

      const sameAirline   = a.airlineCode === b.airlineCode;
      const reversedRoute = a.fromCode === b.toCode && a.toCode === b.fromCode;
      const samePrice     = priceMatch(a, b);

      if (sameAirline && reversedRoute && samePrice) {
        // Determine outbound vs return by date
        let outbound = a, ret = b;
        if (a.departDate && b.departDate && b.departDate < a.departDate) {
          outbound = b; ret = a;
        }

        // When both tickets are multi-leg, merge their multiLeg data properly
        // so returnLegs are populated from the return journey's outbound chain
        let mergedMultiLeg = outbound.multiLeg;
        if (outbound.multiLeg && ret.multiLeg) {
          mergedMultiLeg = {
            ...outbound.multiLeg,
            returnLegs:         ret.multiLeg.outboundLegs,
            returnTransitCodes: ret.multiLeg.transitCodes,
            returnDate:         ret.departDate ?? null,
          };
        }

        const grouped: ParsedTicketPrice = {
          ...outbound,
          tripType:              "return",
          returnFromCode:        ret.fromCode,
          returnToCode:          ret.toCode,
          returnFromCity:        ret.fromCity,
          returnToCity:          ret.toCity,
          returnDate:            ret.departDate,
          returnFlightNumber:    ret.flightNumber,
          returnEtd:             ret.etd,
          returnEta:             ret.eta,
          returnTransitCode:     ret.transitCode,
          returnTransitCity:     ret.transitCity,
          returnTransitDuration: ret.transitDuration,
          multiLeg:              mergedMultiLeg,
        };
        result.push(grouped);
        used.add(i);
        used.add(j);
        matched = true;
        break;
      }
    }

    if (!matched) {
      result.push({ ...a, tripType: a.tripType ?? "one_way" });
      used.add(i);
    }
  }

  return result;
}

// ── Encode/decode return leg in TicketPrice.notes ─────────────────────────────
// Return leg data is persisted in the notes field as a JSON prefix so we don't
// need a DB migration. Format: "__RT__:{...}\n<user notes>"

const RT_PREFIX = "__RT__:";

export interface ReturnLegData {
  returnFromCode: string | null;
  returnToCode: string | null;
  returnFromCity: string | null;
  returnToCity: string | null;
  returnDate: string | null;
  returnFlightNumber: string | null;
  returnEtd: string | null;
  returnEta: string | null;
  returnTransitCode: string | null;
  returnTransitCity: string | null;
  returnTransitDuration: string | null;
}

export function encodeReturnLeg(p: ParsedTicketPrice, userNotes?: string): string {
  const rt: ReturnLegData = {
    returnFromCode:       p.returnFromCode,
    returnToCode:         p.returnToCode,
    returnFromCity:       p.returnFromCity,
    returnToCity:         p.returnToCity,
    returnDate:           p.returnDate,
    returnFlightNumber:   p.returnFlightNumber,
    returnEtd:            p.returnEtd,
    returnEta:            p.returnEta,
    returnTransitCode:    p.returnTransitCode,
    returnTransitCity:    p.returnTransitCity,
    returnTransitDuration: p.returnTransitDuration,
  };
  const base = `${RT_PREFIX}${JSON.stringify(rt)}`;
  return userNotes ? `${base}\n${userNotes}` : base;
}

export function decodeReturnLeg(notes: string | null): { leg: ReturnLegData | null; userNotes: string | null } {
  if (!notes?.startsWith(RT_PREFIX)) return { leg: null, userNotes: notes };
  try {
    const rest = notes.slice(RT_PREFIX.length);
    const newlineIdx = rest.indexOf("\n");
    const jsonStr = newlineIdx >= 0 ? rest.slice(0, newlineIdx) : rest;
    const userNotes = newlineIdx >= 0 ? rest.slice(newlineIdx + 1) || null : null;
    const leg = JSON.parse(jsonStr) as ReturnLegData;
    return { leg, userNotes };
  } catch {
    return { leg: null, userNotes: notes };
  }
}

export function isReturnTrip(notes: string | null): boolean {
  return !!notes?.startsWith(RT_PREFIX);
}

// ── Encode/decode extended flight details in TicketPrice.notes ─────────────────
// Stored as a JSON line in the notes field — no DB migration needed.
// Format: "__EXT__:{...}\n[__RT__:{...}\n|__ML__:{...}]<user notes>"

const EXT_PREFIX = "__EXT__:";

export interface ExtendedFlightData {
  aircraftType: string | null;      // e.g. "Boeing 777-300ER"
  flightDuration: string | null;    // e.g. "7j 45m"
  leg2FlightNumber: string | null;  // flight number for leg after transit, e.g. "EK927"
  leg2AircraftType: string | null;  // e.g. "Airbus A380-800"
  leg2Duration: string | null;      // e.g. "3j 50m"
}

export function decodeExtended(notes: string | null): {
  ext: ExtendedFlightData | null;
  restNotes: string | null;
} {
  if (!notes) return { ext: null, restNotes: notes };
  const lines = notes.split("\n");
  const extIdx = lines.findIndex((l) => l.startsWith(EXT_PREFIX));
  if (extIdx < 0) return { ext: null, restNotes: notes };
  try {
    const ext = JSON.parse(lines[extIdx].slice(EXT_PREFIX.length)) as ExtendedFlightData;
    const restLines = [...lines.slice(0, extIdx), ...lines.slice(extIdx + 1)];
    const restNotes = restLines.join("\n").trim() || null;
    return { ext, restNotes };
  } catch {
    return { ext: null, restNotes: notes };
  }
}

/** Prepend EXT line to baseNotes. Returns baseNotes unchanged if all EXT fields are null. */
export function encodeExtended(ext: ExtendedFlightData, baseNotes: string | null): string | null {
  const hasData = Object.values(ext).some((v) => v !== null && v !== "");
  if (!hasData) return baseNotes;
  const extLine = `${EXT_PREFIX}${JSON.stringify(ext)}`;
  return baseNotes ? `${extLine}\n${baseNotes}` : extLine;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export interface ScanDebugInfo {
  rawSegmentsCount: number;
  rawSegments: Array<{ from: string; to: string; flight: string | null; date: string | null; tripType: string }>;
  firstOrigin: string | null;
  lastDestination: string | null;
  detectedType: string;
  groupedCount: number;
  source: "ai" | "text";
}

export interface ScanResult {
  tickets: ParsedTicketPrice[];
  usedAI: boolean;
  grouped: number;
  debug?: ScanDebugInfo;
  error?: string;
}

export async function scanTicketPriceScreenshot(imageSource: File | string): Promise<ScanResult> {
  try {
    const rawDataUrl = imageSource instanceof File ? await fileToDataUrl(imageSource) : imageSource;
    const dataUrl    = await compressImage(rawDataUrl, 1800);
    const rawTickets = await callOpenAIVision(dataUrl);
    // groupGalileoLegsSequentially: Phase 0 (detectReturnSplit on ordered segments) →
    // Phase 1-2 (direction chains + multi-leg) → Phase 3 (fallback round-trip).
    // More robust than plain groupRoundTrips for sequential Galileo-style AI output.
    const tickets = groupGalileoLegsSequentially(rawTickets);
    const grouped = tickets.filter((t) => t.tripType === "return" || t.multiLeg).length;

    const debug: ScanDebugInfo = {
      rawSegmentsCount: rawTickets.length,
      rawSegments: rawTickets.map((t) => ({
        from: t.fromCode, to: t.toCode, flight: t.flightNumber ?? null,
        date: t.departDate ?? null, tripType: t.tripType,
      })),
      firstOrigin: rawTickets[0]?.fromCode ?? null,
      lastDestination: rawTickets[rawTickets.length - 1]?.toCode ?? null,
      detectedType: tickets[0]?.tripType ?? "unknown",
      groupedCount: tickets.length,
      source: "ai",
    };

    return { tickets, usedAI: true, grouped, debug };
  } catch (err) {
    return { tickets: [], usedAI: false, grouped: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Fase 20: Galileo Text → ParsedTicketPrice (no AI needed) ─────────────────

/**
 * Convert each FlightLeg from ItineraryData into a raw one-way ParsedTicketPrice.
 * All legs share the same totalPrice (single price point for the whole booking).
 * groupRoundTrips() is then used to merge transit chains and detect round trips.
 */
function itineraryLegsToRawTickets(data: ItineraryData): ParsedTicketPrice[] {
  return data.legs.map((leg) => {
    // Extract 2-letter airline code from flightNumber prefix, e.g. "GF70" → "GF"
    const airlineCode = leg.flightNumber?.match(/^([A-Z]{2})/)?.[1] ?? "??";
    const airline = leg.airline ?? airlineCode;

    const currency = (["IDR", "EGP", "USD", "SAR"].includes(String(data.priceCurrency ?? "")))
      ? (data.priceCurrency as ParsedTicketPrice["currency"])
      : "IDR";

    return {
      airline,
      airlineCode,
      fromCode:        leg.fromCode ?? "???",
      fromCity:        leg.fromCity ?? "",
      toCode:          leg.toCode ?? "???",
      toCity:          leg.toCity ?? "",
      departDate:      leg.departDate ?? null,
      basePrice:       data.totalPrice ?? null,
      currency,
      tripType:        "one_way" as const,
      flightNumber:    leg.flightNumber ?? null,
      etd:             leg.departTime ?? null,
      eta:             leg.arriveTime ?? null,
      terminal:        null,
      transitCode:     null,
      transitCity:     null,
      transitDuration: null,
      returnFromCode:      null,
      returnToCode:        null,
      returnFromCity:      null,
      returnToCity:        null,
      returnDate:          null,
      returnFlightNumber:  null,
      returnEtd:           null,
      returnEta:           null,
      returnTransitCode:   null,
      returnTransitCity:   null,
      returnTransitDuration: null,
    };
  });
}

/**
 * Split Galileo multi-option text into individual MORE N blocks.
 *
 * In real Galileo output the TOTAL AMOUNT appears on the SAME LINE as MORE N:
 *   "MORE 1                    TOTAL AMOUNT 29283.80 EGP"
 * so a simple regex dollar-anchor split won't work.
 * We iterate lines and start a new block whenever we hit a "MORE N" line.
 * Each block retains its MORE line (which carries the TOTAL AMOUNT).
 */
function splitMoreBlocks(text: string): string[] {
  const lines = text.split("\n");
  const MORE_LINE_RE = /^[ \t]*MORE\s+\d+\b/i;
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (MORE_LINE_RE.test(line) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks.filter((b) => b.trim());
}

/**
 * Try both Galileo parsers on a single text block and return whichever finds
 * MORE flight segments. This prevents the short-circuit of `??` from hiding
 * a better result: e.g. if parseGalileoDisplay only matches 2 of 4 lines but
 * parseGalileoPNR matches all 4, we should use the PNR result.
 */
function bestGalileoData(block: string): ItineraryData | null {
  const displayData = parseGalileoDisplay(block);
  const pnrData     = parseGalileoPNR(block);
  if (!displayData && !pnrData) return null;
  if (!displayData) return pnrData;
  if (!pnrData) return displayData;
  // Both found segments — pick whichever has MORE (more complete parse)
  return displayData.legs.length >= pnrData.legs.length ? displayData : pnrData;
}

export function parseGalileoTextToTickets(text: string): ScanResult {
  // ── Multi-option: split on "MORE N" block markers ──────────────────────────
  // Galileo outputs multiple pricing options prefixed with "MORE 1", "MORE 2", etc.
  // The TOTAL AMOUNT may appear on the SAME LINE: "MORE 1    TOTAL AMOUNT 29283.80 EGP"
  // We split by iterating lines so each block retains its MORE + TOTAL AMOUNT line.
  const MORE_DETECT_RE = /^[ \t]*MORE\s+\d+\b/im;
  if (MORE_DETECT_RE.test(text)) {
    const blocks = splitMoreBlocks(text);

    const allTickets: ParsedTicketPrice[] = [];
    let totalGrouped = 0;

    for (const block of blocks) {
      if (!block.trim()) continue;
      const data = bestGalileoData(block);
      if (!data || data.legs.length === 0) continue;

      const rawTickets = itineraryLegsToRawTickets(data);
      const tickets    = groupGalileoLegsSequentially(rawTickets);
      totalGrouped    += tickets.filter((t) => t.tripType === "return" || !!t.multiLeg).length;
      allTickets.push(...tickets);
    }

    if (allTickets.length === 0) {
      return {
        tickets: [],
        usedAI: false,
        grouped: 0,
        error: "Blok MORE ditemukan tetapi tidak ada segmen penerbangan valid. Pastikan setiap blok berisi baris segmen Galileo (contoh: 1 GF 70 N 03JUN CAI BAH 1715 2015) dan TOTAL AMOUNT.",
      };
    }

    return { tickets: allTickets, usedAI: false, grouped: totalGrouped };
  }

  // ── Single-block fallback ──────────────────────────────────────────────────
  // Use bestGalileoData so both parsers compete — whichever finds more segments wins.
  // This prevents the old `??` short-circuit from discarding the PNR parser when the
  // display parser only partially matches (e.g. only 2 of 4 segments for a return trip).
  const data = bestGalileoData(text);

  if (!data || data.legs.length === 0) {
    return {
      tickets: [],
      usedAI: false,
      grouped: 0,
      error: "Format tidak dikenali. Pastikan text mengandung baris segmen Galileo (contoh: 1 GF 70 N 03JUN CAI BAH 1715 2015) atau format PNR (1 GF 70N 03JUN 3 CAIBAH HK1 1715 2015).",
    };
  }

  const rawTickets = itineraryLegsToRawTickets(data);
  const tickets    = groupGalileoLegsSequentially(rawTickets);
  const grouped    = tickets.filter((t) => t.tripType === "return" || !!t.multiLeg).length;
  const debug: ScanDebugInfo = {
    rawSegmentsCount: rawTickets.length,
    rawSegments: rawTickets.map((t) => ({
      from: t.fromCode, to: t.toCode, flight: t.flightNumber ?? null,
      date: t.departDate ?? null, tripType: t.tripType,
    })),
    firstOrigin: rawTickets[0]?.fromCode ?? null,
    lastDestination: rawTickets[rawTickets.length - 1]?.toCode ?? null,
    detectedType: tickets[0]?.tripType ?? "unknown",
    groupedCount: tickets.length,
    source: "text",
  };
  return { tickets, usedAI: false, grouped, debug };
}

// ── AI text parser (BC / Kode Sistem fallback) ───────────────────────────────

async function callAITextParser(text: string): Promise<ParsedTicketPrice[]> {
  const resp = await callAI({
    model: "openai/gpt-4.1-mini",
    temperature: 0.05,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Parse the following pasted TEXT (not an image) and extract ALL flight ticket options. The text may be a WhatsApp BC promo, booking confirmation, GDS itinerary, or any flight-related text. Return only JSON with a "tickets" array.\n\nTEXT TO PARSE:\n\n${text}`,
      },
    ],
  }, { timeoutMs: 60_000 });

  const json = await resp.json() as { choices: { message: { content: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: { tickets?: ParsedTicketPrice[] } | ParsedTicketPrice[];
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI mengembalikan format JSON yang tidak valid.");
  }

  const tickets = Array.isArray(parsed)
    ? parsed
    : ((parsed as { tickets?: ParsedTicketPrice[] }).tickets ?? []);

  return tickets.map(normalizeTicket);
}

/**
 * scanTicketPriceTextWithAI — BC / Kode Sistem text parser with AI fallback.
 *
 * Flow:
 *   1. Try parseGalileoTextToTickets(text) — fast local regex parser, no AI
 *   2. If local parser finds tickets → return immediately
 *   3. Otherwise fallback to AI text parser (handles BC WhatsApp, booking text, etc.)
 */
export async function scanTicketPriceTextWithAI(text: string): Promise<ScanResult> {
  // Phase 1: local Galileo/GDS parser (instant, no AI cost)
  const localResult = parseGalileoTextToTickets(text);
  if (localResult.tickets.length > 0) {
    return { ...localResult };
  }

  // Phase 2: AI text fallback
  try {
    const rawTickets = await callAITextParser(text);

    if (rawTickets.length === 0) {
      return {
        tickets: [],
        usedAI: true,
        grouped: 0,
        error: "AI tidak menemukan data penerbangan dari teks ini. Coba paste BC atau kode sistem yang lebih lengkap (maskapai, rute, jam, harga).",
      };
    }

    const tickets = groupGalileoLegsSequentially(rawTickets);
    const grouped = tickets.filter((t) => t.tripType === "return" || !!t.multiLeg).length;
    const debug: ScanDebugInfo = {
      rawSegmentsCount: rawTickets.length,
      rawSegments: rawTickets.map((t) => ({
        from: t.fromCode, to: t.toCode, flight: t.flightNumber ?? null,
        date: t.departDate ?? null, tripType: t.tripType,
      })),
      firstOrigin: rawTickets[0]?.fromCode ?? null,
      lastDestination: rawTickets[rawTickets.length - 1]?.toCode ?? null,
      detectedType: tickets[0]?.tripType ?? "unknown",
      groupedCount: tickets.length,
      source: "ai",
    };

    return { tickets, usedAI: true, grouped, debug };
  } catch (err) {
    return {
      tickets: [],
      usedAI: true,
      grouped: 0,
      error: `AI gagal memproses teks: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAirlineLogoUrl(code: string): string {
  const c = code.trim().toUpperCase();
  return `https://content.airhex.com/content/logos/airlines_${c}_50_50_s.png`;
}

const AIRLINE_COLORS: Record<string, string> = {
  QR: "from-[#5C0632] to-[#8B1A4A]",
  SV: "from-[#006341] to-[#008751]",
  EK: "from-[#D71921] to-[#A01520]",
  EY: "from-[#B8860B] to-[#D4A017]",
  GA: "from-[#003087] to-[#0050A0]",
  SQ: "from-[#006478] to-[#00839B]",
  TK: "from-[#C8102E] to-[#E8192E]",
  MS: "from-[#005BAA] to-[#0075D6]",
  KU: "from-[#003366] to-[#004D99]",
  WY: "from-[#C8102E] to-[#E01020]",
  GF: "from-[#C8A97F] to-[#B8936A]",
  AI: "from-[#E03A3E] to-[#C22C30]",
  MH: "from-[#003580] to-[#0050B8]",
  CX: "from-[#006564] to-[#008C8A]",
};

export function getAirlineGradient(code: string): string {
  return AIRLINE_COLORS[code.toUpperCase()] ?? "from-slate-600 to-slate-800";
}
