import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Sparkles, Plus, Trash2, Edit3, Eye, EyeOff, Loader2,
  MessageCircle, AlertTriangle, Check, X, ChevronDown, ChevronUp,
  Tag, RefreshCw, Settings2, ImagePlus, Plane, Share2, Copy,
  Clock, MapPin, ArrowRight, ExternalLink, Instagram, Link2,
  ArrowLeftRight, RotateCcw, Search, Calendar, SlidersHorizontal, ArrowUpDown,
  FlaskConical, ClipboardPaste, ArrowLeft, TrendingUp, Calculator, Bell,
  FileSpreadsheet, LayoutGrid, ArrowDown, ArrowUp, Star, Database, History,
} from "lucide-react";
import { MobileFAB } from "@/components/MobileFAB";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RouteTimeline } from "@/components/RouteTimeline";
import { MultiLegTimeline } from "@/components/MultiLegTimeline";
import { useAuthStore } from "@/store/authStore";
import { useRatesStore } from "@/store/ratesStore";
import {
  scanTicketPriceScreenshot, parseGalileoTextToTickets, scanTicketPriceTextWithAI,
  getAirlineLogoUrl, getAirlineGradient,
  encodeReturnLeg, decodeReturnLeg,
  encodeMultiLeg, decodeMultiLeg, buildRouteLabel,
  type ParsedTicketPrice, type ReturnLegData, type MultiLegData, type LegInfo,
  type ScanDebugInfo,
} from "@/lib/ticketPriceAI";
import {
  createTicketPrice, updateTicketPrice, deleteTicketPrice,
  loadMarkup, saveMarkup, sellingPrice, isExpired, fmtIDR, fmtDate,
  CURRENCY_LABEL,
  type TicketPrice, type TicketPriceDraft, type TicketCurrency,
} from "@/features/ticketPrices/ticketPricesRepo";
import { useTicketPricesStore } from "@/store/ticketPricesStore";
import { loadIghAdminSettings, whatsappUrl } from "@/lib/ighSettings";

// ── Types ────────────────────────────────────────────────────────────────────
type FormState = Omit<TicketPriceDraft, "sortOrder" | "isPublished"> & {
  isPublished: boolean;
};

const EMPTY_FORM: FormState = {
  airline: "", airlineCode: "", fromCode: "", fromCity: "",
  toCode: "", toCity: "", departDate: null, basePrice: 0,
  currency: "IDR", validUntil: null, notes: null, isPublished: true,
  flightNumber: null, etd: null, eta: null, terminal: null,
  transitCode: null, transitCity: null, transitDuration: null,
  baggageInfo: null,
};

function formFromParsed(p: ParsedTicketPrice): FormState {
  // Fase 19.5: multi-leg gets __ML__ encoding; simple return gets __RT__; one-way gets null.
  let notes: string | null = null;
  if (p.multiLeg) {
    notes = encodeMultiLeg(p.multiLeg);
  } else if (p.tripType === "return" || p.tripType === "multi_city") {
    notes = encodeReturnLeg(p);
  }

  // For multi-leg trips, derive outbound-only flight number from the leg chain
  // so the primary flightNumber field doesn't include return-leg flights.
  const outboundFlightNumber = p.multiLeg
    ? p.multiLeg.outboundLegs.map((l) => l.flightNumber).filter(Boolean).join("/") || p.flightNumber
    : p.flightNumber;

  // validUntil is a price-expiry date set by the agent, not derived from trip dates.
  return {
    airline: p.airline, airlineCode: p.airlineCode,
    fromCode: p.fromCode, fromCity: p.fromCity,
    toCode: p.toCode, toCity: p.toCity,
    departDate: p.departDate, basePrice: p.basePrice ?? 0,
    currency: p.currency, validUntil: null, notes,
    isPublished: p.confidence !== "low" && (p.basePrice != null && p.basePrice > 0) && p.fromCode !== "???" && p.toCode !== "???",
    flightNumber: outboundFlightNumber ?? null,
    etd: p.etd ?? null, eta: p.eta ?? null,
    terminal: p.terminal ?? null,
    transitCode: p.transitCode ?? null,
    transitCity: p.transitCity ?? null,
    transitDuration: p.transitDuration ?? null,
    baggageInfo: null,
  };
}

// ── Airline logo component ───────────────────────────────────────────────────
// Codes with locally uploaded logos in /airlines/
const LOCAL_AIRLINE_LOGOS = new Set(["QR","EK","EY","GA","TK","WY","SV","MS"]);

function AirlineLogo({ code, airline, size = 40, white = false }: { code: string; airline: string; size?: number; white?: boolean }) {
  const c = (code || "").trim().toUpperCase();
  const grad = getAirlineGradient(c);
  const localSrc = LOCAL_AIRLINE_LOGOS.has(c) ? `/airlines/${c}.png` : null;
  const cdnSrc = getAirlineLogoUrl(c);

  const [src, setSrc] = useState<string | null>(localSrc ?? cdnSrc);
  const [triedCdn, setTriedCdn] = useState(!localSrc);

  if (!src || !c || c === "??") {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl font-bold shrink-0",
          white ? "text-white/90" : cn("bg-gradient-to-br text-white", grad),
        )}
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
      style={{ width: size, height: size, filter: white ? "brightness(0) invert(1)" : undefined }}
      onError={handleError}
    />
  );
}


