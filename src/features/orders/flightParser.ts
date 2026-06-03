/**
 * Magic Parser untuk tiket pesawat.
 *
 * Tujuan: kasih satu textarea, lo paste raw text dari Galileo, Trip.com,
 * atau itinerary email → form Tiket Pesawat ke-fill otomatis.
 *
 * Strategi: kombinasi regex + heuristik. Bukan parser strict (format
 * Galileo/Trip.com ada banyak variasi), tapi cukup buat narik field
 * yang paling sering dibutuhkan: PNR, airline, flight number, rute
 * (origin → destination via IATA 3-letter), tanggal & jam, harga.
 *
 * Tiap field bersifat best-effort — kalau parser miss, user tinggal
 * koreksi di form. Lebih bagus auto-fill 6 field benar daripada
 * 0 field karena strict-format.
 */

export interface ParsedFlight {
  pnr?: string;
  airline?: string;
  flightNumber?: string;
  fromCode?: string;
  fromCity?: string;
  toCode?: string;
  toCity?: string;
  /** YYYY-MM-DD */
  departDate?: string;
  /** HH:MM (24h) */
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
  passengerName?: string;
  costPrice?: number;
  sellPrice?: number;
  tripType?: "one_way" | "return";
  returnFromCode?: string;
  returnFromCity?: string;
  returnToCode?: string;
  returnToCity?: string;
  returnDate?: string;
  returnDepartTime?: string;
  returnArriveDate?: string;
  returnArriveTime?: string;
  returnFlightNumber?: string;
  /** Kode bandara transit (jika penerbangan via transit) */
  transitCode?: string;
  /** Nama kota transit */
  transitCity?: string;
}

// ── Constant tables ────────────────────────────────────────────────────────

/**
 * Mapping IATA airline code → human name. Sengaja ringkas — kalau tidak ada
 * di sini, kita tetap simpan kode-nya sebagai airline (mis. "GA").
 */
const AIRLINE_BY_IATA: Record<string, string> = {
  GA: "Garuda Indonesia",
  QZ: "AirAsia Indonesia",
  AK: "AirAsia",
  D7: "AirAsia X",
  ID: "Batik Air",
  JT: "Lion Air",
  IW: "Wings Air",
  QG: "Citilink",
  SJ: "Sriwijaya Air",
  IN: "Nam Air",
  XT: "Indonesia AirAsia X",
  SQ: "Singapore Airlines",
  MH: "Malaysia Airlines",
  TR: "Scoot",
  TG: "Thai Airways",
  CX: "Cathay Pacific",
  EK: "Emirates",
  EY: "Etihad",
  QR: "Qatar Airways",
  SV: "Saudia",
  XY: "flynas",
  MS: "EgyptAir",
  TK: "Turkish Airlines",
  KL: "KLM",
  AF: "Air France",
  LH: "Lufthansa",
  BA: "British Airways",
  CI: "China Airlines",
  CZ: "China Southern",
  KE: "Korean Air",
  OZ: "Asiana",
  NH: "ANA",
  JL: "JAL",
  PR: "Philippine Airlines",
  VN: "Vietnam Airlines",
  TZ: "Scoot Tigerair",
  // Gulf / Middle East
  GF: "Gulf Air",
  G9: "Air Arabia",
  FZ: "flydubai",
  WY: "Oman Air",
  KU: "Kuwait Airways",
  RJ: "Royal Jordanian",
  ME: "Middle East Airlines",
  GS: "Air Arabia Abu Dhabi",
  // African / others common in Umrah routes
  ET: "Ethiopian Airlines",
  AT: "Royal Air Maroc",
  TU: "Tunisair",
};

/**
 * IATA city/airport code → display name. Cuma yang relevan ke market
 * Indonesia / Umrah / regional Asia.
 */
