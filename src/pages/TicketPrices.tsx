import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, Sparkles, Plus, Trash2, Edit3, Eye, EyeOff, Loader2,
  MessageCircle, AlertTriangle, Check, X, ChevronDown, ChevronUp,
  Tag, RefreshCw, Settings2, ImagePlus, Plane,
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
import { useAuthStore } from "@/store/authStore";
import { useRatesStore } from "@/store/ratesStore";
import { scanTicketPriceScreenshot, getAirlineLogoUrl, getAirlineGradient, type ParsedTicketPrice } from "@/lib/ticketPriceAI";
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
};

function formFromParsed(p: ParsedTicketPrice): FormState {
  return {
    airline: p.airline, airlineCode: p.airlineCode,
    fromCode: p.fromCode, fromCity: p.fromCity,
    toCode: p.toCode, toCity: p.toCity,
    departDate: p.departDate, basePrice: p.basePrice ?? 0,
    currency: p.currency, validUntil: null, notes: null, isPublished: true,
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

// ── Price card ───────────────────────────────────────────────────────────────
function PriceCard({
  item, markup, rates, isAdmin, onEdit, onDelete, onTogglePublish, waNumber,
}: {
  item: TicketPrice;
  markup: number;
  rates: Record<string, number>;
  isAdmin: boolean;
  onEdit: (item: TicketPrice) => void;
  onDelete: (id: string) => void;
  onTogglePublish: (id: string, val: boolean) => void;
  waNumber: string;
}) {
  const expired = isExpired(item.validUntil);
  const sell = sellingPrice(item.basePrice, item.currency, rates, markup);

  const waText = encodeURIComponent(
    `Halo Temantiket! Saya tertarik dengan tiket berikut:\n\n` +
    `✈️ *${item.airline}*\n` +
    `🗺️ Rute: *${item.fromCode} → ${item.toCode}*\n` +
    `${item.fromCity ? `   ${item.fromCity} → ${item.toCity}\n` : ""}` +
    `📅 Tanggal: ${item.departDate ? fmtDate(item.departDate) : "Fleksibel"}\n` +
    `💰 Harga: *${fmtIDR(sell)}/pax*\n\n` +
    `Mohon infokan ketersediaan dan detailnya. Terima kasih!`
  );

  const waLink = waNumber
    ? `${whatsappUrl(waNumber)}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md overflow-hidden",
        expired && "opacity-70",
        !item.isPublished && "border-dashed border-slate-300 bg-slate-50",
      )}
    >
      {/* Admin badges */}
      {isAdmin && !item.isPublished && (
        <div className="absolute top-2 left-2 z-10">
          <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-300">
            Tersembunyi
          </Badge>
        </div>
      )}
      {expired && (
        <div className="absolute top-2 right-2 z-10">
          <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">Expired</Badge>
        </div>
      )}

      {/* Airline header */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 bg-gradient-to-r",
        getAirlineGradient(item.airlineCode),
        "text-white",
      )}>
        <AirlineLogo code={item.airlineCode} airline={item.airline} size={38} />
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight truncate">{item.airline}</p>
          <p className="text-[11px] text-white/70 leading-tight">{item.airlineCode}</p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Route */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-slate-800 tracking-tight">{item.fromCode}</span>
          <div className="flex-1 flex items-center gap-1">
            <div className="h-px flex-1 bg-slate-200" />
            <Plane className="w-3 h-3 text-slate-400" />
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <span className="text-lg font-black text-slate-800 tracking-tight">{item.toCode}</span>
        </div>
        {(item.fromCity || item.toCity) && (
          <div className="flex justify-between text-[11px] text-slate-400 -mt-2">
            <span>{item.fromCity}</span>
            <span>{item.toCity}</span>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
          <span>📅</span>
          <span>{item.departDate ? fmtDate(item.departDate) : "Tanggal Fleksibel"}</span>
        </div>

        {/* Price */}
        <div className="bg-sky-50 rounded-xl px-3 py-2.5">
          {expired ? (
            <div className="text-center">
              <p className="text-sm font-bold text-red-600">Harga Expired</p>
              <p className="text-[11px] text-slate-500">Hubungi admin untuk harga terbaru</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-sky-600 font-medium uppercase tracking-wide">Harga Jual</p>
              <p className="text-xl font-black text-sky-700 leading-tight">{fmtIDR(sell)}</p>
              <p className="text-[10px] text-slate-400">/pax • sudah termasuk margin</p>
            </>
          )}
        </div>

        {/* Valid until */}
        {item.validUntil && (
          <p className={cn("text-[11px]", expired ? "text-red-500" : "text-slate-400")}>
            {expired ? "⛔" : "⏰"} Berlaku hingga {fmtDate(item.validUntil)}
          </p>
        )}

        {/* Notes */}
        {item.notes && (
          <p className="text-[11px] text-slate-500 italic leading-snug">{item.notes}</p>
        )}

        {/* CTA */}
        <div className="flex gap-2 pt-1">
          {expired ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="flex-1 text-xs border-slate-300 text-slate-600"
            >
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                Hubungi Admin
              </a>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                Pesan via WA
              </a>
            </Button>
          )}

          {/* Admin controls */}
          {isAdmin && (
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-slate-500"
                title={item.isPublished ? "Sembunyikan" : "Tampilkan"}
                onClick={() => onTogglePublish(item.id, !item.isPublished)}
              >
                {item.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-slate-500"
                title="Edit"
                onClick={() => onEdit(item)}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                title="Hapus"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form Dialog ──────────────────────────────────────────────────────────────
function TicketFormDialog({
  open, onClose, initial, onSave, loading,
}: {
  open: boolean;
  onClose: () => void;
  initial: FormState;
  onSave: (form: FormState) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  useEffect(() => { setForm(initial); }, [initial, open]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-sky-600" />
            {form.airline ? `Edit: ${form.airline}` : "Tambah Harga Tiket"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Airline */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nama Maskapai</Label>
              <Input
                placeholder="Qatar Airways"
                value={form.airline}
                onChange={(e) => set({ airline: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kode IATA</Label>
              <Input
                placeholder="QR"
                maxLength={2}
                value={form.airlineCode}
                onChange={(e) => set({ airlineCode: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
              />
            </div>
          </div>

          {/* Route */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Dari (IATA 3-huruf)</Label>
              <Input
                placeholder="CGK"
                maxLength={3}
                value={form.fromCode}
                onChange={(e) => set({ fromCode: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ke (IATA 3-huruf)</Label>
              <Input
                placeholder="JED"
                maxLength={3}
                value={form.toCode}
                onChange={(e) => set({ toCode: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kota Asal</Label>
              <Input
                placeholder="Jakarta"
                value={form.fromCity}
                onChange={(e) => set({ fromCity: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kota Tujuan</Label>
              <Input
                placeholder="Jeddah"
                value={form.toCity}
                onChange={(e) => set({ toCity: e.target.value })}
              />
            </div>
          </div>

          {/* Date + Price + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tanggal Keberangkatan</Label>
              <Input
                type="date"
                value={form.departDate ?? ""}
                onChange={(e) => set({ departDate: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Berlaku Hingga</Label>
              <Input
                type="date"
                value={form.validUntil ?? ""}
                onChange={(e) => set({ validUntil: e.target.value || null })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Harga Modal (base)</Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.basePrice || ""}
                onChange={(e) => set({ basePrice: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mata Uang</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => set({ currency: v as TicketCurrency })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CURRENCY_LABEL) as TicketCurrency[]).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Catatan (opsional)</Label>
            <Textarea
              placeholder="Contoh: Termasuk bagasi 30kg, tersedia kelas bisnis"
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => set({ notes: e.target.value || null })}
            />
          </div>

          {/* Publish toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border">
            <Switch
              checked={form.isPublished}
              onCheckedChange={(v) => set({ isPublished: v })}
            />
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
            onClick={() => onSave(form)}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TicketPrices() {
  const { user } = useAuthStore();
  const { rates } = useRatesStore();
  const isAdmin = user?.role === "owner" || user?.role === "staff";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Admin form (manual add)
  const [addOpen, setAddOpen] = useState(false);

  // WA number
  const waNumber = loadIghAdminSettings().adminWhatsapp ?? "";

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

  // ── Markup ────────────────────────────────────────────────────────────────
  function applyMarkup() {
    const val = Math.max(0, Number(markupInput) || 0);
    saveMarkup(val);
    setMarkupState(val);
    setMarkupOpen(false);
    toast.success(`Mark-up diset ke ${fmtIDR(val)}/pax`);
  }

  // ── Screenshot scan ───────────────────────────────────────────────────────
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
    setParsedTickets(result.tickets);
    setPendingForms(result.tickets.map(formFromParsed));
    toast.success(`AI berhasil menemukan ${result.tickets.length} tiket dari screenshot!`);
  }

  function updatePending(idx: number, patch: Partial<FormState>) {
    setPendingForms((prev) => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }

  async function savePending() {
    setSaving(true);
    let saved = 0;
    for (const form of pendingForms) {
      try {
        const item = await createTicketPrice({ ...form, sortOrder: 0 });
        setPrices((prev) => [item, ...prev]);
        saved++;
      } catch (e) {
        toast.error(`Gagal simpan ${form.airline}: ${String(e)}`);
      }
    }
    if (saved > 0) {
      toast.success(`${saved} harga tiket berhasil disimpan!`);
      setParsedTickets([]);
      setPendingForms([]);
    }
    setSaving(false);
  }

  function removePending(idx: number) {
    setParsedTickets((prev) => prev.filter((_, i) => i !== idx));
    setPendingForms((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────
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

  // ── Visible prices ────────────────────────────────────────────────────────
  const visiblePrices = isAdmin ? prices : prices.filter((p) => p.isPublished);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-100">
              <Plane className="w-5 h-5 text-sky-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Daftar Harga Tiket</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Update harga via screenshot — AI ekstrak otomatis
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Markup badge */}
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
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700 text-white"
                onClick={openAdd}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Tambah Manual
              </Button>
            </>
          )}
        </div>
      </div>

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
                  type="number"
                  min="0"
                  step="50000"
                  placeholder="0"
                  className="bg-white"
                  value={markupInput}
                  onChange={(e) => setMarkupInput(e.target.value)}
                />
                <p className="text-[11px] text-emerald-600">
                  Ditambahkan ke semua harga modal sebelum ditampilkan ke klien.
                  Kurs konversi otomatis dari header.
                </p>
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                onClick={applyMarkup}
              >
                <Check className="w-4 h-4 mr-1" />
                Terapkan
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
              Import dari Screenshot via AI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop zone */}
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
                  <p className="text-sm font-medium text-sky-700">AI sedang membaca screenshot…</p>
                  <p className="text-xs text-slate-400">gpt-4o-mini Vision</p>
                </>
              ) : (
                <>
                  <ImagePlus className="w-7 h-7 text-slate-400" />
                  <p className="text-sm font-medium text-slate-600">
                    Drop screenshot harga tiket atau <span className="text-sky-600 underline">klik untuk pilih</span>
                  </p>
                  <p className="text-xs text-slate-400">JPG, PNG, WebP • AI ekstrak maskapai, rute, dan harga otomatis</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileSelect(f);
                e.target.value = "";
              }}
            />

            {/* Scan error */}
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
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    ✅ {pendingForms.length} tiket ditemukan — periksa dan simpan:
                  </p>
                  <Button
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700 text-white"
                    disabled={saving}
                    onClick={savePending}
                  >
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan…</>
                      : <><Check className="w-3.5 h-3.5 mr-1.5" />Simpan Semua ({pendingForms.length})</>
                    }
                  </Button>
                </div>
                <div className="space-y-3">
                  {pendingForms.map((form, idx) => (
                    <div
                      key={idx}
                      className="border border-sky-200 rounded-xl p-3 bg-sky-50/50 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AirlineLogo code={form.airlineCode} airline={form.airline} size={28} />
                          <div>
                            <p className="text-xs font-bold text-slate-800">{form.airline || "—"}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {form.fromCode} → {form.toCode}
                              {form.basePrice ? ` • ${form.currency} ${form.basePrice.toLocaleString("id-ID")}` : ""}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removePending(idx)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {/* Quick edit inline */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Maskapai</Label>
                          <Input
                            className="h-7 text-xs"
                            value={form.airline}
                            onChange={(e) => updatePending(idx, { airline: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="space-y-0.5">
                            <Label className="text-[10px] text-slate-500">Dari</Label>
                            <Input
                              className="h-7 text-xs font-mono uppercase"
                              maxLength={3}
                              value={form.fromCode}
                              onChange={(e) => updatePending(idx, { fromCode: e.target.value.toUpperCase() })}
                            />
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px] text-slate-500">Ke</Label>
                            <Input
                              className="h-7 text-xs font-mono uppercase"
                              maxLength={3}
                              value={form.toCode}
                              onChange={(e) => updatePending(idx, { toCode: e.target.value.toUpperCase() })}
                            />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-slate-500">Harga Modal</Label>
                          <Input
                            className="h-7 text-xs"
                            type="number"
                            value={form.basePrice || ""}
                            onChange={(e) => updatePending(idx, { basePrice: Number(e.target.value) })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="space-y-0.5">
                            <Label className="text-[10px] text-slate-500">Mata Uang</Label>
                            <Select
                              value={form.currency}
                              onValueChange={(v) => updatePending(idx, { currency: v as TicketCurrency })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(["IDR","EGP","USD","SAR"] as TicketCurrency[]).map((c) => (
                                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px] text-slate-500">Berlaku Hingga</Label>
                            <Input
                              className="h-7 text-xs"
                              type="date"
                              value={form.validUntil ?? ""}
                              onChange={(e) => updatePending(idx, { validUntil: e.target.value || null })}
                            />
                          </div>
                        </div>
                      </div>
                      {/* Preview selling price */}
                      {form.basePrice > 0 && (
                        <p className="text-[11px] text-emerald-600 font-medium">
                          💰 Harga jual: {fmtIDR(sellingPrice(form.basePrice, form.currency, rates, markup))}
                          {markup > 0 && ` (modal ${form.currency} ${form.basePrice.toLocaleString("id-ID")} + markup ${fmtIDR(markup)})`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Price grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat daftar harga…</span>
        </div>
      ) : visiblePrices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <div className="p-4 rounded-2xl bg-slate-100">
            <Plane className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-sm font-medium">Belum ada harga tiket</p>
          {isAdmin && (
            <p className="text-xs text-center max-w-xs">
              Upload screenshot harga tiket di atas untuk mulai menambahkan data via AI,
              atau klik "Tambah Manual".
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {visiblePrices.length} rute tersedia
              {markup > 0 && <span className="ml-2 text-emerald-600">• Markup {fmtIDR(markup)}/pax sudah termasuk</span>}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <img src="/temantiket-logo.png" alt="" className="h-4 w-auto opacity-50" />
              <span>Temantiket</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePrices.map((item) => (
              <PriceCard
                key={item.id}
                item={item}
                markup={markup}
                rates={rates}
                isAdmin={isAdmin}
                onEdit={openEdit}
                onDelete={handleDelete}
                onTogglePublish={handleTogglePublish}
                waNumber={waNumber}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Edit / Add Dialog ── */}
      <TicketFormDialog
        open={editOpen || addOpen}
        onClose={() => { setEditOpen(false); setAddOpen(false); }}
        initial={editForm}
        onSave={handleSaveEdit}
        loading={savingEdit}
      />
    </div>
  );
}
