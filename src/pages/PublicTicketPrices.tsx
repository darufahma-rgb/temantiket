/**
 * PublicTicketPrices — halaman publik daftar harga tiket
 * Routes: /harga-tiket, /promo, /prices (no auth required)
 *
 * Fase 22: Advanced Filter & Sort Bar
 * - Real-time search (rute + maskapai)
 * - Filter bulan keberangkatan & maskapai dropdown
 * - Filter direct/transit
 * - Smart sort: harga terendah, tanggal terdekat, default
 * - Mobile-first, WhatsApp-friendly UI
 */
import { useState, useEffect, useMemo } from "react";
import {
  Plane, MessageCircle, Clock, RefreshCw, Loader2,
  Search, SlidersHorizontal, X, ArrowUpDown, ChevronDown,
  TrendingUp, CalendarDays, Filter, Globe, ShieldCheck, Zap, HeadphonesIcon,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAirlineGradient, getAirlineLogoUrl,
  decodeMultiLeg, decodeReturnLeg, buildRouteLabel,
} from "@/lib/ticketPriceAI";
import {
  listTicketPrices, loadMarkup, sellingPrice, isExpired, fmtIDR, fmtDate,
  type TicketPrice,
} from "@/features/ticketPrices/ticketPricesRepo";
import { useRatesStore } from "@/store/ratesStore";
import { loadIghAdminSettings, whatsappUrl } from "@/lib/ighSettings";

// ── Types ─────────────────────────────────────────────────────────────────────
type SortKey = "default" | "price_asc" | "price_desc" | "date_asc";
type FlightType = "all" | "direct" | "transit";

interface Filters {
  search: string;
  month: string;
  airline: string;
  flightType: FlightType;
  sort: SortKey;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  month: "",
  airline: "",
  flightType: "all",
  sort: "default",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const idx = parseInt(m, 10) - 1;
  return `${names[idx] ?? m} ${y}`;
}

function dateToMs(d?: string): number {
  if (!d || d.toLowerCase().includes("fleks")) return Infinity;
  const parsed = Date.parse(d);
  return isNaN(parsed) ? Infinity : parsed;
}

function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.search) n++;
  if (f.month) n++;
  if (f.airline) n++;
  if (f.flightType !== "all") n++;
  if (f.sort !== "default") n++;
  return n;
}

// ── Airline Logo ──────────────────────────────────────────────────────────────
const LOCAL_AIRLINE_LOGOS = new Set(["QR","EK","EY","GA","TK","WY","SV","MS"]);

