/**
 * PublicTicketPrices — halaman publik daftar harga tiket
 * Route: /harga-tiket (no auth required)
 *
 * Menampilkan tiket yang isPublished=true dengan harga jual (markup included),
 * tanpa menampilkan harga modal. Branding Temantiket.
 */
import { useState, useEffect } from "react";
import { Plane, MessageCircle, Clock, MapPin, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAirlineGradient, getAirlineLogoUrl } from "@/lib/ticketPriceAI";
import {
  listTicketPrices, loadMarkup, sellingPrice, isExpired, fmtIDR, fmtDate,
  type TicketPrice,
} from "@/features/ticketPrices/ticketPricesRepo";
import { useRatesStore } from "@/store/ratesStore";
import { loadIghAdminSettings, whatsappUrl } from "@/lib/ighSettings";

// ── Airline Logo (self-contained, no auth dep) ───────────────────────────────
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

// ── Public Boarding Pass Card ────────────────────────────────────────────────
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PublicTicketPrices() {
  const { rates, refresh } = useRatesStore();
  const [tickets, setTickets] = useState<TicketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [markup] = useState(() => loadMarkup());
  const waNumber = loadIghAdminSettings().adminWhatsapp ?? "";

  // ── SEO meta injection ───────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.title;
    document.title = "Daftar Harga Tiket Umroh & Haji — Temantiket";

    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        document.head.appendChild(el);
      }
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

  const published = tickets.filter((t) => t.isPublished);

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
        className="relative py-10 px-4 text-center overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0c1e3e 0%,#0f3460 50%,#0c2d6e 100%)" }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#38bdf8 0%,transparent 60%),radial-gradient(circle at 80% 20%,#818cf8 0%,transparent 50%)" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-4">
            <Plane className="w-3.5 h-3.5 text-sky-300" />
            <span className="text-[11px] text-sky-200 font-semibold uppercase tracking-wider">Harga Terbaru</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
            Tiket Umroh & Haji
          </h1>
          <p className="text-sm text-blue-200 max-w-md mx-auto">
            Harga kompetitif untuk semua rute pilihan. Pesan langsung via WhatsApp.
          </p>
          {published.length > 0 && (
            <p className="mt-3 text-xs text-blue-300">
              {published.length} rute tersedia hari ini
            </p>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
            <p className="text-sm">Memuat daftar harga…</p>
          </div>
        ) : published.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {published.map((item) => (
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
