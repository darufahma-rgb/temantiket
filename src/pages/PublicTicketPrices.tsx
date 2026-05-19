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
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Plane, MessageCircle, Clock, RefreshCw, Loader2,
  Search, SlidersHorizontal, X, ArrowUpDown, ChevronDown,
  TrendingUp, CalendarDays, Filter, Globe, ShieldCheck, Zap, HeadphonesIcon,
  Calendar, Info, Luggage, MapPin,
  ArrowLeft, Bell, MoreHorizontal, ChevronRight, CheckCircle2, ChevronUp, ArrowLeftRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { buildMLStops, buildSimpleStops, AIRPORT_NAMES, type StopData } from "@/components/FlightStopDetail";
import { cn } from "@/lib/utils";
import {
  getAirlineGradient, getAirlineLogoUrl,
  decodeMultiLeg, decodeReturnLeg, buildRouteLabel, decodeExtended,
} from "@/lib/ticketPriceAI";
import {
  loadMarkup, sellingPrice, isExpired, fmtIDR, fmtDate,
  type TicketPrice,
} from "@/features/ticketPrices/ticketPricesRepo";
import { useRatesStore } from "@/store/ratesStore";
import { loadIghAdminSettings, whatsappUrl } from "@/lib/ighSettings";
import { loadBannerTheme, resolveBannerCss, type BannerTheme } from "@/lib/bannerTheme";

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

function fmtDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
  } catch { return dateStr; }
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

// ── Public Detail Modal ───────────────────────────────────────────────────────
// ── Traveloka-style Stop Row ──────────────────────────────────────────────────
function TvkStopRow({
  stop, airline, airlineCode, baggageInfo, isLastInSection, showDetail,
}: {
  stop: StopData;
  airline: string;
  airlineCode: string;
  baggageInfo?: string | null;
  isLastInSection: boolean;
  showDetail: boolean;
}) {
  const airportName = AIRPORT_NAMES[stop.code.toUpperCase()] ?? stop.city ?? null;
  const hasFlightInfo = !isLastInSection;

  return (
    <div className="flex">
      {/* Time column */}
      <div className="w-[52px] shrink-0 text-right pr-3 pt-[3px]">
        {stop.time && (
          <span className="text-[14px] font-bold text-slate-800 leading-none font-mono tabular-nums">
            {stop.time.replace(":", ".")}
          </span>
        )}
      </div>

      {/* Timeline column */}
      <div className="flex flex-col items-center w-5 shrink-0">
        <div className={cn(
          "w-[10px] h-[10px] rounded-full border-2 shrink-0 mt-[5px]",
          stop.isFirst
            ? "border-slate-600 bg-white"
            : stop.isLast
              ? "border-slate-800 bg-slate-800"
              : "border-slate-400 bg-slate-300",
        )} />
        {!isLastInSection && (
          <div className="w-[1.5px] bg-slate-200 flex-1 mt-1" style={{ minHeight: 32 }} />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pl-3 pb-1">
        {/* Airport name */}
        <p className="text-[13.5px] font-bold text-slate-900 leading-snug">
          <span>{stop.code}</span>
          {airportName && (
            <span className="font-normal text-slate-600"> {airportName}</span>
          )}
          {stop.isFirst && airline && (
            <span className="text-slate-400 font-normal"> T3</span>
          )}
        </p>

        {/* Transit layover card */}
        {stop.isTransit && stop.layover && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mr-2">
            <p className="text-[12px] font-semibold text-slate-700">
              Transit di {stop.city ?? stop.code}, {stop.layover}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <p className="text-[11px] text-sky-600 font-medium flex-1">
                Tidak perlu mengambil bagasi & check-in ulang
              </p>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            </div>
          </div>
        )}

        {/* Flight info (shown when showDetail=true and not last stop) */}
        {hasFlightInfo && showDetail && (
          <div className="mt-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <AirlineLogo code={airlineCode} airline={airline} size={18} />
              <span className="text-[12px] font-semibold text-slate-700">{airline}</span>
              {stop.flightNumber && (
                <span className="text-[11px] text-slate-400 font-mono">{stop.flightNumber}</span>
              )}
              {stop.aircraftType && (
                <>
                  <span className="text-slate-200 text-[10px] select-none">|</span>
                  <span className="text-[11px] text-slate-400">{stop.aircraftType}</span>
                </>
              )}
            </div>
            {/* Amenity icons */}
            <div className="flex items-center gap-2 mt-1.5 text-slate-400">
              <span className="text-[13px]" title="Makanan">🍽</span>
              <span className="text-[13px]" title="Layar hiburan">🖥</span>
              <span className="text-[13px]" title="WiFi">📶</span>
              <span className="text-[13px]" title="USB Charging">⚡</span>
              <span className="text-[10px] font-medium text-slate-400">CO2e</span>
              <ChevronRight className="w-3 h-3" />
            </div>
            {/* Duration */}
            {stop.duration && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[11px] text-slate-500">
                  Durasi penerbangan: {stop.duration}
                </span>
              </div>
            )}
            {/* Baggage on first stop */}
            {baggageInfo && (
              <div className="flex items-center gap-1.5 mt-1">
                <Luggage className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[11px] text-slate-500">{baggageInfo}</span>
              </div>
            )}
          </div>
        )}
        {/* Spacer when detail is hidden */}
        {hasFlightInfo && !showDetail && <div className="h-3" />}
      </div>
    </div>
  );
}

