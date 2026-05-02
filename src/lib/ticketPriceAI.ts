/**
 * ticketPriceAI — ekstrak daftar harga tiket dari screenshot menggunakan
 * OpenAI gpt-4o-mini Vision API.
 *
 * Fase 19.5: Global Universal Transit & Multi-Leg Recognition
 *   - Dynamic transit detection: arrival[n] == departure[n+1] → merge into single leg
 *   - Universal round-trip grouping: significant gap between groups → Return Trip
 *   - Flexible route display: [Origin] ↔ [Final Destination] (via [Transit])
 *   - Single price point: markup applied once per booking regardless of transit count
 *   - Multi-leg support: N transits (CAI-BAH-MCT-CGK etc.)
 */

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
Given a screenshot of airline tickets or price lists (Galileo GDS, booking systems, WhatsApp screenshots, Traveloka, Trip.com, airline websites, etc.), extract ALL visible flights and INTELLIGENTLY GROUP them.

## CRITICAL RULE 1: TRANSIT CHAIN DETECTION (highest priority)

In GDS/booking systems, a SINGLE booking often shows multiple "segment rows". These MUST be merged into one ticket:

DETECTION: If Row[n].ArrivalAirport == Row[n+1].DepartureAirport AND they share the same Total Amount → SAME booking with transit stop.

EXAMPLE from Galileo GDS:
  Row 1: CAI → BAH  GF70  05:30→08:30  Total: EGP 29,283.80
  Row 2: BAH → GOI  GF286  15:40→22:05  Total: EGP 29,283.80
  BAH == BAH → ONE ticket: CAI → GOI (via BAH), price EGP 29,283.80

Result: ONE ticket entry with fromCode=CAI, toCode=GOI, transitCode=BAH

MULTI-TRANSIT EXAMPLE (CAI→BAH→MCT→CGK):
  Row 1: CAI → BAH  Total: X
  Row 2: BAH → MCT  Total: X
  Row 3: MCT → CGK  Total: X
  → ONE ticket: CAI → CGK, transitCode=BAH (first transit), all rows share price X

## CRITICAL RULE 2: ROUND TRIP GROUPING

After transit chain detection, group round trips:
- If two legs share the same Total Amount AND one leg's route reverses the other → ROUND TRIP
- Example: CAI→GOI-via-BAH on 3 Jun + GOI→CAI-via-BAH on 3 Sep (same price) = ONE return ticket
- basePrice = TOTAL PACKAGE price (the shared Total Amount), NOT per-leg price
- tripType = "return"

For the transit+roundtrip combined case:
- Outbound: CAI→BAH→GOI (from segment rows 1+2 going forward)
- Return: GOI→BAH→CAI (from segment rows going backward, same date range)
- Result: ONE entry, tripType="return", fromCode=CAI, toCode=GOI, transitCode=BAH
- returnFromCode=GOI, returnToCode=CAI, returnTransitCode=BAH

## RULE 3: SINGLE PRICE POINT
The basePrice must be set ONCE to the Total Amount shown in the screenshot.
Never multiply by number of transit rows. Never create separate entries for transit legs.

## RULE 4: TRIP TYPE
- "one_way": single direction, no return
- "return": round trip (A→B then B→A pattern, same Total Amount)
- "multi_city": 3+ locations that don't form simple A↔A pattern

