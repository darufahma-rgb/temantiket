/**
 * ticketPriceAI — ekstrak daftar harga tiket dari screenshot menggunakan
 * OpenAI gpt-4o-mini Vision API.
 *
 * Return array ParsedTicketPrice — bisa lebih dari 1 tiket per screenshot.
 */

export interface ParsedTicketPrice {
  airline: string;
  airlineCode: string;    // IATA 2-letter e.g. "QR"
  fromCode: string;       // IATA 3-letter e.g. "CGK"
  fromCity: string;
  toCode: string;         // IATA 3-letter e.g. "JED"
  toCity: string;
  departDate: string | null; // YYYY-MM-DD or null
  basePrice: number | null;
  currency: "IDR" | "EGP" | "USD" | "SAR";
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

async function compressImage(dataUrl: string, maxEdge = 1600): Promise<string> {
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
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl); // fallback: pakai asli
    img.src = dataUrl;
  });
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a flight ticket price extractor for an Indonesian travel agency (Temantiket).
Given a screenshot of airline ticket prices (from booking systems, Galileo GDS, WhatsApp screenshots, price lists, Trip.com, Traveloka, etc.), extract ALL visible tickets/flights.

Return ONLY a valid JSON array (no markdown, no explanation, no prose):
[
  {
    "airline": "full airline name e.g. Qatar Airways",
    "airlineCode": "IATA 2-letter code e.g. QR",
    "fromCode": "IATA 3-letter airport code e.g. CGK",
    "fromCity": "city name e.g. Jakarta",
    "toCode": "IATA 3-letter airport code e.g. JED",
    "toCity": "city name e.g. Jeddah",
    "departDate": "YYYY-MM-DD or null if not shown",
    "basePrice": number or null,
    "currency": "IDR or EGP or USD or SAR"
  }
]

Rules:
- Extract ALL tickets visible, not just one.
- airlineCode: IATA 2-letter (QR=Qatar Airways, SV=Saudia, EK=Emirates, GA=Garuda, SQ=Singapore Airlines, EY=Etihad, TK=Turkish, MS=EgyptAir, AI=Air India, KU=Kuwait Airways, WY=Oman Air, GF=Gulf Air).
- fromCode/toCode: IATA 3-letter airport (CGK=Jakarta, SUB=Surabaya, JED=Jeddah, MED=Madinah, RUH=Riyadh, CAI=Cairo, DOH=Doha, DXB=Dubai, AUH=Abu Dhabi, KUL=Kuala Lumpur, SIN=Singapore, IST=Istanbul, KWI=Kuwait).
- currency: detect from symbol (Rp/IDR=IDR, EGP/£E/جنيه=EGP, $=USD, SAR/ريال=SAR). Default IDR if unclear.
- basePrice: numeric only (no currency symbols). null if unreadable.
- departDate: YYYY-MM-DD. null if not shown or flexible.
- Return [] if no clear flight price data is found.`;

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
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all flight ticket prices from this screenshot and return a JSON object with a 'tickets' array." },
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

  const tickets = Array.isArray(parsed) ? parsed : (parsed.tickets ?? []);

  return tickets.map((t) => ({
    airline:     String(t.airline ?? "").trim() || "Unknown Airline",
    airlineCode: String(t.airlineCode ?? "").trim().toUpperCase().slice(0, 2) || "??",
    fromCode:    String(t.fromCode ?? "").trim().toUpperCase().slice(0, 3) || "???",
    fromCity:    String(t.fromCity ?? "").trim(),
    toCode:      String(t.toCode ?? "").trim().toUpperCase().slice(0, 3) || "???",
    toCity:      String(t.toCity ?? "").trim(),
    departDate:  /^\d{4}-\d{2}-\d{2}$/.test(String(t.departDate ?? "")) ? String(t.departDate) : null,
    basePrice:   t.basePrice != null && !isNaN(Number(t.basePrice)) ? Number(t.basePrice) : null,
    currency:    (["IDR","EGP","USD","SAR"].includes(String(t.currency ?? "")) ? t.currency : "IDR") as ParsedTicketPrice["currency"],
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
    const dataUrl = await compressImage(rawDataUrl, 1600);
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

/** Airline brand colors by code */
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
};

export function getAirlineGradient(code: string): string {
  return AIRLINE_COLORS[code.toUpperCase()] ?? "from-slate-600 to-slate-800";
}
