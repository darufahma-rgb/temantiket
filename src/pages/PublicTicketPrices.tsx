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
  Plane, MessageCircle, Clock, MapPin, RefreshCw, Loader2,
  Search, SlidersHorizontal, X, ArrowUpDown, ChevronDown,
  TrendingUp, CalendarDays, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAirlineGradient, getAirlineLogoUrl } from "@/lib/ticketPriceAI";
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
function AirlineLogo({ code, airline, size = 40 }: { code: string; airline: string; size?: number }) {
  const [ok, setOk] = useState(true);
  const grad = getAirlineGradient(code);
  if (!ok || !code || code === "??") {
    return (
      <div
        className={cn("flex items-center justify-center rounded-xl bg-gradient-to-br text-white font-bold shrink-0", grad)}
        style={{ width: size, height: size, fontSize: size * 0.32 }}
      >
        {code.slice(0, 2) || <Plane className="w-4 h-4" />}
      </div>
    );
  }
  return (
    <img
      src={getAirlineLogoUrl(code)}
      alt={airline}
      width={size} height={size}
      className="rounded-xl object-contain shrink-0 bg-white border border-white/20"
      style={{ width: size, height: size }}
      onError={() => setOk(false)}
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

  const waText = encodeURIComponent(
    `Halo Temantiket! Saya tertarik dengan tiket berikut:\n\n` +
    `✈️ *${item.airline}*${item.flightNumber ? ` (${item.flightNumber})` : ""}\n` +
    `🗺️ Rute: *${item.fromCode} → ${item.toCode}*\n` +
    `${item.fromCity ? `   ${item.fromCity} → ${item.toCity}\n` : ""}` +
    `${item.etd || item.eta ? `🕐 ${item.etd ?? "—"} → ${item.eta ?? "—"}\n` : ""}` +
    `${item.transitCode ? `🔄 Transit: ${item.transitCity ?? item.transitCode}${item.transitDuration ? ` (${item.transitDuration})` : ""}\n` : ""}` +
    `📅 Tanggal: ${item.departDate ? fmtDate(item.departDate) : "Fleksibel"}\n` +
    `💰 Harga: *${fmtIDR(sell)}/pax*\n\n` +
    `Mohon infokan ketersediaan dan detailnya. Terima kasih!`
  );
  const waLink = waNumber
    ? `${whatsappUrl(waNumber)}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  return (
    <div className={cn(
      "rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col",
      expired && "opacity-60",
    )}>
      {/* Airline header */}
      <div className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r text-white",
        getAirlineGradient(item.airlineCode),
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <AirlineLogo code={item.airlineCode} airline={item.airline} size={36} />
          <div className="min-w-0">
            <p className="font-bold text-[13px] leading-tight truncate">{item.airline}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-white/70 font-mono">{item.airlineCode}</span>
              {item.flightNumber && (
                <span className="text-[10px] bg-white/20 rounded px-1.5 py-0.5 font-mono font-semibold">
                  {item.flightNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={cn(
          "text-[9px] rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider shrink-0",
          isDirect ? "bg-white/20 text-white/90" : "bg-amber-400/30 text-amber-100",
        )}>
          {isDirect ? "Direct" : "Transit"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {/* Route + Times */}
        <div className="flex items-center gap-2">
          <div className="flex-1 text-left">
            <p className="text-2xl font-black text-slate-900 leading-none tracking-tight">{item.fromCode}</p>
            {item.fromCity && (
              <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[80px]">{item.fromCity}</p>
            )}
            {item.etd && (
              <p className="text-[15px] font-extrabold text-sky-700 mt-1.5 tabular-nums leading-none">{item.etd}</p>
            )}
            {item.terminal && (
              <p className="text-[9px] text-slate-400 mt-0.5">{item.terminal}</p>
            )}
          </div>

          <div className="flex flex-col items-center shrink-0 px-1 gap-1">
            {isDirect ? (
              <>
                <div className="flex items-center gap-1">
                  <div className="h-px w-5 bg-slate-200" />
                  <Plane className="w-3.5 h-3.5 text-slate-400" />
                  <div className="h-px w-5 bg-slate-200" />
                </div>
                <span className="text-[9px] text-slate-300">Direct</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-0.5">
                  <div className="h-px w-4 bg-slate-200" />
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <div className="h-px w-4 bg-slate-200" />
                </div>
                <p className="text-[9px] text-amber-600 font-bold">{item.transitCode}</p>
                {item.transitDuration && (
                  <p className="text-[8px] text-slate-400">{item.transitDuration}</p>
                )}
              </>
            )}
          </div>

          <div className="flex-1 text-right">
            <p className="text-2xl font-black text-slate-900 leading-none tracking-tight">{item.toCode}</p>
            {item.toCity && (
              <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[80px] ml-auto">{item.toCity}</p>
            )}
            {item.eta && (
              <p className="text-[15px] font-extrabold text-sky-700 mt-1.5 tabular-nums leading-none">{item.eta}</p>
            )}
          </div>
        </div>

        {/* Transit detail */}
        {item.transitCode && item.transitCity && (
          <div className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-amber-50 border border-amber-100">
            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="text-[10.5px] text-amber-700 font-medium">
              Transit: {item.transitCity} ({item.transitCode})
              {item.transitDuration && <span className="text-amber-500"> · {item.transitDuration}</span>}
            </span>
          </div>
        )}

        {/* Tear-off divider */}
        <div className="relative flex items-center -mx-4 px-4">
          <div className="h-px flex-1 border-t border-dashed border-slate-200" />
          <div className="absolute -left-2 h-4 w-4 rounded-full bg-slate-100 border border-slate-200" />
          <div className="absolute -right-2 h-4 w-4 rounded-full bg-slate-100 border border-slate-200" />
        </div>

        {/* Date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{item.departDate ? fmtDate(item.departDate) : "Tanggal Fleksibel"}</span>
          </div>
          {item.validUntil && (
            <span className={cn("text-[10px]", expired ? "text-red-500" : "text-slate-400")}>
              {expired ? "⛔ Expired" : `⏰ s/d ${fmtDate(item.validUntil)}`}
            </span>
          )}
        </div>

        {/* Price */}
        <div className={cn("rounded-xl px-3 py-2.5", expired ? "bg-red-50" : "bg-sky-50")}>
          {expired ? (
            <div className="text-center">
              <p className="text-sm font-bold text-red-600">Hubungi Admin</p>
              <p className="text-[11px] text-slate-500">Harga mungkin sudah diperbarui</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-sky-600 font-medium uppercase tracking-wide">Harga / pax</p>
              <p className="text-[22px] font-black text-sky-700 leading-tight tabular-nums">{fmtIDR(sell)}</p>
              <p className="text-[10px] text-slate-400">sudah termasuk semua biaya layanan</p>
            </>
          )}
        </div>

        {item.notes && (
          <p className="text-[11px] text-slate-500 italic leading-snug">{item.notes}</p>
        )}

        {/* CTA */}
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors",
            expired ? "bg-slate-500 hover:bg-slate-600" : "bg-green-600 hover:bg-green-700",
          )}
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
              src="/temantiket-logo.png"
              alt="Temantiket"
              className="h-8 w-auto object-contain"
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
        className="relative py-8 px-4 text-center overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0c1e3e 0%,#0f3460 50%,#0c2d6e 100%)" }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#38bdf8 0%,transparent 60%),radial-gradient(circle at 80% 20%,#818cf8 0%,transparent 50%)" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-3">
            <Plane className="w-3.5 h-3.5 text-sky-300" />
            <span className="text-[11px] text-sky-200 font-semibold uppercase tracking-wider">Harga Terbaru</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-1.5">
            Tiket Umroh & Haji
          </h1>
          <p className="text-sm text-blue-200 max-w-md mx-auto">
            Harga kompetitif untuk semua rute pilihan. Pesan langsung via WhatsApp.
          </p>
          {published.length > 0 && (
            <p className="mt-2 text-xs text-blue-300">
              {published.length} rute tersedia — gunakan filter untuk menemukan rute Anda
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
          /* No published tickets at all */
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <Plane className="w-10 h-10 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-600">Belum ada harga yang dipublikasikan</p>
              <p className="text-sm mt-1">Hubungi kami langsung untuk informasi harga terbaru.</p>
            </div>
            {waNumber && (
              <a
                href={whatsappUrl(waNumber)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Tanya via WhatsApp
              </a>
            )}
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
            <img src="/temantiket-logo.png" alt="" className="h-5 w-auto opacity-40"
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
