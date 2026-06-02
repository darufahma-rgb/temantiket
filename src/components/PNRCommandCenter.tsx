/**
 * PNR Command Center — Fase 28.1
 * Universal one-click workflow: paste PNR/Galileo text (or screenshot) →
 * auto-extract → confirm → save client + order + itinerary + invoice + WA reminder.
 */
import { useCallback, useRef, useState } from "react";
import {
  Clipboard, ImagePlus, Loader2, Sparkles, X, CheckCircle2,
  User, Plane, DollarSign, FileDown, MessageCircle, Copy, Check,
  ChevronDown, ChevronUp, AlertCircle, RefreshCw, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRatesStore } from "@/store/ratesStore";
import { useClientsStore } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useInvoiceStore } from "@/store/invoiceStore";
import { useAuthStore } from "@/store/authStore";
import {
  extractItinerary,
  extractItineraryFromImage,
  buildWhatsAppText,
  type ItineraryData,
  type FlightLeg,
} from "@/lib/itineraryAI";
import { nextInvoiceNumber, todayString } from "@/lib/invoiceGenerator";
import { generateInvoicePdfRemote } from "@/lib/exportPdfApi";
import { loadIghAdminSettings } from "@/lib/ighSettings";
import { normalizePhoneForWa } from "@/lib/memberSlug";
import type { ClientDraft } from "@/features/clients/clientsRepo";
import type { OrderDraft } from "@/features/orders/ordersRepo";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtIDR(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Build route label e.g. "CGK → JED (PP)" */
function buildRouteLabel(legs: FlightLeg[]): string {
  if (!legs.length) return "—";
  const first = legs[0];
  const last  = legs[legs.length - 1];
  const route = [
    first.fromCode ?? first.fromCity,
    last.toCode ?? last.toCity,
  ].filter(Boolean).join(" → ");
  const isRound = legs.length >= 2 &&
    (last.toCode === first.fromCode || last.toCity === first.fromCity);
  return route + (isRound ? " (PP)" : "");
}

/** Build order title like "Tiket CGK → JED — Ahmad Fauzi" */
function buildOrderTitle(data: ItineraryData, clientName: string): string {
  const route = buildRouteLabel(data.legs);
  const name  = clientName.split(" ").slice(0, 2).join(" ");
  return ["Tiket", route, name ? `— ${name}` : ""].filter(Boolean).join(" ");
}

/** Convert price to IDR based on currency and rates */
function toIDR(
  amount: number,
  currency: string,
  rates: { EGP: number; SAR: number; USD: number; IDR: number },
): number {
  if (currency === "IDR" || !currency) return amount;
  if (currency === "EGP") return Math.round(amount * (rates.EGP ?? 515));
  if (currency === "SAR") return Math.round(amount * (rates.SAR ?? 4250));
  if (currency === "USD") return Math.round(amount * (rates.USD ?? 16000));
  return amount;
}

/** Build WA reminder message for flight */
function buildWaReminder(data: ItineraryData, clientName: string): string {
  const first = data.legs[0];
  const name  = clientName.split(" ")[0] || "Bapak/Ibu";
  const dept  = first?.departDate ? fmtDate(first.departDate) : "—";
  const time  = first?.departTime ?? "—";
  const route = buildRouteLabel(data.legs);
  const pnr   = data.pnr ? `\nPNR: *${data.pnr}*` : "";

  return (
    `*REMINDER PENERBANGAN — Temantiket*\n\n` +
    `Halo ${name}, mengingatkan jadwal penerbangan Anda:\n\n` +
    `✈️ Rute  : *${route}*\n` +
    `📅 Tgl   : *${dept}*\n` +
    `🕐 Jam   : *${time}*` +
    pnr + `\n\n` +
    `Harap tiba di bandara min. *2 jam* sebelum keberangkatan.\n` +
    `Pastikan dokumen perjalanan lengkap.\n\n` +
    `_Temantiket — mudah, cepat, amanah_`
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ExtractionResult {
  data: ItineraryData;
  usedAI: boolean;
  sellPriceIDR: number;
  costPriceIDR: number;
  routeLabel: string;
}

interface SaveResult {
  clientId: string;
  clientName: string;
  orderId: string;
  isNewClient: boolean;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FieldRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-[hsl(var(--border))] last:border-0">
      <span className="mt-0.5 text-[hsl(var(--primary))] shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider">{label}</p>
        <p className="text-[13px] font-semibold text-[hsl(var(--foreground))] mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

function ItineraryPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const preview = lines.slice(0, 8).join("\n");
  const shown   = expanded ? text : preview;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
        <span className="text-[11px] font-bold text-[hsl(var(--foreground))] uppercase tracking-wider">
          Preview Itinerary
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-[11.5px] font-mono text-[hsl(var(--foreground))] whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
        {shown}
        {!expanded && lines.length > 8 && (
          <span className="text-[hsl(var(--muted-foreground))]">\n…</span>
        )}
      </pre>
    </div>
  );
}

// ── Confirmation Modal ─────────────────────────────────────────────────────

interface ConfirmModalProps {
  result: ExtractionResult;
  itineraryText: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}

function ConfirmModal({ result, itineraryText, onConfirm, onCancel, saving }: ConfirmModalProps) {
  const { data, sellPriceIDR, costPriceIDR, routeLabel } = result;
  const first = data.legs[0];

  return (
    <div className="space-y-3.5">
      {/* Badge */}
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-[12.5px] font-semibold text-emerald-800">
          Data penerbangan ditemukan{result.usedAI ? " (AI)" : " (Regex)"}
        </p>
      </div>

      {/* Fields */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-white divide-y divide-[hsl(var(--border))] overflow-hidden">
        {data.passengerName && (
          <FieldRow
            icon={<User className="h-3.5 w-3.5" />}
            label="Nama Klien"
            value={toTitleCase(data.passengerName)}
          />
        )}
        <FieldRow
          icon={<Plane className="h-3.5 w-3.5" />}
          label="Rute Penerbangan"
          value={routeLabel}
        />
        {first?.departDate && (
          <FieldRow
            icon={<span className="text-[13px]">📅</span>}
            label="Tanggal Berangkat"
            value={`${fmtDate(first.departDate)}${first.departTime ? ` · ${first.departTime}` : ""}`}
          />
        )}
        {data.pnr && (
          <FieldRow
            icon={<span className="text-[13px]">🔖</span>}
            label="Kode PNR / Booking"
            value={data.pnr}
          />
        )}
        {data.legs.length > 1 && (
          <FieldRow
            icon={<span className="text-[13px]">🔄</span>}
            label="Total Segmen"
            value={`${data.legs.length} penerbangan (bundled 1 order)`}
          />
        )}
        {sellPriceIDR > 0 && (
          <FieldRow
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label={`Harga Jual (${data.priceCurrency ?? "IDR"})`}
            value={
              data.priceCurrency && data.priceCurrency !== "IDR"
                ? `${data.priceCurrency} ${(data.totalPrice ?? 0).toLocaleString("id-ID")} ≈ ${fmtIDR(sellPriceIDR)}`
                : fmtIDR(sellPriceIDR)
            }
          />
        )}
      </div>

      {/* Itinerary preview */}
      <ItineraryPreview text={itineraryText} />

      {/* What will happen */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-3.5 py-3 space-y-1.5">
        <p className="text-[11px] font-bold text-sky-800 uppercase tracking-wider mb-2">
          Yang akan dilakukan otomatis
        </p>
        {[
          data.passengerName ? `Buat / temukan profil klien "${toTitleCase(data.passengerName)}"` : "Simpan profil klien",
          "Buat 1 order tiket dengan semua segmen bundled",
          "Itinerary minimalis siap di-copy",
          "Invoice PDF langsung terunduh",
          "Link WA Reminder siap dikirim ke klien",
          "Member Card poin otomatis terupdate",
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-sky-600 mt-0.5 shrink-0" />
            <span className="text-[11.5px] text-sky-800">{item}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5 pt-1">
        <Button
          variant="outline"
          className="flex-1 h-10 text-[13px]"
          onClick={onCancel}
          disabled={saving}
        >
          Batal
        </Button>
        <Button
          className="flex-1 h-10 text-[13px] font-bold"
          style={{ background: "linear-gradient(135deg,#0064E0,#0064E0)", color: "white" }}
          onClick={onConfirm}
          disabled={saving}
        >
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Menyimpan…</>
          ) : (
            <><Zap className="h-3.5 w-3.5 mr-1.5" /> Simpan & Otomatis</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Success Panel ──────────────────────────────────────────────────────────

interface SuccessPanelProps {
  saveResult: SaveResult;
  itineraryText: string;
  waReminderUrl: string;
  onDone: () => void;
}

function SuccessPanel({ saveResult, itineraryText, waReminderUrl, onDone }: SuccessPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyItinerary = async () => {
    try {
      await navigator.clipboard.writeText(itineraryText);
      setCopied(true);
      toast.success("Itinerary tersalin ke clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  return (
    <div className="space-y-4">
      {/* Success header */}
      <div className="flex flex-col items-center gap-2 py-3">
        <div className="h-14 w-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-bold text-[hsl(var(--foreground))]">
            Berhasil!
          </p>
          <p className="text-[12px] text-[hsl(var(--muted-foreground))] mt-0.5">
            {saveResult.isNewClient
              ? `Klien baru "${saveResult.clientName}" dibuat & order tersimpan.`
              : `Order untuk "${saveResult.clientName}" tersimpan.`}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-2">
        <button
          onClick={handleCopyItinerary}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all text-left",
            copied
              ? "border-emerald-300 bg-emerald-50"
              : "border-[hsl(var(--border))] bg-white hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--accent))]",
          )}
        >
          {copied
            ? <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            : <Copy className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />}
          <div>
            <p className="text-[12.5px] font-semibold text-[hsl(var(--foreground))]">
              {copied ? "Itinerary tersalin!" : "Copy Itinerary"}
            </p>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Teks siap untuk di-paste ke WhatsApp
            </p>
          </div>
        </button>

        <a
          href={waReminderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#f0fdf4] px-4 py-3 hover:bg-[#dcfce7] transition-colors text-left"
        >
          <MessageCircle className="h-4 w-4 text-[#128C7E] shrink-0" />
          <div>
            <p className="text-[12.5px] font-semibold text-[hsl(var(--foreground))]">
              Kirim WA Reminder
            </p>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Buka WhatsApp dengan pesan reminder otomatis
            </p>
          </div>
        </a>

        <p className="text-[10.5px] text-center text-[hsl(var(--muted-foreground))]">
          Invoice PDF sudah otomatis terunduh. Member Card poin sudah diupdate.
        </p>
      </div>

      <Button
        className="w-full h-10 text-[13px]"
        variant="outline"
        onClick={onDone}
      >
        Selesai
      </Button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function PNRCommandCenter() {
  const [open, setOpen]           = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [rawText, setRawText]     = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [extraction, setExtraction]     = useState<ExtractionResult | null>(null);
  const [itineraryText, setItineraryText] = useState("");
  const [saveResult, setSaveResult]     = useState<SaveResult | null>(null);
  const [waReminderUrl, setWaReminderUrl] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);

  const rates         = useRatesStore((s) => s.rates);
  const { clients, addClient, fetchClients } = useClientsStore();
  const { addOrder }  = useOrdersStore();
  const { templateDataUrl, setLastInvoice } = useInvoiceStore();
  const user          = useAuthStore((s) => s.user);

  // ── Extract ──────────────────────────────────────────────────────────────

  const doExtract = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setError(null);
    setExtracting(true);
    setExtraction(null);
    setSaveResult(null);

    try {
      const { data, usedAI } = await extractItinerary(text);
      finalizeExtraction(data, usedAI);
    } catch (err) {
      setError("Ekstraksi gagal. Pastikan teks berisi data penerbangan valid.");
      console.error("[PNRCommandCenter] extract error:", err);
    } finally {
      setExtracting(false);
    }
  }, [rates]); // eslint-disable-line

  const doExtractImage = useCallback(async (dataUrl: string) => {
    setError(null);
    setExtracting(true);
    setExtraction(null);
    setSaveResult(null);

    try {
      const { data, usedAI } = await extractItineraryFromImage(dataUrl);
      finalizeExtraction(data, usedAI);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memproses gambar.";
      setError(msg);
    } finally {
      setExtracting(false);
    }
  }, [rates]); // eslint-disable-line

  function finalizeExtraction(data: ItineraryData, usedAI: boolean) {
    const currency = data.priceCurrency ?? "IDR";
    const rawPrice = data.totalPrice ?? 0;
    const sellPriceIDR = toIDR(rawPrice, currency, rates);
    const routeLabel   = buildRouteLabel(data.legs);

    const egpRate = rates.EGP ?? 515;
    const itin = buildWhatsAppText(data, egpRate);

    setItineraryText(itin);
    setExtraction({ data, usedAI, sellPriceIDR, costPriceIDR: 0, routeLabel });
    setOpen(true);
  }

  // ── Save all ──────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!extraction) return;
    setSaving(true);

    try {
      const { data, sellPriceIDR } = extraction;

      // 1. Find or create client
      let clientId: string | null = null;
      let clientName = data.passengerName
        ? toTitleCase(data.passengerName)
        : (user?.displayName ?? "Klien");
      let isNewClient = false;

      if (data.passengerName) {
        // Refresh clients list so we have the latest
        await fetchClients();
        const allClients = useClientsStore.getState().clients;
        const norm = normalizeName(data.passengerName);
        const found = allClients.find((c) =>
          normalizeName(c.name) === norm ||
          normalizeName(c.name).includes(norm.split(" ")[0]) ||
          norm.includes(normalizeName(c.name).split(" ")[0])
        );

        if (found) {
          clientId   = found.id;
          clientName = found.name;
        } else {
          const draft: ClientDraft = {
            name: clientName,
            phone: "",
            notes: data.pnr ? `PNR: ${data.pnr}` : undefined,
          };
          const newClient = await addClient(draft);
          clientId    = newClient.id;
          clientName  = newClient.name;
          isNewClient = true;
        }
      }

      // 2. Create flight order (all legs bundled as one order)
      const first = data.legs[0];
      const orderTitle = buildOrderTitle(data, clientName);
      const orderDraft: OrderDraft = {
        clientId,
        type: "flight",
        status: "Confirmed",
        title: orderTitle,
        totalPrice: sellPriceIDR,
        costPrice: 0,
        currency: "IDR",
        tripId: null,
        packageId: null,
        jamaahId: null,
        notes: data.pnr ? `PNR: ${data.pnr}` : null,
        metadata: {
          pnr: data.pnr ?? null,
          passengerName: data.passengerName ?? null,
          legs: data.legs,
          rawPrice: data.totalPrice ?? 0,
          rawCurrency: data.priceCurrency ?? "IDR",
          routeLabel: extraction.routeLabel,
          source: "pnr_command_center",
        },
      };
      const savedOrder = await addOrder(orderDraft);

      // 3. Generate invoice PDF and auto-download
      try {
        const settings     = loadIghAdminSettings();
        const invoiceNum   = nextInvoiceNumber();
        const invoiceDate  = todayString();
        const clientForInv = clientId
          ? { id: clientId, name: clientName, phone: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : null;

        const pdfBytes = await generateInvoicePdfRemote({
          invoiceNumber: invoiceNum,
          invoiceDate,
          order: savedOrder,
          client: clientForInv,
          agencyName: "Temantiket",
          agencyPhone: settings.adminWhatsapp,
          agencyInstagram: settings.adminInstagram,
          templateDataUrl,
        });

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `${invoiceNum}_${clientName.replace(/\s+/g, "_")}.pdf`;
        a.click();

        const reader = new FileReader();
        reader.onloadend = () => {
          setLastInvoice(reader.result as string, `${invoiceNum} · ${clientName}`);
          URL.revokeObjectURL(url);
        };
        reader.readAsDataURL(blob);

        toast.success(`Invoice ${invoiceNum} terunduh`);
      } catch (invErr) {
        console.warn("[PNRCommandCenter] invoice generation skipped:", invErr);
        toast.warning("Invoice tidak bisa dibuat, tapi data sudah tersimpan.");
      }

      // 4. Build WA Reminder URL
      const reminderText = buildWaReminder(data, clientName);
      const waUrl = `https://wa.me/?text=${encodeURIComponent(reminderText)}`;
      setWaReminderUrl(waUrl);

      // 5. Done
      setSaveResult({
        clientId: clientId ?? "",
        clientName,
        orderId: savedOrder.id,
        isNewClient,
      });

      toast.success("Semua data tersimpan!", {
        description: `Order "${orderTitle}" berhasil dibuat.`,
        duration: 4000,
      });

    } catch (err) {
      console.error("[PNRCommandCenter] save error:", err);
      toast.error("Gagal menyimpan", {
        description: err instanceof Error ? err.message : "Coba lagi.",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text.trim().length > 20) {
      setTimeout(() => doExtract(text), 100);
    }
  }, [doExtract]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar (PNG, JPG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) doExtractImage(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  const handleClose = () => {
    setOpen(false);
    setExtraction(null);
    setSaveResult(null);
    setError(null);
  };

  const handleDone = () => {
    handleClose();
    setRawText("");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Widget Card ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-xl md:rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 shadow-sm overflow-hidden mb-1.5 md:mb-5"
      >
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sky-50/50 transition-colors"
        >
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
            <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-[12px] font-bold text-[hsl(var(--foreground))]">
              PNR Command Center
            </p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">
              Paste teks Galileo/PNR → auto klien, order, invoice, WA
            </p>
          </div>
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0" />
            : <ChevronUp   className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0" />}
        </button>

        {/* Body */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2.5">
                {/* Textarea */}
                <div className="relative">
                  <Textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    onPaste={handlePaste}
                    placeholder={
                      "Paste teks Galileo, Amadeus, atau itinerary di sini...\n\n" +
                      "Contoh:\n1 QR 978 Y 15MAR 4 CGKDOH HK1 2355 0430 16MAR\nPassenger: MR AHMED/NABIL"
                    }
                    className="min-h-[76px] resize-none text-[12px] font-mono pr-10 bg-white/80 border-sky-200 focus:border-sky-400 placeholder:text-[hsl(var(--muted-foreground))]/60 placeholder:text-[11px]"
                    disabled={extracting}
                  />
                  {rawText && (
                    <button
                      onClick={() => setRawText("")}
                      className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted-foreground))]/20 flex items-center justify-center transition-colors"
                    >
                      <X className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                    </button>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-[11.5px] text-red-700">{error}</p>
                  </div>
                )}

                {/* Action row */}
                <div className="flex items-center gap-2">
                  {/* Image upload */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={extracting}
                    title="Upload screenshot tiket"
                    className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] bg-white flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))]/40 transition-colors shrink-0 disabled:opacity-50"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>

                  {/* Extract button */}
                  <Button
                    onClick={() => doExtract(rawText)}
                    disabled={!rawText.trim() || extracting}
                    className="flex-1 h-9 text-[12.5px] font-bold rounded-xl"
                    style={{ background: "linear-gradient(135deg,#0064E0,#0064E0)", color: "white" }}
                  >
                    {extracting ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Mengekstrak…</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Ekstrak & Proses</>
                    )}
                  </Button>

                  {/* Paste from clipboard */}
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text.trim()) {
                          setRawText(text);
                          await doExtract(text);
                        }
                      } catch {
                        toast.error("Tidak bisa akses clipboard. Paste manual ke kolom teks.");
                      }
                    }}
                    disabled={extracting}
                    title="Paste dari clipboard & langsung proses"
                    className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] bg-white flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))]/40 transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Clipboard className="h-4 w-4" />
                  </button>
                </div>

                {/* Tips row */}
                <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] text-center">
                  Otomatis deteksi saat paste · Upload screenshot untuk OCR (butuh OpenAI key)
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) handleClose(); }}>
        <DialogContent className="max-w-[480px] max-h-[90vh] overflow-y-auto p-5 gap-0">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              {saveResult ? "Operasi Selesai" : "Konfirmasi Data"}
            </DialogTitle>
          </DialogHeader>

          {saveResult ? (
            <SuccessPanel
              saveResult={saveResult}
              itineraryText={itineraryText}
              waReminderUrl={waReminderUrl}
              onDone={handleDone}
            />
          ) : extraction ? (
            <ConfirmModal
              result={extraction}
              itineraryText={itineraryText}
              onConfirm={handleConfirm}
              onCancel={handleClose}
              saving={saving}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
              <p className="text-[13px] text-[hsl(var(--muted-foreground))]">Mengekstrak data penerbangan…</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
