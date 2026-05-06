import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Sparkles, Plus, Trash2, Edit3, Eye, EyeOff, Loader2,
  MessageCircle, AlertTriangle, Check, X, ChevronDown, ChevronUp,
  Tag, RefreshCw, Settings2, ImagePlus, Plane, Share2, Copy,
  Clock, MapPin, ArrowRight, ExternalLink, Instagram, Link2,
  ArrowLeftRight, RotateCcw, Search, Calendar, SlidersHorizontal, ArrowUpDown,
} from "lucide-react";
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
  scanTicketPriceScreenshot, parseGalileoTextToTickets,
  getAirlineLogoUrl, getAirlineGradient,
  encodeReturnLeg, decodeReturnLeg, isReturnTrip,
  encodeMultiLeg, decodeMultiLeg, isMultiLegNotes, buildRouteLabel,
  type ParsedTicketPrice, type ReturnLegData, type MultiLegData, type LegInfo,
} from "@/lib/ticketPriceAI";
import {
  listTicketPrices, createTicketPrice, updateTicketPrice, deleteTicketPrice,
  loadMarkup, saveMarkup, sellingPrice, isExpired, fmtIDR, fmtDate,
  CURRENCY_LABEL,
  type TicketPrice, type TicketPriceDraft, type TicketCurrency,
} from "@/features/ticketPrices/ticketPricesRepo";
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
    currency: p.currency, validUntil: null, notes, isPublished: true,
    flightNumber: outboundFlightNumber ?? null,
    etd: p.etd ?? null, eta: p.eta ?? null,
    terminal: p.terminal ?? null,
    transitCode: p.transitCode ?? null,
    transitCity: p.transitCity ?? null,
    transitDuration: p.transitDuration ?? null,
  };
}

// ── Airline logo component ───────────────────────────────────────────────────
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
      className="rounded-xl object-contain shrink-0 bg-white border border-slate-100"
      style={{ width: size, height: size }}
      onError={() => setOk(false)}
    />
  );
}