function PublicDetailModal({
  open, item, markup, rates, waNumber, onClose,
}: {
  open: boolean;
  item: TicketPrice | null;
  markup: number;
  rates: Record<string, number>;
  waNumber: string;
  onClose: () => void;
}) {
  const [showDetail, setShowDetail] = useState(true);

  if (!item) return null;

  const expired = isExpired(item.validUntil);
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);
  const isDirect = !item.transitCode;

  const { ext: extInfo, restNotes: notesForDecode } = decodeExtended(item.notes);
  const { ml: mlData, userNotes: mlUserNotes } = decodeMultiLeg(notesForDecode);
  const isML = !!mlData;
  const { leg: returnLeg, userNotes: rtUserNotes } = isML
    ? { leg: null, userNotes: null }
    : decodeReturnLeg(notesForDecode);
  const isRT = !!returnLeg;
  const userNotes = mlUserNotes ?? rtUserNotes;
  const isRTorML = isRT || isML;

  const routeLabel = isML
    ? buildRouteLabel(mlData!)
    : isRT ? `${item.fromCode} ⇄ ${item.toCode}` : `${item.fromCode} → ${item.toCode}`;

  const waText = encodeURIComponent(
    `Halo! Saya tertarik dengan tiket:\n\n✈️ *${item.airline}*\n🗺️ Rute: *${routeLabel}*\n💰 Harga: *${fmtIDR(sell)}${isRTorML ? "/paket PP" : "/pax"}*\n\nMohon infokan ketersediaan. Terima kasih!`
  );
  const waLink = waNumber ? `${whatsappUrl(waNumber)}?text=${waText}` : `https://wa.me/?text=${waText}`;

  const returnDate = isML
    ? (mlData?.returnLegs?.[0]?.date ? fmtDate(mlData.returnLegs[0].date) : null)
    : (returnLeg?.returnDate ? fmtDate(returnLeg.returnDate) : null);

  const extOpts = extInfo ? {
    leg1Duration: extInfo.flightDuration,
    leg1AircraftType: extInfo.aircraftType,
    leg2FlightNumber: extInfo.leg2FlightNumber,
    leg2AircraftType: extInfo.leg2AircraftType,
    leg2Duration: extInfo.leg2Duration,
  } : undefined;

  const outboundStops = isML && mlData?.outboundLegs
    ? buildMLStops(mlData.outboundLegs)
    : buildSimpleStops(
        item.fromCode, item.fromCity ?? null, item.etd ?? null,
        item.transitCode ?? null, item.transitCity ?? null, item.transitDuration ?? null,
        item.toCode, item.toCity ?? null, item.eta ?? null,
        item.flightNumber ?? null,
        extOpts,
      );

  const returnStops = isML && (mlData?.returnLegs?.length ?? 0) > 0
    ? buildMLStops(mlData!.returnLegs!)
    : isRT && returnLeg
      ? buildSimpleStops(
          returnLeg.returnFromCode ?? item.toCode, returnLeg.returnFromCity ?? null, returnLeg.returnEtd ?? null,
          returnLeg.returnTransitCode ?? null, returnLeg.returnTransitCity ?? null, returnLeg.returnTransitDuration ?? null,
          returnLeg.returnToCode ?? item.fromCode, returnLeg.returnToCity ?? null, returnLeg.returnEta ?? null,
          returnLeg.returnFlightNumber ?? null,
        )
      : [];

  const hasNotes = !!(
    (userNotes && !String(userNotes).startsWith("__")) ||
    (!isRTorML && item.notes && !item.notes.startsWith("__"))
  );
  const notesText = userNotes && !String(userNotes).startsWith("__")
    ? userNotes
    : (!isRTorML && item.notes && !item.notes.startsWith("__") ? item.notes : null);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-md w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden rounded-none sm:rounded-2xl border-0">
        <DialogTitle className="sr-only">Detail Tiket {item.airline}</DialogTitle>

        {/* ── Sticky header ── */}
        <div className="flex items-center gap-1 px-2 border-b border-slate-100 bg-white shrink-0" style={{ height: 52 }}>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <span className="font-bold text-[16px] text-slate-900 flex-1 ml-1">Pilih Harga</span>
          <button className="p-2 rounded-full hover:bg-slate-100 transition-colors relative">
            <Bell className="w-4.5 h-4.5 text-slate-500" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-orange-500 rounded-full" />
          </button>
          <button className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <MoreHorizontal className="w-4.5 h-4.5 text-slate-500" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto bg-[#f5f6f8]">

          {/* Date notice */}
          {item.departDate && (
            <div className="bg-white px-4 py-3 text-[12.5px] text-slate-500 leading-relaxed border-b border-slate-100">
              Harap perhatikan tanggal keberangkatan Anda dan pastikan Anda tiba di bandara lebih awal pada{" "}
              <span className="text-orange-500 font-semibold">{fmtDateLong(item.departDate)}</span>
            </div>
          )}

          {/* ── Outbound section ── */}
          <div className="bg-white mt-2 px-4 pt-4 pb-1">
            {/* Section label */}
            <div className="flex items-center gap-1.5 mb-3">
              <Plane className="w-3.5 h-3.5 text-sky-500" />
              <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider">
                Penerbangan Pergi
              </span>
              {item.departDate && (
                <span className="text-[11px] text-slate-400 ml-auto">{fmtDate(item.departDate)}</span>
              )}
            </div>

            {outboundStops.map((stop, idx) => (
              <TvkStopRow
                key={idx}
                stop={stop}
                airline={item.airline}
                airlineCode={item.airlineCode}
                baggageInfo={idx === 0 ? item.baggageInfo : null}
                isLastInSection={idx === outboundStops.length - 1}
                showDetail={showDetail}
              />
            ))}

            {/* Show/hide toggle */}
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1 text-[12px] text-slate-500 font-medium py-3 w-full justify-center hover:text-slate-700 transition-colors"
            >
              {showDetail ? "Sembunyikan" : "Tampilkan detail"}
              <ChevronUp className={cn("w-3.5 h-3.5 transition-transform duration-200", !showDetail && "rotate-180")} />
            </button>
          </div>

          {/* ── Return section ── */}
          {returnStops.length > 0 && (
            <div className="bg-white mt-2 px-4 pt-4 pb-1">
              <div className="flex items-center gap-1.5 mb-3">
                <ArrowLeftRight className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-[11px] font-bold text-violet-600 uppercase tracking-wider">
                  Penerbangan Pulang
                </span>
                {returnDate && (
                  <span className="text-[11px] text-slate-400 ml-auto">{returnDate}</span>
                )}
              </div>
              {returnStops.map((stop, idx) => (
                <TvkStopRow
                  key={idx}
                  stop={stop}
                  airline={item.airline}
                  airlineCode={item.airlineCode}
                  baggageInfo={null}
                  isLastInSection={idx === returnStops.length - 1}
                  showDetail={showDetail}
                />
              ))}
              <div className="h-3" />
            </div>
          )}

          {/* ── Info / notes row ── */}
          {hasNotes && notesText && (
            <div className="bg-white mt-2 px-4 py-3.5 flex items-start gap-3">
              <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] font-semibold text-sky-600">
                  Ketahui sebelum Anda pergi{" "}
                  <span className="text-orange-500">1 Pesan</span>
                </p>
                <p className="text-[11.5px] text-slate-500 mt-0.5 leading-relaxed line-clamp-3">
                  {notesText}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            </div>
          )}

          {/* Bagasi & validity info row */}
          {(item.terminal || item.validUntil) && (
            <div className="bg-white mt-2 divide-y divide-slate-100">
              {item.terminal && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-[12px] text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Terminal keberangkatan
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 font-mono">{item.terminal}</span>
                </div>
              )}
              {item.validUntil && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-[12px] text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Harga berlaku hingga
                  </div>
                  <span className={cn("text-[12px] font-semibold", expired ? "text-red-600" : "text-slate-700")}>
                    {expired ? "⛔ " : ""}{fmtDate(item.validUntil)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Spacer for bottom bar */}
          <div className="h-6" />
        </div>

        {/* ── Sticky bottom bar ── */}
        <div className="shrink-0 bg-white border-t border-slate-100 shadow-[0_-4px_24px_rgba(0,0,0,0.07)]">
          {/* Class tabs */}
          <div className="flex border-b border-slate-100">
            <button className="flex-1 py-3.5 text-[13px] font-bold text-sky-600 border-b-2 border-sky-600 -mb-px transition-colors">
              Ekonomi
            </button>
            <button className="flex-1 py-3.5 text-[13px] font-medium text-slate-400 hover:text-slate-600 transition-colors">
              Bisnis/Utama
            </button>
          </div>

          {/* Price row */}
          <div className="px-4 pt-3 pb-1 flex items-end justify-between gap-3">
            {expired ? (
              <p className="text-[12px] font-semibold text-red-500">Harga sudah expired — hubungi admin</p>
            ) : (
              <p className="text-[11px] text-emerald-600 font-semibold leading-snug">
                Harga terendah dengan<br />bagasi terdaftar
              </p>
            )}
            {!expired && (
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-400 leading-none mb-0.5">Dari</p>
                <p className="text-[22px] font-black text-slate-900 tabular-nums leading-none">
                  {fmtIDR(sell)}
                </p>
              </div>
            )}
          </div>

          {/* WA button */}
          <div className="px-4 pb-5 pt-2.5">
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-colors shadow-sm",
                expired ? "bg-slate-500 hover:bg-slate-600" : "bg-green-600 hover:bg-green-700 active:bg-green-800",
              )}
            >
              <MessageCircle className="w-4 h-4" />
              {expired ? "Hubungi Admin" : "Pesan via WhatsApp"}
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Public Card ───────────────────────────────────────────────────────────────
function PublicCard({
  item, markup, rates, waNumber, onDetail,
}: {
  item: TicketPrice;
  markup: number;
  rates: Record<string, number>;
  waNumber: string;
  onDetail: () => void;
}) {
  const expired = isExpired(item.validUntil);
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);
  const isDirect = !item.transitCode;

  // Decode EXT then RT / ML encoded notes — same logic as internal detail modal
  const { ext: extInfo, restNotes: notesForDecode } = decodeExtended(item.notes);
  const { ml: mlData, userNotes: mlUserNotes } = decodeMultiLeg(notesForDecode);
  const isML = !!mlData;
  const { leg: returnLeg, userNotes: rtUserNotes } = isML
    ? { leg: null, userNotes: null }
    : decodeReturnLeg(notesForDecode);
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
      <div className="px-4 pb-3 flex-1">
        <div className="border-t border-slate-200 mb-2.5" />
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
      <div className="px-4 pb-3">
        <div className="border-t border-slate-200 mb-2.5" />
        {(extInfo?.aircraftType || extInfo?.flightDuration || extInfo?.leg2FlightNumber || extInfo?.leg2AircraftType || extInfo?.leg2Duration || item.baggageInfo) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
            {extInfo?.aircraftType && (
              <span className="text-[10px] text-slate-500">✈ {extInfo.aircraftType}</span>
            )}
            {extInfo?.flightDuration && (
              <span className="text-[10px] text-slate-500 font-mono">⏱ {extInfo.flightDuration}</span>
            )}
            {extInfo?.leg2FlightNumber && (
              <span className="text-[10px] text-amber-600 font-mono">✈ Leg 2: {extInfo.leg2FlightNumber}</span>
            )}
            {extInfo?.leg2AircraftType && (
              <span className="text-[10px] text-amber-600">{extInfo.leg2AircraftType}</span>
            )}
            {extInfo?.leg2Duration && (
              <span className="text-[10px] text-amber-600 font-mono">⏱ {extInfo.leg2Duration}</span>
            )}
            {item.baggageInfo && (
              <span className="text-[10px] text-slate-500">🧳 {item.baggageInfo}</span>
            )}
          </div>
        )}
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
        <div className="border-t border-slate-200 mb-3" />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onDetail}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
            style={{ fontFamily: SK, fontWeight: 600 }}
          >
            <Info className="w-4 h-4 text-sky-500" />
            Lihat Detail Penerbangan
          </button>
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
  const [detailItem, setDetailItem] = useState<TicketPrice | null>(null);
  const waNumber = loadIghAdminSettings().adminWhatsapp ?? "";

  // ── Banner theme (customisable by owner) ─────────────────────────────────
  const [bannerTheme, setBannerTheme] = useState<BannerTheme>(() => loadBannerTheme());
  useEffect(() => {
    const handler = (e: Event) => {
      const theme = (e as CustomEvent<BannerTheme>).detail;
      if (theme) setBannerTheme(theme);
    };
    window.addEventListener("banner-theme-changed", handler);
    return () => window.removeEventListener("banner-theme-changed", handler);
  }, []);

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
    fetch("/api/public/ticket-prices")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TicketPrice[]>;
      })
      .then((items) => setTickets(items))
      .catch((e) => console.error("[harga-tiket] fetch error:", e))
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
      <header
        className="sticky top-0 z-20 border-b border-slate-200/80"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between" style={{ height: 56 }}>
          {/* Logo full — icon + wordmark */}
          <Link
            to="/"
            className="flex items-center shrink-0 active:opacity-70 transition-opacity"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <img
              src="/temantiket-logo.png"
              alt="Temantiket"
              className="object-contain"
              style={{ height: 28, width: "auto" }}
              loading="eager"
            />
          </Link>

          {/* Right side: badge + WA button */}
          <div className="flex items-center gap-2.5">
            {/* Tagline pill — hanya muncul di md ke atas */}
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              Mudah · Cepat · Amanah
            </span>

            {/* WA Button */}
            {waNumber && (
              <a
                href={whatsappUrl(waNumber)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 px-3.5 py-2 rounded-xl transition-colors shadow-sm"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Hubungi Kami</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero — compact elegant strip ── */}
      {(() => {
        const css = resolveBannerCss(bannerTheme);
        return (
          <div
            className="relative overflow-hidden"
            style={{ background: css.base }}
          >
            {/* Subtle blobs */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full"
                style={{ background: `radial-gradient(circle, ${css.blob1Color} 0%, transparent 65%)`, filter: "blur(48px)" }} />
              <div className="absolute -top-16 right-[-4%] w-[360px] h-[360px] rounded-full"
                style={{ background: `radial-gradient(circle, ${css.blob2Color} 0%, transparent 65%)`, filter: "blur(52px)" }} />
              <div className="absolute bottom-0 left-[30%] w-[500px] h-[120px] rounded-full"
                style={{ background: `radial-gradient(ellipse, ${css.blob3Color} 0%, transparent 70%)`, filter: "blur(36px)" }} />
            </div>
            {/* Fine grid texture */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent 0%, ${css.accentColor} 40%, ${css.blob1Color} 60%, transparent 100%)` }} />
            {/* Bottom fade */}
            <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
              style={{ background: `linear-gradient(to bottom, transparent, ${css.base}e0)` }} />

            {/* Content */}
            <div className="relative max-w-5xl mx-auto px-4 py-6 md:py-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                {/* Left — headline block */}
                <div className="min-w-0">
                  {/* Live badge */}
                  <div className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1 mb-3 backdrop-blur-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    <span className="text-[10px] text-white/70 font-semibold uppercase tracking-[0.1em]">
                      Agen Tiketing · Mudah & Murah
                    </span>
                  </div>

                  <h1 className="font-black leading-tight text-white">
                    <span className="text-2xl md:text-3xl block">Beli Tiket Pesawat</span>
                    <span
                      className="text-xl md:text-2xl text-transparent bg-clip-text"
                      style={{ backgroundImage: `linear-gradient(90deg, ${css.accentColor.replace(/[\d.]+\)$/, "0.9)")} 0%, ${css.blob2Color.replace(/[\d.]+\)$/, "0.9)")} 100%)` }}
                    >
                      Gak Ribet, Gak Mahal.
                    </span>
                  </h1>

                  <p className="text-[12px] text-white/50 mt-1.5 max-w-sm leading-relaxed hidden md:block">
                    Harga bersaing, proses kilat, CS aktif via WhatsApp. Cocok buat mahasiswa!
                  </p>

                  {/* Trust chips — desktop */}
                  <div className="hidden md:flex items-center gap-3 mt-3">
                    {["⚡ Konfirmasi 1×24 jam", "🔒 Aman & Amanah", "🌏 Semua Rute"].map((t) => (
                      <span key={t} className="text-[10px] text-white/40 font-medium">{t}</span>
                    ))}
                  </div>
                </div>

                {/* Right — CTA + route count */}
                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 shrink-0">
                  {waNumber && (
                    <a
                      href={whatsappUrl(waNumber)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 active:scale-95 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-green-900/30 hover:-translate-y-0.5 whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Chat Sekarang
                    </a>
                  )}
                  <a
                    href="#tickets"
                    className="inline-flex items-center gap-1.5 bg-white/8 hover:bg-white/12 border border-white/12 text-white/80 text-[12px] font-semibold px-4 py-2.5 rounded-xl transition-all backdrop-blur-sm whitespace-nowrap"
                  >
                    <Plane className="w-3.5 h-3.5" />
                    Lihat Tiket
                  </a>
                  {published.length > 0 && (
                    <p className="text-[10px] text-white/25 md:text-right hidden md:block">
                      {published.length} rute tersedia
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item) => (
                <PublicCard
                  key={item.id}
                  item={item}
                  markup={markup}
                  rates={rates}
                  waNumber={waNumber}
                  onDetail={() => setDetailItem(item)}
                />
              ))}
            </div>

            <PublicDetailModal
              open={!!detailItem}
              item={detailItem}
              markup={markup}
              rates={rates}
              waNumber={waNumber}
              onClose={() => setDetailItem(null)}
            />

            {/* ── Travel Tips ── */}
            <div className="mt-16 -mx-4 px-4 py-12 rounded-3xl" style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e8edf8 50%, #eff6ff 100%)" }}>
              {/* Section header */}
              <div className="text-center mb-10">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">
                  ✈️ Tips Perjalanan
                </span>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">
                  Siap Terbang?{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-blue-600">Jangan Sampai Lupa Ini!</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    emoji: "🛂",
                    iconBg: "bg-blue-100",
                    title: "Cek Paspor & Visa",
                    tips: [
                      "Paspor masih berlaku minimal 6 bulan",
                      "Foto halaman biodata harus jelas & terbaca",
                      "Simpan salinan dokumen di ponsel & email",
                    ],
                  },
                  {
                    emoji: "🧳",
                    iconBg: "bg-amber-100",
                    title: "Atur Bagasi dengan Bijak",
                    tips: [
                      "Batas kabin 7–10 kg, cek ketentuan maskapai",
                      "Gunakan tas vacuum untuk hemat ruang",
                      "Beri label nama & nomor HP di setiap koper",
                    ],
                  },
                  {
                    emoji: "✈️",
                    iconBg: "bg-emerald-100",
                    title: "Tiba di Bandara Lebih Awal",
                    tips: [
                      "Datang minimal 3 jam sebelum penerbangan internasional",
                      "Check-in online 24 jam sebelum berangkat",
                      "Simpan boarding pass di ponsel & cetak cadangan",
                    ],
                  },
                  {
                    emoji: "💊",
                    iconBg: "bg-rose-100",
                    title: "Jaga Kesehatan Selama Perjalanan",
                    tips: [
                      "Bawa obat pribadi dalam tas kabin",
                      "Minum air putih cukup, hindari kafein berlebihan",
                      "Gerakkan kaki setiap 1–2 jam untuk cegah DVT",
                    ],
                  },
                  {
                    emoji: "📱",
                    iconBg: "bg-violet-100",
                    title: "Persiapan Komunikasi",
                    tips: [
                      "Aktifkan roaming atau beli SIM card lokal di tujuan",
                      "Unduh peta offline (Google Maps) sebelum berangkat",
                      "Simpan nomor darurat KBRI & agensi di ponsel",
                    ],
                  },
                  {
                    emoji: "💰",
                    iconBg: "bg-teal-100",
                    title: "Kelola Keuangan Perjalanan",
                    tips: [
                      "Bawa kartu Visa/Mastercard untuk kemudahan transaksi",
                      "Tukar uang di money changer resmi, bukan di bandara",
                      "Catat pengeluaran agar budget tetap aman",
                    ],
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="group bg-white rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-4"
                  >
                    {/* Icon row */}
                    <div className="flex items-start justify-between">
                      <div className={`w-11 h-11 rounded-xl ${item.iconBg} flex items-center justify-center text-2xl`}>
                        {item.emoji}
                      </div>
                    </div>

                    {/* Title */}
                    <div>
                      <h3 className="text-[16px] font-black text-slate-900 leading-snug mb-2">{item.title}</h3>
                      <ul className="space-y-1.5">
                        {item.tips.map((tip, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <span className="text-[12px] text-slate-500 leading-relaxed">{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Pill button */}
                    <div className="mt-auto pt-1">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-4 py-1.5 text-[11px] font-semibold text-slate-500">
                        Catat sebelum berangkat ✓
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {waNumber && (
                <div className="mt-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a2472] via-[#123499] to-[#1a44d4] p-8 text-center text-white shadow-xl">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full bg-white/30" />
                    <div className="absolute -bottom-8 -left-8 w-52 h-52 rounded-full bg-white/20" />
                  </div>
                  <div className="relative">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 text-2xl mb-3">💬</div>
                    <p className="text-lg font-black mb-1">Masih Bingung? Konsultasi Gratis!</p>
                    <p className="text-sm text-blue-200 mb-5">Tim kami siap bantu dari pesan tiket sampai perjalanan selesai.</p>
                    <a
                      href={whatsappUrl(waNumber)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-white text-[#0a2472] font-black text-sm px-7 py-3 rounded-xl hover:bg-blue-50 transition-colors shadow-lg"
                    >
                      <MessageCircle className="w-4 h-4 text-green-600" />
                      Chat via WhatsApp
                    </a>
                  </div>
                </div>
              )}
            </div>
          </>
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
              fetch("/api/public/ticket-prices")
                .then((r) => {
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return r.json() as Promise<TicketPrice[]>;
                })
                .then((items) => setTickets(items))
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