const CITY_BY_IATA: Record<string, string> = {
  // Indonesia
  CGK: "Jakarta",
  HLP: "Jakarta (Halim)",
  SUB: "Surabaya",
  DPS: "Denpasar",
  KNO: "Medan",
  BTH: "Batam",
  UPG: "Makassar",
  YIA: "Yogyakarta",
  SOC: "Solo",
  PDG: "Padang",
  BPN: "Balikpapan",
  PKU: "Pekanbaru",
  PLM: "Palembang",
  // Saudi Arabia / Umrah / Haji
  JED: "Jeddah",
  MED: "Madinah",
  RUH: "Riyadh",
  DMM: "Dammam",
  // Middle East hubs
  BAH: "Bahrain",
  KWI: "Kuwait City",
  AMM: "Amman",
  MCT: "Muscat",
  AHB: "Abha",
  TIF: "Taif",
  // Gulf & regional hubs
  KUL: "Kuala Lumpur",
  SIN: "Singapore",
  BKK: "Bangkok",
  DOH: "Doha",
  DXB: "Dubai",
  AUH: "Abu Dhabi",
  SHJ: "Sharjah",
  IST: "Istanbul",
  // Africa / North Africa
  CAI: "Cairo",
  ALG: "Algiers",
  TUN: "Tunis",
  CMN: "Casablanca",
  ADD: "Addis Ababa",
  // Asia & long-haul
  HKG: "Hong Kong",
  TPE: "Taipei",
  ICN: "Seoul",
  HND: "Tokyo",
  NRT: "Tokyo (Narita)",
  BOM: "Mumbai",
  DEL: "New Delhi",
  GOI: "Goa",
  HYD: "Hyderabad",
  MAA: "Chennai",
  COK: "Kochi",
  CCU: "Kolkata",
  // Europe
  AMS: "Amsterdam",
  CDG: "Paris",
  LHR: "London",
  FRA: "Frankfurt",
  JFK: "New York",
};

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Indonesian aliases yang sering muncul di e-tiket Trip.com
  mei: 5, agt: 8, agu: 8, agust: 8, agustus: 8, ags: 8,
  okt: 10, des: 12, januari: 1, februari: 2, maret: 3,
  april: 4, juni: 6, juli: 7, september: 9, oktober: 10,
  november: 11, desember: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse "15MAR" / "15 MAR 2026" / "15 Mei 2026" → YYYY-MM-DD. */
