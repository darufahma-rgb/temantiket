/**
 * ticketPriceAI — ekstrak daftar harga tiket dari screenshot menggunakan
 * OpenAI gpt-4o-mini Vision API.
 *
 * Fase 19.3: Smart Round-Trip Grouping — AI menggabungkan leg PP menjadi
 * satu kartu "return" dengan harga total paket dan markup sekali.
 */

export type TripType = "one_way" | "return" | "multi_city";

export interface ParsedTicketPrice {
  airline: string;
  airlineCode: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  departDate: string | null;
  basePrice: number | null;       // TOTAL package price (for return: covers both legs)
  currency: "IDR" | "EGP" | "USD" | "SAR";
  tripType: TripType;             // "one_way" | "return" | "multi_city"
  // Fase 19.2 — extended fields (outbound leg)
  flightNumber: string | null;
  etd: string | null;
  eta: string | null;
  terminal: string | null;
  transitCode: string | null;
  transitCity: string | null;
  transitDuration: string | null;
  // Fase 19.3 — return leg (null for one_way)
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

// ── Image helpers ────────────────────────────────────────────────────────────

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

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a flight ticket data extractor for an Indonesian travel agency (Temantiket).
Given a screenshot of airline tickets or price lists (Galileo GDS, booking systems, WhatsApp screenshots, Traveloka, Trip.com, airline websites, etc.), extract ALL visible flights and INTELLIGENTLY GROUP ROUND TRIPS.

## CRITICAL: ROUND TRIP GROUPING RULES

1. DETECT ROUND TRIPS: If you see multiple flight legs that share the SAME Total Amount / Total Fare / harga total (e.g. "29.283,80 EGP" appearing for both a CGK→CAI leg and a CAI→CGK leg), they are ONE round-trip package. Group them into a SINGLE ticket entry.

2. IDENTIFY OUTBOUND vs RETURN:
   - OUTBOUND (Depart): The leg where the route departs FROM the origin city (e.g. CGK→CAI, or whichever comes first chronologically)
   - RETURN (Pulang): The leg where the route goes BACK to origin (e.g. CAI→CGK, or the later date)
   - Use departure dates to determine order — earlier date = outbound, later date = return

3. PRICE FOR ROUND TRIP: The basePrice must be the TOTAL PACKAGE price (the shared Total Amount), NOT the individual leg price. If two legs each show 14,641.90 EGP summing to 29,283.80 EGP total, use 29,283.80 as basePrice.

4. ONE_WAY: A single leg with no matching return = tripType "one_way"

5. MULTI_CITY: Three or more legs that don't form a simple A→B→A pattern = tripType "multi_city" (still grouped as one entry)

Return ONLY a valid JSON object with a "tickets" array (no markdown, no explanation):
{
  "tickets": [
    {
      "airline": "full airline name e.g. EgyptAir",
      "airlineCode": "IATA 2-letter code e.g. MS",
      "fromCode": "IATA 3-letter OUTBOUND departure airport e.g. CGK",
      "fromCity": "outbound departure city e.g. Jakarta",
      "toCode": "IATA 3-letter OUTBOUND arrival airport e.g. CAI",
      "toCity": "outbound arrival city e.g. Cairo",
      "departDate": "YYYY-MM-DD outbound departure date, or null",
      "basePrice": number — TOTAL PACKAGE PRICE (both legs for return), or null,
      "currency": "IDR or EGP or USD or SAR",
      "tripType": "one_way or return or multi_city",
      "flightNumber": "outbound flight number e.g. MS760, null if not shown",
      "etd": "HH:MM outbound departure time 24h, null if not shown",
      "eta": "HH:MM outbound arrival time 24h, null if not shown",
      "terminal": "terminal info e.g. T3, null if not shown",
      "transitCode": "IATA 3-letter outbound transit airport, null if direct",
      "transitCity": "outbound transit city, null if direct",
      "transitDuration": "outbound layover e.g. 2h 30m, null if not shown",
      "returnFromCode": "IATA 3-letter RETURN departure airport e.g. CAI, null for one_way",
      "returnToCode": "IATA 3-letter RETURN arrival airport e.g. CGK, null for one_way",
      "returnFromCity": "return departure city e.g. Cairo, null for one_way",
      "returnToCity": "return arrival city e.g. Jakarta, null for one_way",
      "returnDate": "YYYY-MM-DD return departure date, null for one_way",
      "returnFlightNumber": "return flight number e.g. MS761, null if not shown or one_way",
      "returnEtd": "HH:MM return departure time 24h, null if not shown",
      "returnEta": "HH:MM return arrival time 24h, null if not shown",
      "returnTransitCode": "IATA 3-letter return transit airport, null if direct or one_way",
      "returnTransitCity": "return transit city, null if direct or one_way",
      "returnTransitDuration": "return layover duration, null if not shown"
    }
  ]
}

EXTRACTION RULES:
- ALWAYS check if multiple rows share the same Total Amount — if yes, group as round-trip.
- airlineCode IATA 2-letter: QR=Qatar Airways, SV=Saudia, EK=Emirates, GA=Garuda Indonesia, SQ=Singapore Airlines, EY=Etihad, TK=Turkish, MS=EgyptAir, AI=Air India, KU=Kuwait Airways, WY=Oman Air, GF=Gulf Air, MH=Malaysia Airlines, CX=Cathay Pacific.
- Airport codes IATA 3-letter: CGK=Jakarta, SUB=Surabaya, JED=Jeddah, MED=Madinah, RUH=Riyadh, CAI=Cairo, DOH=Doha, DXB=Dubai, AUH=Abu Dhabi, KUL=Kuala Lumpur, SIN=Singapore, IST=Istanbul, KWI=Kuwait, MCT=Muscat, BAH=Bahrain, AMM=Amman, BKK=Bangkok, KNO=Medan.
- currency: detect from symbol (Rp/IDR=IDR, EGP/£E/جنيه=EGP, $=USD, SAR/SR/ريال=SAR). Default IDR if unclear.
- basePrice: numeric only, no currency symbols. For round-trip = TOTAL of both legs. null if unreadable.
- departDate/returnDate: YYYY-MM-DD. null if not shown.
- etd/eta/returnEtd/returnEta: 24-hour HH:MM. Convert 12h to 24h. null if not shown.
- For one_way: all return* fields must be null.
- Return {"tickets":[]} if no clear flight data is found.`;

// ── OpenAI Vision call ───────────────────────────────────────────────────────

async function callOpenAIVision(dataUrl: string, apiKey: string): Promise<ParsedTicketPrice[]> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
              text: "Extract ALL flight ticket data from this screenshot. IMPORTANT: If you see multiple legs sharing the same Total Amount, group them as a SINGLE round-trip ticket. Fill in return leg fields for return trips. Return JSON with 'tickets' array.",
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
    // Return leg — only fill when tripType is return/multi_city
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
    returnTransitDuration: isReturn && t.returnTransitDuration ? String(t.returnTransitDuration).trim()              : null,
  };
}

// ── Fallback client-side grouper ─────────────────────────────────────────────
// If AI outputs individual legs, try to detect and merge round-trip pairs.

export function groupRoundTrips(tickets: ParsedTicketPrice[]): ParsedTicketPrice[] {
  const result: ParsedTicketPrice[] = [];
  const used = new Set<number>();

  for (let i = 0; i < tickets.length; i++) {
    if (used.has(i)) continue;
    const a = tickets[i];
    if (a.tripType === "return" || a.tripType === "multi_city") {
      // Already grouped by AI
      result.push(a);
      used.add(i);
      continue;
    }

    let matched = false;
    for (let j = i + 1; j < tickets.length; j++) {
      if (used.has(j)) continue;
      const b = tickets[j];
      if (b.tripType !== "one_way") continue;

      const sameAirline    = a.airlineCode === b.airlineCode;
      const reversedRoute  = a.fromCode === b.toCode && a.toCode === b.fromCode;
      const samePrice      = a.basePrice != null && b.basePrice != null && a.basePrice === b.basePrice;
      const similarPrice   = a.basePrice != null && b.basePrice != null &&
        Math.abs(a.basePrice - b.basePrice) / Math.max(a.basePrice, 1) < 0.02; // within 2%

      if (sameAirline && reversedRoute && (samePrice || similarPrice)) {
        // Determine which leg is outbound by date
        let outbound = a, ret = b;
        if (a.departDate && b.departDate && b.departDate < a.departDate) {
          outbound = b; ret = a;
        }

        const grouped: ParsedTicketPrice = {
          ...outbound,
          tripType: "return",
          returnFromCode:       ret.fromCode,
          returnToCode:         ret.toCode,
          returnFromCity:       ret.fromCity,
          returnToCity:         ret.toCity,
          returnDate:           ret.departDate,
          returnFlightNumber:   ret.flightNumber,
          returnEtd:            ret.etd,
          returnEta:            ret.eta,
          returnTransitCode:    ret.transitCode,
          returnTransitCity:    ret.transitCity,
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

// ── Encode/decode return leg in TicketPrice.notes ────────────────────────────
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

// ── Main entry ───────────────────────────────────────────────────────────────

export interface ScanResult {
  tickets: ParsedTicketPrice[];
  usedAI: boolean;
  grouped: number;  // how many pairs were auto-grouped
  error?: string;
}

export async function scanTicketPriceScreenshot(imageSource: File | string): Promise<ScanResult> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  if (!apiKey || apiKey.length < 10) {
    return { tickets: [], usedAI: false, grouped: 0, error: "VITE_OPENAI_API_KEY belum di-set. Set API key untuk menggunakan AI OCR." };
  }

  try {
    const rawDataUrl = imageSource instanceof File ? await fileToDataUrl(imageSource) : imageSource;
    const dataUrl = await compressImage(rawDataUrl, 1800);
    const rawTickets = await callOpenAIVision(dataUrl, apiKey);
    // Apply fallback grouper in case AI returned individual legs
    const tickets = groupRoundTrips(rawTickets);
    const grouped = tickets.filter((t) => t.tripType === "return" || t.tripType === "multi_city").length;
    return { tickets, usedAI: true, grouped };
  } catch (err) {
    return { tickets: [], usedAI: false, grouped: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
