/**
 * ticketPriceAI — ekstrak daftar harga tiket dari screenshot menggunakan
 * OpenAI gpt-4o-mini Vision API.
 *
 * Fase 19.2: Deep Data Extraction — flight number, ETD, ETA, terminal, transit
 */

export interface ParsedTicketPrice {
  airline: string;
  airlineCode: string;      // IATA 2-letter e.g. "QR"
  fromCode: string;         // IATA 3-letter e.g. "CGK"
  fromCity: string;
  toCode: string;           // IATA 3-letter e.g. "JED"
  toCity: string;
  departDate: string | null; // YYYY-MM-DD or null
  basePrice: number | null;
  currency: "IDR" | "EGP" | "USD" | "SAR";
  // Fase 19.2 — extended fields
  flightNumber: string | null;   // e.g. "QR818"
  etd: string | null;            // departure time "HH:MM" (local)
  eta: string | null;            // arrival time "HH:MM" (local)
  terminal: string | null;       // e.g. "T3" or "Terminal 2"
  transitCode: string | null;    // IATA 3-letter transit airport, e.g. "DOH"
  transitCity: string | null;    // transit city name e.g. "Doha"
  transitDuration: string | null;// e.g. "2h 30m"
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
      canvas.width = w;
      canvas.height = h;
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
Given a screenshot of airline tickets or price lists (booking systems, Galileo GDS, WhatsApp screenshots, Traveloka, Trip.com, airline websites, etc.), extract ALL visible flights with COMPLETE details.

Return ONLY a valid JSON object with a "tickets" array (no markdown, no explanation):
{
  "tickets": [
    {
      "airline": "full airline name e.g. Qatar Airways",
      "airlineCode": "IATA 2-letter code e.g. QR",
      "fromCode": "IATA 3-letter departure airport e.g. CGK",
      "fromCity": "departure city e.g. Jakarta",
      "toCode": "IATA 3-letter arrival airport e.g. JED",
      "toCity": "arrival city e.g. Jeddah",
      "departDate": "YYYY-MM-DD or null",
      "basePrice": number or null,
      "currency": "IDR or EGP or USD or SAR",
      "flightNumber": "flight number e.g. QR818 or GA507, null if not shown",
      "etd": "HH:MM departure time in 24h format e.g. 23:55, null if not shown",
      "eta": "HH:MM arrival time in 24h format e.g. 05:30, null if not shown",
      "terminal": "terminal info e.g. T3 or Terminal 2, null if not shown",
      "transitCode": "IATA 3-letter transit/stopover airport e.g. DOH, null if direct flight",
      "transitCity": "transit city name e.g. Doha, null if direct",
      "transitDuration": "transit/layover duration e.g. 2h 30m, null if not shown or direct"
    }
  ]
}

EXTRACTION RULES:
- Extract ALL flights visible, not just one.
- airlineCode IATA 2-letter: QR=Qatar Airways, SV=Saudia, EK=Emirates, GA=Garuda Indonesia, SQ=Singapore Airlines, EY=Etihad, TK=Turkish Airlines, MS=EgyptAir, AI=Air India, KU=Kuwait Airways, WY=Oman Air, GF=Gulf Air, MH=Malaysia Airlines, CX=Cathay Pacific.
- Airport codes IATA 3-letter: CGK=Jakarta Soekarno-Hatta, SUB=Surabaya, JED=Jeddah, MED=Madinah, RUH=Riyadh, CAI=Cairo, DOH=Doha, DXB=Dubai, AUH=Abu Dhabi, KUL=Kuala Lumpur, SIN=Singapore, IST=Istanbul, KWI=Kuwait City, MCT=Muscat, BAH=Bahrain, AMM=Amman, BKK=Bangkok.
- currency: detect from symbol (Rp/IDR=IDR, EGP/£E/جنيه=EGP, $=USD, SAR/SR/ريال=SAR). Default IDR if unclear.
- basePrice: numeric only, no currency symbols. null if unreadable.
- departDate: YYYY-MM-DD. null if not shown.
- flightNumber: include airline prefix e.g. "QR818" not just "818". null if not visible.
- etd/eta: 24-hour HH:MM format. Convert 12h to 24h. null if not shown.
- terminal: only if explicitly shown, e.g. "T3", "Terminal 2", "T2D". null otherwise.
- transitCode/transitCity: fill both if there is a stopover/transit. null if direct flight.
- transitDuration: layover time at transit, not total flight time. null if not shown.
- Return {"tickets":[]} if no clear flight data is found.`;

// ── OpenAI Vision call ───────────────────────────────────────────────────────

async function callOpenAIVision(dataUrl: string, apiKey: string): Promise<ParsedTicketPrice[]> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.05,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL flight ticket data from this screenshot. Include flight numbers, departure/arrival times, terminal, and transit info if visible. Return JSON object with 'tickets' array.",
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

  const tickets = Array.isArray(parsed) ? parsed : ((parsed as { tickets?: ParsedTicketPrice[] }).tickets ?? []);

  return tickets.map((t) => ({
    airline:          String(t.airline ?? "").trim() || "Unknown Airline",
    airlineCode:      String(t.airlineCode ?? "").trim().toUpperCase().slice(0, 2) || "??",
    fromCode:         String(t.fromCode ?? "").trim().toUpperCase().slice(0, 3) || "???",
    fromCity:         String(t.fromCity ?? "").trim(),
    toCode:           String(t.toCode ?? "").trim().toUpperCase().slice(0, 3) || "???",
    toCity:           String(t.toCity ?? "").trim(),
    departDate:       /^\d{4}-\d{2}-\d{2}$/.test(String(t.departDate ?? "")) ? String(t.departDate) : null,
    basePrice:        t.basePrice != null && !isNaN(Number(t.basePrice)) ? Number(t.basePrice) : null,
    currency:         (["IDR","EGP","USD","SAR"].includes(String(t.currency ?? "")) ? t.currency : "IDR") as ParsedTicketPrice["currency"],
    flightNumber:     t.flightNumber ? String(t.flightNumber).trim().toUpperCase() : null,
    etd:              /^\d{1,2}:\d{2}$/.test(String(t.etd ?? "")) ? String(t.etd).padStart(5, "0") : null,
    eta:              /^\d{1,2}:\d{2}$/.test(String(t.eta ?? "")) ? String(t.eta).padStart(5, "0") : null,
    terminal:         t.terminal ? String(t.terminal).trim() : null,
    transitCode:      t.transitCode ? String(t.transitCode).trim().toUpperCase().slice(0, 3) : null,
    transitCity:      t.transitCity ? String(t.transitCity).trim() : null,
    transitDuration:  t.transitDuration ? String(t.transitDuration).trim() : null,
  }));
}

// ── Main entry ───────────────────────────────────────────────────────────────

export interface ScanResult {
  tickets: ParsedTicketPrice[];
  usedAI: boolean;
  error?: string;
}

export async function scanTicketPriceScreenshot(imageSource: File | string): Promise<ScanResult> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  if (!apiKey || apiKey.length < 10) {
    return {
      tickets: [],
      usedAI: false,
      error: "VITE_OPENAI_API_KEY belum di-set. Set API key untuk menggunakan AI OCR.",
    };
  }

  try {
    const rawDataUrl = imageSource instanceof File ? await fileToDataUrl(imageSource) : imageSource;
    const dataUrl = await compressImage(rawDataUrl, 1800);
    const tickets = await callOpenAIVision(dataUrl, apiKey);
    return { tickets, usedAI: true };
  } catch (err) {
    return {
      tickets: [],
      usedAI: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map IATA 2-letter → airhex logo URL */
export function getAirlineLogoUrl(code: string): string {
  const c = code.trim().toUpperCase();
  return `https://content.airhex.com/content/logos/airlines_${c}_50_50_s.png`;
}

/** Airline brand gradient by IATA code */
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
