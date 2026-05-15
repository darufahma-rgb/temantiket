/**
 * FlightSearch — Cari harga tiket via Google Flights (SerpAPI)
 * Hanya untuk admin/owner. Hasil bisa langsung disimpan ke database tiket.
 */
import { useState } from "react";
import {
  Plane, Search, Loader2, ArrowLeftRight, Clock, Save,
  CheckCircle2, AlertCircle, TrendingDown, Calendar, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { saveTicketPrice } from "@/features/ticketPrices/ticketPricesRepo";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Layover { duration: number; code: string; name: string; }
interface FlightResult {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  transitCode: string | null;
  transitCity: string | null;
  transitCodes: string[];
  etd: string | null;
  eta: string | null;
  duration: number | null;
  price: number | null;
  currency: string;
  layovers: Layover[];
  isBest: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(mins: number | null): string {
  if (!mins) return "—";
  return `${Math.floor(mins / 60)}j ${String(mins % 60).padStart(2, "0")}m`;
}
function fmtIDR(n: number | null): string {
  if (!n) return "—";
  return "Rp " + n.toLocaleString("id-ID");
}

const POPULAR_ROUTES = [
  { from: "CGK", to: "JED", label: "Jakarta → Jeddah" },
  { from: "CGK", to: "MED", label: "Jakarta → Madinah" },
  { from: "SUB", to: "JED", label: "Surabaya → Jeddah" },
  { from: "CGK", to: "CAI", label: "Jakarta → Cairo" },
  { from: "JED", to: "CGK", label: "Jeddah → Jakarta" },
];

// ── API call ──────────────────────────────────────────────────────────────────
async function searchFlights(params: {
  from: string; to: string;
  outboundDate: string; returnDate?: string;
  adults: number; travelClass: number;
}): Promise<FlightResult[]> {
  const token = useAuthStore.getState().token;
  const qs = new URLSearchParams({
    departure_id: params.from,
    arrival_id: params.to,
    outbound_date: params.outboundDate,
    adults: String(params.adults),
    travel_class: String(params.travelClass),
    currency: "IDR",
  });
  if (params.returnDate) qs.set("return_date", params.returnDate);

  const resp = await fetch(`/api/flight-search?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error ?? "Gagal fetch data penerbangan");
  return data.results as FlightResult[];
}

// ── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({
  result, outboundDate, onSave, saving, saved,
}: {
  result: FlightResult;
  outboundDate: string;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const hasTransit = !!result.transitCode;

  return (
    <div className={cn(
      "relative bg-white rounded-2xl border p-4 transition-all",
      result.isBest
        ? "border-emerald-200 shadow-[0_2px_12px_-4px_rgba(16,185,129,0.25)]"
        : "border-slate-150 shadow-sm",
      saved && "opacity-60",
    )}>
      {result.isBest && (
        <span className="absolute -top-2.5 left-4 text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white px-2.5 py-0.5 rounded-full">
          Terbaik
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Airline badge */}
        <div className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center text-white font-black text-[12px] shrink-0",
          "bg-gradient-to-br from-blue-600 to-blue-900",
        )}>
          {result.airlineCode.slice(0, 2) || <Plane className="w-4 h-4" />}
        </div>

        {/* Route info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-[13px] font-bold text-slate-900 truncate">{result.airline}</p>
            {result.flightNumber && (
              <span className="text-[9px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.5 rounded-md shrink-0">
                {result.flightNumber}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-center">
              <p className="text-[16px] font-black text-slate-900 leading-none">{result.fromCode}</p>
              {result.etd && (
                <p className="text-[10px] font-mono font-semibold text-slate-500 mt-0.5">{result.etd}</p>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center gap-0.5 px-1">
              <div className="flex items-center w-full gap-1">
                <div className="flex-1 h-px bg-slate-200" />
                <Plane className="w-3 h-3 text-slate-400 rotate-90 shrink-0" />
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="flex items-center gap-1">
                {result.duration && (
                  <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />{fmtDuration(result.duration)}
                  </span>
                )}
                {hasTransit && (
                  <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-600 font-semibold px-1.5 py-0.5 rounded-full">
                    via {result.transitCode}
                  </span>
                )}
              </div>
            </div>

            <div className="text-center">
              <p className="text-[16px] font-black text-slate-900 leading-none">{result.toCode}</p>
              {result.eta && (
                <p className="text-[10px] font-mono font-semibold text-slate-500 mt-0.5">{result.eta}</p>
              )}
            </div>
          </div>

          {/* Layover badges */}
          {result.layovers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {result.layovers.map((l, i) => (
                <span key={i} className="text-[9px] bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="w-2 h-2" />
                  Layover {l.code} {fmtDuration(l.duration)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price + save */}
        <div className="text-right shrink-0 ml-1">
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">Harga</p>
          <p className="text-[18px] font-black text-emerald-700 leading-none tabular-nums">
            {fmtIDR(result.price)}
          </p>
          <p className="text-[8.5px] text-slate-400 mt-0.5">/pax</p>

          <button
            onClick={onSave}
            disabled={saving || saved}
            className={cn(
              "mt-2 flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all",
              saved
                ? "bg-emerald-100 text-emerald-700 cursor-default"
                : saving
                ? "bg-slate-100 text-slate-400 cursor-wait"
                : "bg-sky-600 hover:bg-sky-700 text-white active:scale-95",
            )}
          >
            {saved ? (
              <><CheckCircle2 className="w-3 h-3" />Tersimpan</>
            ) : saving ? (
              <><Loader2 className="w-3 h-3 animate-spin" />Menyimpan…</>
            ) : (
              <><Save className="w-3 h-3" />Simpan</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function FlightSearch() {
  const [from, setFrom] = useState("CGK");
  const [to, setTo] = useState("JED");
  const [outboundDate, setOutboundDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [travelClass, setTravelClass] = useState(1);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FlightResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);

  const [savingIdx, setSavingIdx] = useState<Set<number>>(new Set());
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());

  function swapRoute() {
    setFrom(to);
    setTo(from);
  }

  async function doSearch() {
    if (!from || !to || !outboundDate) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSavedIdx(new Set());
    try {
      const res = await searchFlights({ from, to, outboundDate, returnDate: returnDate || undefined, adults, travelClass });
      setResults(res);
      setSearchedAt(new Date().toLocaleTimeString("id-ID"));
      if (res.length === 0) setError("Tidak ada penerbangan ditemukan untuk rute & tanggal ini.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  async function doSave(idx: number, r: FlightResult) {
    setSavingIdx((s) => new Set(s).add(idx));
    try {
      await saveTicketPrice({
        airline: r.airline,
        airlineCode: r.airlineCode,
        flightNumber: r.flightNumber || null,
        fromCode: r.fromCode,
        fromCity: r.fromCity,
        toCode: r.toCode,
        toCity: r.toCity,
        departDate: outboundDate,
        basePrice: r.price ?? 0,
        currency: "IDR",
        validUntil: null,
        notes: null,
        isPublished: false,
        sortOrder: 0,
        etd: r.etd,
        eta: r.eta,
        terminal: null,
        transitCode: r.transitCode,
        transitCity: r.transitCity,
        transitDuration: r.layovers[0] ? fmtDuration(r.layovers[0].duration) : null,
        baggageInfo: null,
      });
      setSavedIdx((s) => new Set(s).add(idx));
    } catch (e: unknown) {
      alert("Gagal simpan: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setSavingIdx((s) => { const ns = new Set(s); ns.delete(idx); return ns; });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-black text-slate-900 leading-tight">Cari Harga Tiket</h1>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Powered by Google Flights · Simpan langsung ke database Harga Tiket
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        {/* Popular routes */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Rute Populer</p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_ROUTES.map((r) => (
              <button
                key={r.from + r.to}
                onClick={() => { setFrom(r.from); setTo(r.to); }}
                className={cn(
                  "text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                  from === r.from && to === r.to
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Route inputs */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dari (IATA)</label>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="CGK"
              className="w-full mt-0.5 px-3 py-2.5 text-[15px] font-black font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 uppercase"
            />
          </div>
          <button
            onClick={swapRoute}
            className="mt-4 p-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors shrink-0"
          >
            <ArrowLeftRight className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ke (IATA)</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="JED"
              className="w-full mt-0.5 px-3 py-2.5 text-[15px] font-black font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 uppercase"
            />
          </div>
        </div>

        {/* Date inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Calendar className="w-3 h-3" />Tanggal Berangkat
            </label>
            <input
              type="date"
              value={outboundDate}
              onChange={(e) => setOutboundDate(e.target.value)}
              className="w-full mt-0.5 px-3 py-2.5 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Calendar className="w-3 h-3" />Tanggal Pulang (opsional)
            </label>
            <input
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              min={outboundDate}
              className="w-full mt-0.5 px-3 py-2.5 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
            />
          </div>
        </div>

        {/* Passengers + class */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Users className="w-3 h-3" />Penumpang
            </label>
            <select
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="w-full mt-0.5 px-3 py-2.5 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>{n} orang</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kelas</label>
            <select
              value={travelClass}
              onChange={(e) => setTravelClass(Number(e.target.value))}
              className="w-full mt-0.5 px-3 py-2.5 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
            >
              <option value={1}>Ekonomi</option>
              <option value={2}>Premium Ekonomi</option>
              <option value={3}>Bisnis</option>
              <option value={4}>First Class</option>
            </select>
          </div>
        </div>

        {/* Search button */}
        <button
          onClick={doSearch}
          disabled={loading || !from || !to || !outboundDate}
          className={cn(
            "w-full h-12 flex items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white transition-all",
            loading || !from || !to || !outboundDate
              ? "bg-slate-300 cursor-not-allowed"
              : "bg-sky-600 hover:bg-sky-700 active:scale-[0.99] shadow-sm",
          )}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Mencari penerbangan…</>
          ) : (
            <><Search className="w-4 h-4" />Cari Harga</>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-500" />
              <p className="text-[13px] font-bold text-slate-800">
                {results.length} penerbangan ditemukan
              </p>
            </div>
            {searchedAt && (
              <p className="text-[10px] text-slate-400">Diperbarui {searchedAt}</p>
            )}
          </div>

          <p className="text-[11px] text-slate-500 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
            💡 Klik <strong>Simpan</strong> pada tiket yang ingin ditambahkan ke database Harga Tiket. Status akan otomatis <em>Draft</em> (tidak tampil publik) sampai lo publikasikan.
          </p>

          {results.map((r, i) => (
            <ResultCard
              key={i}
              result={r}
              outboundDate={outboundDate}
              onSave={() => doSave(i, r)}
              saving={savingIdx.has(i)}
              saved={savedIdx.has(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