// ── Boarding-pass style Price Card (Compact) ─────────────────────────────────
export function BoardingPassCard({
  item, markup, rates, isAdmin, onEdit, onDelete, onTogglePublish, onView, waNumber, showBasePrice = false,
}: {
  item: TicketPrice;
  markup: number;
  rates: Record<string, number>;
  isAdmin: boolean;
  onEdit?: (item: TicketPrice) => void;
  onDelete?: (id: string) => void;
  onTogglePublish?: (id: string, val: boolean) => void;
  onView?: (item: TicketPrice) => void;
  waNumber: string;
  showBasePrice?: boolean;
}) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const expired = isExpired(item.validUntil);
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);
  const isDirect = !item.transitCode;

  // Fase 19.5: detect multi-leg first, then fall back to simple round-trip
  const { ml: mlData, userNotes: mlUserNotes } = decodeMultiLeg(item.notes);
  const isML = !!mlData;
  const { leg: returnLeg, userNotes: rtUserNotes } = isML
    ? { leg: null, userNotes: null }
    : decodeReturnLeg(item.notes);
  const isRT = !!returnLeg;
  const userNotes = mlUserNotes ?? rtUserNotes;
  const isRTorML = isRT || isML;

  // ── Compact route label ──────────────────────────────────────────────────────
  // e.g. "Surabaya → Madinah via Dubai" or "Cairo ↔ Goa (via Bahrain)"
  const fromLabel = item.fromCity || item.fromCode;
  const toLabel   = item.toCity   || item.toCode;
  const viaLabel  = item.transitCity || item.transitCode;

  const compactRoute = isML
    ? buildRouteLabel(mlData!)
    : isRT
      ? `${fromLabel} ⇄ ${toLabel}${viaLabel ? ` via ${viaLabel}` : ""}`
      : `${fromLabel} → ${toLabel}${viaLabel ? ` via ${viaLabel}` : ""}`;

  // ── Date/time display ────────────────────────────────────────────────────────
  const returnDate = isML
    ? (mlData?.returnLegs?.[0]?.date ?? null)
    : isRT
      ? (returnLeg?.returnDate ?? null)
      : null;

  const returnEtd = isML
    ? (mlData?.returnLegs?.[0]?.etd ?? null)
    : isRT
      ? (returnLeg?.returnEtd ?? null)
      : null;

  // Airport codes shown next to times for context
  const departFromCode = item.fromCode || null;
  const returnFromCode = isML
    ? (mlData?.returnLegs?.[0]?.fromCode ?? null)
    : isRT
      ? (returnLeg?.returnFromCode ?? null)
      : null;

  // ── WhatsApp message ─────────────────────────────────────────────────────────
  const routeLabel = isML
    ? buildRouteLabel(mlData!)
    : isRT
      ? `${item.fromCode} ⇄ ${item.toCode}`
      : `${item.fromCode} → ${item.toCode}`;

  const waText = encodeURIComponent(
    `Halo Temantiket! Saya tertarik dengan tiket berikut:\n\n` +
    `✈️ *${item.airline}*\n` +
    `🗺️ Rute: *${routeLabel}*\n` +
    (isML
      ? mlData!.outboundLegs.map((l, i) =>
          `   Seg ${i+1}: ${l.fromCode}→${l.toCode}${l.flightNumber ? ` (${l.flightNumber})` : ""}${l.etd ? ` jam ${l.etd}` : ""}${l.date ? ` · ${fmtDate(l.date)}` : ""}`
        ).join("\n") + "\n" +
        (mlData!.returnLegs?.length
          ? `   ↩ Pulang:\n` + mlData!.returnLegs.map((l, i) =>
              `   Seg ${i+1}: ${l.fromCode}→${l.toCode}${l.flightNumber ? ` (${l.flightNumber})` : ""}${l.etd ? ` jam ${l.etd}` : ""}${l.date ? ` · ${fmtDate(l.date)}` : ""}`
            ).join("\n") + "\n"
          : "")
      : isRT
        ? `   Berangkat: ${item.fromCode}→${item.toCode}${item.flightNumber ? ` (${item.flightNumber})` : ""}${item.etd ? ` jam ${item.etd}` : ""}${item.departDate ? ` · ${fmtDate(item.departDate)}` : ""}\n` +
          `   Pulang: ${returnLeg?.returnFromCode ?? ""}→${returnLeg?.returnToCode ?? ""}${returnLeg?.returnFlightNumber ? ` (${returnLeg.returnFlightNumber})` : ""}${returnLeg?.returnEtd ? ` jam ${returnLeg.returnEtd}` : ""}${returnLeg?.returnDate ? ` · ${fmtDate(returnLeg.returnDate)}` : ""}\n`
        : `${item.fromCity ? `   ${item.fromCity} → ${item.toCity}\n` : ""}` +
          `${item.etd || item.eta ? `🕐 ${item.etd ?? "—"} → ${item.eta ?? "—"}\n` : ""}` +
          `${item.transitCode ? `🔄 Transit: ${item.transitCity ?? item.transitCode}${item.transitDuration ? ` (${item.transitDuration})` : ""}\n` : ""}` +
          `📅 Tanggal: ${item.departDate ? fmtDate(item.departDate) : "Fleksibel"}\n`) +
    `💰 Harga: *${fmtIDR(sell)}${isRTorML ? "/paket PP" : "/pax"}*\n\n` +
    `Mohon infokan ketersediaan dan detailnya. Terima kasih!`
  );

  const waLink = waNumber
    ? `${whatsappUrl(waNumber)}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  const SK = "'Sk-Modernist', 'Inter', sans-serif";

  // Handle card body click → open detail modal
  const handleCardClick = () => {
    if (onView) onView(item);
  };

  return (
    <div
      className={cn(
        "relative rounded-3xl border bg-white flex flex-col transition-all duration-200",
        "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.10),0_1px_4px_-2px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_6px_28px_-6px_rgba(0,0,0,0.14),0_2px_8px_-2px_rgba(0,0,0,0.08)]",
        expired ? "opacity-60 border-slate-200" : "border-slate-150",
        !item.isPublished && "border-dashed border-slate-300",
        onView && "cursor-pointer",
      )}
      style={{ fontFamily: SK }}
      onClick={handleCardClick}
    >
      {/* ── HEADER: Maskapai + Kode Penerbangan + Badge Tipe ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <AirlineLogo code={item.airlineCode} airline={item.airline} size={52} />
          <div className="min-w-0 flex-1">
            <p
              className="text-[13.5px] text-slate-900 leading-tight truncate"
              style={{ fontFamily: SK, fontWeight: 700 }}
            >
              {item.airline}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-mono tracking-wide">{item.airlineCode}</span>
              {!isRT && !isML && item.flightNumber && (
                <span
                  className="text-[10px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5 font-mono"
                  style={{ fontWeight: 600 }}
                >
                  {item.flightNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full",
            isML || isRT ? "bg-violet-50 text-violet-600 border border-violet-100"
            : isDirect ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
            : "bg-amber-50 text-amber-600 border border-amber-100",
          )} style={{ fontWeight: 700 }}>
            {isML ? "Multi-Leg PP" : isRT ? "Pulang-Pergi" : isDirect ? "One Way" : "Transit"}
          </span>
          {isAdmin && !item.isPublished && (
            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-400 border-slate-200 py-0">
              Tersembunyi
            </Badge>
          )}
          {expired && (
            <Badge className="text-[10px] bg-red-50 text-red-500 border border-red-100 py-0">Expired</Badge>
          )}
        </div>
      </div>

      {/* ── ROUTE SUMMARY ── */}
      <div className="px-4 pb-3 flex-1">
        <div className="border-t border-slate-200 mb-2.5" />
        <div className="flex items-start gap-1.5">
          <Plane className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p
            className="text-[13px] text-slate-800 leading-snug flex-1 min-w-0"
            style={{ fontFamily: SK, fontWeight: 600 }}
          >
            {compactRoute}
          </p>
          {onView && (
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
          )}
        </div>

        {/* Date + Time — two-column layout for RT/ML, single col for OW */}
        <div className="mt-2">
          {isRTorML && returnDate ? (
            <div className="flex items-stretch gap-0">
              {/* Berangkat */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Berangkat</p>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-[11.5px] text-slate-700 font-semibold leading-none">
                    {item.departDate ? fmtDate(item.departDate) : "Fleksibel"}
                  </span>
                </div>
                {item.etd && (
                  <div className="flex items-center gap-1 ml-4 mt-0.5">
                    <span className="text-[11px] text-slate-700 font-mono font-semibold">{item.etd}</span>
                    {departFromCode && (
                      <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 py-0.5 font-mono font-semibold tracking-wide">
                        {departFromCode}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Divider */}
              <div className="w-px bg-slate-100 mx-3 self-stretch" />
              {/* Pulang */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-violet-400 uppercase tracking-wide font-semibold mb-0.5">Pulang</p>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-violet-400 shrink-0" />
                  <span className="text-[11.5px] text-violet-700 font-semibold leading-none">
                    {fmtDate(returnDate)}
                  </span>
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
                    {departFromCode && (
                      <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 py-0.5 font-mono font-semibold tracking-wide">
                        {departFromCode}
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
          {/* Valid until — below the two-col date block for RT/ML */}
          {isRTorML && item.validUntil && (
            <span className={cn("text-[9.5px] mt-1 block", expired ? "text-red-500 font-semibold" : "text-slate-400")}>
              {expired ? "⛔ Expired" : `s/d ${fmtDate(item.validUntil)}`}
            </span>
          )}
        </div>
      </div>

      {/* ── HARGA ── */}
      <div className="px-4 pb-3">
        <div className="border-t border-slate-200 mb-2.5" />
        {item.baggageInfo && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] text-slate-400">🧳</span>
            <span className="text-[10px] text-slate-500 font-medium">{item.baggageInfo}</span>
          </div>
        )}
        {!expired ? (
          <div className="flex items-end justify-between gap-2">
            <div>
              <p
                className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5"
                style={{ fontWeight: 700 }}
              >
                Harga
              </p>
              <p
                className="text-[20px] text-slate-900 leading-tight tabular-nums"
                style={{ fontFamily: SK, fontWeight: 700 }}
              >
                {fmtIDR(sell)}
              </p>
              {showBasePrice && markup > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Modal: {item.currency} {item.basePrice.toLocaleString("id-ID")} · markup {fmtIDR(markup)}
                </p>
              )}
              {!showBasePrice && (
                <p className="text-[9.5px] text-slate-400 mt-0.5">
                  {isRTorML ? "paket PP · sudah termasuk margin" : "sudah termasuk margin"}
                </p>
              )}
            </div>
            {/* Notes — owner only (strip any raw __RT__/__ML__ encoded strings) */}
            {showBasePrice && (() => {
              const cleanNotes = userNotes && !String(userNotes).startsWith("__") ? userNotes : null;
              const rawNotes = !isRTorML && item.notes && !item.notes.startsWith("__") ? item.notes : null;
              const display = cleanNotes ?? rawNotes;
              return display ? (
                <p className="text-[10px] text-slate-400 italic leading-snug text-right max-w-[120px] truncate">
                  {display}
                </p>
              ) : null;
            })()}
          </div>
        ) : (
          <div>
            <p className="text-sm text-red-500" style={{ fontWeight: 700 }}>Harga Expired</p>
            <p className="text-[11px] text-slate-400">Hubungi admin untuk harga terbaru</p>
          </div>
        )}
      </div>

      {/* ── FOOTER: Tombol aksi ── */}
      <div className="px-4 pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="border-t border-slate-200 mb-3" />

        {/* Row 1: WA + Order */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 w-full">
            <p className="flex-1 text-[11.5px] text-slate-600 truncate" style={{ fontFamily: SK, fontWeight: 600 }}>
              Hapus tiket ini?
            </p>
            <Button size="sm" variant="outline"
              className="rounded-xl text-xs border-slate-200 text-slate-500 h-8 px-3 shrink-0"
              onClick={() => setConfirmDelete(false)}>
              Batal
            </Button>
            <Button size="sm"
              className="rounded-xl text-xs bg-red-500 hover:bg-red-600 text-white h-8 px-3 shadow-none shrink-0"
              style={{ fontFamily: SK, fontWeight: 700 }}
              onClick={() => { setConfirmDelete(false); onDelete!(item.id); }}>
              <Trash2 className="w-3 h-3 mr-1" />Hapus
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 w-full">
            {expired ? (
              <Button asChild size="sm" variant="outline"
                className="flex-1 min-w-0 rounded-xl text-xs border-slate-200 text-slate-600 h-9">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">Hubungi Admin</span>
                </a>
              </Button>
            ) : (
              <Button asChild size="sm"
                className="flex-1 min-w-0 rounded-xl text-xs bg-green-500 hover:bg-green-600 text-white h-9 shadow-none"
                style={{ fontFamily: SK, fontWeight: 700 }}>
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">Pesan via WA</span>
                </a>
              </Button>
            )}
            {isAdmin && !expired && (
              <Button size="sm" variant="outline"
                className="rounded-xl text-xs border-slate-200 text-slate-600 hover:bg-slate-50 h-9 px-3 shrink-0"
                onClick={() => navigate("/orders/flight")}
                style={{ fontFamily: SK, fontWeight: 600 }}>
                <Plus className="w-3.5 h-3.5 mr-1 shrink-0" />Order
              </Button>
            )}
          </div>
        )}

        {/* Row 2 (admin only): icon actions — right-aligned */}
        {isAdmin && !confirmDelete && (
          <div className="flex items-center justify-end gap-0.5">
            {onView && (
              <Button size="icon" variant="ghost"
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="Lihat Detail" onClick={() => onView(item)}>
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            {onEdit && (
              <Button size="icon" variant="ghost"
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="Edit" onClick={() => onEdit(item)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button size="icon" variant="ghost"
                className="h-8 w-8 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50"
                title="Hapus" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ticket Detail Modal ───────────────────────────────────────────────────────
function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-semibold text-slate-500 shrink-0 w-28">{label}</span>
      <span className={cn("text-[12px] font-semibold text-slate-800 text-right", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function TicketDetailModal({
  open, item, markup, rates, isOwner, onClose, onEdit, onTogglePublish,
}: {
  open: boolean;
  item: TicketPrice | null;
  markup: number;
  rates: Record<string, number>;
  isOwner?: boolean;
  onClose: () => void;
  onEdit?: (item: TicketPrice) => void;
  onTogglePublish?: (id: string, val: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);

  if (!item) return null;

  const expired = isExpired(item.validUntil);
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);
  const isDirect = !item.transitCode;

  const { ml: mlData } = decodeMultiLeg(item.notes);
  const isML = !!mlData;
  const { leg: returnLeg, userNotes } = isML
    ? { leg: null, userNotes: null }
    : decodeReturnLeg(item.notes);
  const isRT = !!returnLeg;

  const tripType = isML ? "Multi-Leg PP" : isRT ? "Pulang-Pergi" : isDirect ? "Direct" : "Transit";
  const tripBadgeColor = isML || isRT
    ? "bg-violet-100 text-violet-700"
    : isDirect
    ? "bg-sky-100 text-sky-700"
    : "bg-amber-100 text-amber-700";

  async function doToggle() {
    if (!onTogglePublish) return;
    setToggling(true);
    try { await onTogglePublish(item.id, !item.isPublished); }
    finally { setToggling(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {/* ── Airline header strip ── */}
        <div className={cn(
          "flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r text-white rounded-t-lg",
          getAirlineGradient(item.airlineCode),
        )}>
          <div className="flex items-center gap-3 min-w-0">
            <AirlineLogo code={item.airlineCode} airline={item.airline} size={40} white />
            <div className="min-w-0">
              <p className="font-bold text-[15px] leading-tight truncate">{item.airline}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[10px] text-white/70 font-mono">{item.airlineCode}</span>
                {item.flightNumber && !isRT && !isML && (
                  <span className="text-[10px] bg-white/20 rounded px-1.5 py-0.5 font-mono font-semibold">
                    {item.flightNumber}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", tripBadgeColor)}>
              {tripType}
            </span>
            {expired && (
              <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                Expired
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* ── Route section — vertical timeline ── */}
          <div className="rounded-xl border border-slate-100 bg-white px-4 py-4">
            {isML && mlData ? (
              <div className="space-y-4">
                <MultiLegTimeline legs={mlData.outboundLegs} label="Berangkat" />
                {(mlData.returnLegs?.length ?? 0) > 0 && (
                  <>
                    <div className="border-t border-dashed border-slate-200" />
                    <MultiLegTimeline legs={mlData.returnLegs!} label="Pulang" />
                  </>
                )}
              </div>
            ) : isRT && returnLeg ? (
              <RouteTimeline
                outbound={{
                  origin: { code: item.fromCode, city: item.fromCity, time: item.etd },
                  destination: { code: item.toCode, city: item.toCity, time: item.eta },
                  transit: item.transitCode
                    ? { code: item.transitCode, city: item.transitCity, duration: item.transitDuration ?? undefined }
                    : null,
                  date: item.departDate ? fmtDate(item.departDate) : null,
                  flightNumber: item.flightNumber,
                }}
                returnTrip={{
                  origin: { code: returnLeg.returnFromCode ?? "—", city: returnLeg.returnFromCity, time: returnLeg.returnEtd },
                  destination: { code: returnLeg.returnToCode ?? "—", city: returnLeg.returnToCity, time: returnLeg.returnEta },
                  transit: returnLeg.returnTransitCode
                    ? { code: returnLeg.returnTransitCode, city: returnLeg.returnTransitCity, duration: returnLeg.returnTransitDuration ?? undefined }
                    : null,
                  date: returnLeg.returnDate ? fmtDate(returnLeg.returnDate) : null,
                  flightNumber: returnLeg.returnFlightNumber,
                }}
              />
            ) : (
              <RouteTimeline
                outbound={{
                  origin: { code: item.fromCode, city: item.fromCity, time: item.etd },
                  destination: { code: item.toCode, city: item.toCity, time: item.eta },
                  transit: item.transitCode
                    ? { code: item.transitCode, city: item.transitCity, duration: item.transitDuration ?? undefined }
                    : null,
                  date: item.departDate ? fmtDate(item.departDate) : null,
                  flightNumber: item.flightNumber,
                }}
              />
            )}
          </div>

          {/* ── Detail rows ── */}
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Detail</p>
            <div className="divide-y divide-slate-100">
              {item.terminal && <DetailRow label="Terminal" value={item.terminal} mono />}
              {item.baggageInfo && <DetailRow label="Bagasi" value={item.baggageInfo} />}
              {item.validUntil && (
                <DetailRow
                  label="Berlaku Hingga"
                  value={
                    <span className={expired ? "text-red-600" : "text-slate-800"}>
                      {expired ? "⛔ " : ""}{fmtDate(item.validUntil)}
                    </span>
                  }
                />
              )}
            </div>
          </div>

          {/* ── Pricing — owner sees base + markup; non-owner sees final price only ── */}
          {isOwner ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Harga</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">
                    {isML || isRT ? "Harga Paket PP" : "Harga"}
                  </p>
                  <p className="text-[28px] font-black font-mono text-sky-700 leading-none tabular-nums mt-0.5">
                    {fmtIDR(sell)}
                  </p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-[10.5px] text-slate-500">
                    Modal: <span className="font-semibold text-slate-700">{item.currency} {item.basePrice.toLocaleString("id-ID")}</span>
                  </p>
                  {markup > 0 && (
                    <p className="text-[10.5px] text-slate-500">
                      Markup: <span className="font-semibold text-emerald-600">+{fmtIDR(markup)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
              <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide mb-0.5">
                {isML || isRT ? "Harga Paket PP" : "Harga"}
              </p>
              <p className="text-[26px] font-black font-mono text-sky-700 leading-none tabular-nums">
                {fmtIDR(sell)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {isML || isRT ? "harga paket pulang-pergi, sudah termasuk margin" : "sudah termasuk margin keuntungan"}
              </p>
            </div>
          )}

          {/* ── Notes (owner only) ── */}
          {isOwner && userNotes && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-100 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-600 mb-1">Catatan</p>
              <p className="text-[12px] text-yellow-800 leading-snug">{userNotes}</p>
            </div>
          )}
          {isOwner && !isRT && !isML && item.notes && !item.notes.startsWith("__") && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-100 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-600 mb-1">Catatan</p>
              <p className="text-[12px] text-yellow-800 leading-snug">{item.notes}</p>
            </div>
          )}

          {/* ── Status (publish toggle) ── */}
          {onTogglePublish && (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-4 py-2.5">
              <div>
                <p className="text-[12px] font-semibold text-slate-700">Tampil di Daftar Publik</p>
                <p className="text-[10px] text-slate-400">{item.isPublished ? "Dipublikasikan" : "Disembunyikan (draft)"}</p>
              </div>
              <button
                onClick={() => void doToggle()}
                disabled={toggling}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60",
                  item.isPublished ? "bg-emerald-500" : "bg-slate-300",
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  item.isPublished ? "translate-x-6" : "translate-x-1",
                )} />
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="px-5 pb-5 pt-0 gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Tutup</Button>
          {onEdit && (
            <Button
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => { onClose(); onEdit(item); }}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Form Dialog ──────────────────────────────────────────────────────────────
function LegDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="h-px flex-1 bg-violet-200" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">{label}</span>
      <div className="h-px flex-1 bg-violet-200" />
    </div>
  );
}

function TicketFormDialog({
  open, onClose, initial, onSave, loading, isOwner,
}: {
  open: boolean;
  onClose: () => void;
  initial: FormState;
  onSave: (form: FormState) => Promise<void>;
  loading: boolean;
  isOwner?: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [returnForm, setReturnForm] = useState<ReturnLegData | null>(null);
  const [mlData, setMlData] = useState<MultiLegData | null>(null);
  const [userNotes, setUserNotes] = useState<string>("");
  const [returnOpen, setReturnOpen] = useState(false);

  useEffect(() => {
    setForm(initial);
    const { ml } = decodeMultiLeg(initial.notes);
    if (ml) {
      setMlData(ml);
      setReturnForm(null);
      setReturnOpen(false);
      setUserNotes("");
    } else {
      setMlData(null);
      const { leg, userNotes: un } = decodeReturnLeg(initial.notes);
      setReturnForm(leg);
      setReturnOpen(!!leg);
      setUserNotes(un ?? "");
    }
  }, [initial, open]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setRt = (patch: Partial<ReturnLegData>) =>
    setReturnForm((r) => r ? { ...r, ...patch } : r);

  const addReturnLeg = () => {
    setReturnForm({
      returnFlightNumber: null,
      returnEtd: null,
      returnEta: null,
      returnFromCode: form.toCode || null,
      returnToCode: form.fromCode || null,
      returnFromCity: form.toCity || null,
      returnToCity: form.fromCity || null,
      returnTransitCode: null,
      returnTransitCity: null,
      returnTransitDuration: null,
      returnDate: null,
    });
    setReturnOpen(true);
  };

  const removeReturnLeg = () => {
    setReturnForm(null);
    setReturnOpen(false);
  };

  const isRT = !!returnForm;
  const isML = !!mlData;
  const isPP = isRT || isML;

  const handleSave = async () => {
    let finalNotes: string | null = null;
    if (isML) {
      finalNotes = form.notes; // keep ML encoding unchanged
    } else if (isRT && returnForm) {
      const rtStr = `__RT__:${JSON.stringify(returnForm)}`;
      finalNotes = userNotes.trim() ? `${rtStr}\n${userNotes.trim()}` : rtStr;
    } else {
      finalNotes = userNotes.trim() || null;
    }
    await onSave({ ...form, notes: finalNotes });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Plane className="w-4 h-4 text-sky-600 shrink-0" />
            {form.airline ? `Edit: ${form.airline}` : "Tambah Harga Tiket"}
            {isML && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                <ArrowLeftRight className="w-3 h-3" />Multi-Leg PP
              </span>
            )}
            {isRT && !isML && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                <ArrowLeftRight className="w-3 h-3" />PP
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Airline ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nama Maskapai</Label>
              <Input placeholder="Qatar Airways" value={form.airline}
                onChange={(e) => set({ airline: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kode IATA</Label>
              <Input placeholder="QR" maxLength={2} value={form.airlineCode}
                onChange={(e) => set({ airlineCode: e.target.value.toUpperCase() })}
                className="font-mono uppercase" />
            </div>
          </div>

          {isPP && <LegDivider label="↗ Leg Berangkat" />}

          {/* ── Outbound flight number + times ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">No. Penerbangan</Label>
              <Input placeholder="QR818" value={form.flightNumber ?? ""}
                onChange={(e) => set({ flightNumber: e.target.value.toUpperCase() || null })}
                className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ETD</Label>
              <Input placeholder="23:55" value={form.etd ?? ""}
                onChange={(e) => set({ etd: e.target.value || null })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ETA</Label>
              <Input placeholder="05:30" value={form.eta ?? ""}
                onChange={(e) => set({ eta: e.target.value || null })} />
            </div>
          </div>

          {/* ── Outbound route ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Dari (IATA)</Label>
              <Input placeholder="CGK" maxLength={3} value={form.fromCode}
                onChange={(e) => set({ fromCode: e.target.value.toUpperCase() })}
                className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ke (IATA)</Label>
              <Input placeholder="JED" maxLength={3} value={form.toCode}
                onChange={(e) => set({ toCode: e.target.value.toUpperCase() })}
                className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kota Asal</Label>
              <Input placeholder="Jakarta" value={form.fromCity}
                onChange={(e) => set({ fromCity: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kota Tujuan</Label>
              <Input placeholder="Jeddah" value={form.toCity}
                onChange={(e) => set({ toCity: e.target.value })} />
            </div>
          </div>

          {/* ── Outbound transit ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Transit (IATA)</Label>
              <Input placeholder="DOH" maxLength={3} value={form.transitCode ?? ""}
                onChange={(e) => set({ transitCode: e.target.value.toUpperCase() || null })}
                className="font-mono uppercase" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kota Transit</Label>
              <Input placeholder="Doha" value={form.transitCity ?? ""}
                onChange={(e) => set({ transitCity: e.target.value || null })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durasi Transit</Label>
              <Input placeholder="2h 30m" value={form.transitDuration ?? ""}
                onChange={(e) => set({ transitDuration: e.target.value || null })} />
            </div>
          </div>

          {/* ── Outbound date ── */}
          <div className="space-y-1">
            <Label className="text-xs">Tanggal Keberangkatan</Label>
            <Input type="date" value={form.departDate ?? ""}
              onChange={(e) => set({ departDate: e.target.value || null })} />
          </div>

          {/* ══ RETURN LEG SECTION ══ */}
          {!isML && (
            <>
              {!isRT ? (
                /* ── Tombol Tambah Kepulangan ── */
                <button
                  type="button"
                  onClick={addReturnLeg}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed",
                    "border-violet-200 bg-violet-50/30 hover:bg-violet-50 hover:border-violet-300",
                    "py-3 text-[12px] font-semibold text-violet-500 hover:text-violet-700",
                    "transition-all duration-150 cursor-pointer",
                  )}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Info Kepulangan (Pulang-Pergi)
                </button>
              ) : (
                /* ── Collapsible Return Leg Card ── */
                <div className="rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
                  {/* Header — always visible */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-violet-50/60 transition-colors"
                    onClick={() => setReturnOpen((v) => !v)}
                  >
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span className="text-[12px] font-bold text-violet-700">Leg Kepulangan</span>
                      {returnForm?.returnFromCode && returnForm?.returnToCode && (
                        <span className="text-[10px] font-mono bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">
                          {returnForm.returnFromCode} → {returnForm.returnToCode}
                        </span>
                      )}
                      {returnForm?.returnDate && (
                        <span className="text-[10px] text-violet-400 truncate">
                          · {fmtDate(returnForm.returnDate)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeReturnLeg(); }}
                      className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors shrink-0"
                      title="Hapus info kepulangan"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span className="hidden sm:inline">Hapus</span>
                    </button>
                    {returnOpen
                      ? <ChevronUp className="w-4 h-4 text-violet-400 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-violet-400 shrink-0" />
                    }
                  </div>

                  {/* Body — collapsible */}
                  {returnOpen && returnForm && (
                    <div className="px-3 pb-3 space-y-3 border-t border-violet-100">
                      <div className="h-1" />
                      {/* No. Penerbangan + ETD + ETA */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">No. Penerbangan</Label>
                          <Input placeholder="QR819" value={returnForm.returnFlightNumber ?? ""}
                            onChange={(e) => setRt({ returnFlightNumber: e.target.value.toUpperCase() || null })}
                            className="font-mono uppercase" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ETD</Label>
                          <Input placeholder="08:00" value={returnForm.returnEtd ?? ""}
                            onChange={(e) => setRt({ returnEtd: e.target.value || null })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ETA</Label>
                          <Input placeholder="18:30" value={returnForm.returnEta ?? ""}
                            onChange={(e) => setRt({ returnEta: e.target.value || null })} />
                        </div>
                      </div>

                      {/* Dari / Ke IATA + Kota */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Dari (IATA)</Label>
                          <Input placeholder="JED" maxLength={3} value={returnForm.returnFromCode ?? ""}
                            onChange={(e) => setRt({ returnFromCode: e.target.value.toUpperCase() || null })}
                            className="font-mono uppercase" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Ke (IATA)</Label>
                          <Input placeholder="CGK" maxLength={3} value={returnForm.returnToCode ?? ""}
                            onChange={(e) => setRt({ returnToCode: e.target.value.toUpperCase() || null })}
                            className="font-mono uppercase" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Kota Asal Pulang</Label>
                          <Input placeholder="Jeddah" value={returnForm.returnFromCity ?? ""}
                            onChange={(e) => setRt({ returnFromCity: e.target.value || null })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Kota Tujuan Pulang</Label>
                          <Input placeholder="Jakarta" value={returnForm.returnToCity ?? ""}
                            onChange={(e) => setRt({ returnToCity: e.target.value || null })} />
                        </div>
                      </div>

                      {/* Transit (opsional) */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Transit (IATA)</Label>
                          <Input placeholder="DOH" maxLength={3} value={returnForm.returnTransitCode ?? ""}
                            onChange={(e) => setRt({ returnTransitCode: e.target.value.toUpperCase() || null })}
                            className="font-mono uppercase" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Kota Transit</Label>
                          <Input placeholder="Doha" value={returnForm.returnTransitCity ?? ""}
                            onChange={(e) => setRt({ returnTransitCity: e.target.value || null })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Durasi Transit</Label>
                          <Input placeholder="2j 30m" value={returnForm.returnTransitDuration ?? ""}
                            onChange={(e) => setRt({ returnTransitDuration: e.target.value || null })} />
                        </div>
                      </div>

                      {/* Tanggal kepulangan */}
                      <div className="space-y-1">
                        <Label className="text-xs">Tanggal Kepulangan</Label>
                        <Input type="date" value={returnForm.returnDate ?? ""}
                          onChange={(e) => setRt({ returnDate: e.target.value || null })} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ══ RETURN LEG — Multi-Leg (read-only summary, collapsible) ══ */}
          {isML && mlData && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-violet-50/60 transition-colors"
                onClick={() => setReturnOpen((v) => !v)}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                <span className="text-[12px] font-bold text-violet-700 flex-1">Detail Rute Multi-Leg</span>
                <span className="text-[10px] text-violet-400 italic">scan ulang untuk ubah rute</span>
                {returnOpen
                  ? <ChevronUp className="w-4 h-4 text-violet-400 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-violet-400 shrink-0" />
                }
              </div>
              {returnOpen && (
                <div className="px-3 pb-3 space-y-1 border-t border-violet-100">
                  <div className="h-1" />
                  <p className="text-[10px] font-bold text-violet-600 mb-1">↗ Berangkat</p>
                  {mlData.outboundLegs.map((leg, i) => (
                    <p key={i} className="text-[11px] text-violet-700 pl-2 font-mono">
                      {leg.fromCode}→{leg.toCode}{leg.flightNumber ? ` (${leg.flightNumber})` : ""}{leg.etd ? ` jam ${leg.etd}` : ""}{leg.date ? ` · ${fmtDate(leg.date)}` : ""}
                    </p>
                  ))}
                  {(mlData.returnLegs?.length ?? 0) > 0 && (
                    <>
                      <p className="text-[10px] font-bold text-violet-600 pt-1">↩ Pulang</p>
                      {mlData.returnLegs!.map((leg, i) => (
                        <p key={i} className="text-[11px] text-violet-700 pl-2 font-mono">
                          {leg.fromCode}→{leg.toCode}{leg.flightNumber ? ` (${leg.flightNumber})` : ""}{leg.etd ? ` jam ${leg.etd}` : ""}{leg.date ? ` · ${fmtDate(leg.date)}` : ""}
                        </p>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Common fields ── */}
          <div className="h-px bg-border/50" />

          <div className="space-y-1">
            <Label className="text-xs">Terminal Keberangkatan (opsional)</Label>
            <Input placeholder="T3 atau Terminal 2" value={form.terminal ?? ""}
              onChange={(e) => set({ terminal: e.target.value || null })} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Detail Bagasi (opsional)</Label>
            <Input placeholder="Contoh: 23kg + 7kg kabin" value={form.baggageInfo ?? ""}
              onChange={(e) => set({ baggageInfo: e.target.value || null })} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Berlaku Hingga</Label>
            <Input type="date" value={form.validUntil ?? ""}
              onChange={(e) => set({ validUntil: e.target.value || null })} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {isOwner && (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Harga Modal (base)</Label>
                <Input type="number" min="0" placeholder="0" value={form.basePrice || ""}
                  onChange={(e) => set({ basePrice: Number(e.target.value) })} />
              </div>
            )}
            <div className={isOwner ? "space-y-1" : "col-span-3 space-y-1"}>
              <Label className="text-xs">Mata Uang</Label>
              <Select value={form.currency} onValueChange={(v) => set({ currency: v as TicketCurrency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CURRENCY_LABEL) as TicketCurrency[]).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isML && (
            <div className="space-y-1">
              <Label className="text-xs">Catatan (opsional)</Label>
              <Textarea placeholder="Contoh: Termasuk bagasi 30kg, tersedia kelas bisnis" rows={2}
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)} />
            </div>
          )}

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border">
            <Switch checked={form.isPublished} onCheckedChange={(v) => set({ isPublished: v })} />
            <div>
              <p className="text-sm font-medium">Tampilkan di Daftar Harga</p>
              <p className="text-xs text-slate-400">Matikan untuk menyembunyikan sementara</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Batal</Button>
          <Button
            className="bg-sky-600 hover:bg-sky-700 text-white"
            disabled={loading || !form.airline || !form.fromCode || !form.toCode}
            onClick={() => void handleSave()}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Share Panel ──────────────────────────────────────────────────────────────
function SharePanel({ publicUrl }: { publicUrl: string }) {
  const promoUrl = `${window.location.origin}/promo`;
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedPromo, setCopiedPromo] = useState(false);

  function copyUrl(url: string, which: "main" | "promo") {
    void navigator.clipboard.writeText(url).then(() => {
      if (which === "main") { setCopiedMain(true); setTimeout(() => setCopiedMain(false), 2000); }
      else { setCopiedPromo(true); setTimeout(() => setCopiedPromo(false), 2000); }
    });
  }

  function handleNativeShare() {
    if (navigator.share) {
      void navigator.share({
        title: "Daftar Harga Tiket Umroh & Haji — Temantiket",
        text: "Cek harga tiket umroh dan haji terbaru! Maskapai pilihan, langsung pesan via WhatsApp 🕋✈️",
        url: promoUrl,
      });
    } else {
      copyUrl(promoUrl, "promo");
    }
  }

  function handleWaShare() {
    const msg = encodeURIComponent(`✈️ *Daftar Harga Tiket Umroh & Haji*\nCek harga terbaru di sini:\n${promoUrl}\n\n_Harga kompetitif, pesan langsung via WhatsApp — Temantiket_`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sky-200 bg-sky-600/5">
        <div className="p-1.5 rounded-lg bg-sky-600 text-white">
          <Share2 className="w-3.5 h-3.5" />
        </div>
        <div>
          <p className="text-[12px] font-bold text-sky-800">Bagikan Daftar Harga ke Klien</p>
          <p className="text-[10px] text-sky-600">Halaman publik — tanpa login, tanpa harga modal</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* URL rows */}
        <div className="space-y-2">
          {/* Promo URL — short, recommended */}
          <div className="flex items-center gap-2 bg-white rounded-xl border border-sky-200 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5">
                SINGKAT
              </span>
            </div>
            <code className="flex-1 text-[11px] font-mono text-sky-700 truncate min-w-0">{promoUrl}</code>
            <button
              onClick={() => copyUrl(promoUrl, "promo")}
              className={cn(
                "flex items-center gap-1 text-[11px] font-semibold shrink-0 rounded-lg px-2.5 py-1.5 transition-colors",
                copiedPromo
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-sky-100 text-sky-600 hover:bg-sky-200",
              )}
            >
              {copiedPromo ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedPromo ? "Tersalin!" : "Salin"}
            </button>
          </div>

          {/* Full URL */}
          <div className="flex items-center gap-2 bg-white/60 rounded-xl border border-slate-200 px-3 py-2">
            <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <code className="flex-1 text-[11px] font-mono text-slate-500 truncate min-w-0">{publicUrl}</code>
            <button
              onClick={() => copyUrl(publicUrl, "main")}
              className={cn(
                "flex items-center gap-1 text-[11px] font-semibold shrink-0 rounded-lg px-2.5 py-1.5 transition-colors",
                copiedMain
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {copiedMain ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedMain ? "Tersalin!" : "Salin"}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleNativeShare}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold px-3 py-2 rounded-xl transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            Bagikan
          </button>
          <button
            onClick={handleWaShare}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold px-3 py-2 rounded-xl transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Kirim via WhatsApp
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-semibold px-3 py-2 rounded-xl transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Pratinjau
          </a>
        </div>

        <p className="text-[10px] text-sky-600/70 pt-0.5">
          Hanya tiket yang dipublikasikan yang tampil. Harga modal tersembunyi dari halaman publik.
        </p>
      </div>
    </div>
  );
}

// ── Search & Filter Bar ──────────────────────────────────────────────────────
type TripTypeFilter = "all" | "direct" | "transit" | "pp";
type DateFilter = "all" | "today" | "week" | "month";
type PublishFilter = "all" | "published" | "draft";
type SortBy = "default" | "date" | "price" | "airline";
type SortDir = "asc" | "desc";

function SearchFilterBar({
  searchQuery, onSearchChange,
  filterTripType, onTripTypeChange,
  filterDateRange, onDateRangeChange,
  filterPublish, onPublishChange,
  isOwner, totalCount, filteredCount, onReset,
  sortBy, onSortByChange, sortDir, onSortDirChange,
}: {
  searchQuery: string; onSearchChange: (v: string) => void;
  filterTripType: TripTypeFilter; onTripTypeChange: (v: TripTypeFilter) => void;
  filterDateRange: DateFilter; onDateRangeChange: (v: DateFilter) => void;
  filterPublish: PublishFilter; onPublishChange: (v: PublishFilter) => void;
  isOwner: boolean; totalCount: number; filteredCount: number; onReset: () => void;
  sortBy: SortBy; onSortByChange: (v: SortBy) => void;
  sortDir: SortDir; onSortDirChange: (v: SortDir) => void;
}) {
  const isFiltered = searchQuery.trim() !== "" || filterTripType !== "all" || filterDateRange !== "all" || filterPublish !== "all" || sortBy !== "default";

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Cari maskapai, kode, atau rute…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 transition-colors"
          >
            <X className="h-3 w-3 text-slate-500" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0" />

        {/* Trip type chips */}
        {(["all", "direct", "transit", "pp"] as TripTypeFilter[]).map((t) => {
          const labels: Record<TripTypeFilter, string> = { all: "Semua", direct: "Direct", transit: "Transit", pp: "Pulang-Pergi" };
          const active = filterTripType === t;
          return (
            <button
              key={t}
              onClick={() => onTripTypeChange(t)}
              className={cn(
                "inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all",
                active
                  ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300",
              )}
            >
              {labels[t]}
            </button>
          );
        })}

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* Date filter chips — click to toggle */}
        {(["today", "week", "month"] as DateFilter[]).map((d) => {
          const labels: Record<string, string> = { today: "Hari Ini", week: "Minggu Ini", month: "Bulan Ini" };
          const active = filterDateRange === d;
          return (
            <button
              key={d}
              onClick={() => onDateRangeChange(active ? "all" : d)}
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all",
                active
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300",
              )}
            >
              <Calendar className="h-3 w-3" />
              {labels[d]}
            </button>
          );
        })}

        {/* Publish filter — owner only */}
        {isOwner && (
          <>
            <div className="h-4 w-px bg-slate-200 mx-0.5" />
            {(["published", "draft"] as PublishFilter[]).map((p) => {
              const labels: Record<string, string> = { published: "Published", draft: "Draft" };
              const active = filterPublish === p;
              return (
                <button
                  key={p}
                  onClick={() => onPublishChange(active ? "all" : p)}
                  className={cn(
                    "inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all",
                    active
                      ? p === "published"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-slate-500 text-white border-slate-500 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300",
                  )}
                >
                  {labels[p]}
                </button>
              );
            })}
          </>
        )}

        {/* Reset */}
        {isFiltered && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors ml-auto"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Sort chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Urutkan:</span>
        {(["date", "price", "airline"] as const).map((s) => {
          const labels = { date: "Tanggal", price: "Harga", airline: "Maskapai" } as const;
          const active = sortBy === s;
          return (
            <button
              key={s}
              onClick={() => {
                if (active) {
                  onSortDirChange(sortDir === "asc" ? "desc" : "asc");
                } else {
                  onSortByChange(s);
                  onSortDirChange("asc");
                }
              }}
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all",
                active
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300",
              )}
            >
              {labels[s]}
              {active && <span className="opacity-80 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>}
            </button>
          );
        })}
        {sortBy !== "default" && (
          <button
            onClick={() => { onSortByChange("default"); onSortDirChange("asc"); }}
            className="h-6 w-6 flex items-center justify-center rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Hapus urutan"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Result count */}
      {isFiltered && (
        <p className="text-[11px] text-slate-500">
          Menampilkan{" "}
          <span className="font-bold text-slate-700">{filteredCount}</span> dari{" "}
          <span className="font-bold">{totalCount}</span> tiket
          {filteredCount === 0 && (
            <span className="text-slate-400"> — coba ubah filter atau kata kunci</span>
          )}
        </p>
      )}
    </div>
  );
}

// ── OCR Segment Row helpers (used by pending OCR result cards) ────────────────
function _layoverMins(etaStr: string | null | undefined, etdStr: string | null | undefined): number | null {
  if (!etaStr || !etdStr) return null;
  const [h1, m1] = etaStr.split(":").map(Number);
  const [h2, m2] = etdStr.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return null;
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  return diff;
}
function _fmtLayover(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

function OcrSegmentRow({ leg, segNum, totalInDir, nextEtd }: {
  leg: LegInfo; segNum: number; totalInDir: number; nextEtd?: string | null;
}) {
  const layover = nextEtd !== undefined ? _layoverMins(leg.eta, nextEtd) : null;
  const isLongLayover = layover !== null && layover > 8 * 60;
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/70 border border-slate-100">
        <span className="text-[9px] font-bold text-slate-400 w-4 shrink-0">S{segNum}</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[11px] font-bold text-slate-900 font-mono shrink-0">{leg.fromCode}</span>
          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="text-[11px] font-bold text-slate-900 font-mono shrink-0">{leg.toCode}</span>
          {leg.flightNumber && (
            <span className="text-[9px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5 font-mono shrink-0">
              {leg.flightNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {leg.etd && <span className="text-[9.5px] text-slate-600 font-mono font-bold">{leg.etd}</span>}
          {leg.etd && leg.eta && <span className="text-[9px] text-slate-400">→</span>}
          {leg.eta && <span className="text-[9.5px] text-slate-500 font-mono">{leg.eta}</span>}
        </div>
        {leg.date && (
          <span className="text-[9px] text-slate-400 shrink-0 hidden sm:block">{fmtDate(leg.date)}</span>
        )}
      </div>
      {nextEtd !== undefined && segNum < totalInDir && (
        <div className={cn(
          "ml-6 my-0.5 flex items-center gap-1.5 px-2",
          isLongLayover ? "text-amber-600" : "text-slate-400",
        )}>
          <div className="w-px h-3.5 bg-current opacity-40 shrink-0" />
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span className="text-[9px] font-medium">
            Transit {leg.toCode}{layover !== null ? ` · ${_fmtLayover(layover)}` : ""}
            {isLongLayover && " ⚠ layover panjang"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Desktop Ticket Card (redesigned) ─────────────────────────────────────────
function DesktopTicketCard({
  item, markup, rates, onView, waNumber, isAdmin, onEdit, onDelete, showBasePrice,
}: {
  item: TicketPrice;
  markup: number;
  rates: Record<string, number>;
  isAdmin: boolean;
  onEdit?: (item: TicketPrice) => void;
  onDelete?: (id: string) => void;
  onTogglePublish?: (id: string, val: boolean) => void;
  onView?: (item: TicketPrice) => void;
  waNumber: string;
  showBasePrice?: boolean;
}) {
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);
  const { ml: mlData } = decodeMultiLeg(item.notes);
  const isML = !!mlData;
  const { leg: returnLeg } = isML ? { leg: null } : decodeReturnLeg(item.notes);
  const isRT = !!returnLeg;
  const isDirect = !item.transitCode;

  const tripTypeLabel = isML ? "Multi-Leg PP" : isRT ? "Pulang Pergi" : isDirect ? "Langsung" : "Transit";

  const returnDate = isML
    ? (mlData?.returnLegs?.[0]?.date ?? null)
    : isRT ? (returnLeg?.returnDate ?? null) : null;
  const returnEtd = isML
    ? (mlData?.returnLegs?.[0]?.etd ?? null)
    : isRT ? (returnLeg?.returnEtd ?? null) : null;
  const returnToCode = isML
    ? (mlData?.returnLegs?.[mlData.returnLegs.length - 1]?.toCode ?? item.toCode)
    : isRT ? (returnLeg?.returnToCode ?? item.toCode) : null;

  function fmtShortDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function fmtRelative(iso: string): string {
    if (!iso) return "";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins} menit lalu`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h} jam lalu`;
    return `${Math.floor(h / 24)} hari lalu`;
  }

  const updatedAt = (item as unknown as Record<string, string>).updatedAt ?? (item as unknown as Record<string, string>).createdAt ?? "";
  const createdAt = (item as unknown as Record<string, string>).createdAt ?? "";
  const isNew = createdAt && (Date.now() - new Date(createdAt).getTime()) < 48 * 3600 * 1000;

  const baseInIDR = item.currency === "IDR" ? item.basePrice : item.basePrice * (rates[item.currency] || 1);
  const markupAmount = Math.max(0, sell - Math.round(baseInIDR));

  const waText = encodeURIComponent(
    `Halo! Saya tertarik dengan tiket ${item.airline} rute ${item.fromCode}–${item.toCode}. Harga: ${fmtIDR(sell)}`
  );
  const waLink = waNumber ? `${whatsappUrl(waNumber)}?text=${waText}` : `https://wa.me/?text=${waText}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col">
      {/* ── Header: logo + name + badge ─── */}
      <div className="p-4 pb-0 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <AirlineLogo code={item.airlineCode} airline={item.airline} size={36} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-slate-900 leading-tight truncate">{item.airline}</p>
              <p className="text-[10.5px] text-slate-400 font-mono mt-0.5">{item.airlineCode} · {tripTypeLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {isNew && (
              <span className="flex items-center gap-1 text-[9.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                TERBARU
              </span>
            )}
          </div>
        </div>

        {/* ── Route row (clickable) ─── */}
        <button
          className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 hover:bg-slate-100 active:scale-[0.99] transition-all text-left"
          onClick={() => onView?.(item)}
        >
          <Plane className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[15px] font-black text-slate-900 font-mono">{item.fromCode}</span>
          {isRT || isML
            ? <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            : <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          }
          <span className="text-[15px] font-black text-slate-900 font-mono">{item.toCode}</span>
          {item.transitCode && (
            <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">
              via {item.transitCode}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0 -rotate-90" />
        </button>

        {/* ── Date/time grid ─── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Berangkat</p>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-sky-500 shrink-0" />
              <span className="text-[11.5px] font-semibold text-slate-800">{fmtShortDate(item.departDate)}</span>
            </div>
            {item.etd && (
              <p className="text-[10.5px] text-slate-500 mt-0.5 pl-4 font-mono">
                {item.etd} <span className="text-slate-400">{item.fromCode}</span>
              </p>
            )}
          </div>
          {(isRT || isML) ? (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pulang</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-violet-500 shrink-0" />
                <span className="text-[11.5px] font-semibold text-slate-800">{fmtShortDate(returnDate)}</span>
              </div>
              {returnEtd && (
                <p className="text-[10.5px] text-slate-500 mt-0.5 pl-4 font-mono">
                  {returnEtd} <span className="text-slate-400">{returnToCode ?? item.toCode}</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tipe</p>
              <span className="inline-flex items-center text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full mt-0.5">
                {tripTypeLabel}
              </span>
            </div>
          )}
        </div>

        {/* ── Price row ─── */}
        <div className="flex items-end justify-between gap-2 pb-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Harga</p>
            <p className="text-[22px] font-black font-mono text-blue-700 leading-none">{fmtIDR(sell)}</p>
            {showBasePrice && (
              <p className="text-[9.5px] text-slate-400 mt-1 leading-snug">
                Modal: {item.currency} {item.basePrice.toLocaleString("id-ID")}
                {markupAmount > 0 && ` · Markup: ${fmtIDR(markupAmount)}`}
              </p>
            )}
          </div>
          {showBasePrice && markupAmount > 0 && (
            <div className="shrink-0 bg-blue-50 border border-blue-100 rounded-xl px-2.5 py-1.5 text-right">
              <p className="text-[8px] font-bold text-blue-400 uppercase tracking-wider">Markup / Pax</p>
              <p className="text-[13px] font-black font-mono text-blue-700 leading-none mt-0.5">+{fmtIDR(markupAmount)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ─── */}
      <div className="h-px bg-slate-100" />

      {/* ── Actions ─── */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Pesan via WA
        </a>
        <button
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
          onClick={() => onView?.(item)}
        >
          <Plus className="w-3.5 h-3.5" />
          Order
        </button>
        {isAdmin && (
          <>
            <button
              className="ml-auto h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 border border-transparent hover:border-sky-100 transition-colors"
              onClick={() => onView?.(item)}
              title="Lihat detail"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100 transition-colors"
              onClick={() => onEdit?.(item)}
              title="Edit"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
              onClick={() => onDelete?.(item.id)}
              title="Hapus"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ── Footer timestamp ─── */}
      {updatedAt && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[9px] text-slate-400 text-right">Extracted {fmtRelative(updatedAt)}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TicketPrices() {
  const { user } = useAuthStore();
  const { rates } = useRatesStore();
  const isAdmin = user?.role === "owner" || user?.role === "staff";
  const isOwner = user?.role === "owner";

  const { items: prices, loading, loaded: ticketPricesLoaded, refresh: refreshTicketPrices, setItems: setTicketPrices } = useTicketPricesStore();
  const [markup, setMarkupState] = useState(loadMarkup);
  const [markupInput, setMarkupInput] = useState(String(loadMarkup()));
  const [markupOpen, setMarkupOpen] = useState(false);

  // AI Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [parsedTickets, setParsedTickets] = useState<ParsedTicketPrice[]>([]);
  const [pendingForms, setPendingForms] = useState<FormState[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  const [scanDebugInfos, setScanDebugInfos] = useState<(ScanDebugInfo | undefined)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const screenshotSectionRef = useRef<HTMLDivElement>(null);
  const pasteSectionRef = useRef<HTMLDivElement>(null);
  const ticketListRef = useRef<HTMLDivElement>(null);

  // ── Draft persistence (survive page refresh) ────────────────────────────
  const DRAFT_KEY = "ticket_prices.pending_draft.v1";
  function saveDraft(forms: FormState[]) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(forms)); } catch { /* ignore */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }
  function loadDraft(): FormState[] | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as FormState[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch { return null; }
  }

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.length > 0) {
      setPendingForms(draft);
      toast.info(`Draft dipulihkan — ${draft.length} tiket belum disimpan.`, {
        description: "Periksa ulang dan klik Simpan Semua.",
        duration: 5000,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BC / Kode Sistem text paste state
  const [pasteText, setPasteText] = useState("");
  const [scanningText, setScanningText] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Manual add dialog
  const [addOpen, setAddOpen] = useState(false);

  // View detail dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<TicketPrice | null>(null);

  function openView(item: TicketPrice) {
    setViewItem(item);
    setViewOpen(true);
  }

  const waNumber = loadIghAdminSettings().adminWhatsapp ?? "";

  // ── Search & Filter state ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTripType, setFilterTripType] = useState<TripTypeFilter>("all");
  const [filterDateRange, setFilterDateRange] = useState<DateFilter>("all");
  const [filterPublish, setFilterPublish] = useState<PublishFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function resetFilters() {
    setSearchQuery("");
    setFilterTripType("all");
    setFilterDateRange("all");
    setFilterPublish("all");
    setSortBy("default");
    setSortDir("asc");
  }

  // Public link for sharing
  const publicUrl = `${window.location.origin}/harga-tiket`;

  useEffect(() => {
    if (!ticketPricesLoaded) void refreshTicketPrices();
  }, [ticketPricesLoaded, refreshTicketPrices]);

  // ── Markup ──────────────────────────────────────────────────────────────
  function applyMarkup() {
    const val = Math.max(0, Number(markupInput) || 0);
    saveMarkup(val);
    setMarkupState(val);
    setMarkupOpen(false);
    toast.success(`Mark-up diset ke ${fmtIDR(val)}/pax`);
  }

  // ── Share public link ───────────────────────────────────────────────────
  function handleSharePublic() {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(publicUrl).then(() => {
        toast.success("Link publik tersalin! Bagikan ke klien Anda.");
      });
    } else {
      window.open(publicUrl, "_blank");
    }
  }

  // ── PDF first-page → JPEG data URL (using pdfjs-dist) ───────────────────
  async function pdfFirstPageToDataUrl(file: File): Promise<string> {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx as unknown as Parameters<typeof page.render>[0]["canvasContext"], viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.90);
  }

  // ── Screenshot / file scan (JPG, PNG, PDF) ───────────────────────────────
  async function handleFileSelect(file: File) {
    const isImage = file.type.startsWith("image/");
    const isPdf   = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      toast.error("Format tidak didukung. Gunakan JPG, PNG, atau PDF.");
      return;
    }
    setScanning(true);
    setScanError(null);
    setParsedTickets([]);
    setPendingForms([]);
    setScanDebugInfos([]);

    let imageSource: File | string = file;
    if (isPdf) {
      try {
        toast.info("Mengkonversi halaman pertama PDF…", { duration: 2000 });
        imageSource = await pdfFirstPageToDataUrl(file);
      } catch {
        setScanning(false);
        setScanError("Gagal membaca PDF. Pastikan file tidak terenkripsi/terproteksi.");
        return;
      }
    }

    const result = await scanTicketPriceScreenshot(imageSource);
    setScanning(false);

    if (result.error) {
      setScanError(result.error);
      return;
    }
    if (result.tickets.length === 0) {
      setScanError("AI tidak menemukan data tiket di screenshot ini. Coba screenshot yang lebih jelas.");
      return;
    }
    const forms = result.tickets.map(formFromParsed);
    setParsedTickets(result.tickets);
    setPendingForms(forms);
    setScanDebugInfos(result.tickets.map(() => result.debug));
    saveDraft(forms);
    const rtCount = result.grouped ?? 0;
    toast.success(
      `AI menemukan ${result.tickets.length} entri tiket!`,
      {
        description: rtCount > 0
          ? `${rtCount} paket pulang-pergi otomatis digabung ✈️↩️ Markup diterapkan sekali per paket.`
          : "Periksa detail sebelum menyimpan.",
      }
    );
  }

  // ── BC / Kode Sistem text paste (local parser + AI fallback) ────────────────
  async function handleParseText() {
    if (!pasteText.trim()) {
      toast.error("Tempel dulu teks BC atau kode sistem di textarea");
      return;
    }
    setScanError(null);
    setParsedTickets([]);
    setPendingForms([]);
    setScanDebugInfos([]);
    setScanningText(true);

    const result = await scanTicketPriceTextWithAI(pasteText);

    setScanningText(false);

    if (result.error || result.tickets.length === 0) {
      setScanError(result.error ?? "Tidak ada data penerbangan ditemukan. Coba paste teks BC atau kode sistem yang lebih lengkap.");
      return;
    }

    const forms = result.tickets.map(formFromParsed);
    setParsedTickets(result.tickets);
    setPendingForms(forms);
    setScanDebugInfos(result.tickets.map(() => result.debug));
    saveDraft(forms);
    setPasteText("");
    const rtCount = result.grouped ?? 0;
    const usedAI = result.usedAI ?? false;
    toast.success(
      `${usedAI ? "AI" : "Parser"} menemukan ${result.tickets.length} entri tiket!`,
      {
        description: rtCount > 0
          ? `${rtCount} paket pulang-pergi otomatis digabung. Markup diterapkan sekali per paket.`
          : usedAI
            ? "Diproses via AI. Periksa dan edit detail sebelum menyimpan."
            : "Periksa detail sebelum menyimpan.",
      }
    );
  }

  function updatePending(idx: number, patch: Partial<FormState>) {
    setPendingForms((prev) => {
      const updated = prev.map((f, i) => i === idx ? { ...f, ...patch } : f);
      saveDraft(updated);
      return updated;
    });
  }

  function updatePendingRT(idx: number, patch: Partial<ReturnLegData>) {
    setPendingForms((prev) => {
      const updated = prev.map((f, i) => {
        if (i !== idx) return f;
        const { leg, userNotes: un } = decodeReturnLeg(f.notes);
        if (!leg) return f;
        const newLeg = { ...leg, ...patch };
        const rtStr = `__RT__:${JSON.stringify(newLeg)}`;
        const newNotes = un ? `${rtStr}\n${un}` : rtStr;
        return { ...f, notes: newNotes };
      });
      saveDraft(updated);
      return updated;
    });
  }

  async function savePending() {
    if (saving) return;
    const forms = pendingForms;
    if (forms.length === 0) return;

    setSaving(true);
    setSaveProgress({ current: 0, total: forms.length });

    const savedItems: TicketPrice[] = [];
    const failedForms: FormState[] = [];
    const failedParsed: ParsedTicketPrice[] = [];

    for (let i = 0; i < forms.length; i++) {
      setSaveProgress({ current: i + 1, total: forms.length });
      const form = forms[i];
      let success = false;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((r) => setTimeout(r, 1200 * attempt));
        }
        try {
          const item = await createTicketPrice({ ...form, sortOrder: 0 });
          savedItems.push(item);
          success = true;
          break;
        } catch (e) {
          lastError = e;
        }
      }

      if (!success) {
        failedForms.push(form);
        failedParsed.push(parsedTickets[i] ?? ({} as ParsedTicketPrice));
        toast.error(`Gagal simpan ${form.airline || `Opsi ${i + 1}`}: ${String(lastError)}`);
      }
    }

    if (savedItems.length > 0) {
      setTicketPrices((prev) => [...savedItems, ...prev]);
      toast.success(`${savedItems.length} harga tiket berhasil disimpan!`);
    }

    if (failedForms.length > 0) {
      setPendingForms(failedForms);
      setParsedTickets(failedParsed);
      saveDraft(failedForms);
      toast.error(`${failedForms.length} tiket gagal disimpan — klik "Coba Simpan Lagi".`, {
        duration: 8000,
      });
    } else {
      setPendingForms([]);
      setParsedTickets([]);
      clearDraft();
    }

    setSaving(false);
    setSaveProgress(null);
  }

  function removePending(idx: number) {
    setParsedTickets((prev) => prev.filter((_, i) => i !== idx));
    setPendingForms((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      if (updated.length === 0) clearDraft(); else saveDraft(updated);
      return updated;
    });
  }

  // ── CRUD ───────────────────────────────────────────────────────────────
  async function handleSaveEdit(form: FormState) {
    setSavingEdit(true);
    try {
      if (editId) {
        const updated = await updateTicketPrice(editId, { ...form, sortOrder: 0 });
        setTicketPrices((prev) => prev.map((p) => p.id === editId ? updated : p));
        toast.success("Harga tiket diperbarui!");
      } else {
        const item = await createTicketPrice({ ...form, sortOrder: 0 });
        setTicketPrices((prev) => [item, ...prev]);
        toast.success("Harga tiket ditambahkan!");
      }
      setEditOpen(false);
      setAddOpen(false);
    } catch (e) {
      toast.error("Gagal simpan: " + String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  function openEdit(item: TicketPrice) {
    setEditId(item.id);
    setEditForm({
      airline: item.airline, airlineCode: item.airlineCode,
      fromCode: item.fromCode, fromCity: item.fromCity,
      toCode: item.toCode, toCity: item.toCity,
      departDate: item.departDate, basePrice: item.basePrice,
      currency: item.currency, validUntil: item.validUntil,
      notes: item.notes, isPublished: item.isPublished,
      flightNumber: item.flightNumber, etd: item.etd, eta: item.eta,
      terminal: item.terminal, transitCode: item.transitCode,
      transitCity: item.transitCity, transitDuration: item.transitDuration,
      baggageInfo: item.baggageInfo,
    });
    setEditOpen(true);
  }

  function openAdd() {
    setEditId(null);
    setEditForm(EMPTY_FORM);
    setAddOpen(true);
  }

  async function handleDelete(id: string) {
    try {
      await deleteTicketPrice(id);
      setTicketPrices((prev) => prev.filter((p) => p.id !== id));
      toast.success("Tiket dihapus.");
    } catch (e) { toast.error("Gagal hapus: " + String(e)); }
  }

  const [injecting, setInjecting] = useState(false);
  async function handleInjectSample() {
    setInjecting(true);
    try {
      // ── Sample 1: One-way + transit ──────────────────────────────────────
      const oneway = await createTicketPrice({
        airline: "Qatar Airways", airlineCode: "QR",
        fromCode: "CGK", fromCity: "Jakarta",
        toCode: "JED", toCity: "Jeddah",
        flightNumber: "QR956/QR1167",
        etd: "22:10", eta: "06:40",
        terminal: "T3",
        transitCode: "DOH", transitCity: "Doha", transitDuration: "2j 10m",
        departDate: "2026-08-05",
        basePrice: 8_500_000, currency: "IDR",
        validUntil: null, notes: null,
        isPublished: true, sortOrder: 0,
      });

      // ── Sample 2: Return trip (PP) ───────────────────────────────────────
      const rtNotes = "__RT__:" + JSON.stringify({
        returnFromCode: "MED", returnToCode: "SUB",
        returnFromCity: "Madinah", returnToCity: "Surabaya",
        returnDate: "2026-07-24",
        returnFlightNumber: "EK8502/EK360",
        returnEtd: "09:00", returnEta: "23:55",
        returnTransitCode: "DXB", returnTransitCity: "Dubai",
        returnTransitDuration: "2j 15m",
      });
      const returntrip = await createTicketPrice({
        airline: "Emirates", airlineCode: "EK",
        fromCode: "SUB", fromCity: "Surabaya",
        toCode: "MED", toCity: "Madinah",
        flightNumber: "EK359/EK8501",
        etd: "08:30", eta: "17:20",
        terminal: null,
        transitCode: "DXB", transitCity: "Dubai", transitDuration: "1j 50m",
        departDate: "2026-07-10",
        basePrice: 14_200_000, currency: "IDR",
        validUntil: null, notes: rtNotes,
        isPublished: true, sortOrder: 0,
      });

      setTicketPrices((prev) => [returntrip, oneway, ...prev]);
      toast.success("2 contoh tiket berhasil ditambahkan!");
    } catch (e) {
      toast.error("Gagal inject: " + String(e));
    } finally {
      setInjecting(false);
    }
  }

  async function handleTogglePublish(id: string, val: boolean) {
    try {
      const updated = await updateTicketPrice(id, { isPublished: val });
      setTicketPrices((prev) => prev.map((p) => p.id === id ? updated : p));
    } catch (e) { toast.error("Gagal update: " + String(e)); }
  }

  const visiblePrices = isAdmin ? prices : prices.filter((p) => p.isPublished);

  const filteredPrices = useMemo(() => {
    let list = visiblePrices;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) =>
        item.airline.toLowerCase().includes(q) ||
        item.airlineCode.toLowerCase().includes(q) ||
        (item.flightNumber ?? "").toLowerCase().includes(q) ||
        item.fromCode.toLowerCase().includes(q) ||
        item.toCode.toLowerCase().includes(q) ||
        (item.fromCity ?? "").toLowerCase().includes(q) ||
        (item.toCity ?? "").toLowerCase().includes(q) ||
        (item.transitCode ?? "").toLowerCase().includes(q) ||
        (item.transitCity ?? "").toLowerCase().includes(q)
      );
    }

    if (filterTripType !== "all") {
      list = list.filter((item) => {
        const { ml } = decodeMultiLeg(item.notes);
        const isML = !!ml;
        const { leg: rtLeg } = isML ? { leg: null } : decodeReturnLeg(item.notes);
        const isRT = !!rtLeg;
        const isDirect = !item.transitCode;
        if (filterTripType === "pp") return isML || isRT;
        if (filterTripType === "direct") return !isML && !isRT && isDirect;
        if (filterTripType === "transit") return !isML && !isRT && !isDirect;
        return true;
      });
    }

    if (filterDateRange !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      list = list.filter((item) => {
        if (!item.departDate) return false;
        const d = new Date(item.departDate);
        if (filterDateRange === "today") return d.toDateString() === today.toDateString();
        if (filterDateRange === "week") {
          const weekEnd = new Date(today);
          weekEnd.setDate(today.getDate() + 7);
          return d >= today && d <= weekEnd;
        }
        if (filterDateRange === "month") {
          return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }
        return true;
      });
    }

    if (isOwner && filterPublish !== "all") {
      list = list.filter((item) =>
        filterPublish === "published" ? item.isPublished : !item.isPublished
      );
    }

    if (sortBy !== "default") {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortBy === "date") {
          const da = a.departDate ? new Date(a.departDate).getTime() : Infinity;
          const db = b.departDate ? new Date(b.departDate).getTime() : Infinity;
          cmp = da - db;
        } else if (sortBy === "price") {
          cmp = sellingPrice(a.basePrice, a.currency, rates, markup) -
                sellingPrice(b.basePrice, b.currency, rates, markup);
        } else if (sortBy === "airline") {
          cmp = a.airline.localeCompare(b.airline, "id");
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [visiblePrices, searchQuery, filterTripType, filterDateRange, filterPublish, isOwner, sortBy, sortDir, rates, markup]);

  const publishedCount = prices.filter(p => p.isPublished).length;
  const hiddenCount    = prices.filter(p => !p.isPublished).length;

  // ── Desktop-specific state ─────────────────────────────────────────────────
  const [deskTab, setDeskTab] = useState<"semua"|"domestik"|"internasional"|"promo"|"favorit">("semua");
  const [deskSheetUrl, setDeskSheetUrl] = useState("");
  const [deskSyncBanner, setDeskSyncBanner] = useState(false);
  const [filterAirlineCode, setFilterAirlineCode] = useState("all");
  const [expandedSource, setExpandedSource] = useState<"share"|"upload"|"bc"|"manual"|null>(null);

  const IDN_CODES = useMemo(() => new Set([
    "CGK","HLP","SUB","DPS","MES","BDJ","UPG","BPN","MDC","PLW","SRG","JOG","SOC",
    "KOE","AMQ","BTH","DJJ","GTO","BIK","PDG","PKU","TKG","BTJ","PLM","PNK","SRI",
    "LOP","MOF","TTR","BEJ","LLO","GNS","BIK","FKQ","SOQ","MKQ","NAM","MPC",
  ]), []);

  const tabPrices = useMemo(() => {
    let list = filteredPrices;
    if (filterAirlineCode !== "all") list = list.filter(p => p.airlineCode === filterAirlineCode);
    if (deskTab === "domestik") list = list.filter(p => IDN_CODES.has(p.fromCode) && IDN_CODES.has(p.toCode));
    else if (deskTab === "internasional") list = list.filter(p => !IDN_CODES.has(p.fromCode) || !IDN_CODES.has(p.toCode));
    else if (deskTab === "promo") list = list.filter(p => (p.notes ?? "").toLowerCase().includes("promo") || p.basePrice < 3_000_000);
    else if (deskTab === "favorit") list = [];
    return list;
  }, [filteredPrices, deskTab, filterAirlineCode, IDN_CODES]);

  const uniqueAirlines = useMemo(() => {
    const seen = new Map<string, string>();
    prices.forEach(p => { if (!seen.has(p.airlineCode)) seen.set(p.airlineCode, p.airline); });
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [prices]);

  const domCount = useMemo(() =>
    filteredPrices.filter(p => IDN_CODES.has(p.fromCode) && IDN_CODES.has(p.toCode)).length,
  [filteredPrices, IDN_CODES]);

  const intlCount = useMemo(() =>
    filteredPrices.filter(p => !IDN_CODES.has(p.fromCode) || !IDN_CODES.has(p.toCode)).length,
  [filteredPrices, IDN_CODES]);

  const promoCount = useMemo(() =>
    filteredPrices.filter(p => (p.notes ?? "").toLowerCase().includes("promo") || p.basePrice < 3_000_000).length,
  [filteredPrices]);

  const sidebarStats = useMemo(() => {
    const totalRoutes = prices.length;
    const airlineCount = new Set(prices.map(p => p.airlineCode)).size;
    const available = publishedCount;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const changed = prices.filter(p => {
      const rec = p as unknown as Record<string, string>;
      const ts = new Date(rec.updatedAt ?? rec.createdAt ?? 0).getTime();
      return ts > thirtyDaysAgo;
    }).length;
    const sells = prices.map(p => sellingPrice(p.basePrice, p.currency, rates, markup)).filter(v => v > 0);
    const minPrice = sells.length ? Math.min(...sells) : 0;
    const maxPrice = sells.length ? Math.max(...sells) : 0;
    return { totalRoutes, airlineCount, available, changed, minPrice, maxPrice };
  }, [prices, publishedCount, rates, markup]);

  function ticketTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "baru saja";
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    return `${Math.floor(h / 24)} hari lalu`;
  }

  return (
    <div className="max-w-5xl mx-auto pb-8 md:py-6 md:px-4 md:space-y-6">

      {/* ══════════════════════════════════════════════════════════
           MOBILE LAYOUT  (md:hidden) — Native App Style
      ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen bg-[#F2F5FB]" style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}>

        {/* ── PAGE HEADER ── */}
        <div
          className="bg-white px-4 pb-3 sticky top-0 z-20"
          style={{ paddingTop: "calc(60px + env(safe-area-inset-top, 0px))", boxShadow: "0 1px 0 rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-60 transition-opacity shrink-0"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2.2} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[17px] font-extrabold text-[#0f1c3f] leading-tight truncate">Harga Tiket</h1>
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5 truncate">
                Extract tiket via AI · screenshot atau kode booking
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => void refreshTicketPrices()} disabled={loading}
                className="h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-40"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <RefreshCw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} strokeWidth={2} />
              </button>
              <button
                onClick={() => ticketListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="h-9 px-3 rounded-full flex items-center gap-1.5 text-[12px] font-bold active:opacity-80 transition-opacity shrink-0"
                style={{ background: "#EEF2FF", color: "#0038B8", WebkitTapHighlightColor: "transparent" }}
              >
                <History className="h-3.5 w-3.5" strokeWidth={2} />
                Riwayat
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-3">

          {/* ── SEARCH BAR ── */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" strokeWidth={2} />
            <input
              type="text"
              placeholder="Cari maskapai, kode, atau rute…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-9 rounded-2xl text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none bg-white"
              style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.07)", border: "1.5px solid rgba(0,0,0,0.06)" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-slate-200 active:opacity-70"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <X className="h-3 w-3 text-slate-500" />
              </button>
            )}
          </div>

          {/* ── FILTER ROW ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
                <span className="text-[12px] font-bold text-[#0f1c3f]">Filter</span>
              </div>
              {(searchQuery.trim() !== "" || filterTripType !== "all" || filterDateRange !== "all" || filterPublish !== "all" || sortBy !== "default") && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] active:opacity-60"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  Reset <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>

              {/* Semua Rute dropdown */}
              <div className="relative shrink-0">
                <select
                  value={filterTripType}
                  onChange={(e) => setFilterTripType(e.target.value as TripTypeFilter)}
                  className={cn(
                    "appearance-none h-8 pl-3 pr-7 rounded-xl text-[12px] font-semibold border focus:outline-none cursor-pointer transition-colors",
                    filterTripType !== "all"
                      ? "bg-sky-600 text-white border-sky-600"
                      : "bg-white text-slate-700 border-slate-200"
                  )}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <option value="all">Semua Rute</option>
                  <option value="direct">Direct</option>
                  <option value="transit">Transit</option>
                  <option value="pp">Pulang-Pergi</option>
                </select>
                <ChevronDown className={cn("absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", filterTripType !== "all" ? "text-white" : "text-slate-400")} strokeWidth={2.5} />
              </div>

              {/* Tanggal dropdown */}
              <div className="relative shrink-0">
                <Calendar className={cn("absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", filterDateRange !== "all" ? "text-white" : "text-slate-400")} strokeWidth={1.8} />
                <select
                  value={filterDateRange}
                  onChange={(e) => setFilterDateRange(e.target.value as DateFilter)}
                  className={cn(
                    "appearance-none h-8 pl-8 pr-7 rounded-xl text-[12px] font-semibold border focus:outline-none cursor-pointer transition-colors",
                    filterDateRange !== "all"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-200"
                  )}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <option value="all">Tanggal</option>
                  <option value="today">Hari Ini</option>
                  <option value="week">Minggu Ini</option>
                  <option value="month">Bulan Ini</option>
                </select>
                <ChevronDown className={cn("absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", filterDateRange !== "all" ? "text-white" : "text-slate-400")} strokeWidth={2.5} />
              </div>

              {/* Maskapai/Sort dropdown */}
              <div className="relative shrink-0">
                <Plane className={cn("absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", sortBy !== "default" ? "text-white" : "text-slate-400")} strokeWidth={1.8} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className={cn(
                    "appearance-none h-8 pl-8 pr-7 rounded-xl text-[12px] font-semibold border focus:outline-none cursor-pointer transition-colors",
                    sortBy !== "default"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-700 border-slate-200"
                  )}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <option value="default">Maskapai</option>
                  <option value="airline">Urut: Maskapai</option>
                  <option value="price">Urut: Harga</option>
                  <option value="date">Urut: Tanggal</option>
                </select>
                <ChevronDown className={cn("absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", sortBy !== "default" ? "text-white" : "text-slate-400")} strokeWidth={2.5} />
              </div>

              {/* Status (owner only) */}
              {isOwner && (
                <div className="relative shrink-0">
                  <select
                    value={filterPublish}
                    onChange={(e) => setFilterPublish(e.target.value as PublishFilter)}
                    className={cn(
                      "appearance-none h-8 pl-3 pr-7 rounded-xl text-[12px] font-semibold border focus:outline-none cursor-pointer transition-colors",
                      filterPublish !== "all"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-700 border-slate-200"
                    )}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <option value="all">Semua Status</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                  <ChevronDown className={cn("absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", filterPublish !== "all" ? "text-white" : "text-slate-400")} strokeWidth={2.5} />
                </div>
              )}
            </div>
          </div>

          {/* ── SORT + RESULT COUNT ── */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-white border border-slate-200 text-[12px] font-semibold text-slate-600 active:opacity-70 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
              {sortDir === "asc" ? "Terbaru" : "Terlama"}
              <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", sortDir === "desc" && "rotate-180")} strokeWidth={2.5} />
            </button>
            <span className="text-[12px] font-semibold text-slate-500">
              {filteredPrices.length} hasil ditemukan
            </span>
          </div>

          {/* ── PENDING FORMS (AI Scan Results) ── */}
          {isAdmin && pendingForms.length > 0 && (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
              <div className="px-4 pt-3.5 pb-3 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5 text-sky-500" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[13px] font-extrabold text-[#0f1c3f]">
                      {saving ? `Menyimpan… (${saveProgress?.current ?? 0}/${pendingForms.length})` : `${pendingForms.length} Tiket Ditemukan`}
                    </p>
                    <p className="text-[10px] text-slate-400">Periksa detail sebelum menyimpan</p>
                  </div>
                </div>
                <button
                  onClick={() => void savePending()} disabled={saving}
                  className="h-8 px-3.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 active:opacity-80 transition-opacity disabled:opacity-50 shrink-0"
                  style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {saving ? `${saveProgress?.current ?? "…"}/${pendingForms.length}` : "Simpan Semua"}
                </button>
              </div>
              <div className="px-4 py-3 space-y-2">
                {saveProgress && (
                  <div className="flex items-center gap-2 text-[11px] text-sky-700 font-medium mb-1">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    Menyimpan tiket {saveProgress.current} dari {saveProgress.total}…
                  </div>
                )}
                {pendingForms.map((form, idx) => (
                  <div key={idx} className="bg-[#F2F5FB] rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-xl bg-[#dbeafe] flex items-center justify-center shrink-0">
                      <Plane className="h-3.5 w-3.5 text-[#0066FF]" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-extrabold text-[#0f1c3f] truncate">{form.airline || "Maskapai"}</p>
                      <p className="text-[10px] text-slate-400">{form.fromCode} → {form.toCode} {form.departDate ? `· ${form.departDate}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[11px] font-extrabold text-[#0f1c3f]">{form.currency} {form.basePrice > 0 ? form.basePrice.toLocaleString("id") : "—"}</p>
                      <button onClick={() => removePending(idx)} className="h-6 w-6 rounded-lg bg-red-50 flex items-center justify-center active:opacity-70">
                        <X className="h-3 w-3 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TICKET LIST ── */}
          <div ref={ticketListRef}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Hasil Extract Terbaru</h3>
                {markup > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">+{fmtIDR(markup)} markup/pax</p>
                )}
              </div>
              <button
                onClick={resetFilters}
                className="text-[12px] font-semibold text-[#0066FF] active:opacity-60 shrink-0"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                Lihat Semua
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
                    <div className="h-16 bg-slate-100" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-slate-100 rounded-full w-3/4" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPrices.length === 0 ? (
              <div className="bg-white rounded-2xl px-4 py-12 text-center flex flex-col items-center" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
                <div className="h-14 w-14 rounded-2xl bg-[#dbeafe] flex items-center justify-center mb-3">
                  <Plane className="h-6 w-6 text-[#0066FF]" strokeWidth={1.8} />
                </div>
                {visiblePrices.length === 0 ? (
                  <>
                    <p className="text-[14px] font-bold text-[#0f1c3f]">Belum ada harga tiket</p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug max-w-[220px]">Upload screenshot atau tambah manual untuk mulai.</p>
                    {isAdmin && (
                      <button onClick={openAdd} className="mt-4 inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl text-[12px] font-bold text-white shadow-sm active:opacity-80" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}>
                        <Plus className="h-3.5 w-3.5" /> Tambah Manual
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[14px] font-bold text-[#0f1c3f]">Tidak ada hasil</p>
                    <p className="text-[11px] text-slate-400 mt-1">Tidak ada tiket yang cocok. Coba ubah filter.</p>
                    <button onClick={resetFilters} className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-2xl text-[11px] font-bold text-red-500 border border-red-200 active:opacity-70">
                      <RotateCcw className="h-3 w-3" /> Reset Filter
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPrices.map((item, idx) => {
                  const isNew = !!item.createdAt && (Date.now() - new Date(item.createdAt).getTime()) < 48 * 60 * 60 * 1000;
                  return (
                    <div key={item.id}>
                      <div className="relative">
                        {isNew && idx === 0 && (
                          <div
                            className="absolute top-4 right-14 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide pointer-events-none"
                            style={{ background: "#d1fae5", color: "#059669" }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                            Terbaru
                          </div>
                        )}
                        <BoardingPassCard
                          item={item} markup={markup} rates={rates}
                          isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete}
                          onTogglePublish={handleTogglePublish} onView={openView}
                          waNumber={waNumber} showBasePrice={isOwner}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 text-right px-2 mt-1.5 flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                        Extracted {ticketTimeAgo(item.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── TAMBAH TIKET (Admin) ── */}
          {isAdmin && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Tambah Tiket</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Quick-action row */}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning}
                  className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold text-[#0038B8] bg-white border border-slate-200 active:opacity-70 transition-opacity shadow-sm disabled:opacity-50"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {scanning
                    ? <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                    : <ImagePlus className="h-4 w-4" strokeWidth={2} />}
                  {scanning ? "Menganalisis…" : "Screenshot Tiket"}
                </button>
                <button
                  onClick={openAdd}
                  className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold text-white active:opacity-80 transition-opacity"
                  style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  Tambah Manual
                </button>
              </div>

              {scanError && (
                <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-100">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-700">{scanError}</p>
                </div>
              )}

              {/* Paste kode */}
              <div ref={pasteSectionRef} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }} data-bc-paste-section>
                <div className="px-4 pt-4 pb-4">
                  <p className="text-[13px] font-extrabold text-[#0f1c3f] mb-0.5">Paste Kode Booking / GDS</p>
                  <p className="text-[11px] text-slate-400 mb-3">PNR, Galileo, Amadeus, atau BC WhatsApp</p>
                  <Textarea
                    placeholder={"Contoh:\n  1 GF70 CAI→BAH 03JUN 17:15\n  TOTAL AMOUNT 29283 EGP"}
                    className="font-mono text-[11px] min-h-[90px] resize-none bg-[#F2F5FB] border-0 rounded-xl text-slate-700 placeholder:text-slate-300"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <button
                    onClick={() => void handleParseText()}
                    disabled={!pasteText.trim() || scanningText}
                    className="w-full h-10 rounded-xl mt-3 text-[12px] font-extrabold text-white flex items-center justify-center gap-2 active:opacity-80 transition-opacity disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}
                  >
                    {scanningText
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Menganalisis…</>
                      : <><Sparkles className="h-3.5 w-3.5 text-yellow-300" strokeWidth={2} />Extract via AI</>}
                  </button>
                </div>
              </div>

              {/* Markup */}
              <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
                <button
                  onClick={() => setMarkupOpen(v => !v)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 active:opacity-70 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <Tag className="h-4 w-4 text-emerald-600" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[13px] font-extrabold text-[#0f1c3f]">Global Markup</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{markup > 0 ? `+${fmtIDR(markup)} per pax` : "Tap untuk mengatur"}</p>
                  </div>
                  {markup > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">Aktif</span>}
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0", markupOpen && "rotate-180")} />
                </button>
                {markupOpen && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2.5">
                    <Input
                      type="number" min="0" step="50000" placeholder="0"
                      className="bg-[#F2F5FB] h-11 rounded-xl text-[13px] border-0"
                      value={markupInput}
                      onChange={(e) => setMarkupInput(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-400 leading-snug">Ditambahkan ke semua harga modal sebelum ditampilkan ke klien.</p>
                    <button
                      onClick={applyMarkup}
                      className="w-full h-10 rounded-xl text-[12px] font-bold text-white flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
                      style={{ background: "linear-gradient(135deg,#059669,#047857)", WebkitTapHighlightColor: "transparent" }}
                    >
                      <Check className="w-3.5 h-3.5" /> Terapkan Markup
                    </button>
                  </div>
                )}
              </div>

              {/* Inject sample */}
              <button
                onClick={() => void handleInjectSample()} disabled={injecting}
                className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-1.5 text-[12px] font-bold bg-amber-50 border border-amber-200 text-amber-700 active:opacity-70 transition-opacity shadow-sm disabled:opacity-50"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {injecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                Contoh Data
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden md:flex)
      ══════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex gap-6 items-start">

        {/* ── LEFT / MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Plane className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Harga Tiket</h1>
                <p className="text-sm text-slate-500 mt-0.5">Kelola harga tiket maskapai secara mudah dan terstruktur.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline" size="sm"
                className="text-slate-600 border-slate-200 hover:bg-slate-50"
                onClick={() => toast.info("Riwayat perubahan segera hadir")}
              >
                <History className="w-3.5 h-3.5 mr-1.5" />
                Riwayat Perubahan
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={openAdd}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Tambah Harga
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>

          {/* Sumber Data Harga Tiket */}
          <Card className="border-slate-200">
            <CardContent className="p-0">
              {/* Card header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Sumber Data Harga Tiket</h2>
                  <p className="text-xs text-slate-500">Pilih atau masukkan sumber harga tiket yang akan digunakan.</p>
                </div>
              </div>

              {/* Option 1: Share Link Publik */}
              <div className="border-b border-slate-100">
                <div
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedSource(s => s === "share" ? null : "share")}
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                    <Link2 className="w-4 h-4 text-sky-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 flex-1">Share Link Publik</span>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expandedSource === "share" && "rotate-180")} />
                </div>
                {expandedSource === "share" && (
                  <div className="px-5 pb-4">
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={publicUrl}
                        className="h-8 text-xs bg-slate-50 border-slate-200 text-slate-600 flex-1 font-mono"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0 bg-sky-600 hover:bg-sky-700 text-white"
                        onClick={handleSharePublic}
                      >
                        Salin
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2: Upload File (Gambar / PDF) */}
              <div className="border-b border-slate-100">
                <div
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedSource(s => s === "upload" ? null : "upload")}
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <ImagePlus className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">Upload File</span>
                    <span className="ml-2 text-[10px] text-slate-400">PNG · JPG · PDF</span>
                  </div>
                  {deskSheetUrl && (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full mr-1">
                      TERHUBUNG
                    </span>
                  )}
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expandedSource === "upload" && "rotate-180")} />
                </div>
                {expandedSource === "upload" && (
                  <div className="px-5 pb-5 space-y-4">
                    {/* ── Drop zone ── */}
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-xl py-7 flex flex-col items-center gap-3 cursor-pointer transition-colors",
                        scanning ? "border-sky-400 bg-sky-50 pointer-events-none" : "border-slate-200 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40"
                      )}
                      onClick={() => !scanning && uploadFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files[0];
                        if (f) void handleFileSelect(f);
                      }}
                    >
                      {scanning ? (
                        <>
                          <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />
                          </div>
                          <p className="text-xs font-semibold text-sky-700">AI sedang menganalisis…</p>
                        </>
                      ) : (
                        <>
                          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Upload className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">Klik atau seret file ke sini</p>
                            <p className="text-xs text-slate-400 mt-0.5">PNG, JPG, atau PDF • Maks. 10MB</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {["PNG", "JPG", "PDF"].map((fmt) => (
                              <span key={fmt} className="text-[10px] font-bold bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                                {fmt}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {scanError && (
                      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-700">{scanError}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-slate-100" />
                      <span className="text-[10px] text-slate-400 font-medium">atau link Google Sheet</span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>

                    {/* ── Sheet URL input ── */}
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Tempel link publik (Google Sheet, CSV, atau TXT)"
                        className="h-8 text-xs flex-1"
                        value={deskSheetUrl}
                        onChange={(e) => setDeskSheetUrl(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => {
                          if (deskSheetUrl.trim()) {
                            setDeskSyncBanner(true);
                            toast.success("URL berhasil disimpan!");
                          } else {
                            toast.error("Masukkan URL terlebih dahulu");
                          }
                        }}
                      >
                        Simpan
                      </Button>
                    </div>
                    {deskSyncBanner && deskSheetUrl && (
                      <>
                        <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">TERHUBUNG</span>
                            <span className="text-xs text-slate-500 font-mono truncate">{deskSheetUrl}</span>
                          </div>
                          <span className="text-xs text-slate-400 shrink-0 ml-3">Terakhir diperbarui: —</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-xs text-emerald-700 font-medium">Data berhasil disinkronkan</span>
                          </div>
                          <button
                            onClick={() => setDeskSyncBanner(false)}
                            className="text-slate-400 hover:text-slate-600 ml-2"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                            <RefreshCw className="w-3 h-3 mr-1.5" />
                            Sinkronkan Sekarang
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-slate-600 border-slate-200 hover:bg-slate-50">
                            <Settings2 className="w-3 h-3 mr-1.5" />
                            Pengaturan Kolom
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Option 3: Tempel Teks BC (AI) */}
              <div className="border-b border-slate-100">
                <div
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedSource(s => s === "bc" ? null : "bc")}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">Tempel Teks BC (AI)</span>
                    <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">AI</span>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expandedSource === "bc" && "rotate-180")} />
                </div>

                {expandedSource === "bc" && (
                  <div className="px-5 pb-5 space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Tempel teks broadcast (BC), itinerary, atau kode sistem GDS — AI akan otomatis mengekstrak data harga tiket.
                    </p>

                    {/* Textarea */}
                    <Textarea
                      placeholder={`Contoh:\nEK 802 CGK-DXB 15JUL 2359 0450+1\nDXB-JED EK 853 16JUL 0700 0845\nHarga: Rp 4.850.000 / pax\n\natau paste kode GDS / BC WA langsung di sini...`}
                      className="min-h-[140px] text-xs font-mono resize-none border-slate-200 focus-visible:ring-amber-400 bg-slate-50"
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      disabled={scanningText}
                    />

                    {/* Error */}
                    {scanError && (
                      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-700">{scanError}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-9 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1.5 flex-1"
                        disabled={!pasteText.trim() || scanningText}
                        onClick={handleParseText}
                      >
                        {scanningText ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            AI sedang memproses…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Proses dengan AI
                          </>
                        )}
                      </Button>
                      {pasteText && !scanningText && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs border-slate-200 text-slate-500"
                          onClick={() => { setPasteText(""); setScanError(null); }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400">
                      Mendukung teks BC WhatsApp, format Galileo GDS, itinerary maskapai, dan teks bebas lainnya.
                    </p>
                  </div>
                )}
              </div>

              {/* Option 4: Input Manual */}
              <div
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors rounded-b-xl"
                onClick={openAdd}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4 text-violet-600" />
                </div>
                <span className="text-sm font-medium text-slate-700 flex-1">Input Manual</span>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </div>
            </CardContent>
          </Card>

          {/* ── PENDING FORMS (AI Scan Results) — Desktop ── */}
          {isAdmin && pendingForms.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/40">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-blue-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {saving
                          ? `Menyimpan… (${saveProgress?.current ?? 0}/${pendingForms.length})`
                          : `${pendingForms.length} Tiket Ditemukan oleh AI`}
                      </p>
                      <p className="text-xs text-slate-500">Periksa detail lalu klik Simpan Semua</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-slate-200 text-slate-500"
                      onClick={() => { setPendingForms([]); setParsedTickets([]); }}
                      disabled={saving}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => void savePending()}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                      {saving ? `${saveProgress?.current ?? "…"}/${pendingForms.length}` : "Simpan Semua"}
                    </Button>
                  </div>
                </div>
                <div className="px-5 py-4 grid grid-cols-2 gap-3">
                  {pendingForms.map((form, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-blue-100 px-4 py-3 flex items-center gap-3 shadow-sm">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <Plane className="w-4 h-4 text-blue-600" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{form.airline || "Maskapai"}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {form.fromCode} → {form.toCode}
                          {form.departDate ? ` · ${fmtDate(form.departDate)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-bold text-slate-900">
                          {form.currency} {form.basePrice > 0 ? form.basePrice.toLocaleString("id") : "—"}
                        </p>
                        <button
                          onClick={() => removePending(idx)}
                          className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors"
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daftar Harga Tiket */}
          <div className="space-y-4">
            {/* Section header */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Plane className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Daftar Harga Tiket</h2>
                  <p className="text-xs text-slate-500">
                    {filteredPrices.length} rute tersedia
                    {loading && " · Memuat…"}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Teransinkron
              </span>
            </div>

            {/* Search + filter row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari rute, kota, atau maskapai..."
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterAirlineCode} onValueChange={setFilterAirlineCode}>
                <SelectTrigger className="h-9 w-44 text-xs border-slate-200">
                  <SelectValue placeholder="Semua Maskapai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Semua Maskapai</SelectItem>
                  {uniqueAirlines.map(a => (
                    <SelectItem key={a.code} value={a.code} className="text-xs">{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value="all" onValueChange={() => {}}>
                <SelectTrigger className="h-9 w-36 text-xs border-slate-200">
                  <SelectValue placeholder="Semua Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Semua Kelas</SelectItem>
                  <SelectItem value="ekonomi" className="text-xs">Ekonomi</SelectItem>
                  <SelectItem value="bisnis" className="text-xs">Bisnis</SelectItem>
                  <SelectItem value="first" className="text-xs">First Class</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9 text-xs text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filter
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 border-slate-200 bg-white shrink-0">
                <LayoutGrid className="w-4 h-4 text-slate-500" />
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-slate-200">
              {[
                { key: "semua",         label: "Semua",          count: filteredPrices.length },
                { key: "domestik",      label: "Domestik",       count: domCount },
                { key: "internasional", label: "Internasional",  count: intlCount },
                { key: "promo",         label: "Promo",          count: promoCount },
                { key: "favorit",       label: "Favorit",        count: 0 },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDeskTab(tab.key as typeof deskTab)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    deskTab === tab.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700",
                  )}
                >
                  {tab.label}
                  <span className={cn(
                    "text-[11px] font-semibold rounded-full px-1.5 py-0.5",
                    deskTab === tab.key ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500",
                  )}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Ticket grid */}
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 shrink-0" />
                      <div className="h-4 bg-slate-100 rounded flex-1" />
                    </div>
                    <div className="h-5 bg-slate-100 rounded mb-2" />
                    <div className="h-3 bg-slate-100 rounded w-3/4 mb-4" />
                    <div className="h-5 bg-slate-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : tabPrices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Plane className="w-6 h-6 text-slate-300" />
                </div>
                {visiblePrices.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-600">Belum ada harga tiket</p>
                    <p className="text-xs text-slate-400 text-center max-w-xs">
                      Klik &ldquo;+ Tambah Harga&rdquo; untuk menambah tiket pertama Anda.
                    </p>
                    {isAdmin && (
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white mt-1" onClick={openAdd}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Tambah Harga Tiket
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Tidak ada tiket yang cocok</p>
                    <p className="text-xs text-slate-400 text-center max-w-xs">Coba ubah kata kunci atau filter.</p>
                    <button
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset Filter
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {tabPrices.map(item => (
                  <DesktopTicketCard
                    key={item.id}
                    item={item}
                    markup={markup}
                    rates={rates}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onTogglePublish={handleTogglePublish}
                    onView={openView}
                    waNumber={waNumber}
                    showBasePrice={isOwner}
                  />
                ))}
                {/* Promo empty-slot card matching screenshot */}
                {isAdmin && tabPrices.length > 0 && tabPrices.length % 3 !== 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center gap-3 p-6 text-center min-h-[200px]">
                    <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                      <Plane className="w-7 h-7 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Kelola Harga dengan Mudah</p>
                      <p className="text-xs text-slate-400 mt-1 leading-snug">
                        Tambahkan, perbarui, dan pantau harga tiket dari berbagai maskapai dalam satu tempat.
                      </p>
                    </div>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openAdd}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Tambah Harga Tiket
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>{/* end left main */}

        {/* ── RIGHT SIDEBAR ── */}
        <div className="w-64 shrink-0 space-y-4">
          <Card className="border-slate-200">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h3 className="text-sm font-bold text-slate-900">Ringkasan Data</h3>
                <Select defaultValue="30d">
                  <SelectTrigger className="h-7 w-36 text-[11px] border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30d" className="text-xs">30 Hari Terakhir</SelectItem>
                    <SelectItem value="7d"  className="text-xs">7 Hari Terakhir</SelectItem>
                    <SelectItem value="all" className="text-xs">Semua Waktu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3.5">
                {[
                  { icon: <MapPin className="w-4 h-4 text-blue-500" />,     bg: "bg-blue-50",   label: "Total Rute",       value: sidebarStats.totalRoutes.toLocaleString("id-ID") },
                  { icon: <Plane   className="w-4 h-4 text-violet-500" />,  bg: "bg-violet-50", label: "Maskapai",         value: sidebarStats.airlineCount.toLocaleString("id-ID") },
                  { icon: <Tag     className="w-4 h-4 text-emerald-500" />, bg: "bg-emerald-50",label: "Harga Tersedia",   value: sidebarStats.available.toLocaleString("id-ID") },
                  { icon: <TrendingUp className="w-4 h-4 text-amber-500" />,bg: "bg-amber-50",  label: "Perubahan Harga", value: sidebarStats.changed.toLocaleString("id-ID"), badge: "+1%" },
                  { icon: <ArrowDown className="w-4 h-4 text-red-500" />,   bg: "bg-red-50",    label: "Harga Termurah",  value: sidebarStats.minPrice > 0 ? fmtIDR(sidebarStats.minPrice) : "—" },
                  { icon: <ArrowUp  className="w-4 h-4 text-orange-500" />, bg: "bg-orange-50", label: "Harga Tertinggi", value: sidebarStats.maxPrice > 0 ? fmtIDR(sidebarStats.maxPrice) : "—" },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", s.bg)}>
                        {s.icon}
                      </div>
                      <span className="text-[12px] text-slate-500">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[13px] font-bold text-slate-900 tabular-nums">{s.value}</span>
                      {s.badge && (
                        <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 py-0.5 rounded-full">
                          {s.badge}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Empty-state helper card */}
          {visiblePrices.length === 0 && isAdmin && (
            <Card className="border-dashed border-slate-200">
              <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Plane className="w-7 h-7 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">Kelola Harga dengan Mudah</p>
                  <p className="text-xs text-slate-400 mt-1 leading-snug">
                    Tambahkan, perbarui, dan pantau harga tiket dari berbagai maskapai dalam satu tempat.
                  </p>
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white w-full" onClick={openAdd}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Tambah Harga Tiket
                </Button>
              </CardContent>
            </Card>
          )}
        </div>{/* end right sidebar */}

      </div>{/* end hidden md:flex */}

      {/* ── Hidden file inputs (mobile screenshot + desktop upload) ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileSelect(f); if (fileInputRef.current) fileInputRef.current.value = ""; }}
      />
      <input
        ref={uploadFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileSelect(f); if (uploadFileInputRef.current) uploadFileInputRef.current.value = ""; }}
      />

      {/* ── Edit / Add Dialog — rendered at root level for both mobile & desktop ── */}
      <TicketFormDialog
        open={editOpen || addOpen}
        onClose={() => { setEditOpen(false); setAddOpen(false); }}
        initial={editForm}
        onSave={handleSaveEdit}
        loading={savingEdit}
        isOwner={isOwner}
      />

      {/* ── Detail Modal — rendered at root level ── */}
      <TicketDetailModal
        open={viewOpen}
        item={viewItem}
        markup={markup}
        rates={rates}
        isOwner={isOwner}
        onClose={() => { setViewOpen(false); }}
        onEdit={isOwner ? (item) => { setViewOpen(false); openEdit(item); } : undefined}
        onTogglePublish={isOwner ? (async (id, val) => {
          await handleTogglePublish(id, val);
          setViewItem((prev) => prev?.id === id ? { ...prev, isPublished: val } : prev);
        }) : undefined}
      />
    </div>
  );
}