Return ONLY a valid JSON object with a "tickets" array (no markdown, no explanation):
{
  "tickets": [
    {
      "airline": "full airline name e.g. Gulf Air",
      "airlineCode": "IATA 2-letter code e.g. GF",
      "fromCode": "IATA 3-letter OUTBOUND ORIGIN airport e.g. CAI",
      "fromCity": "outbound origin city e.g. Cairo",
      "toCode": "IATA 3-letter OUTBOUND FINAL DESTINATION airport e.g. GOI (NOT the transit!)",
      "toCity": "outbound final destination city",
      "departDate": "YYYY-MM-DD outbound first departure date, or null",
      "basePrice": number — TOTAL PACKAGE PRICE (single price for the whole booking), or null,
      "currency": "IDR or EGP or USD or SAR",
      "tripType": "one_way or return or multi_city",
      "flightNumber": "outbound flight number(s) e.g. GF70/GF286 (slash-separated for multi-leg), null if not shown",
      "etd": "HH:MM outbound FIRST departure time 24h, null if not shown",
      "eta": "HH:MM outbound FINAL arrival time 24h, null if not shown",
      "terminal": "terminal info, null if not shown",
      "transitCode": "IATA 3-letter FIRST outbound transit airport e.g. BAH, null if direct",
      "transitCity": "first outbound transit city, null if direct",
      "transitDuration": "outbound layover at first transit e.g. 7h 10m, null if not shown",
      "returnFromCode": "IATA 3-letter RETURN ORIGIN airport e.g. GOI, null for one_way",
      "returnToCode": "IATA 3-letter RETURN FINAL DESTINATION e.g. CAI, null for one_way",
      "returnFromCity": "return origin city, null for one_way",
      "returnToCity": "return final destination city, null for one_way",
      "returnDate": "YYYY-MM-DD return first departure date, null for one_way",
      "returnFlightNumber": "return flight number(s) e.g. GF285/GF79, null if not shown or one_way",
      "returnEtd": "HH:MM return FIRST departure time 24h, null if not shown",
      "returnEta": "HH:MM return FINAL arrival time 24h, null if not shown",
      "returnTransitCode": "IATA 3-letter FIRST return transit airport, null if direct or one_way",
      "returnTransitCity": "first return transit city, null if direct or one_way",
      "returnTransitDuration": "return layover duration, null if not shown"
    }
  ]
}

AIRPORT CODES: CGK=Jakarta, SUB=Surabaya, JED=Jeddah, MED=Madinah, RUH=Riyadh, CAI=Cairo, DOH=Doha, DXB=Dubai, AUH=Abu Dhabi, KUL=Kuala Lumpur, SIN=Singapore, IST=Istanbul, KWI=Kuwait, MCT=Muscat, BAH=Bahrain, AMM=Amman, BKK=Bangkok, KNO=Medan, GOI=Goa/Bahrain??, GOI=Gulf of India (Goa).
AIRLINE CODES: QR=Qatar Airways, SV=Saudia, EK=Emirates, GA=Garuda, SQ=Singapore Airlines, EY=Etihad, TK=Turkish, MS=EgyptAir, AI=Air India, KU=Kuwait Airways, WY=Oman Air, GF=Gulf Air, MH=Malaysia Airlines, CX=Cathay Pacific.
CURRENCY: Rp/IDR=IDR, EGP/£E/جنيه=EGP, $=USD, SAR/SR/ريال=SAR. Default IDR if unclear.

REMEMBER: One booking = ONE ticket entry. Transit rows with same Total Amount = ONE ticket, NOT multiple entries. Return {"tickets":[]} if no clear flight data found.`;

// ── OpenAI Vision call ────────────────────────────────────────────────────────

async function callOpenAIVision(dataUrl: string): Promise<ParsedTicketPrice[]> {
  const resp = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${body.slice(0, 300)}`);
  }

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