// ── Boarding-pass style Price Card ───────────────────────────────────────────
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

  // Route label for WhatsApp message
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
    `💰 Harga: *${fmtIDR(sell)}${isML || isRT ? "/paket PP" : "/pax"}*\n\n` +
    `Mohon infokan ketersediaan dan detailnya. Terima kasih!`
  );

  const waLink = waNumber
    ? `${whatsappUrl(waNumber)}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  const isRTorML = isRT || isML;

  return (
    <div className={cn(
      "relative rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md overflow-hidden flex flex-col",
      expired && "opacity-60",
      !item.isPublished && "border-dashed border-slate-300",
    )}>
      {/* ── Temantiket blue top accent bar ── */}
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg,#1a56a8,#2d7dd2)" }} />

      {/* ── Header: airline info + TM icon ── */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <AirlineLogo code={item.airlineCode} airline={item.airline} size={34} />
          <div className="min-w-0">
            <p className="font-bold text-[13px] text-slate-800 leading-tight truncate">{item.airline}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9.5px] text-slate-400 font-mono">{item.airlineCode}</span>
              {!isRT && !isML && item.flightNumber && (
                <span className="text-[9.5px] bg-[#1a56a8]/10 text-[#1a56a8] rounded px-1.5 py-0.5 font-mono font-bold">
                  {item.flightNumber}
                </span>
              )}
              <span className={cn(
                "text-[8.5px] font-bold px-1.5 py-0.5 rounded-full",
                isML || isRT ? "bg-violet-100 text-violet-700"
                : isDirect ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700",
              )}>
                {isML ? "Multi-Leg PP" : isRT ? "Pulang-Pergi" : isDirect ? "Direct" : "Transit"}
              </span>
            </div>
          </div>
        </div>
        {/* Temantiket icon + status badges */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <img src="/temantiket-icon-mark.png" alt="Temantiket" className="h-6 w-6 object-contain opacity-40" />
          {isAdmin && !item.isPublished && (
            <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-500 border-slate-300 py-0">
              Tersembunyi
            </Badge>
          )}
          {expired && (
            <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200 py-0">Expired</Badge>
          )}
        </div>
      </div>

      {/* ── Route section ── */}
      <div className="px-4 pb-3">
        <div className="border-t border-dashed border-slate-200 mb-3" />
        {isML && mlData ? (
          <div className="space-y-3">
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

      {/* ── Footer: date · price · actions ── */}
      <div className="mt-auto border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
        {/* Date + valid-until */}
        <div className="flex items-center justify-between text-[10.5px]">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{item.departDate ? fmtDate(item.departDate) : "Tanggal Fleksibel"}</span>
          </div>
          {item.validUntil && (
            <span className={cn(expired ? "text-red-500 font-semibold" : "text-slate-400")}>
              {expired ? "⛔ Expired" : `s/d ${fmtDate(item.validUntil)}`}
            </span>
          )}
        </div>

        {/* Price */}
        {!expired ? (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
              Harga
            </p>
            <p className="text-[22px] font-black leading-tight tabular-nums" style={{ color: "#1a56a8" }}>
              {fmtIDR(sell)}
            </p>
            {showBasePrice && markup > 0 ? (
              <p className="text-[10px] text-slate-400">
                Modal: {item.currency} {item.basePrice.toLocaleString("id-ID")} · markup {fmtIDR(markup)}
              </p>
            ) : !showBasePrice ? (
              <p className="text-[10px] text-slate-400">
                {isRTorML ? "harga paket pulang-pergi, sudah termasuk margin" : "sudah termasuk margin keuntungan"}
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-red-600">Harga Expired</p>
            <p className="text-[11px] text-slate-400">Hubungi admin untuk harga terbaru</p>
          </div>
        )}

        {/* Notes — owner only (showBasePrice == true for owner) */}
        {showBasePrice && userNotes && (
          <p className="text-[10.5px] text-slate-500 italic leading-snug">{userNotes}</p>
        )}
        {showBasePrice && !isRTorML && item.notes && !item.notes.startsWith("__") && (
          <p className="text-[10.5px] text-slate-500 italic leading-snug">{item.notes}</p>
        )}

        {/* CTAs */}
        <div className="flex gap-2 pt-0.5">
          {expired ? (
            <Button asChild size="sm" variant="outline" className="flex-1 text-xs border-slate-300 text-slate-600">
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />Hubungi Admin
              </a>
            </Button>
          ) : (
            <Button asChild size="sm" className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white">
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />Pesan via WA
              </a>
            </Button>
          )}
          {isAdmin && !expired && (
            <Button size="sm" variant="outline"
              className="text-xs border-[#1a56a8]/20 text-[#1a56a8] hover:bg-[#1a56a8]/5 shrink-0"
              title="Buat order flight dari tiket ini"
              onClick={() => navigate("/orders/flight")}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />Order
            </Button>
          )}
          {isAdmin && (
            <div className="flex gap-1">
              {onView && (
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[#1a56a8]/10"
                  style={{ color: "#1a56a8" }}
                  title="Lihat Detail" onClick={() => onView(item)}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              )}
              {onEdit && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500"
                  title="Edit" onClick={() => onEdit(item)}>
                  <Edit3 className="w-3.5 h-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                  title="Hapus" onClick={() => onDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
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
            <AirlineLogo code={item.airlineCode} airline={item.airline} size={40} />
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
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#1a56a8] mb-1">↗ Berangkat</p>
                <MultiLegTimeline legs={mlData.outboundLegs} />
                {(mlData.returnLegs?.length ?? 0) > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-dashed border-slate-200" />
                      <RotateCcw className="w-3 h-3 text-violet-400 shrink-0" />
                      <div className="flex-1 border-t border-dashed border-slate-200" />
                    </div>
                    <MultiLegTimeline legs={mlData.returnLegs!} accentColor="#7c3aed" />
                  </>
                )}
              </div>
            ) : isRT && returnLeg ? (
              <div className="space-y-4">
                <RouteTimeline
                  fromCode={item.fromCode} fromCity={item.fromCity} etd={item.etd}
                  toCode={item.toCode} toCity={item.toCity} eta={item.eta}
                  isDirect={!item.transitCode} transitCode={item.transitCode}
                  transitCity={item.transitCity} transitDuration={item.transitDuration}
                  label="Berangkat"
                  date={item.departDate ? fmtDate(item.departDate) : null}
                  flightNumber={item.flightNumber}
                />
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-dashed border-slate-200" />
                  <RotateCcw className="w-3 h-3 text-violet-400 shrink-0" />
                  <div className="flex-1 border-t border-dashed border-slate-200" />
                </div>
                <RouteTimeline
                  fromCode={returnLeg.returnFromCode ?? "—"} fromCity={returnLeg.returnFromCity}
                  etd={returnLeg.returnEtd}
                  toCode={returnLeg.returnToCode ?? "—"} toCity={returnLeg.returnToCity}
                  eta={returnLeg.returnEta}
                  isDirect={!returnLeg.returnTransitCode}
                  transitCode={returnLeg.returnTransitCode}
                  transitCity={returnLeg.returnTransitCity}
                  transitDuration={returnLeg.returnTransitDuration}
                  label="Pulang"
                  date={returnLeg.returnDate ? fmtDate(returnLeg.returnDate) : null}
                  flightNumber={returnLeg.returnFlightNumber}
                />
              </div>
            ) : (
              <RouteTimeline
                fromCode={item.fromCode} fromCity={item.fromCity} etd={item.etd}
                toCode={item.toCode} toCity={item.toCity} eta={item.eta}
                isDirect={isDirect} transitCode={item.transitCode}
                transitCity={item.transitCity} transitDuration={item.transitDuration}
                date={item.departDate ? fmtDate(item.departDate) : null}
                flightNumber={item.flightNumber}
              />
            )}
          </div>

          {/* ── Detail rows ── */}
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Detail</p>
            <div className="divide-y divide-slate-100">
              {item.terminal && <DetailRow label="Terminal" value={item.terminal} mono />}
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
                  <p className="text-[28px] font-black text-sky-700 leading-none tabular-nums mt-0.5">
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
              <p className="text-[26px] font-black text-sky-700 leading-none tabular-nums">
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

  useEffect(() => {
    setForm(initial);
    const { ml } = decodeMultiLeg(initial.notes);
    if (ml) {
      setMlData(ml);
      setReturnForm(null);
      setUserNotes("");
    } else {
      setMlData(null);
      const { leg, userNotes: un } = decodeReturnLeg(initial.notes);
      setReturnForm(leg);
      setUserNotes(un ?? "");
    }
  }, [initial, open]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setRt = (patch: Partial<ReturnLegData>) =>
    setReturnForm((r) => r ? { ...r, ...patch } : r);

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

          {/* ══ RETURN LEG — Simple RT ══ */}
          {isRT && returnForm && (
            <>
              <LegDivider label="↩ Leg Pulang" />
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
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
                    <Input placeholder="2h 30m" value={returnForm.returnTransitDuration ?? ""}
                      onChange={(e) => setRt({ returnTransitDuration: e.target.value || null })} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Tanggal Kepulangan</Label>
                  <Input type="date" value={returnForm.returnDate ?? ""}
                    onChange={(e) => setRt({ returnDate: e.target.value || null })} />
                </div>
              </div>
            </>
          )}

          {/* ══ RETURN LEG — Multi-Leg (read-only summary) ══ */}
          {isML && mlData && (
            <>
              <LegDivider label="↩ Leg Pulang (Multi-Leg)" />
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5 space-y-1">
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
                <p className="text-[10px] text-violet-400 pt-1 italic">Multi-leg otomatis — scan ulang untuk ubah rute</p>
              </div>
            </>
          )}

          {/* ── Common fields ── */}
          <div className="h-px bg-border/50" />

          <div className="space-y-1">
            <Label className="text-xs">Terminal Keberangkatan (opsional)</Label>
            <Input placeholder="T3 atau Terminal 2" value={form.terminal ?? ""}
              onChange={(e) => set({ terminal: e.target.value || null })} />
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TicketPrices() {
  const { user } = useAuthStore();
  const { rates } = useRatesStore();
  const isAdmin = user?.role === "owner" || user?.role === "staff";
  const isOwner = user?.role === "owner";

  const [prices, setPrices] = useState<TicketPrice[]>([]);
  const [loading, setLoading] = useState(true);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Galileo text paste state (Fase 20)
  const [pasteText, setPasteText] = useState("");

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listTicketPrices(false);
      setPrices(items);
    } catch (e) {
      toast.error("Gagal memuat daftar harga: " + String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  // ── Screenshot scan ─────────────────────────────────────────────────────
  async function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar (JPG, PNG, WebP)");
      return;
    }
    setScanning(true);
    setScanError(null);
    setParsedTickets([]);
    setPendingForms([]);

    const result = await scanTicketPriceScreenshot(file);
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

  // ── Galileo text paste (Fase 20) ─────────────────────────────────────────
  function handleParseText() {
    if (!pasteText.trim()) {
      toast.error("Tempel dulu text Galileo di textarea");
      return;
    }
    setScanError(null);
    setParsedTickets([]);
    setPendingForms([]);

    const result = parseGalileoTextToTickets(pasteText);

    if (result.error || result.tickets.length === 0) {
      setScanError(result.error ?? "Tidak ada segmen penerbangan yang ditemukan di text ini.");
      return;
    }

    const forms = result.tickets.map(formFromParsed);
    setParsedTickets(result.tickets);
    setPendingForms(forms);
    saveDraft(forms);
    setPasteText("");
    const rtCount = result.grouped ?? 0;
    toast.success(
      `Parser menemukan ${result.tickets.length} entri tiket (tanpa AI)!`,
      {
        description: rtCount > 0
          ? `${rtCount} paket pulang-pergi otomatis digabung. Markup diterapkan sekali per paket.`
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
      setPrices((prev) => [...savedItems, ...prev]);
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
        setPrices((prev) => prev.map((p) => p.id === editId ? updated : p));
        toast.success("Harga tiket diperbarui!");
      } else {
        const item = await createTicketPrice({ ...form, sortOrder: 0 });
        setPrices((prev) => [item, ...prev]);
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
    });
    setEditOpen(true);
  }

  function openAdd() {
    setEditId(null);
    setEditForm(EMPTY_FORM);
    setAddOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus harga tiket ini?")) return;
    try {
      await deleteTicketPrice(id);
      setPrices((prev) => prev.filter((p) => p.id !== id));
      toast.success("Dihapus.");
    } catch (e) { toast.error("Gagal hapus: " + String(e)); }
  }

  async function handleTogglePublish(id: string, val: boolean) {
    try {
      const updated = await updateTicketPrice(id, { isPublished: val });
      setPrices((prev) => prev.map((p) => p.id === id ? updated : p));
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

  return (
    <div className="max-w-5xl mx-auto pb-8 md:py-6 md:px-4 md:space-y-6">

      {/* ══════════════════════════════════════════════════════════
           MOBILE LAYOUT  (md:hidden)
      ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden px-4 space-y-4">

        {/* ── Header row ── */}
        <div className="flex items-center gap-2.5">
          <Plane className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] leading-none">Tiket & Harga</p>
            <h1 className="text-[14px] font-extrabold text-[hsl(var(--foreground))] leading-tight truncate mt-0.5">Daftar Harga Tiket</h1>
          </div>
          {isAdmin && (
            <button
              onClick={() => void load()} disabled={loading}
              className="h-9 w-9 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] flex items-center justify-center active:scale-95 transition-transform shrink-0"
            >
              <RefreshCw className={cn("h-4 w-4 text-[hsl(var(--muted-foreground))]", loading && "animate-spin")} />
            </button>
          )}
        </div>

        {/* ── Hero stats banner ── */}
        <div
          className="rounded-2xl px-4 py-3.5 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#00072d 0%,#0a2472 55%,#1a44d4 100%)" }}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 65%)" }} />
            <div className="absolute -bottom-8 left-0 right-0 h-24" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(26,68,212,0.3) 0%, transparent 70%)" }} />
            <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }} />
          </div>
          <div className="relative flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-widest text-sky-400/70 mb-0.5">Total Tiket</p>
              <p className="text-[28px] font-black text-white leading-none tabular-nums">{visiblePrices.length}</p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0 mt-0.5 backdrop-blur-sm">
              <Plane className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="relative flex items-center pt-3 border-t border-white/10">
            {[
              { label: "Publik",      value: String(publishedCount) },
              { label: "Tersembunyi", value: String(hiddenCount)    },
              { label: "Markup",      value: markup > 0 ? `+${fmtIDR(markup)}` : "—" },
            ].map((s, i) => (
              <div key={s.label} className={cn("flex-1 text-center", i > 0 && "border-l border-white/10")}>
                <p className="text-[12px] font-black text-white tabular-nums leading-none">{s.value}</p>
                <p className="text-[7.5px] text-sky-300/60 uppercase tracking-wide mt-1 font-semibold">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex gap-2">
          <button
            onClick={handleSharePublic}
            className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold text-white shadow-sm active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg,#1a44d4,#0a2472)" }}
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            onClick={() => setMarkupOpen((v) => !v)}
            className={cn(
              "flex-1 h-11 rounded-2xl flex items-center justify-center gap-1.5 text-[12px] font-bold border transition-all active:scale-95",
              markup > 0
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]"
            )}
          >
            <Tag className="h-4 w-4" />
            {markup > 0 ? "Edit Markup" : "Markup"}
          </button>
          {isAdmin && (
            <button
              onClick={openAdd}
              className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-1.5 text-[12px] font-bold bg-white border border-[hsl(var(--border))] text-[hsl(var(--foreground))] active:scale-95 transition-transform shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Tambah
            </button>
          )}
        </div>

        {/* ── Markup inline (mobile) ── */}
        {markupOpen && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                <Settings2 className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-emerald-900">Global Mark-up</p>
                <p className="text-[10px] text-emerald-600">Keuntungan per pax (IDR)</p>
              </div>
              <button onClick={() => setMarkupOpen(false)} className="ml-auto h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center active:scale-95">
                <X className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
            <Input
              type="number" min="0" step="50000" placeholder="0"
              className="bg-white h-11 rounded-xl text-[13px]"
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
            />
            <p className="text-[10.5px] text-emerald-600 leading-snug">
              Ditambahkan ke semua harga modal sebelum ditampilkan ke klien. Kurs konversi otomatis.
            </p>
            <button
              onClick={applyMarkup}
              className="w-full h-11 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
            >
              <Check className="w-4 h-4" /> Terapkan Markup
            </button>
          </div>
        )}

        {/* ── Share panel (mobile compact) ── */}
        <SharePanel publicUrl={publicUrl} />

        {/* ── AI Scanner (mobile, collapsible) ── */}
        {isAdmin && (
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-bold text-[hsl(var(--foreground))]">Import via AI</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">Screenshot → ekstrak otomatis</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
                className="h-9 px-3.5 rounded-xl text-[11.5px] font-bold text-white flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
                style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}
              >
                {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {scanning ? "Scan…" : "Upload"}
              </button>
            </div>

            {scanError && (
              <div className="mx-4 mb-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700">{scanError}</p>
              </div>
            )}

            {pendingForms.length > 0 && (
              <div className="border-t border-[hsl(var(--border))] px-4 py-3 space-y-3">
                {saveProgress && (
                  <div className="mx-4 mb-1 flex items-center gap-2 text-[11px] text-sky-700 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    Menyimpan tiket {saveProgress.current} dari {saveProgress.total}…
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-[hsl(var(--foreground))]">
                    {saving ? `Menyimpan ${saveProgress?.current ?? "…"}/${pendingForms.length}…` : `✅ ${pendingForms.length} tiket ditemukan`}
                  </p>
                  <button
                    onClick={savePending} disabled={saving}
                    className="h-8 px-3.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 active:scale-95"
                    style={{ background: "linear-gradient(135deg,#1a44d4,#0a2472)" }}
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    {saving
                      ? `${saveProgress?.current ?? "…"}/${pendingForms.length}`
                      : "Simpan Semua"
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Search & Filter (mobile) ── */}
        {!loading && visiblePrices.length > 0 && (
          <SearchFilterBar
            searchQuery={searchQuery} onSearchChange={setSearchQuery}
            filterTripType={filterTripType} onTripTypeChange={setFilterTripType}
            filterDateRange={filterDateRange} onDateRangeChange={setFilterDateRange}
            filterPublish={filterPublish} onPublishChange={setFilterPublish}
            isOwner={isOwner} totalCount={visiblePrices.length}
            filteredCount={filteredPrices.length} onReset={resetFilters}
            sortBy={sortBy} onSortByChange={setSortBy}
            sortDir={sortDir} onSortDirChange={setSortDir}
          />
        )}

        {/* ── Ticket list (mobile) ── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border animate-pulse overflow-hidden">
                <div className="h-16 bg-slate-200" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-slate-100 rounded-full w-3/4" />
                  <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPrices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-10 text-center flex flex-col items-center">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center mb-3 shadow-sm"
              style={{ background: "linear-gradient(135deg,#1a44d4,#0a2472)" }}
            >
              <Plane className="h-6 w-6 text-white" />
            </div>
            {visiblePrices.length === 0 ? (
              <>
                <p className="text-[13px] font-bold text-[hsl(var(--foreground))]">Belum ada harga tiket</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1 leading-snug max-w-[220px]">
                  Upload screenshot atau tambah manual untuk mulai.
                </p>
                {isAdmin && (
                  <button
                    onClick={openAdd}
                    className="mt-4 inline-flex items-center gap-1.5 h-9 px-5 rounded-xl text-[12px] font-bold text-white shadow-sm active:scale-95 transition-transform"
                    style={{ background: "linear-gradient(135deg,#1a44d4,#0a2472)" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Manual
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-[13px] font-bold text-[hsl(var(--foreground))]">Tidak ada hasil</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1 leading-snug max-w-[220px]">
                  Tidak ada tiket yang cocok. Coba ubah filter atau kata kunci.
                </p>
                <button
                  onClick={resetFilters}
                  className="mt-3 inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-[11px] font-bold text-red-500 border border-red-200 active:scale-95 transition-transform"
                >
                  <RotateCcw className="h-3 w-3" /> Reset Filter
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                {filteredPrices.length} rute tersedia
              </p>
              {markup > 0 && (
                <span className="text-[10px] font-bold text-emerald-600">
                  +{fmtIDR(markup)} markup/pax
                </span>
              )}
            </div>
            {filteredPrices.map((item) => (
              <BoardingPassCard
                key={item.id} item={item} markup={markup} rates={rates}
                isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete}
                onTogglePublish={handleTogglePublish} onView={openView}
                waNumber={waNumber} showBasePrice={isOwner}
              />
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden md:block)
      ══════════════════════════════════════════════════════════ */}
      <div className="hidden md:block space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <Plane className="w-6 h-6 shrink-0 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Daftar Harga Tiket</h1>
              <p className="text-sm text-slate-500 mt-0.5">AI ekstrak nomor penerbangan, jam, transit otomatis dari screenshot</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm" variant="outline"
            className="text-sky-600 border-sky-200 hover:bg-sky-50 hover:border-sky-300"
            onClick={handleSharePublic}
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Share Link Publik
          </Button>
          <button
            onClick={() => setMarkupOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              markup > 0
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200",
            )}
          >
            <Tag className="w-3 h-3" />
            Markup: {markup > 0 ? fmtIDR(markup) : "Belum diset"}
            {markupOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              </Button>
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={openAdd}>
                <Plus className="w-3.5 h-3.5 mr-1" />Tambah Manual
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Share Panel ── */}
      <SharePanel publicUrl={publicUrl} />

      {/* ── Markup popover ── */}
      {markupOpen && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-semibold text-emerald-800">
                  <Settings2 className="w-3 h-3 inline mr-1" />
                  Global Mark-up Keuntungan (IDR/pax)
                </Label>
                <Input
                  type="number" min="0" step="50000" placeholder="0"
                  className="bg-white"
                  value={markupInput}
                  onChange={(e) => setMarkupInput(e.target.value)}
                />
                <p className="text-[11px] text-emerald-600">
                  Ditambahkan ke semua harga modal sebelum ditampilkan ke klien. Kurs konversi otomatis.
                </p>
              </div>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" onClick={applyMarkup}>
                <Check className="w-4 h-4 mr-1" />Terapkan
              </Button>
              <Button variant="ghost" onClick={() => setMarkupOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Admin: Screenshot OCR section ── */}
      {isAdmin && (
        <Card className="border-sky-200 dark:border-sky-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-500" />
              Import dari Screenshot via AI — Deep Extraction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void handleFileSelect(file);
              }}
              className={cn(
                "border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-colors",
                scanning
                  ? "border-sky-400 bg-sky-50"
                  : "border-slate-200 hover:border-sky-300 hover:bg-sky-50",
              )}
            >
              {scanning ? (
                <>
                  <Loader2 className="w-7 h-7 text-sky-500 animate-spin" />
                  <p className="text-sm font-medium text-sky-700">AI sedang menganalisis tiket…</p>
                  <p className="text-xs text-slate-400">Mengekstrak nomor penerbangan, jam, transit…</p>
                </>
              ) : (
                <>
                  <ImagePlus className="w-7 h-7 text-slate-400" />
                  <p className="text-sm font-medium text-slate-600">
                    Drop screenshot atau <span className="text-sky-600 underline">klik untuk pilih</span>
                  </p>
                  <p className="text-xs text-slate-400">AI ekstrak: maskapai · nomor penerbangan · ETD/ETA · transit · harga</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileSelect(f);
                e.target.value = "";
              }}
            />

            {/* ── Fase 20: Galileo text paste ── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                  Atau paste text Galileo langsung (tanpa AI, instan):
                </span>
              </div>
              <Textarea
                placeholder={
                  "Contoh format display:\n  1 GF  70  N  03JUN  CAI  BAH  1715  2015   WE\n  2 GF 284  N  03JUN  BAH  GOI  2115  0340#  WE\n  TOTAL AMOUNT 29283.80 EGP\n\nAtau format PNR:\n  1 GF  70N 03JUN 3 CAIBAH HK1  1715 2015\n  2 GF 284N 03JUN 3 BAHGOI HK1  2115 0340+1"
                }
                className="font-mono text-[11px] min-h-[90px] resize-y bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full border-slate-300 text-slate-700 hover:bg-slate-100 text-[12px]"
                disabled={!pasteText.trim()}
                onClick={handleParseText}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
                Parse Text Galileo (Instan, Tanpa AI)
              </Button>
            </div>

            {scanError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">Gagal baca screenshot</p>
                  <p className="text-xs text-red-600 mt-0.5">{scanError}</p>
                </div>
              </div>
            )}

            {/* Pending tickets from AI */}
            {pendingForms.length > 0 && (
              <div className="space-y-3">
                {saveProgress && (
                  <div className="flex items-center gap-2 px-1 text-[12px] text-sky-700 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Menyimpan tiket {saveProgress.current} dari {saveProgress.total}…
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    {saving
                      ? `Menyimpan… (${saveProgress?.current ?? 0}/${pendingForms.length})`
                      : `✅ ${pendingForms.length} entri ditemukan — periksa dan simpan:`
                    }
                  </p>
                  <Button
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700 text-white shrink-0"
                    disabled={saving}
                    onClick={() => void savePending()}
                  >
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan…</>
                      : <><Check className="w-3.5 h-3.5 mr-1.5" />Simpan Semua ({pendingForms.length})</>
                    }
                  </Button>
                </div>
                <div className="space-y-3">
                  {pendingForms.map((form, idx) => {
                    // Fase 19.5: detect multi-leg first, then simple RT
                    const { ml: pendingML } = decodeMultiLeg(form.notes);
                    const isMLForm = !!pendingML;
                    const { leg: rtLeg } = isMLForm ? { leg: null } : decodeReturnLeg(form.notes);
                    const isRTForm = !!rtLeg;
                    const isPPForm = isMLForm || isRTForm;
                    // Build per-card flight-number display from multiLeg leg data (if available)
                    // so outbound and return flights are shown separately and accurately.
                    const mlOutFlights = pendingML
                      ? pendingML.outboundLegs.map((l) => l.flightNumber).filter(Boolean).join("/")
                      : null;
                    const mlRetFlights = pendingML?.returnLegs?.length
                      ? pendingML.returnLegs.map((l) => l.flightNumber).filter(Boolean).join("/")
                      : null;
                    const mlFlightDisplay = mlOutFlights
                      ? mlRetFlights ? `${mlOutFlights} / ${mlRetFlights}` : mlOutFlights
                      : form.flightNumber ?? "";
                    return (
                    <div key={idx} className={cn(
                      "border rounded-xl p-3 space-y-3",
                      isPPForm ? "border-violet-200 bg-violet-50/40" : "border-sky-200 bg-sky-50/50"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <AirlineLogo code={form.airlineCode} airline={form.airline} size={28} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Option number badge — visible when multiple entries exist */}
                              {pendingForms.length > 1 && (
                                <span className="inline-flex items-center text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full shrink-0">
                                  Opsi {idx + 1}
                                </span>
                              )}
                              <p className="text-xs font-bold text-slate-800 truncate">{form.airline || "—"}</p>
                              {isMLForm && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full shrink-0">
                                  <ArrowLeftRight className="w-2.5 h-2.5" />Multi-Leg PP
                                </span>
                              )}
                              {!isMLForm && isRTForm && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full shrink-0">
                                  <ArrowLeftRight className="w-2.5 h-2.5" />PP
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono truncate">
                              {isMLForm
                                ? `${buildRouteLabel(pendingML!)} · ${mlFlightDisplay} · Total: ${form.currency} ${form.basePrice?.toLocaleString("id-ID") ?? "—"}`
                                : isRTForm
                                  ? `${form.fromCode} ⇄ ${form.toCode} · ${form.flightNumber ?? ""}${rtLeg?.returnFlightNumber ? `/${rtLeg.returnFlightNumber}` : ""} · Total: ${form.currency} ${form.basePrice?.toLocaleString("id-ID") ?? "—"}`
                                  : `${form.fromCode} → ${form.toCode}${form.flightNumber ? ` · ${form.flightNumber}` : ""}${form.etd ? ` · ${form.etd}` : ""}${form.eta ? `→${form.eta}` : ""}${form.transitCode ? ` via ${form.transitCode}` : ""}${form.basePrice ? ` · ${form.currency} ${form.basePrice.toLocaleString("id-ID")}` : ""}`
                              }
                            </p>
                          </div>
                        </div>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          onClick={() => removePending(idx)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Multi-leg leg chain preview — outbound + return clearly separated */}
                      {isMLForm && pendingML && (
                        <div className="rounded-lg bg-violet-100/60 border border-violet-200 px-2.5 py-2 space-y-1.5">
                          <div className="space-y-0.5">
                            <p className="text-[9.5px] font-bold text-violet-700 uppercase tracking-wide">↗ Berangkat</p>
                            {pendingML.outboundLegs.map((leg, li) => (
                              <div key={li} className="flex items-center gap-1.5 pl-2">
                                <span className="text-[10px] font-bold text-violet-900 font-mono">{leg.fromCode}→{leg.toCode}</span>
                                {leg.flightNumber && <span className="text-[9.5px] text-violet-600 font-mono">{leg.flightNumber}</span>}
                                {leg.etd && <span className="text-[9.5px] text-violet-500">{leg.etd}</span>}
                                {leg.eta && <span className="text-[9.5px] text-violet-400">→{leg.eta}</span>}
                                {leg.date && <span className="text-[9px] text-violet-400 ml-auto">{fmtDate(leg.date)}</span>}
                              </div>
                            ))}
                          </div>
                          {(pendingML.returnLegs?.length ?? 0) > 0 && (
                            <>
                              <div className="border-t border-violet-200/70" />
                              <div className="space-y-0.5">
                                <p className="text-[9.5px] font-bold text-violet-700 uppercase tracking-wide">↩ Pulang</p>
                                {pendingML.returnLegs!.map((leg, li) => (
                                  <div key={li} className="flex items-center gap-1.5 pl-2">
                                    <span className="text-[10px] font-bold text-violet-900 font-mono">{leg.fromCode}→{leg.toCode}</span>
                                    {leg.flightNumber && <span className="text-[9.5px] text-violet-600 font-mono">{leg.flightNumber}</span>}
                                    {leg.etd && <span className="text-[9.5px] text-violet-500">{leg.etd}</span>}
                                    {leg.eta && <span className="text-[9.5px] text-violet-400">→{leg.eta}</span>}
                                    {leg.date && <span className="text-[9px] text-violet-400 ml-auto">{fmtDate(leg.date)}</span>}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Simple RT leg info */}
                      {!isMLForm && isRTForm && (
                        <div className="rounded-lg bg-violet-100/60 border border-violet-200 px-2.5 py-1.5 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9.5px] font-bold text-violet-700 uppercase tracking-wide shrink-0">↗ Berangkat</span>
                            <span className="text-[10px] text-violet-800 font-mono font-bold">{form.fromCode}→{form.toCode}</span>
                            {form.etd && <span className="text-[9.5px] text-violet-500">{form.etd}</span>}
                            {form.departDate && <span className="text-[9px] text-violet-400 ml-auto">{fmtDate(form.departDate)}</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9.5px] font-bold text-violet-700 uppercase tracking-wide shrink-0">↩ Pulang</span>
                            <span className="text-[10px] text-violet-800 font-mono font-bold">{rtLeg?.returnFromCode}→{rtLeg?.returnToCode}</span>
                            {rtLeg?.returnEtd && <span className="text-[9.5px] text-violet-500">{rtLeg.returnEtd}</span>}
                            {rtLeg?.returnDate && <span className="text-[9px] text-violet-400 ml-auto">{fmtDate(rtLeg.returnDate)}</span>}
                          </div>
                        </div>
                      )}

                      {/* Quick edit inline */}
                      {isPPForm && (
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-sky-200" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-sky-600">↗ Berangkat</span>
                          <div className="h-px flex-1 bg-sky-200" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="space-y-0.5 col-span-2">
                          <Label className="text-[10px] text-slate-500">Maskapai</Label>
                          <Input className="h-7 text-xs" value={form.airline}
                            onChange={(e) => updatePending(idx, { airline: e.target.value })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">No. Penerbangan</Label>
                          <Input className="h-7 text-xs font-mono uppercase" value={form.flightNumber ?? ""}
                            onChange={(e) => updatePending(idx, { flightNumber: e.target.value.toUpperCase() || null })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Kode IATA</Label>
                          <Input className="h-7 text-xs font-mono uppercase" maxLength={2} value={form.airlineCode}
                            onChange={(e) => updatePending(idx, { airlineCode: e.target.value.toUpperCase() })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Dari</Label>
                          <Input className="h-7 text-xs font-mono uppercase" maxLength={3} value={form.fromCode}
                            onChange={(e) => updatePending(idx, { fromCode: e.target.value.toUpperCase() })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Ke</Label>
                          <Input className="h-7 text-xs font-mono uppercase" maxLength={3} value={form.toCode}
                            onChange={(e) => updatePending(idx, { toCode: e.target.value.toUpperCase() })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">ETD</Label>
                          <Input className="h-7 text-xs font-mono" placeholder="23:55" value={form.etd ?? ""}
                            onChange={(e) => updatePending(idx, { etd: e.target.value || null })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">ETA</Label>
                          <Input className="h-7 text-xs font-mono" placeholder="05:30" value={form.eta ?? ""}
                            onChange={(e) => updatePending(idx, { eta: e.target.value || null })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Tgl Berangkat</Label>
                          <Input className="h-7 text-xs" type="date" value={form.departDate ?? ""}
                            onChange={(e) => updatePending(idx, { departDate: e.target.value || null })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Harga Modal</Label>
                          <Input className="h-7 text-xs" type="number" value={form.basePrice || ""}
                            onChange={(e) => updatePending(idx, { basePrice: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Mata Uang</Label>
                          <Select value={form.currency} onValueChange={(v) => updatePending(idx, { currency: v as TicketCurrency })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(["IDR","EGP","USD","SAR"] as TicketCurrency[]).map((c) => (
                                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Berlaku Hingga</Label>
                          <Input className="h-7 text-xs" type="date" value={form.validUntil ?? ""}
                            onChange={(e) => updatePending(idx, { validUntil: e.target.value || null })} />
                        </div>
                        {!isMLForm && (form.transitCode || form.transitCity) && (
                          <div className="col-span-2 space-y-0.5">
                            <Label className="text-[10px] text-slate-500">Transit</Label>
                            <div className="flex gap-1">
                              <Input className="h-7 text-xs font-mono uppercase w-20" maxLength={3}
                                placeholder="DOH" value={form.transitCode ?? ""}
                                onChange={(e) => updatePending(idx, { transitCode: e.target.value.toUpperCase() || null })} />
                              <Input className="h-7 text-xs flex-1" placeholder="Doha" value={form.transitCity ?? ""}
                                onChange={(e) => updatePending(idx, { transitCity: e.target.value || null })} />
                              <Input className="h-7 text-xs w-20" placeholder="2h 30m" value={form.transitDuration ?? ""}
                                onChange={(e) => updatePending(idx, { transitDuration: e.target.value || null })} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Return leg editable fields (simple RT only) ── */}
                      {isRTForm && rtLeg && (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-violet-200" />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-violet-600">↩ Pulang</span>
                            <div className="h-px flex-1 bg-violet-200" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg bg-violet-50/60 border border-violet-200 p-2">
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-violet-600">No. Penerbangan</Label>
                              <Input className="h-7 text-xs font-mono uppercase" value={rtLeg.returnFlightNumber ?? ""}
                                onChange={(e) => updatePendingRT(idx, { returnFlightNumber: e.target.value.toUpperCase() || null })} />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-violet-600">Dari</Label>
                              <Input className="h-7 text-xs font-mono uppercase" maxLength={3} value={rtLeg.returnFromCode ?? ""}
                                onChange={(e) => updatePendingRT(idx, { returnFromCode: e.target.value.toUpperCase() || null })} />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-violet-600">Ke</Label>
                              <Input className="h-7 text-xs font-mono uppercase" maxLength={3} value={rtLeg.returnToCode ?? ""}
                                onChange={(e) => updatePendingRT(idx, { returnToCode: e.target.value.toUpperCase() || null })} />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-violet-600">Tgl Pulang</Label>
                              <Input className="h-7 text-xs" type="date" value={rtLeg.returnDate ?? ""}
                                onChange={(e) => updatePendingRT(idx, { returnDate: e.target.value || null })} />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-violet-600">ETD Pulang</Label>
                              <Input className="h-7 text-xs font-mono" placeholder="08:00" value={rtLeg.returnEtd ?? ""}
                                onChange={(e) => updatePendingRT(idx, { returnEtd: e.target.value || null })} />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-violet-600">ETA Pulang</Label>
                              <Input className="h-7 text-xs font-mono" placeholder="18:30" value={rtLeg.returnEta ?? ""}
                                onChange={(e) => updatePendingRT(idx, { returnEta: e.target.value || null })} />
                            </div>
                          </div>
                        </>
                      )}

                      {form.basePrice > 0 && (
                        <p className="text-[11px] text-emerald-600 font-medium">
                          💰 {isPPForm ? "Harga paket PP" : "Harga jual"}: {fmtIDR(sellingPrice(form.basePrice, form.currency, rates, markup))}
                          {markup > 0 && ` (modal ${form.currency} ${form.basePrice.toLocaleString("id-ID")} + markup ${fmtIDR(markup)}${isPPForm ? " — markup SEKALI untuk seluruh paket" : ""})`}
                        </p>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Search & Filter (desktop) ── */}
      {!loading && visiblePrices.length > 0 && (
        <SearchFilterBar
          searchQuery={searchQuery} onSearchChange={setSearchQuery}
          filterTripType={filterTripType} onTripTypeChange={setFilterTripType}
          filterDateRange={filterDateRange} onDateRangeChange={setFilterDateRange}
          filterPublish={filterPublish} onPublishChange={setFilterPublish}
          isOwner={isOwner} totalCount={visiblePrices.length}
          filteredCount={filteredPrices.length} onReset={resetFilters}
          sortBy={sortBy} onSortByChange={setSortBy}
          sortDir={sortDir} onSortDirChange={setSortDir}
        />
      )}

      {/* ── Price grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat daftar harga…</span>
        </div>
      ) : filteredPrices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <div className="p-4 rounded-2xl bg-slate-100">
            <Plane className="w-8 h-8 text-slate-300" />
          </div>
          {visiblePrices.length === 0 ? (
            <>
              <p className="text-sm font-medium">Belum ada harga tiket</p>
              {isAdmin && (
                <p className="text-xs text-center max-w-xs">
                  Upload screenshot harga tiket di atas untuk mulai menambahkan data via AI,
                  atau klik "Tambah Manual".
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-600">Tidak ada hasil yang cocok</p>
              <p className="text-xs text-center max-w-xs text-slate-400">
                Tidak ada tiket yang sesuai filter. Coba ubah kata kunci atau filter.
              </p>
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
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {filteredPrices.length} rute tersedia
              {markup > 0 && <span className="ml-2 text-emerald-600">• Markup {fmtIDR(markup)}/pax sudah termasuk</span>}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <img src="/temantiket-icon.svg" alt="" className="h-4 w-4 object-contain opacity-50 icon-adaptive" />
              <span>Temantiket</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPrices.map((item) => (
              <BoardingPassCard
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
          </div>
        </>
      )}

      </div>{/* end hidden md:block */}

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