function AirlineLogo({ code, airline, size = 40 }: { code: string; airline: string; size?: number }) {
  const c = (code || "").trim().toUpperCase();
  const grad = getAirlineGradient(c);
  const localSrc = LOCAL_AIRLINE_LOGOS.has(c) ? `/airlines/${c}.png` : null;
  const cdnSrc = getAirlineLogoUrl(c);

  const [src, setSrc] = useState<string | null>(localSrc ?? cdnSrc);
  const [triedCdn, setTriedCdn] = useState(!localSrc);

  if (!src || !c || c === "??") {
    return (
      <div
        className={cn("flex items-center justify-center rounded-xl bg-gradient-to-br text-white font-bold shrink-0", grad)}
        style={{ width: size, height: size, fontSize: size * 0.32 }}
      >
        {c.slice(0, 2) || <Plane className="w-4 h-4" />}
      </div>
    );
  }

  const handleError = () => {
    if (!triedCdn) {
      setSrc(cdnSrc);
      setTriedCdn(true);
    } else {
      setSrc(null);
    }
  };

  return (
    <img
      src={src}
      alt={airline}
      width={size} height={size}
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
      onError={handleError}
    />
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────
function FilterBar({
  filters,
  onChange,
  uniqueAirlines,
  uniqueMonths,
  resultCount,
  totalCount,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  uniqueAirlines: string[];
  uniqueMonths: string[];
  resultCount: number;
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = activeFilterCount(filters);
  const hasFilters = count > 0;

  const sortLabels: Record<SortKey, string> = {
    default: "Default",
    price_asc: "Harga Termurah",
    price_desc: "Harga Tertinggi",
    date_asc: "Tanggal Terdekat",
  };

  return (
    <div className="bg-white border-b border-slate-100 shadow-sm sticky top-[57px] z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 space-y-2.5">

        {/* ── Row 1: Search + toggle ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              placeholder="Cari rute (CGK, JED…) atau maskapai…"
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors placeholder:text-slate-400"
            />
            {filters.search && (
              <button
                onClick={() => onChange({ search: "" })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors shrink-0",
              expanded || hasFilters
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100",
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filter</span>
            {count > 0 && (
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white text-sky-600 text-[10px] font-bold">
                {count}
              </span>
            )}
          </button>
        </div>

        {/* ── Row 2: Expanded filters ── */}
        {expanded && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-1">
            {/* Bulan */}
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={filters.month}
                onChange={(e) => onChange({ month: e.target.value })}
                className="w-full appearance-none pl-8 pr-6 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700 font-medium"
              >
                <option value="">Semua Bulan</option>
                {uniqueMonths.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Maskapai */}
            <div className="relative">
              <Plane className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={filters.airline}
                onChange={(e) => onChange({ airline: e.target.value })}
                className="w-full appearance-none pl-8 pr-6 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700 font-medium"
              >
                <option value="">Semua Maskapai</option>
                {uniqueAirlines.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Jenis penerbangan */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[12px] font-semibold">
              {(["all", "direct", "transit"] as FlightType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => onChange({ flightType: t })}
                  className={cn(
                    "flex-1 py-2 transition-colors",
                    filters.flightType === t
                      ? "bg-sky-600 text-white"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100",
                  )}
                >
                  {t === "all" ? "Semua" : t === "direct" ? "Langsung" : "Transit"}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="relative">
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={filters.sort}
                onChange={(e) => onChange({ sort: e.target.value as SortKey })}
                className="w-full appearance-none pl-8 pr-6 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700 font-medium"
              >
                {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                  <option key={k} value={k}>{sortLabels[k]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* ── Quick sort chips (always visible) ── */}
        {!expanded && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none -mx-0">
            {/* Flight type pills */}
            {(["direct", "transit"] as FlightType[]).map((t) => (
              <button
                key={t}
                onClick={() => onChange({ flightType: filters.flightType === t ? "all" : t })}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors shrink-0",
                  filters.flightType === t
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                )}
              >
                {t === "direct" ? "✈️ Langsung" : "🔄 Transit"}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 shrink-0" />

            {/* Sort pills */}
            <button
              onClick={() => onChange({ sort: filters.sort === "price_asc" ? "default" : "price_asc" })}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors shrink-0",
                filters.sort === "price_asc"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
              )}
            >
              <TrendingUp className="w-3 h-3" />
              Termurah
            </button>

            <button
              onClick={() => onChange({ sort: filters.sort === "date_asc" ? "default" : "date_asc" })}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors shrink-0",
                filters.sort === "date_asc"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
              )}
            >
              <CalendarDays className="w-3 h-3" />
              Terdekat
            </button>

            {/* Month quick pills */}
            {uniqueMonths.slice(0, 3).map((m) => (
              <button
                key={m}
                onClick={() => onChange({ month: filters.month === m ? "" : m })}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors shrink-0",
                  filters.month === m
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                )}
              >
                {monthLabel(m)}
              </button>
            ))}

            {/* Clear all */}
            {hasFilters && (
              <>
                <div className="h-4 w-px bg-slate-200 shrink-0" />
                <button
                  onClick={() => onChange(EMPTY_FILTERS)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 whitespace-nowrap shrink-0 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Reset
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Result count ── */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            {hasFilters
              ? <span><span className="font-bold text-sky-600">{resultCount}</span> dari {totalCount} rute cocok</span>
              : <span><span className="font-bold text-slate-600">{totalCount}</span> rute tersedia</span>
            }
          </p>
          {expanded && hasFilters && (
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              className="text-[11px] text-red-500 font-semibold hover:underline"
            >
              Reset semua filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Public Boarding Pass Card ─────────────────────────────────────────────────
const SK = "'Sk-Modernist', 'Inter', sans-serif";

function PublicCard({
  item, markup, rates, waNumber,
}: {
  item: TicketPrice;
  markup: number;
  rates: Record<string, number>;
  waNumber: string;
}) {
  const expired = isExpired(item.validUntil);
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);
  const isDirect = !item.transitCode;

  // Decode RT / ML encoded notes — same logic as internal BoardingPassCard
  const { ml: mlData, userNotes: mlUserNotes } = decodeMultiLeg(item.notes);
  const isML = !!mlData;
  const { leg: returnLeg, userNotes: rtUserNotes } = isML
    ? { leg: null, userNotes: null }
    : decodeReturnLeg(item.notes);
  const isRT = !!returnLeg;
  const userNotes = mlUserNotes ?? rtUserNotes;
  const isRTorML = isRT || isML;

  // Compact route label
  const fromLabel = item.fromCity || item.fromCode;
  const toLabel   = item.toCity   || item.toCode;
  const viaLabel  = item.transitCity || item.transitCode;
  const compactRoute = isML
    ? buildRouteLabel(mlData!)
    : isRT
      ? `${fromLabel} ⇄ ${toLabel}${viaLabel ? ` via ${viaLabel}` : ""}`
      : `${fromLabel} → ${toLabel}${viaLabel ? ` via ${viaLabel}` : ""}`;

  // Return date/time
  const returnDate = isML
    ? (mlData?.returnLegs?.[0]?.date ?? null)
    : isRT ? (returnLeg?.returnDate ?? null) : null;
  const returnEtd = isML
    ? (mlData?.returnLegs?.[0]?.etd ?? null)
    : isRT ? (returnLeg?.returnEtd ?? null) : null;
  const returnFromCode = isML
    ? (mlData?.returnLegs?.[0]?.fromCode ?? null)
    : isRT ? (returnLeg?.returnFromCode ?? null) : null;

  // WhatsApp message
  const routeLabel = isML
    ? buildRouteLabel(mlData!)
    : isRT ? `${item.fromCode} ⇄ ${item.toCode}` : `${item.fromCode} → ${item.toCode}`;

  const waText = encodeURIComponent(
    `Halo Temantiket! Saya tertarik dengan tiket berikut:\n\n` +
    `✈️ *${item.airline}*\n` +
    `🗺️ Rute: *${routeLabel}*\n` +
    (isML
      ? mlData!.outboundLegs.map((l, i) =>
          `   Seg ${i+1}: ${l.fromCode}→${l.toCode}${l.flightNumber ? ` (${l.flightNumber})` : ""}${l.etd ? ` jam ${l.etd}` : ""}${l.date ? ` · ${fmtDate(l.date)}` : ""}`
        ).join("\n") + "\n"
      : isRT
        ? `   Berangkat: ${item.fromCode}→${item.toCode}${item.etd ? ` jam ${item.etd}` : ""}${item.departDate ? ` · ${fmtDate(item.departDate)}` : ""}\n` +
          `   Pulang: ${returnLeg?.returnFromCode ?? ""}→${returnLeg?.returnToCode ?? ""}${returnLeg?.returnEtd ? ` jam ${returnLeg.returnEtd}` : ""}${returnLeg?.returnDate ? ` · ${fmtDate(returnLeg.returnDate)}` : ""}\n`
        : `${item.etd || item.eta ? `🕐 ${item.etd ?? "—"} → ${item.eta ?? "—"}\n` : ""}` +
          `${item.transitCode ? `🔄 Transit: ${item.transitCity ?? item.transitCode}${item.transitDuration ? ` (${item.transitDuration})` : ""}\n` : ""}` +
          `📅 Tanggal: ${item.departDate ? fmtDate(item.departDate) : "Fleksibel"}\n`) +
    `💰 Harga: *${fmtIDR(sell)}${isRTorML ? "/paket PP" : "/pax"}*\n\n` +
    `Mohon infokan ketersediaan dan detailnya. Terima kasih!`
  );
  const waLink = waNumber
    ? `${whatsappUrl(waNumber)}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  return (
    <div
      className={cn(
        "relative rounded-3xl border bg-white flex flex-col transition-all duration-200",
        "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.10),0_1px_4px_-2px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_6px_28px_-6px_rgba(0,0,0,0.14),0_2px_8px_-2px_rgba(0,0,0,0.08)]",
        expired ? "opacity-60 border-slate-200" : "border-slate-150",
      )}
      style={{ fontFamily: SK }}
    >
      {/* ── HEADER: Airline + flight number + type badge ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <AirlineLogo code={item.airlineCode} airline={item.airline} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] text-slate-900 leading-tight truncate" style={{ fontFamily: SK, fontWeight: 700 }}>
              {item.airline}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9px] text-slate-400 font-mono tracking-wide">{item.airlineCode}</span>
              {!isRT && !isML && item.flightNumber && (
                <span className="text-[9px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5 font-mono" style={{ fontWeight: 600 }}>
                  {item.flightNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn(
            "text-[8.5px] px-2 py-0.5 rounded-full",
            isML || isRT ? "bg-violet-50 text-violet-600 border border-violet-100"
            : isDirect ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
            : "bg-amber-50 text-amber-600 border border-amber-100",
          )} style={{ fontWeight: 700 }}>
            {isML ? "Multi-Leg PP" : isRT ? "Pulang-Pergi" : isDirect ? "One Way" : "Transit"}
          </span>
          {expired && (
            <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100" style={{ fontWeight: 700 }}>
              Expired
            </span>
          )}
        </div>
      </div>

      {/* ── ROUTE SUMMARY ── */}
      <div className="px-4 pb-3">
        <div className="border-t border-dashed border-slate-100 mb-2.5" />
        <div className="flex items-start gap-1.5">
          <Plane className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[13px] text-slate-800 leading-snug flex-1 min-w-0" style={{ fontFamily: SK, fontWeight: 600 }}>
            {compactRoute}
          </p>
        </div>

        {/* Date + time — two-column for RT/ML, single for OW */}
        <div className="mt-2">
          {isRTorML && returnDate ? (
            <div className="flex items-stretch gap-0">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Berangkat</p>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-[11.5px] text-slate-700 font-semibold leading-none">
                    {item.departDate ? fmtDate(item.departDate) : "Fleksibel"}
                  </span>
                </div>
                {item.etd && (
                  <div className="flex items-center gap-1 ml-4 mt-0.5">
                    <span className="text-[11px] text-slate-700 font-mono font-semibold">{item.etd}</span>
                    {item.fromCode && (
                      <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 py-0.5 font-mono font-semibold tracking-wide">
                        {item.fromCode}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="w-px bg-slate-100 mx-3 self-stretch" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-violet-400 uppercase tracking-wide font-semibold mb-0.5">Pulang</p>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-violet-400 shrink-0" />
                  <span className="text-[11.5px] text-violet-700 font-semibold leading-none">{fmtDate(returnDate)}</span>
                </div>
                {returnEtd && (
                  <div className="flex items-center gap-1 ml-4 mt-0.5">
                    <span className="text-[11px] text-violet-600 font-mono font-semibold">{returnEtd}</span>
                    {returnFromCode && (
                      <span className="text-[9px] bg-violet-50 text-violet-400 rounded px-1 py-0.5 font-mono font-semibold tracking-wide">
                        {returnFromCode}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[11.5px] text-slate-700 font-semibold">
                  {item.departDate ? fmtDate(item.departDate) : "Fleksibel"}
                </span>
                {item.etd && (
                  <>
                    <span className="text-[11px] text-slate-700 font-mono font-semibold">· {item.etd}</span>
                    {item.fromCode && (
                      <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 py-0.5 font-mono font-semibold tracking-wide">
                        {item.fromCode}
                      </span>
                    )}
                  </>
                )}
              </div>
              {item.validUntil && (
                <span className={cn("ml-auto text-[9.5px] shrink-0", expired ? "text-red-500 font-semibold" : "text-slate-400")}>
                  {expired ? "⛔ Expired" : `s/d ${fmtDate(item.validUntil)}`}
                </span>
              )}
            </div>
          )}
          {isRTorML && item.validUntil && (
            <span className={cn("text-[9.5px] mt-1 block", expired ? "text-red-500 font-semibold" : "text-slate-400")}>
              {expired ? "⛔ Expired" : `s/d ${fmtDate(item.validUntil)}`}
            </span>
          )}
        </div>
      </div>

      {/* ── PRICE ── */}
      <div className="px-4 pb-3 mt-auto">
        <div className="border-t border-dashed border-slate-100 mb-2.5" />
        {!expired ? (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5" style={{ fontWeight: 700 }}>
              Harga {isRTorML ? "/ paket PP" : "/ pax"}
            </p>
            <p className="text-[20px] text-slate-900 leading-tight tabular-nums" style={{ fontFamily: SK, fontWeight: 700 }}>
              {fmtIDR(sell)}
            </p>
            <p className="text-[9.5px] text-slate-400 mt-0.5">sudah termasuk semua biaya layanan</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-red-500" style={{ fontWeight: 700 }}>Harga Expired</p>
            <p className="text-[11px] text-slate-400">Hubungi admin untuk harga terbaru</p>
          </div>
        )}
        {/* User-readable notes only — strip any __RT__/__ML__ encoded strings */}
        {userNotes && !String(userNotes).startsWith("__") && (
          <p className="text-[10px] text-slate-400 italic mt-1 leading-snug">{userNotes}</p>
        )}
        {!isRTorML && item.notes && !item.notes.startsWith("__") && (
          <p className="text-[10px] text-slate-400 italic mt-1 leading-snug">{item.notes}</p>
        )}
      </div>

      {/* ── CTA ── */}
      <div className="px-4 pb-4">
        <div className="border-t border-slate-100 mb-3" />
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors",
            expired ? "bg-slate-500 hover:bg-slate-600" : "bg-green-600 hover:bg-green-700",
          )}
          style={{ fontFamily: SK, fontWeight: 700 }}
        >
          <MessageCircle className="w-4 h-4" />
          {expired ? "Hubungi Admin" : "Pesan via WhatsApp"}
        </a>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PublicTicketPrices() {
  const { rates, refresh } = useRatesStore();
  const [tickets, setTickets] = useState<TicketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [markup] = useState(() => loadMarkup());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const waNumber = loadIghAdminSettings().adminWhatsapp ?? "";

  // ── SEO meta injection ───────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.title;
    document.title = "Daftar Harga Tiket Umroh & Haji — Temantiket";
    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };
    const desc = "Cek harga tiket penerbangan umroh dan haji terbaru dari Temantiket. Maskapai pilihan, rute CGK-JED, CGK-MED & lainnya. Pesan langsung via WhatsApp — mudah, cepat, amanah.";
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", "Daftar Harga Tiket Umroh & Haji — Temantiket");
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:type"]', "content", "website");
    setMeta('meta[property="og:url"]', "content", window.location.href);
    setMeta('meta[name="twitter:title"]', "content", "Daftar Harga Tiket Umroh & Haji — Temantiket");
    setMeta('meta[name="twitter:description"]', "content", desc);
    setMeta('meta[name="robots"]', "content", "index, follow");
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    void refresh();
    listTicketPrices(true)
      .then((items) => setTickets(items))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [refresh]);

  const published = useMemo(() => tickets.filter((t) => t.isPublished), [tickets]);

  // ── Derived filter options from live data ────────────────────────────────
  const uniqueAirlines = useMemo(() => {
    const set = new Set(published.map((t) => t.airline).filter(Boolean));
    return [...set].sort();
  }, [published]);

  const uniqueMonths = useMemo(() => {
    const set = new Set(
      published
        .map((t) => t.departDate?.slice(0, 7))
        .filter((m): m is string => !!m && m.length === 7),
    );
    return [...set].sort();
  }, [published]);

  // ── Filtered + sorted list ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    let result = published.filter((t) => {
      // Text search
      if (q) {
        const haystack = [
          t.airline, t.airlineCode, t.flightNumber,
          t.fromCode, t.fromCity, t.toCode, t.toCity,
          t.transitCode, t.transitCity,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Month
      if (filters.month && !t.departDate?.startsWith(filters.month)) return false;
      // Airline
      if (filters.airline && t.airline !== filters.airline) return false;
      // Flight type
      if (filters.flightType === "direct" && t.transitCode) return false;
      if (filters.flightType === "transit" && !t.transitCode) return false;
      return true;
    });

    // Sort
    if (filters.sort === "price_asc") {
      result = [...result].sort((a, b) =>
        sellingPrice(a.basePrice, a.currency, rates, markup) -
        sellingPrice(b.basePrice, b.currency, rates, markup),
      );
    } else if (filters.sort === "price_desc") {
      result = [...result].sort((a, b) =>
        sellingPrice(b.basePrice, b.currency, rates, markup) -
        sellingPrice(a.basePrice, a.currency, rates, markup),
      );
    } else if (filters.sort === "date_asc") {
      result = [...result].sort((a, b) => dateToMs(a.departDate) - dateToMs(b.departDate));
    }
    return result;
  }, [published, filters, rates, markup]);

  function patchFilters(patch: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const hasFilters = activeFilterCount(filters) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/temantiket-icon.svg"
              alt="Temantiket"
              className="h-7 w-7 object-contain icon-adaptive"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div>
              <p className="text-[13px] font-extrabold text-slate-900 leading-none">Temantiket</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Daftar Harga Tiket Penerbangan</p>
            </div>
          </div>
          {waNumber && (
            <a
              href={whatsappUrl(waNumber)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Hubungi Kami
            </a>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(160deg,#040d26 0%,#071840 35%,#0b2660 65%,#071535 100%)" }}
      >
        {/* Decorative blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle,#38bdf8,transparent 65%)" }} />
          <div className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle,#818cf8,transparent 65%)" }} />
          <div className="absolute top-[30%] right-[15%] w-64 h-64 rounded-full opacity-[0.04]"
            style={{ background: "radial-gradient(circle,#34d399,transparent 65%)" }} />
          {/* Fine grid */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
          {/* Diagonal shimmer lines */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize: "20px 20px" }} />
        </div>

        {/* Floating airport codes — decorative */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden>
          {[
            { code: "JED", top: "12%", left: "4%",  opacity: 0.06, size: "text-5xl" },
            { code: "MED", top: "55%", left: "2%",  opacity: 0.05, size: "text-4xl" },
            { code: "CGK", top: "8%",  right: "5%", opacity: 0.06, size: "text-5xl" },
            { code: "SUB", top: "60%", right: "3%", opacity: 0.05, size: "text-4xl" },
            { code: "DOH", top: "30%", left: "1%",  opacity: 0.04, size: "text-3xl" },
            { code: "DXB", top: "25%", right: "1%", opacity: 0.04, size: "text-3xl" },
          ].map(({ code, top, left, right, opacity, size }) => (
            <span key={code} className={`absolute font-black tracking-tight text-white ${size}`}
              style={{ top, left, right, opacity }}>
              {code}
            </span>
          ))}
        </div>

        <div className="relative max-w-3xl mx-auto px-4 pt-14 pb-12 md:pt-20 md:pb-16 text-center">

          {/* Live badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 py-1.5 mb-7 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[11px] text-white/80 font-semibold uppercase tracking-[0.12em]">
              Harga Update Rutin · Terpercaya
            </span>
          </div>

          {/* Main headline */}
          <h1 className="font-black leading-[1.1] mb-5">
            <span className="block text-white text-4xl md:text-5xl lg:text-[3.5rem]">
              Tiket Umroh & Haji
            </span>
            <span
              className="block text-4xl md:text-5xl lg:text-[3.5rem] text-transparent bg-clip-text mt-1"
              style={{ backgroundImage: "linear-gradient(90deg, #60c8f5 0%, #a78bfa 50%, #60c8f5 100%)", backgroundSize: "200% auto" }}
            >
              Harga Terbaik
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-[15px] md:text-base text-blue-200/80 max-w-xl mx-auto leading-relaxed mb-8">
            Tiket penerbangan ke Jeddah, Madinah, dan kota suci lainnya —
            langsung dari agen terpercaya. Proses cepat, harga transparan,
            amanah sejak hari pertama.
          </p>

          {/* Route pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {["✈ CGK → JED", "✈ SUB → JED", "✈ MES → JED", "✈ CGK → MED", "✈ SUB → MED"].map((r) => (
              <span key={r}
                className="px-3 py-1 rounded-full text-[11px] font-semibold text-white/70 border border-white/10 bg-white/5 backdrop-blur-sm">
                {r}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {waNumber && (
              <a
                href={whatsappUrl(waNumber)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 active:scale-95 text-white text-sm font-bold px-7 py-3.5 rounded-2xl transition-all shadow-lg shadow-green-900/40 hover:shadow-green-900/60 hover:-translate-y-0.5"
              >
                <MessageCircle className="w-4 h-4" />
                Konsultasi Gratis via WA
              </a>
            )}
            <a
              href="#tickets"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-semibold px-6 py-3.5 rounded-2xl transition-all backdrop-blur-sm"
            >
              <Plane className="w-4 h-4" />
              Lihat Semua Rute
            </a>
          </div>

          {/* Trust stats */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {[
              { icon: "🛡️", label: "Agen Resmi & Terpercaya" },
              { icon: "⚡", label: "Konfirmasi dalam 1×24 jam" },
              { icon: "💬", label: "Layanan WhatsApp 24 Jam" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[12px] text-white/50">
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Route count */}
          {published.length > 0 && (
            <p className="mt-5 text-[11px] text-white/30">
              {published.length} rute aktif tersedia saat ini
            </p>
          )}
        </div>
      </div>

      {/* ── Filter Bar (only when there are tickets) ── */}
      {!loading && published.length > 0 && (
        <FilterBar
          filters={filters}
          onChange={patchFilters}
          uniqueAirlines={uniqueAirlines}
          uniqueMonths={uniqueMonths}
          resultCount={filtered.length}
          totalCount={published.length}
        />
      )}

      {/* ── Content ── */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
            <p className="text-sm">Memuat daftar harga…</p>
          </div>
        ) : published.length === 0 ? (
          /* No published tickets — premium empty state */
          <div className="space-y-10 py-8">

            {/* Info band */}
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50 px-6 py-8 text-center shadow-sm">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border border-sky-200 shadow-sm mb-4">
                <Plane className="w-8 h-8 text-sky-500" />
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-2">Harga Sedang Diperbarui</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Harga tiket pesawat kami selalu update dan kompetitif. Hubungi tim kami untuk
                mendapatkan penawaran terbaik sesuai rute yang kamu inginkan.
              </p>
              {waNumber && (
                <a
                  href={whatsappUrl(waNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-6 py-3 rounded-2xl transition-all shadow-md hover:-translate-y-0.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  Tanya via WhatsApp
                </a>
              )}
            </div>

            {/* Why Us section */}
            <div>
              <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-5">Kenapa Pesan Lewat Temantiket?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    icon: <TrendingUp className="w-5 h-5 text-sky-600" />,
                    bg: "bg-sky-50 border-sky-100",
                    iconBg: "bg-sky-100",
                    title: "Harga Terbaik",
                    desc: "Kami bekerja langsung dengan maskapai untuk memberikan tarif paling kompetitif.",
                  },
                  {
                    icon: <Zap className="w-5 h-5 text-amber-600" />,
                    bg: "bg-amber-50 border-amber-100",
                    iconBg: "bg-amber-100",
                    title: "Proses Cepat",
                    desc: "Konfirmasi & penerbitan tiket dilakukan dalam hitungan jam, bukan hari.",
                  },
                  {
                    icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
                    bg: "bg-emerald-50 border-emerald-100",
                    iconBg: "bg-emerald-100",
                    title: "Terpercaya & Amanah",
                    desc: "Ribuan jamaah telah mempercayakan perjalanan Umroh & Haji mereka kepada kami.",
                  },
                  {
                    icon: <HeadphonesIcon className="w-5 h-5 text-violet-600" />,
                    bg: "bg-violet-50 border-violet-100",
                    iconBg: "bg-violet-100",
                    title: "Support 24 Jam",
                    desc: "Tim kami siap membantu kapan saja — dari pemesanan hingga keberangkatan.",
                  },
                ].map((item, i) => (
                  <div key={i} className={cn("rounded-2xl border p-5 space-y-3", item.bg)}>
                    <div className={cn("inline-flex items-center justify-center w-10 h-10 rounded-xl", item.iconBg)}>
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rute populer hint */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <Globe className="w-7 h-7 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">Rute Populer Kami</p>
              <p className="text-xs text-slate-400 mb-4">Jakarta · Surabaya · Medan → Jeddah · Madinah · Kairo · Doha</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["CGK → JED", "SUB → JED", "MES → JED", "CGK → MED", "CGK → CAI"].map((r) => (
                  <span key={r} className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    ✈️ {r}
                  </span>
                ))}
              </div>
              {waNumber && (
                <a
                  href={whatsappUrl(waNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-5 text-sm font-semibold text-green-600 hover:text-green-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Hubungi Kami untuk Rute Lainnya →
                </a>
              )}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* Has tickets but filter matched nothing */
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <Filter className="w-10 h-10 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-600">Tidak ada rute yang cocok</p>
              <p className="text-sm mt-1">Coba ubah filter atau hapus pencarian Anda.</p>
            </div>
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              Hapus Semua Filter
            </button>
            {waNumber && (
              <a
                href={whatsappUrl(waNumber)}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-green-600 font-semibold hover:underline"
              >
                Atau tanya langsung via WhatsApp →
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <PublicCard
                key={item.id}
                item={item}
                markup={markup}
                rates={rates}
                waNumber={waNumber}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white mt-8 py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <img src="/temantiket-icon.svg" alt="" className="h-5 w-5 object-contain opacity-40 icon-adaptive"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span>Temantiket — Mudah, Cepat, Amanah</span>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              listTicketPrices(true)
                .then(setTickets)
                .catch(console.error)
                .finally(() => setLoading(false));
            }}
            className="flex items-center gap-1 text-slate-400 hover:text-sky-600 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Perbarui Harga
          </button>
        </div>
      </footer>
    </div>
  );
}