function parseDateLoose(raw: string, fallbackYear?: number): string | undefined {
  const cleaned = raw.trim().replace(/[,]/g, " ");
  // 15MAR, 15MAR26, 15 MAR 2026, 15-Mar-26
  const m = cleaned.match(/^(\d{1,2})[\s\-/]?([A-Za-z]+)[\s\-/]?(\d{2,4})?$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mon = MONTH_BY_NAME[m[2].toLowerCase().slice(0, 3)] ?? MONTH_BY_NAME[m[2].toLowerCase()];
    if (!mon) return;
    let yy = m[3] ? parseInt(m[3], 10) : (fallbackYear ?? new Date().getFullYear());
    if (yy < 100) yy = 2000 + yy;
    if (dd < 1 || dd > 31) return;
    return `${yy}-${pad2(mon)}-${pad2(dd)}`;
  }
  // 2026-03-15 / 2026/03/15
  const iso = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${pad2(parseInt(iso[2], 10))}-${pad2(parseInt(iso[3], 10))}`;
  }
  // 15/03/2026 / 15-03-2026
  const dmy = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    let yy = parseInt(dmy[3], 10);
    if (yy < 100) yy = 2000 + yy;
    return `${yy}-${pad2(parseInt(dmy[2], 10))}-${pad2(parseInt(dmy[1], 10))}`;
  }
  return;
}

/** Parse "1430" / "14:30" / "2:30 PM" → "HH:MM" 24h. */
function parseTimeLoose(raw: string): string | undefined {
  // Handle dot-separated time: "20.05" → "20:05"
  if (/^\d{1,2}\.\d{2}$/.test(raw.trim())) {
    raw = raw.trim().replace(".", ":");
  }
  const t = raw.trim().toUpperCase();
  // 1430 (Galileo) — 4 digits exact
  let m = t.match(/^(\d{2})(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (h >= 0 && h < 24 && mm >= 0 && mm < 60) return `${pad2(h)}:${pad2(mm)}`;
  }
  // 14:30, 2:30PM
  m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ampm = m[3];
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    if (h >= 0 && h < 24 && mm >= 0 && mm < 60) return `${pad2(h)}:${pad2(mm)}`;
  }
  return;
}

/** "Rp 5.250.000" / "IDR 5,250,000" / "5250000" → 5250000 */
function parseMoney(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d]/g, "");
  if (!cleaned) return;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : undefined;
}

// ── Field extractors ───────────────────────────────────────────────────────

function extractPNR(text: string): string | undefined {
  // Cari label "PNR", "Booking Code", "Kode Booking", "Reservation"
  const m = text.match(
    /(?:PNR|booking\s*(?:code|reference|ref)|kode\s*booking|reservation\s*code|record\s*locator)\s*[:#]?\s*([A-Z0-9]{5,8})/i,
  );
  if (m) return m[1].toUpperCase();
  // Galileo plain: 6-char alphanumeric biasanya muncul setelah baris "RLOC" atau standalone uppercase
  const rloc = text.match(/RLOC\s+\S+\s+([A-Z0-9]{6})/i);
  if (rloc) return rloc[1].toUpperCase();
  return;
}

function extractFlightNumber(text: string): { airlineCode?: string; flightNumber?: string } {
  // Format: 2 huruf + 2-4 angka (mis "GA 980", "QR1234")
  // Tapi hindari match harga atau kode lain — wajib di awal kata atau after whitespace
  const m = text.match(/(?:^|[\s,(])([A-Z]{2})\s?(\d{2,4})(?:\b|[/\s])/);
  if (m) {
    return { airlineCode: m[1].toUpperCase(), flightNumber: `${m[1].toUpperCase()}${m[2]}` };
  }
  return {};
}

/**
 * Extract origin/destination IATA codes.
 *
 * Strategi:
 * 1. Cari pattern Galileo "CGKJED" (6 huruf langsung) atau "CGK JED" / "CGK-JED".
 * 2. Fallback: cari semua IATA-like 3-letter uppercase token, ambil 2 pertama
 *    yang ada di whitelist CITY_BY_IATA.
 */
function extractRoute(text: string): { fromCode?: string; toCode?: string } {
  // Pattern eksplisit: "CGK-JED", "CGK→JED", "CGK > JED", "CGK to JED", "CGK JED"
  const explicit = text.match(/\b([A-Z]{3})\s*(?:[-→>]|to)\s*([A-Z]{3})\b/);
  if (explicit) return { fromCode: explicit[1], toCode: explicit[2] };

  // Galileo style: 6-char airport pair right after flight class code (mis "Y 15MAR CGKJED")
  const galileo = text.match(/\b([A-Z]{3})([A-Z]{3})\b\s*(?:HK|TK|KL|HL|XX|UC)?\d?/);
  if (galileo) {
    if (CITY_BY_IATA[galileo[1]] || CITY_BY_IATA[galileo[2]]) {
      return { fromCode: galileo[1], toCode: galileo[2] };
    }
  }

  // Fallback: scan uppercase 3-letter tokens, ambil 2 pertama yg dikenal
  const tokens = text.match(/\b[A-Z]{3}\b/g) ?? [];
  const known = tokens.filter((t) => CITY_BY_IATA[t]);
  if (known.length >= 2) {
    return { fromCode: known[0], toCode: known[1] };
  }
  if (known.length === 1) {
    return { fromCode: known[0] };
  }
  return {};
}

function extractDateAndTime(text: string): {
  departDate?: string;
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
} {
  const out: ReturnType<typeof extractDateAndTime> = {};

  // ── Galileo: "1 GA 980 Y 15MAR 4 CGKJED HK1 1700 0030 16MAR" ──
  // Pattern: <airline> <flight#> <class> <DDMMM> ... <CCC><CCC> <status?> <dep4> <arr4> <DDMMM?>
  const galileoM = text.match(
    /\b[A-Z]{2}\s?\d{2,4}\s+\w?\s*(\d{1,2}[A-Z]{3})\s*\d?\s*([A-Z]{6})\s+\w{0,3}\d?\s+(\d{4})\s+(\d{4})(?:\s+(\d{1,2}[A-Z]{3}))?/,
  );
  if (galileoM) {
    out.departDate = parseDateLoose(galileoM[1]);
    out.departTime = parseTimeLoose(galileoM[3]);
    out.arriveTime = parseTimeLoose(galileoM[4]);
    out.arriveDate = galileoM[5] ? parseDateLoose(galileoM[5]) : out.departDate;
    return out;
  }

  // ── WhatsApp itinerary format: "Berangkat* – 26 Agustus 2026\nCAI 20.05 → DXB 00.40" ──
  const waPattern = text.match(
    /(?:Berangkat|Perjalanan\s*1)[^–\-\n]*[–\-]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\s*[\r\n]+\s*([A-Z]{3})\s+([\d.]+)\s*[→>]\s*([A-Z]{3})\s+([\d.]+)/i
  );
  if (waPattern) {
    out.departDate = parseDateLoose(waPattern[1]);
    out.departTime = parseTimeLoose(waPattern[3].replace(".", ":"));
    out.arriveTime = parseTimeLoose(waPattern[5].replace(".", ":"));
    return out;
  }

  // ── Generic e-ticket: "Departure: 15 Mar 2026, 14:30" ──
  const depLine = text.match(
    /(?:depart(?:ure)?|berangkat|tgl\s*berangkat)\s*[:-]?\s*([0-9]{1,2}[\s\-/A-Za-z0-9]{2,18}\d{2,4})[,\s]+(?:at\s*)?([\d:APMapm]{4,8})/i,
  );
  if (depLine) {
    out.departDate = parseDateLoose(depLine[1]);
    out.departTime = parseTimeLoose(depLine[2]);
  }
  const arrLine = text.match(
    /(?:arriv(?:e|al)|tiba|sampai)\s*[:-]?\s*([0-9]{1,2}[\s\-/A-Za-z0-9]{2,18}\d{2,4})[,\s]+(?:at\s*)?([\d:APMapm]{4,8})/i,
  );
  if (arrLine) {
    out.arriveDate = parseDateLoose(arrLine[1]);
    out.arriveTime = parseTimeLoose(arrLine[2]);
  }

  // Fallback: ambil tanggal pertama saja
  if (!out.departDate) {
    const anyDate = text.match(/\b(\d{1,2}\s*(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Agt|Ags|Sep|Oct|Okt|Nov|Dec|Des)[a-z]*\s*\d{2,4})\b/i);
    if (anyDate) out.departDate = parseDateLoose(anyDate[1]);
  }
  if (!out.departTime) {
    const anyTime = text.match(/\b(\d{1,2}[:.]\d{2}(?:\s?[APap][Mm])?)\b/);
    if (anyTime) out.departTime = parseTimeLoose(anyTime[1].replace(".", ":"));
  }

  return out;
}

function extractPrices(text: string): { costPrice?: number; sellPrice?: number } {
  const out: ReturnType<typeof extractPrices> = {};
  // Cost price (modal): label "Modal", "HPP", "Cost"
  const cost = text.match(/(?:harga\s*modal|modal|HPP|cost(?:\s*price)?)\s*[:-]?\s*(?:Rp|IDR)?\s*([\d.,]+)/i);
  if (cost) out.costPrice = parseMoney(cost[1]);

  // Sell price (jual): label "Jual", "Total", "Selling", "Price", "Harga"
  const sell = text.match(/(?:harga\s*jual|jual|total\s*(?:price|harga|bayar)?|selling\s*price|price)\s*[:-]?\s*(?:Rp|IDR)?\s*([\d.,]+)/i);
  if (sell) out.sellPrice = parseMoney(sell[1]);

  return out;
}

function extractPassengerName(text: string): string | undefined {
  // Trip.com: "Passenger: SMITH/JOHN MR" atau "Nama Penumpang: ..."
  const m = text.match(/(?:passenger|penumpang|nama\s*penumpang|nama)\s*[:-]\s*([A-Za-z][A-Za-z\s/.,'-]{2,60})/i);
  if (m) {
    let name = m[1].trim().split(/\n/)[0].trim();
    // Galileo format "SMITH/JOHN MR" → "JOHN SMITH"
    if (name.includes("/")) {
      const [last, firstWithTitle] = name.split("/");
      const first = firstWithTitle.replace(/\s+(MR|MRS|MS|MISS|MSTR|CHD|INF)\.?$/i, "").trim();
      name = `${first} ${last}`.trim();
    }
    return name;
  }
  return;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse raw text dari Galileo / Trip.com / itinerary email → ParsedFlight.
 * Best-effort. Field yang gagal di-extract tinggal undefined.
 */
export function parseFlightText(rawText: string): ParsedFlight {
  if (!rawText || !rawText.trim()) return {};
  // Normalize: whitespace, jangan ubah case karena IATA & class code case-sensitive
  const text = rawText.replace(/\u00A0/g, " ").replace(/\t/g, " ");

  const route = extractRoute(text);
  const flight = extractFlightNumber(text);
  const dt = extractDateAndTime(text);
  const prices = extractPrices(text);

  const out: ParsedFlight = {
    pnr: extractPNR(text),
    airline: flight.airlineCode ? AIRLINE_BY_IATA[flight.airlineCode] ?? flight.airlineCode : undefined,
    flightNumber: flight.flightNumber,
    fromCode: route.fromCode,
    fromCity: route.fromCode ? CITY_BY_IATA[route.fromCode] : undefined,
    toCode: route.toCode,
    toCity: route.toCode ? CITY_BY_IATA[route.toCode] : undefined,
    departDate: dt.departDate,
    departTime: dt.departTime,
    arriveDate: dt.arriveDate,
    arriveTime: dt.arriveTime,
    passengerName: extractPassengerName(text),
    costPrice: prices.costPrice,
    sellPrice: prices.sellPrice,
  };

  // Deteksi return trip — HANYA dari "Pulang" atau "Return", BUKAN "Perjalanan 2"
  // ("Perjalanan 2" = leg transit, bukan penerbangan pulang)
  const returnPattern = text.match(
    /(?:Pulang|Return)[^–\-\n]*[–\-]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\s*[\r\n]+\s*([A-Z]{3})\s+([\d.]+)\s*[→>]\s*([A-Z]{3})\s+([\d.]+)\s*\*?\(([A-Z]{2}\d{2,4})\)\*?/i
  );
  if (returnPattern) {
    out.tripType = "return";
    out.returnDate = parseDateLoose(returnPattern[1]);
    out.returnFromCode = returnPattern[2];
    out.returnFromCity = CITY_BY_IATA[returnPattern[2]] ?? returnPattern[2];
    out.returnToCode = returnPattern[4];
    out.returnToCity = CITY_BY_IATA[returnPattern[4]] ?? returnPattern[4];
    out.returnDepartTime = parseTimeLoose(returnPattern[3].replace(".", ":"));
    out.returnArriveTime = parseTimeLoose(returnPattern[5].replace(".", ":"));
    out.returnFlightNumber = returnPattern[6];
    // Jika jam tiba < jam berangkat → tiba keesokan harinya
    const depH = parseInt(returnPattern[3].split(".")[0], 10);
    const arrH = parseInt(returnPattern[5].split(".")[0], 10);
    if (out.returnDate) {
      if (arrH < depH) {
        const d = new Date(out.returnDate + "T00:00:00");
        d.setDate(d.getDate() + 1);
        out.returnArriveDate = d.toISOString().slice(0, 10);
      } else {
        out.returnArriveDate = out.returnDate;
      }
    }
  } else {
    out.tripType = "one_way";
  }

  // Deteksi leg transit dari "Perjalanan 2" di itinerary WhatsApp
  // "Perjalanan 2" artinya penerbangan ke-2 dalam perjalanan transit, BUKAN pulang
  const transitPattern = text.match(
    /Perjalanan\s*2[^–\-\n]*[–\-]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\s*[\r\n]+\s*([A-Z]{3})\s+([\d.]+)\s*[→>]\s*([A-Z]{3})\s+([\d.]+)\s*\*?\(([A-Z]{2}\d{2,4})\)\*?/i
  );
  if (transitPattern && !out.returnFromCode) {
    // Leg 2 adalah transit — update tujuan ke destinasi akhir
    // Bandara transit = toCode saat ini (misal DXB)
    // Destinasi akhir = toCode leg 2 (misal CGK)
    if (out.toCode) {
      out.transitCode = out.toCode;
      out.transitCity = out.toCity ?? CITY_BY_IATA[out.toCode] ?? out.toCode;
    }
    out.toCode = transitPattern[4];
    out.toCity = CITY_BY_IATA[transitPattern[4]] ?? transitPattern[4];
    // Update jam tiba ke jam tiba leg terakhir
    out.arriveTime = parseTimeLoose(transitPattern[5].replace(".", ":"));
    // Update tanggal tiba
    const depH2 = parseInt(transitPattern[3].split(".")[0], 10);
    const arrH2 = parseInt(transitPattern[5].split(".")[0], 10);
    const leg2Date = parseDateLoose(transitPattern[1]);
    if (leg2Date) {
      if (arrH2 < depH2) {
        const d = new Date(leg2Date + "T00:00:00");
        d.setDate(d.getDate() + 1);
        out.arriveDate = d.toISOString().slice(0, 10);
      } else {
        out.arriveDate = leg2Date;
      }
    }
    // Gabungkan nomor penerbangan: misal EK924/EK356
    if (transitPattern[6] && out.flightNumber) {
      out.flightNumber = `${out.flightNumber}/${transitPattern[6]}`;
    }
    out.tripType = "one_way";
  }

  // Strip undefined keys agar Object.assign ke flight metadata bersih
  const cleaned: ParsedFlight = {};
  (Object.keys(out) as (keyof ParsedFlight)[]).forEach((k) => {
    const v = out[k];
    if (v !== undefined && v !== "") (cleaned as Record<string, unknown>)[k] = v;
  });
  return cleaned;
}

/**
 * Build a 1-line route label e.g. "CGK → JED · Jakarta → Jeddah"
 */
export function formatRoute(meta: Pick<ParsedFlight, "fromCode" | "toCode" | "fromCity" | "toCity">): string {
  if (!meta.fromCode && !meta.toCode) return "";
  const codes = [meta.fromCode ?? "???", meta.toCode ?? "???"].join(" → ");
  const cities = [meta.fromCity, meta.toCity].filter(Boolean).join(" → ");
  return cities ? `${codes} · ${cities}` : codes;
}

/** Lookup helper utk dropdown / autocomplete UI di masa depan. */
export const KNOWN_AIRPORTS = CITY_BY_IATA;
export const KNOWN_AIRLINES = AIRLINE_BY_IATA;