function normalizeTicket(t: Partial<ParsedTicketPrice>): ParsedTicketPrice {
  const tripType = (["one_way", "return", "multi_city"].includes(String(t.tripType ?? ""))
    ? t.tripType
    : "one_way") as TripType;

  const isReturn = tripType === "return" || tripType === "multi_city";

  return {
    airline:         String(t.airline ?? "").trim() || "Unknown Airline",
    airlineCode:     String(t.airlineCode ?? "").trim().toUpperCase().slice(0, 2) || "??",
    fromCode:        String(t.fromCode ?? "").trim().toUpperCase().slice(0, 3) || "???",
    fromCity:        String(t.fromCity ?? "").trim(),
    toCode:          String(t.toCode ?? "").trim().toUpperCase().slice(0, 3) || "???",
    toCity:          String(t.toCity ?? "").trim(),
    departDate:      /^\d{4}-\d{2}-\d{2}$/.test(String(t.departDate ?? "")) ? String(t.departDate) : null,
    basePrice:       t.basePrice != null && !isNaN(Number(t.basePrice)) ? Number(t.basePrice) : null,
    currency:        (["IDR","EGP","USD","SAR"].includes(String(t.currency ?? "")) ? t.currency : "IDR") as ParsedTicketPrice["currency"],
    tripType,
    flightNumber:    t.flightNumber ? String(t.flightNumber).trim().toUpperCase() : null,
    etd:             /^\d{1,2}:\d{2}$/.test(String(t.etd ?? "")) ? String(t.etd).padStart(5, "0") : null,
    eta:             /^\d{1,2}:\d{2}$/.test(String(t.eta ?? "")) ? String(t.eta).padStart(5, "0") : null,
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
    returnEtd:           isReturn && /^\d{1,2}:\d{2}$/.test(String(t.returnEtd ?? "")) ? String(t.returnEtd).padStart(5, "0") : null,
    returnEta:           isReturn && /^\d{1,2}:\d{2}$/.test(String(t.returnEta ?? "")) ? String(t.returnEta).padStart(5, "0") : null,
    returnTransitCode:   isReturn && t.returnTransitCode ? String(t.returnTransitCode).trim().toUpperCase().slice(0, 3) : null,
    returnTransitCity:   isReturn && t.returnTransitCity ? String(t.returnTransitCity).trim()                          : null,
    returnTransitDuration: isReturn && t.returnTransitDuration ? String(t.returnTransitDuration).trim()                : null,
  };
}

// ── Fase 19.5: Transit chain merger ──────────────────────────────────────────
// Detects when ticket[i].toCode == ticket[j].fromCode + same price + same airline
// → merges them into ONE multi-leg entry with single price point

function priceMatch(a: ParsedTicketPrice, b: ParsedTicketPrice): boolean {
  if (a.basePrice == null || b.basePrice == null) return false;
  return Math.abs(a.basePrice - b.basePrice) / Math.max(Math.abs(a.basePrice), 1) < 0.015; // within 1.5%
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
  const transitCodes = chain.slice(0, -1).map((t) => t.toCode);

  // Return legs — present if ALL tickets are return trips
  const allReturn = chain.every(
    (t) => (t.tripType === "return" || t.tripType === "multi_city") && t.returnFromCode
  );

  let returnLegs: LegInfo[] | undefined;
  let returnTransitCodes: string[] | undefined;
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
    // Intermediate airports in the return journey
    returnTransitCodes = reversed.slice(0, -1).map((t) => t.returnToCode!).filter(Boolean);
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
    flightNumber:    outFlights || null,
    // First transit in outbound chain
    transitCode:     transitCodes[0] ?? null,
    transitCity:     transitCodes.length > 0 ? transitCodes.join(", ") : null,
    transitDuration: null,
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
    returnTransitCity:    allReturn ? (returnTransitCodes?.join(", ") ?? null) : null,
    returnTransitDuration: null,
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

        if (isTransitLink && sameAirline && matchPrice && noLoop) {
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

// ── Fallback client-side round-trip grouper ───────────────────────────────────
// If AI outputs individual legs, detect and merge round-trip pairs.

export function groupRoundTrips(tickets: ParsedTicketPrice[]): ParsedTicketPrice[] {
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

// ── Main entry ────────────────────────────────────────────────────────────────

export interface ScanResult {
  tickets: ParsedTicketPrice[];
  usedAI: boolean;
  grouped: number;
  error?: string;
}

export async function scanTicketPriceScreenshot(imageSource: File | string): Promise<ScanResult> {
  try {
    const rawDataUrl = imageSource instanceof File ? await fileToDataUrl(imageSource) : imageSource;
    const dataUrl    = await compressImage(rawDataUrl, 1800);
    const rawTickets = await callOpenAIVision(dataUrl);
    // Apply client-side grouper (transit merge + round-trip pairing)
    const tickets = groupRoundTrips(rawTickets);
    const grouped = tickets.filter((t) => t.tripType === "return" || t.multiLeg).length;
    return { tickets, usedAI: true, grouped };
  } catch (err) {
    return { tickets: [], usedAI: false, grouped: 0, error: err instanceof Error ? err.message : String(err) };
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
