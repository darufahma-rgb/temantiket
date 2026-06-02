import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LiveClock } from "@/components/LiveClock";
import { AdminWhatsappCard } from "@/components/AdminWhatsappCard";
import { MitraLeaderboardCard } from "@/components/MitraLeaderboardCard";
import { CeoDailyQuest } from "@/components/CeoDailyQuest";
import { DepartureTodayAlert } from "@/components/DepartureTodayAlert";
import { PNRCommandCenter } from "@/components/PNRCommandCenter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Plus, MapPin, Calendar as CalendarIcon, Trash2, Plane, Camera, Calculator, Users, CheckCircle, TrendingUp, ArrowRight, FileBarChart, Bus, Train, AlertCircle, Clock, Star, ChevronRight, Wallet, RefreshCw, ShoppingBag, Package, Sparkles, SlidersHorizontal, Ticket, StickyNote, BookUser, Settings } from "lucide-react";
import { MobileOwnerDashboard } from "@/components/mobile";
import {
  TravelMobileShell,
  TravelHeroCard,
  TravelSearchBar,
  TravelServiceGrid,
  TravelPromoCarousel,
  TravelStatCard,
  TravelSection,
  TravelListCard,
} from "@/components/mobile";
import { useTripsStore, type Trip } from "@/store/tripsStore";
import { listAllAgencyJamaah, countAllAgencyJamaah } from "@/features/trips/tripsRepo";
import { listAllAgencyPayments, sumPaid, type Payment } from "@/features/payments/paymentsRepo";
import type { Jamaah } from "@/features/trips/tripsRepo";
import { useRatesStore } from "@/store/ratesStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { useAuthStore } from "@/store/authStore";
import { revenueIDR, netProfitIDR } from "@/lib/profit";
import { formatDateStr, getLocale, useT } from "@/lib/regional";
import { useRegionalStore } from "@/store/regionalStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, type Variants } from "framer-motion";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] },
  }),
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};


function getGreeting(name: string, t: ReturnType<typeof useT>): string {
  const h = new Date().getHours();
  const prefix =
    h < 5 ? t.greeting_early_morning :
    h < 12 ? t.greeting_morning :
    h < 15 ? t.greeting_day :
    h < 18 ? t.greeting_afternoon : t.greeting_evening;
  const firstName = name.split(" ")[0];
  return `${prefix}, ${firstName}!`;
}

function formatTodayFull(locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Calculated: "bg-blue-50 text-blue-600",
  Confirmed: "bg-amber-50 text-amber-600",
  Paid: "bg-emerald-50 text-emerald-700",
  Completed: "bg-purple-50 text-purple-700",
};

const EMOJIS = ["🕌", "🌴", "🗼", "🏝️", "🏔️", "🌸", "🌍", "✈️", "🛕", "🏖️", "🌺", "🎑"];

const GRADIENTS: [string, string][] = [
  ["#7C5FF5", "#9B84F7"],
  ["#3B82F6", "#60A5FA"],
  ["#10B981", "#34D399"],
  ["#F59E0B", "#FBBF24"],
  ["#EF4444", "#F87171"],
  ["#8B5CF6", "#A78BFA"],
  ["#06B6D4", "#22D3EE"],
  ["#EC4899", "#F472B6"],
];

function cardGradient(id: string): [string, string] {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return GRADIENTS[hash % GRADIENTS.length];
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const { timezone, language, dateFormat } = useRegionalStore.getState();
  return formatDateStr(iso, dateFormat, timezone, getLocale(language), "short");
}

function formatShortDate(iso: string) {
  if (!iso) return "—";
  const { timezone, language } = useRegionalStore.getState();
  const locale = getLocale(language);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: timezone }).format(
    new Date(iso + "T00:00:00")
  );
}

function nightCount(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const d = Math.round(diff / 86400000);
  return d > 0 ? `${d} hari` : "—";
}

function daysUntil(iso: string) {
  const diff = new Date(iso + "T00:00:00").getTime() - Date.now();
  const d = Math.ceil(diff / 86400000);
  if (d < 0) return "Selesai";
  if (d === 0) return "Hari ini";
  return `${d} hari lagi`;
}

// ── ADD TRIP DIALOG ────────────────────────────────────────────────────────────
function AddTripDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addTrip = useTripsStore((s) => s.addTrip);
  const [form, setForm] = useState({ name: "", destination: "", startDate: "", endDate: "", emoji: "🕌", quotaPax: "" as string, pricePerPax: "" as string });
  const [loading, setLoading] = useState(false);

  const reset = () => setForm({ name: "", destination: "", startDate: "", endDate: "", emoji: "🕌", quotaPax: "", pricePerPax: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.destination || !form.startDate || !form.endDate) {
      toast.error("Harap lengkapi semua field.");
      return;
    }
    const quotaNum = form.quotaPax.trim() === "" ? undefined : Math.max(1, parseInt(form.quotaPax, 10) || 0);
    const priceNum = form.pricePerPax.trim() === "" ? undefined : Math.max(0, parseFloat(form.pricePerPax.replace(/[^0-9.]/g, "")) || 0);
    const draft = {
      name: form.name,
      destination: form.destination,
      startDate: form.startDate,
      endDate: form.endDate,
      emoji: form.emoji,
      quotaPax: quotaNum,
      pricePerPax: priceNum,
    };
    // Tutup dialog langsung — save jalan di background
    reset();
    onClose();
    void (async () => {
      try {
        await addTrip(draft);
        toast.success(`Paket "${draft.name}" berhasil ditambahkan.`);
      } catch {
        toast.error(`Gagal menyimpan "${draft.name}". Coba lagi.`);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl border border-[hsl(var(--border))] shadow-xl bg-white">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--border))]">
          <DialogTitle className="text-[14px] font-bold text-[hsl(var(--foreground))] flex items-center gap-2">
            <span className="text-lg">{form.emoji}</span>
            Tambah Paket Trip
          </DialogTitle>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">Isi detail trip baru Anda</p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pt-3.5 pb-4 space-y-3">
          {/* Emoji picker */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Ikon</p>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                  className={cn(
                    "h-8 w-8 rounded-xl text-base flex items-center justify-center border-2 transition-all duration-150",
                    form.emoji === e
                      ? "border-[hsl(var(--primary))] bg-sky-50 scale-110 shadow-sm"
                      : "border-[hsl(var(--border))] hover:border-sky-300 hover:bg-sky-50/50"
                  )}>{e}</button>
              ))}
            </div>
          </div>

          {/* Name + Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Nama Paket *</Label>
              <Input
                className="h-8 text-[12.5px] rounded-xl"
                placeholder="Umrah Ramadhan"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Destinasi *</Label>
              <Select value={form.destination} onValueChange={(v) => setForm((f) => ({ ...f, destination: v }))}>
                <SelectTrigger className="h-8 text-[12.5px] rounded-xl">
                  <SelectValue placeholder="Pilih rute" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mekkah - Madinah - Thaif">Mekkah - Madinah - Thaif</SelectItem>
                  <SelectItem value="Mekkah - Madinah">Mekkah - Madinah</SelectItem>
                  <SelectItem value="Madinah - Mekkah">Madinah - Mekkah</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Berangkat *</Label>
              <Input className="h-8 text-[12.5px] rounded-xl" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Pulang *</Label>
              <Input className="h-8 text-[12.5px] rounded-xl" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>

          {/* Quota & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Kuota Pax (opsional)</Label>
              <Input
                className="h-8 text-[12.5px] rounded-xl"
                type="number" min={1} inputMode="numeric"
                placeholder="cth: 40"
                value={form.quotaPax}
                onChange={(e) => setForm((f) => ({ ...f, quotaPax: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Harga / Pax (IDR)</Label>
              <Input
                className="h-8 text-[12.5px] rounded-xl"
                type="number" min={0} inputMode="numeric"
                placeholder="cth: 35000000"
                value={form.pricePerPax}
                onChange={(e) => setForm((f) => ({ ...f, pricePerPax: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-snug -mt-1">
            Harga dipakai buat hitung sisa tagihan jamaah & alert H-30 belum lunas.
          </p>

          {/* Footer */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="flex-1 h-9 rounded-xl text-[12.5px] font-semibold bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-9 rounded-xl text-[12.5px] font-bold text-white transition-all disabled:opacity-50"
              style={{ background: "#0866FF" }}
            >
              {loading ? "Menyimpan…" : "Simpan Paket"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── TRIP CARD ──────────────────────────────────────────────────────────────────
function TripCard({ trip, onDelete }: { trip: Trip; onDelete: (t: Trip) => void }) {
  const navigate = useNavigate();
  const patchTrip = useTripsStore((s) => s.patchTrip);
  const [from, to] = cardGradient(trip.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await patchTrip(trip.id, { coverImage: reader.result as string });
      toast.success("Foto cover berhasil diperbarui.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <motion.div
      className="group relative rounded-xl md:rounded-2xl overflow-hidden cursor-pointer border border-[hsl(var(--border))] bg-white"
      onClick={() => navigate(`/trips/${trip.id}`)}
      variants={fadeUp}
      whileHover={{ y: -3, boxShadow: "0 10px 28px -6px hsl(198 92% 39% / 0.14)" }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Cover area */}
      <div
        className="relative h-16 sm:h-28 md:h-40 flex items-center justify-center overflow-hidden"
        style={trip.coverImage ? {} : { background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        {trip.coverImage ? (
          <img
            src={trip.coverImage}
            alt={trip.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span className="text-2xl md:text-7xl drop-shadow-lg select-none">{trip.emoji}</span>
        )}

        {/* Overlay gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

        {/* Duration badge */}
        <span className="absolute bottom-1.5 left-1.5 md:bottom-3 md:left-3 text-[9px] md:text-[11px] font-semibold bg-white/20 backdrop-blur-sm text-white px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full z-10">
          {nightCount(trip.startDate, trip.endDate)}
        </span>

        {/* Change photo button */}
        <button
          className="absolute bottom-2 right-2 md:bottom-3 md:right-3 h-6 w-6 md:h-7 md:w-7 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/50 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-10"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          title="Ganti foto"
        >
          <Camera strokeWidth={1.5} className="h-3.5 w-3.5 text-white" />
        </button>

        {/* Delete */}
        <button
          className="absolute top-2 right-2 md:top-3 md:right-3 h-6 w-6 md:h-7 md:w-7 rounded-full bg-white/20 backdrop-blur-sm hover:bg-red-500 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-10"
          onClick={(e) => { e.stopPropagation(); onDelete(trip); }}
          title="Hapus paket"
        >
          <Trash2 strokeWidth={1.5} className="h-3.5 w-3.5 text-white" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
      </div>

      {/* Info */}
      <div className="p-2 md:p-3.5">
        <h3 className="font-semibold text-[11.5px] md:text-[13.5px] text-[hsl(var(--foreground))] line-clamp-1 leading-tight">{trip.name}</h3>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] md:text-xs text-[hsl(var(--muted-foreground))]">
          <MapPin strokeWidth={1.5} className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0 text-[hsl(var(--primary))]" />
          <span className="line-clamp-1">{trip.destination}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] md:text-xs text-[hsl(var(--muted-foreground))]">
          <CalendarIcon strokeWidth={1.5} className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />
          <span className="truncate">{formatDate(trip.startDate)} – {formatDate(trip.endDate)}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── RIGHT PANEL ────────────────────────────────────────────────────────────────
function RightPanel({ trips, totalJamaah }: { trips: Trip[]; totalJamaah: number }) {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const rates = useRatesStore((s) => s.rates);

  const upcoming = [...trips]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 4);

  const active = trips.filter((t) => new Date(t.endDate).getTime() >= Date.now()).length;
  const done = trips.length - active;

  return (
    <div className="w-64 xl:w-72 shrink-0 flex flex-col overflow-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="p-5 space-y-5">
        {/* Mini calendar */}
        <div>
          <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))] mb-3">Kalender</h3>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-2 overflow-hidden">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="w-full"
              classNames={{
                months: "w-full",
                month: "w-full space-y-2",
                caption: "flex justify-center items-center gap-2 px-1 pt-1",
                caption_label: "text-[13px] font-semibold text-[hsl(var(--foreground))]",
                nav: "flex items-center gap-1",
                nav_button: cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center",
                  "bg-white border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]",
                  "hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--primary))] transition-smooth"
                ),
                nav_button_previous: "",
                nav_button_next: "",
                table: "w-full border-collapse",
                head_row: "flex w-full",
                head_cell: "text-[hsl(var(--muted-foreground))] text-[11px] font-medium flex-1 text-center py-1",
                row: "flex w-full mt-1",
                cell: "flex-1 text-center text-[12px] relative p-0",
                day: cn(
                  "h-7 w-7 mx-auto rounded-lg font-medium text-[12px]",
                  "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--primary))]",
                  "transition-smooth"
                ),
                day_selected: "!bg-[hsl(var(--primary))] !text-white !rounded-lg hover:!bg-[hsl(var(--primary))]",
                day_today: "font-bold text-[hsl(var(--primary))] underline decoration-[hsl(var(--primary))]",
                day_outside: "text-[hsl(var(--muted-foreground))] opacity-40",
                day_disabled: "text-[hsl(var(--muted-foreground))] opacity-30",
              }}
            />
          </div>
        </div>

        {/* Upcoming trips */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))]">Jadwal Terdekat</h3>
            <button className="text-[11px] text-[hsl(var(--primary))] font-medium hover:underline">Lihat semua</button>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-8 text-xs text-[hsl(var(--muted-foreground))]">
              Belum ada jadwal trip.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcoming.map((trip) => {
                const [from] = cardGradient(trip.id);
                const countDown = daysUntil(trip.startDate);
                const isPast = countDown === "Selesai";
                return (
                  <div key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-2.5 cursor-pointer hover:border-primary/30 hover:bg-accent/40 transition-colors">
                    <div className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-lg md:text-2xl overflow-hidden"
                      style={{ background: `${from}22` }}>
                      {trip.coverImage ? (
                        <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <span className="text-xl">{trip.emoji}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[hsl(var(--foreground))] truncate">{trip.name}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                        <CalendarIcon strokeWidth={1.5} className="h-3 w-3 shrink-0" />
                        <span>{formatShortDate(trip.startDate)} – {formatShortDate(trip.endDate)}</span>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap",
                      isPast ? "bg-gray-100 text-gray-500" : "bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"
                    )}>
                      {countDown}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transportation quick access */}
        <div>
          <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))] mb-3">Transportasi</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Plane, label: "Pesawat", path: "/orders/flight" },
              { icon: Bus,   label: "Bus",     path: "/orders" },
              { icon: Train, label: "Kereta",  path: "/orders" },
            ].map((t) => (
              <button key={t.label}
                onClick={() => navigate(t.path)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-smooth group active:scale-95">
                <t.icon strokeWidth={1.5} className="h-5 w-5" />
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Laporan ringkasan */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))]">Ringkasan Laporan</h3>
            <button
              onClick={() => navigate("/progress")}
              className="text-[11px] text-[hsl(var(--primary))] font-medium hover:underline"
            >
              Lihat detail
            </button>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3.5 space-y-3">
            {[
              { icon: Plane, label: "Total Paket Trip", value: trips.length },
              { icon: CheckCircle, label: "Trip Selesai", value: done },
              { icon: TrendingUp, label: "Trip Berjalan", value: active },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="h-8 w-8 flex items-center justify-center shrink-0">
                  <item.icon strokeWidth={1.5} className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] text-[hsl(var(--muted-foreground))]">{item.label}</p>
                </div>
                <span className="text-[14px] font-bold text-[hsl(var(--foreground))]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Kalkulator cepat */}
        <div>
          <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))] mb-3">Kalkulator</h3>
          <div
            onClick={() => navigate("/calculator")}
            className="rounded-2xl border border-[hsl(var(--border))] bg-white p-3.5 cursor-pointer hover:border-[hsl(var(--primary))] hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 flex items-center justify-center shrink-0">
                <Calculator strokeWidth={1.5} className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[hsl(var(--foreground))]">Kalkulator Paket</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Hitung biaya trip + PDF</p>
              </div>
              <ArrowRight strokeWidth={1.5} className="h-4 w-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
            </div>
            {/* Rate preview */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { currency: "USD", rate: rates.USD },
                { currency: "SAR", rate: rates.SAR },
              ].map((r) => (
                <div key={r.currency} className="rounded-xl bg-[hsl(var(--secondary))] px-2.5 py-2 text-center">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{r.currency} → IDR</p>
                  <p className="text-[12px] font-bold text-[hsl(var(--foreground))]">
                    {r.rate.toLocaleString("id-ID")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Laporan lengkap cta */}
        <button
          onClick={() => navigate("/progress")}
          className="w-full flex items-center gap-2.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-3 hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-all group"
        >
          <FileBarChart strokeWidth={1.5} className="h-4.5 w-4.5 text-[hsl(var(--primary))]" />
          <span className="text-[13px] font-medium text-[hsl(var(--foreground))] flex-1 text-left">Lihat Laporan Lengkap</span>
          <ArrowRight strokeWidth={1.5} className="h-4 w-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
        </button>
      </div>
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
// ── PAYMENT ALERTS (H-30 belum lunas) ──────────────────────────────────────────
interface UnpaidAlert {
  jamaah: Jamaah;
  trip: Trip;
  daysLeft: number;
  paid: number;
  outstanding: number;
}

function fmtIDRShort(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function PaymentAlerts({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<UnpaidAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [allJamaah, allPayments] = await Promise.all([
          listAllAgencyJamaah(),
          listAllAgencyPayments(),
        ]);
        if (cancelled) return;
        const byJamaah = new Map<string, Payment[]>();
        for (const p of allPayments) {
          const arr = byJamaah.get(p.jamaahId) ?? [];
          arr.push(p);
          byJamaah.set(p.jamaahId, arr);
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tripById = new Map(trips.map((t) => [t.id, t] as const));
        const out: UnpaidAlert[] = [];
        for (const j of allJamaah) {
          const trip = tripById.get(j.tripId);
          if (!trip || !trip.startDate || !trip.pricePerPax || trip.pricePerPax <= 0) continue;
          const dep = new Date(trip.startDate);
          if (isNaN(dep.getTime())) continue;
          const days = Math.ceil((dep.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (days < 0 || days > 30) continue;
          const paid = sumPaid(byJamaah.get(j.id) ?? []);
          const outstanding = trip.pricePerPax - paid;
          if (outstanding <= 0) continue;
          out.push({ jamaah: j, trip, daysLeft: days, paid, outstanding });
        }
        out.sort((a, b) => a.daysLeft - b.daysLeft);
        setAlerts(out);
      } catch (err) {
        console.error("[payment-alerts]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trips]);

  if (loading) return null;
  if (alerts.length === 0) return null;

  const totalOutstanding = alerts.reduce((s, a) => s + a.outstanding, 0);

  return (
    <motion.div
      className="mb-1.5 md:mb-5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.14, ease: "easeOut" }}
    >
      <div className="rounded-xl md:rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-sky-50 overflow-hidden">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-red-100/40 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
              <Wallet strokeWidth={2} className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="text-left min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-[12px] md:text-[14px] font-bold text-red-700">Tagihan Belum Lunas (H-30)</h2>
                <span className="h-4 px-1.5 rounded-full bg-red-500 text-white text-[9.5px] font-bold flex items-center">{alerts.length}</span>
              </div>
              <p className="text-[10px] text-red-600/80 truncate">
                Kurang bayar: <strong>{fmtIDRShort(totalOutstanding)}</strong>
              </p>
            </div>
          </div>
          <ChevronRight strokeWidth={2} className={cn("h-3.5 w-3.5 text-red-500 shrink-0 transition-transform", !collapsed && "rotate-90")} />
        </button>

        {!collapsed && (
          <div className="px-2.5 pb-2.5 space-y-1.5">
            {alerts.slice(0, 8).map((a) => (
              <button
                key={a.jamaah.id}
                onClick={() => navigate(`/trips/${a.trip.id}/jamaah/${a.jamaah.id}`)}
                className="w-full flex items-center gap-2.5 rounded-xl bg-white border border-red-100 p-2 hover:border-red-300 hover:shadow-sm transition-all text-left"
              >
                <div className={cn(
                  "h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-white text-[11px] font-bold",
                  a.daysLeft <= 7 ? "bg-red-500" : a.daysLeft <= 14 ? "bg-sky-500" : "bg-amber-500"
                )}>
                  {a.daysLeft <= 0 ? "H!" : `H-${a.daysLeft}`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[hsl(var(--foreground))] truncate">{a.jamaah.name}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">
                    {a.trip.emoji} {a.trip.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11.5px] font-bold text-red-600 leading-tight">{fmtIDRShort(a.outstanding)}</p>
                  <p className="text-[9.5px] text-[hsl(var(--muted-foreground))] mt-0.5">kurang</p>
                </div>
                <ChevronRight strokeWidth={1.5} className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] shrink-0" />
              </button>
            ))}
            {alerts.length > 8 && (
              <p className="text-center text-[11px] text-red-600/70 pt-1">
                +{alerts.length - 8} jamaah lainnya — buka tiap paket buat detail.
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { trips, loadingTrips, fetchTrips, removeTrip, loaded: tripsLoaded } = useTripsStore();
  const { items: packages, loaded: packagesLoaded, refresh: refreshPackages } = usePackagesStore();
  const { orders, fetchOrders, loaded: ordersLoaded } = useOrdersStore();
  const { clients, fetchClients, loaded: clientsLoaded } = useClientsStore();
  const user = useAuthStore((s) => s.user);
  const agencyId = user?.agencyId;
  const { language } = useRegionalStore();
  const locale = getLocale(language);
  const t = useT();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [tab, setTab] = useState<"all" | "upcoming" | "done">("all");
  const [totalJamaah, setTotalJamaah] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const storageKey = `onboarding_done_${agencyId}`;
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (!agencyId) return false;
    const raw = localStorage.getItem(`onboarding_done_${agencyId}`);
    if (!raw) return true;
    const done = JSON.parse(raw);
    return !done.dismissed && Object.values(done).filter(Boolean).length < 4;
  });
  const [onboardingDone, setOnboardingDone] = useState<Record<string, boolean>>(() => {
    if (!agencyId) return {};
    return JSON.parse(localStorage.getItem(`onboarding_done_${agencyId}`) || "{}");
  });

  const checkItem = (key: string) => {
    const updated = { ...onboardingDone, [key]: true };
    setOnboardingDone(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (Object.keys(updated).filter(k => k !== "dismissed" && updated[k]).length >= 4) {
      setShowOnboarding(false);
    }
  };

  // ── Financial stats for desktop summary cards ─────────────────────────────
  const egpRate = useRatesStore((s) => s.rates.EGP);
  const now = new Date();
  const thisMonthStr = now.toISOString().slice(0, 7);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = prevDate.toISOString().slice(0, 7);

  const thisMonthOrders = orders.filter((o) => o.createdAt?.startsWith(thisMonthStr));
  const lastMonthOrders = orders.filter((o) => o.createdAt?.startsWith(lastMonthStr));
  const thisMonthClients = clients.filter((c) => c.createdAt?.startsWith(thisMonthStr)).length;
  const lastMonthClients = clients.filter((c) => c.createdAt?.startsWith(lastMonthStr)).length;

  const totalRevenue = orders.reduce((s, o) => s + revenueIDR(o, egpRate), 0);
  const totalProfit = orders.reduce((s, o) => s + netProfitIDR(o, egpRate), 0);
  const thisMonthRevenue = thisMonthOrders.reduce((s, o) => s + revenueIDR(o, egpRate), 0);
  const lastMonthRevenue = lastMonthOrders.reduce((s, o) => s + revenueIDR(o, egpRate), 0);
  const thisMonthProfit = thisMonthOrders.reduce((s, o) => s + netProfitIDR(o, egpRate), 0);
  const lastMonthProfit = lastMonthOrders.reduce((s, o) => s + netProfitIDR(o, egpRate), 0);

  function growthPct(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  function fmtStatValue(n: number): string {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)} Jt`;
    if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }

  const clientsGrowth = growthPct(thisMonthClients, lastMonthClients);
  const ordersGrowth = growthPct(thisMonthOrders.length, lastMonthOrders.length);
  const revenueGrowth = growthPct(thisMonthRevenue, lastMonthRevenue);
  const profitGrowth = growthPct(thisMonthProfit, lastMonthProfit);

  const STATUS_LABELS: Record<string, string> = {
    Draft: t.status_draft,
    Calculated: t.status_calculated,
    Confirmed: t.status_confirmed,
    Paid: t.status_paid,
    Completed: t.status_completed,
  };

  useEffect(() => { if (!tripsLoaded) fetchTrips(); }, [tripsLoaded, fetchTrips]);
  useEffect(() => { if (!packagesLoaded) refreshPackages(); }, [packagesLoaded, refreshPackages]);
  useEffect(() => { if (!ordersLoaded) void fetchOrders(); }, [ordersLoaded, fetchOrders]);
  useEffect(() => { if (!clientsLoaded) void fetchClients(); }, [clientsLoaded, fetchClients]);
  useEffect(() => {
    if (!user?.agencyId) return;
    let alive = true;
    countAllAgencyJamaah()
      .then((n) => { if (alive) setTotalJamaah(n); })
      .catch(() => { if (alive) setTotalJamaah(0); });
    return () => { alive = false; };
  }, [trips.length, user?.agencyId]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [, , count] = await Promise.all([
        fetchTrips(),
        refreshPackages(),
        countAllAgencyJamaah().catch(() => 0),
      ]);
      setTotalJamaah(count);
      toast.success("Data dashboard diperbarui dari Supabase.");
    } catch (err) {
      toast.error(`Gagal memuat ulang: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = trips.filter((t) => {
    if (tab === "all") return true;
    const past = new Date(t.endDate).getTime() < Date.now();
    return tab === "done" ? past : !past;
  });

  const activeTrips = trips.filter((t) => new Date(t.endDate).getTime() >= Date.now()).length;
  const doneTrips = trips.length - activeTrips;

  const pendingPackages = packages.filter((p) => !["Paid", "Completed"].includes(p.status));
  const nearestDeparture = [...packages]
    .filter((p) => p.departureDate && new Date(p.departureDate + "T00:00:00").getTime() >= Date.now())
    .sort((a, b) => new Date(a.departureDate!).getTime() - new Date(b.departureDate!).getTime())[0];

  const flightOrders = orders.filter((o) => o.type === "flight").length;
  const visaMesirOrders = orders.filter((o) => o.type === "visa_student").length;
  const voaOrders = orders.filter((o) => o.type === "visa_voa").length;
  const totalSalesOrders = flightOrders + visaMesirOrders + voaOrders;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeTrip(deleteTarget.id);
      toast.success(`Paket "${deleteTarget.name}" dihapus.`);
      setDeleteTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hapus trip gagal.";
      console.error("[Dashboard] hapus trip gagal:", err);
      toast.error(msg);
    }
  };

  return (
    <div className="xl:flex xl:min-h-0 xl:gap-5 md:pt-2">
      {showOnboarding && (
        <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 xl:hidden">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
              Selesaikan setup awal ({Object.keys(onboardingDone).filter(k => k !== "dismissed" && onboardingDone[k]).length}/4 selesai)
            </p>
            <button onClick={() => {
              const updated = { ...onboardingDone, dismissed: true };
              localStorage.setItem(storageKey, JSON.stringify(updated));
              setShowOnboarding(false);
            }} className="text-blue-400 hover:text-blue-600 text-xs">Tutup</button>
          </div>
          {[
            { key: "logo",   label: "Upload logo agency",      path: "/settings" },
            { key: "member", label: "Undang anggota pertama",  path: "/agent-center" },
            { key: "paket",  label: "Buat paket pertama",      path: "/packages" },
            { key: "order",  label: "Buat order pertama",      path: "/orders" },
          ].map(item => (
            <div key={item.key} className="flex items-center gap-3 py-1.5">
              <button onClick={() => checkItem(item.key)} className={cn(
                "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                onboardingDone[item.key] ? "bg-blue-600 border-blue-600" : "border-blue-300"
              )}>
                {onboardingDone[item.key] && <CheckCircle className="h-3 w-3 text-white" />}
              </button>
              <button onClick={() => navigate(item.path)} className="text-sm text-blue-700 dark:text-blue-300 hover:underline text-left">
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
           MOBILE LAYOUT  (hidden on md+) — Native App Style
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden">
        <MobileOwnerDashboard />
        {/* Legacy shell kept for reference — hidden via parent wrapper */}
        <div className="hidden"><TravelMobileShell>
          <div className="pb-28 space-y-5">

            {/* ── Hero card ── */}
            <div className="px-4 pt-1">
              <TravelHeroCard
                greeting="Assalamu'alaikum,"
                title={(user?.displayName?.split(" ")[0] ?? "Admin") + "!"}
                subtitle={user?.agencyName ?? "Mau kelola apa hari ini?"}
                rightSlot={
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="h-9 w-9 rounded-full bg-white/15 border border-white/25 flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-40"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <RefreshCw strokeWidth={2} className={cn("h-4 w-4 text-white", refreshing && "animate-spin")} />
                  </button>
                }
              >
                {/* Sales stats row inside hero */}
                <div className="flex mt-3 pt-3 border-t border-white/15">
                  {[
                    { label: "Tiket Pesawat", value: flightOrders,    emoji: "✈️" },
                    { label: "Visa Mesir",    value: visaMesirOrders, emoji: "🇪🇬" },
                    { label: "VOA",           value: voaOrders,       emoji: "🛂" },
                  ].map((s, i) => (
                    <div key={s.label} className={cn("flex-1 text-center flex flex-col items-center gap-0.5", i > 0 && "border-l border-white/15")}>
                      <span className="text-[15px] leading-none">{s.emoji}</span>
                      <p className="text-[22px] font-black font-mono text-white tabular-nums leading-none mt-0.5">{s.value}</p>
                      <p className="text-[7px] text-sky-200/70 uppercase tracking-wide font-semibold leading-tight mt-0.5 px-1">{s.label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate("/orders")}
                  className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-sky-200 active:opacity-60 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  Lihat Semua Order <ArrowRight className="h-3 w-3" />
                </button>
              </TravelHeroCard>
            </div>

            {/* ── Search bar ── */}
            <div className="px-4">
              <TravelSearchBar
                placeholder="Cari order, klien, tiket..."
                onClick={() => navigate("/clients")}
              />
            </div>

            {/* ── Service grid ── */}
            <div className="px-4">
              <TravelSection title="Menu Utama" onSeeAll={() => setAddOpen(true)} seeAllLabel="+ Trip Baru">
                <TravelServiceGrid
                  cols={4}
                  onNavigate={navigate}
                  items={[
                    { icon: ShoppingBag,  label: "Pesanan",    path: "/orders",        color: "#8b5cf6", bg: "rgba(139,92,246,0.09)"  },
                    { icon: Users,        label: "Klien",      path: "/clients",       color: "#0ea5e9", bg: "rgba(8,102,255,0.09)"   },
                    { icon: Ticket,       label: "Harga Tiket",path: "/ticket-prices", color: "#f59e0b", bg: "rgba(245,158,11,0.09)"   },
                    { icon: Package,      label: "Paket/Trip", path: "/packages",      color: "#10b981", bg: "rgba(16,185,129,0.09)"   },
                    { icon: StickyNote,   label: "Catatan",    path: "/notes",         color: "#ec4899", bg: "rgba(236,72,153,0.09)"   },
                    { icon: Calculator,   label: "Kalkulator", path: "/calculator",    color: "#0866FF", bg: "rgba(0,102,255,0.09)"    },
                    { icon: BookUser,     label: "Agen/Staff", path: "/agent-center",  color: "#f97316", bg: "rgba(249,115,22,0.09)"   },
                    { icon: Settings,     label: "Pengaturan", path: "/settings",      color: "#667085", bg: "rgba(102,112,133,0.09)"  },
                  ]}
                />
              </TravelSection>
            </div>

            {/* ── Quick stats 2×2 grid ── */}
            <div className="px-4">
              <TravelSection title="Ringkasan">
                <div className="grid grid-cols-2 gap-3">
                  <TravelStatCard
                    label="Total Order"
                    value={orders.length}
                    subtitle={`${totalSalesOrders} tiket & visa`}
                    icon={<ShoppingBag className="h-4 w-4" strokeWidth={1.8} />}
                    tone="blue"
                    onClick={() => navigate("/orders")}
                  />
                  <TravelStatCard
                    label="Total Klien"
                    value={clients.length}
                    icon={<Users className="h-4 w-4" strokeWidth={1.8} />}
                    tone="green"
                    onClick={() => navigate("/clients")}
                  />
                  <TravelStatCard
                    label="Paket Trip"
                    value={packages.length}
                    subtitle={pendingPackages.length > 0 ? `${pendingPackages.length} perlu tindakan` : `${activeTrips} aktif`}
                    icon={<Package className="h-4 w-4" strokeWidth={1.8} />}
                    tone="yellow"
                    onClick={() => navigate("/packages")}
                  />
                  <TravelStatCard
                    label="Total Jamaah"
                    value={totalJamaah}
                    icon={<Users className="h-4 w-4" strokeWidth={1.8} />}
                    tone="navy"
                  />
                </div>
              </TravelSection>
            </div>

            {/* ── Promo / quick action carousel ── */}
            <div>
              <div className="px-4 mb-3">
                <h3 className="text-[14px] font-bold text-[#071133]">Aksi Cepat</h3>
              </div>
              <TravelPromoCarousel
                items={[
                  {
                    title: "Follow Up Order Pending",
                    subtitle: `${orders.filter(o => ["Draft","Confirmed","Processing"].includes(o.status ?? "")).length} order perlu tindak lanjut`,
                    cta: "Buka Order",
                    emoji: "📋",
                    gradient: "linear-gradient(135deg, #0057E7 0%, #33A6FF 100%)",
                    onClick: () => navigate("/orders"),
                  },
                  {
                    title: "Cek Harga Tiket",
                    subtitle: "Harga tiket pesawat terbaru untuk klien",
                    cta: "Lihat Tiket",
                    emoji: "✈️",
                    gradient: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
                    onClick: () => navigate("/ticket-prices"),
                  },
                  {
                    title: "Broadcast Promo",
                    subtitle: "Kirim template promo ke klien via WhatsApp",
                    cta: "Buat Template",
                    emoji: "📣",
                    gradient: "linear-gradient(135deg, #059669 0%, #34D399 100%)",
                    onClick: () => navigate("/bc-templates"),
                  },
                  pendingPackages.length > 0
                    ? {
                        title: "Paket Perlu Tindakan",
                        subtitle: `${pendingPackages.length} paket butuh perhatian segera`,
                        cta: "Lihat Paket",
                        emoji: "⚠️",
                        gradient: "linear-gradient(135deg, #D97706 0%, #FCD34D 100%)",
                        onClick: () => navigate("/packages"),
                      }
                    : {
                        title: "Kalkulator Paket",
                        subtitle: "Hitung biaya umrah & trip dengan kalkulator cepat",
                        cta: "Buka Kalkulator",
                        emoji: "🧮",
                        gradient: "linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)",
                        onClick: () => navigate("/calculator"),
                      },
                ]}
              />
            </div>

            {/* ── Alerts ── */}
            <div className="px-4 space-y-3">
              <DepartureTodayAlert packages={packages} orders={orders} clients={clients} />
              <PaymentAlerts trips={trips} />
            </div>

            {/* ── Owner-only widgets ── */}
            {user?.role === "owner" && (
              <div className="px-4 space-y-3">
                <MitraLeaderboardCard />
                <CeoDailyQuest />
              </div>
            )}

            {/* ── PNR + Admin WA ── */}
            <div className="px-4 space-y-3">
              <PNRCommandCenter />
              <AdminWhatsappCard />
            </div>

            {/* ── Recent orders ── */}
            {orders.length > 0 && (
              <div className="px-4">
                <TravelSection title="Order Terbaru" onSeeAll={() => navigate("/orders")}>
                  <div className="space-y-2.5">
                    {[...orders]
                      .sort((a, b) => new Date(b.createdAt ?? "").getTime() - new Date(a.createdAt ?? "").getTime())
                      .slice(0, 4)
                      .map((order) => {
                        const client = clients.find((c) => c.id === order.clientId);
                        const TYPE_LABEL: Record<string, string> = {
                          flight: "✈️ Tiket Pesawat",
                          visa_student: "🇪🇬 Visa Mesir",
                          visa_voa: "🛂 VOA",
                          other: "📋 Lainnya",
                        };
                        const STATUS_TONE: Record<string, "blue" | "green" | "yellow" | "red" | "gray" | "purple"> = {
                          Draft: "gray", Confirmed: "yellow", Processing: "blue",
                          Completed: "green", Cancelled: "red", Paid: "purple",
                        };
                        return (
                          <TravelListCard
                            key={order.id}
                            title={order.title ?? TYPE_LABEL[order.type] ?? "Order"}
                            subtitle={client?.name}
                            meta={TYPE_LABEL[order.type]}
                            badge={order.status}
                            badgeTone={STATUS_TONE[order.status ?? ""] ?? "gray"}
                            avatar={
                              <div className="h-10 w-10 rounded-xl bg-[#F0F4FF] flex items-center justify-center shrink-0">
                                <ShoppingBag className="h-[18px] w-[18px] text-[#0866FF]" strokeWidth={1.8} />
                              </div>
                            }
                            onClick={() => navigate(`/orders/${order.id}`)}
                          />
                        );
                      })}
                  </div>
                </TravelSection>
              </div>
            )}

            {/* ── LiveClock ── */}
            <div className="px-4">
              <LiveClock compact />
            </div>

            {/* ── Package status chips ── */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 px-4">
              {([
                { icon: Star,        label: t.dash_total_packages,     value: packages.length,                                       color: "text-amber-600 bg-amber-50 border-amber-200"  },
                { icon: AlertCircle, label: t.dash_need_action,        value: pendingPackages.length,                                color: pendingPackages.length > 0 ? "text-red-600 bg-red-50 border-red-200" : "text-gray-400 bg-gray-50 border-gray-200" },
                { icon: Clock,       label: t.dash_paid_packages,      value: packages.filter(p => p.status === "Paid").length,      color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                { icon: CheckCircle, label: t.dash_completed_packages, value: packages.filter(p => p.status === "Completed").length, color: "text-purple-600 bg-purple-50 border-purple-200" },
              ] as const).map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate("/packages")}
                  className={cn("shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full border text-[10px] font-semibold active:scale-95 transition-transform", item.color)}
                >
                  <item.icon strokeWidth={2} className="h-3.5 w-3.5" />
                  <span className="tabular-nums font-extrabold">{item.value}</span>
                  <span className="opacity-75">{item.label}</span>
                </button>
              ))}
            </div>

            {/* ── Trip / Packages section ── */}
            <div className="px-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-[14px] font-bold text-[#071133]">{t.dash_packages_title}</h2>
                <div className="flex gap-2.5">
                  {(["all", "upcoming", "done"] as const).map((key) => {
                    const labels = { all: t.dash_filter_all, upcoming: t.dash_filter_active, done: t.dash_filter_done };
                    return (
                      <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={cn("text-[9px] font-semibold pb-0.5 border-b-2 transition-colors", tab === key ? "border-[#0866FF] text-[#0866FF]" : "border-transparent text-[#667085]")}
                      >{labels[key]}</button>
                    );
                  })}
                </div>
              </div>

              {loadingTrips ? (
                <div className="grid gap-2.5 grid-cols-2">
                  {[1, 2].map(i => (
                    <div key={i} className="rounded-2xl border border-[#E5EAF3] overflow-hidden animate-pulse bg-white">
                      <div className="h-16 bg-[#F5F7FB]" />
                      <div className="p-2.5 space-y-1.5">
                        <div className="h-3 bg-[#E5EAF3] rounded-full w-3/4" />
                        <div className="h-2.5 bg-[#E5EAF3] rounded-full w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-[#E5EAF3] bg-white px-4 py-8 text-center flex flex-col items-center" style={{ boxShadow: "0 8px 24px rgba(10,31,68,0.08)" }}>
                  <div className="h-14 w-14 rounded-2xl bg-[#F0F4FF] flex items-center justify-center mb-3">
                    <Plane strokeWidth={1.5} className="h-7 w-7 text-[#0866FF]" />
                  </div>
                  <p className="text-[13px] font-bold text-[#071133]">{t.dash_no_packages}</p>
                  <p className="text-[10.5px] text-[#667085] mt-1 leading-snug max-w-[200px]">{t.dash_no_packages_desc}</p>
                  <button
                    onClick={() => setAddOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 h-9 px-5 rounded-full text-[11.5px] font-bold text-white shadow-md active:scale-95 transition-transform"
                    style={{ background: "linear-gradient(135deg,#0866FF,#0654D6)" }}
                  >
                    <Plus strokeWidth={2} className="h-3.5 w-3.5" /> {t.dash_create_first}
                  </button>
                </div>
              ) : (
                <div className="grid gap-2.5 grid-cols-2">
                  {filtered.map((trip) => <TripCard key={trip.id} trip={trip} onDelete={setDeleteTarget} />)}
                  <button
                    onClick={() => setAddOpen(true)}
                    className="rounded-2xl border-2 border-dashed border-[#E5EAF3] flex flex-col items-center justify-center gap-2 min-h-[80px] hover:border-[#0866FF] hover:bg-[#F0F4FF] transition-all group active:scale-[0.98]"
                  >
                    <Plus strokeWidth={1.5} className="h-4 w-4 text-[#667085] group-hover:text-[#0866FF]" />
                    <span className="text-[10.5px] text-[#667085] group-hover:text-[#0866FF] font-medium">{t.dash_add_package}</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </TravelMobileShell>
        </div>{/* end hidden legacy shell */}
      </div>

      {/* ══════════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden on mobile)
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block xl:flex-1 xl:min-w-0 pb-8 md:pl-12 md:pr-6">

        {/* ── Greeting hero ── */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="rounded-3xl p-6 md:p-8 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#0a1317 0%,#1c1e21 50%,#0866FF 100%)" }}
          >
            {/* Decorative background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 65%)" }} />
              <div className="absolute -bottom-16 left-1/3 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(8,102,255,0.35) 0%, transparent 70%)" }} />
              <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
            </div>

            <div className="relative flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-[26px] md:text-[30px] font-black text-white leading-tight tracking-tight">
                  {getGreeting(user?.displayName ?? "Admin", t)} 👋
                </h1>
                <p className="text-[11.5px] text-sky-300/70 capitalize mt-1 font-medium">
                  {formatTodayFull(locale)}
                </p>
                {nearestDeparture ? (
                  <button onClick={() => navigate("/packages")} className="flex items-center gap-2 mt-3 w-fit px-3 py-2 rounded-xl backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-white/15 transition-colors active:opacity-80" style={{ background: "rgba(255,255,255,0.09)" }}>
                    <Plane strokeWidth={2} className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    <span className="text-[11px] text-sky-200/80">{t.dash_nearest_departure}</span>
                    <strong className="text-[11px] text-white truncate max-w-[180px] font-bold">{nearestDeparture.name}</strong>
                    <span className="text-[11px] text-sky-300 shrink-0 font-semibold">· {daysUntil(nearestDeparture.departureDate!)}</span>
                  </button>
                ) : (
                  <p className="text-[11px] text-sky-300/60 mt-2 italic">{t.dash_no_schedule}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium text-white/70 hover:text-white border border-white/15 hover:border-white/30 transition disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.09)" }}
              >
                <RefreshCw strokeWidth={2.2} className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                {refreshing ? "Memuat…" : "Refresh"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── 4 Stats cards ── */}
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {[
            {
              icon: Users,
              label: "Total Klien",
              value: clients.length.toLocaleString("id-ID"),
              growth: clientsGrowth,
              iconColor: "#f59e0b",
              iconBg: "rgba(245,158,11,0.1)",
              onClick: () => navigate("/clients"),
            },
            {
              icon: ShoppingBag,
              label: "Total Order",
              value: orders.length.toLocaleString("id-ID"),
              growth: ordersGrowth,
              iconColor: "#10b981",
              iconBg: "rgba(16,185,129,0.1)",
              onClick: () => navigate("/orders"),
            },
            {
              icon: TrendingUp,
              label: "Total Pendapatan",
              value: fmtStatValue(totalRevenue),
              growth: revenueGrowth,
              iconColor: "#6366f1",
              iconBg: "rgba(99,102,241,0.1)",
              onClick: () => navigate("/reports"),
            },
            {
              icon: FileBarChart,
              label: "Total Keuntungan",
              value: fmtStatValue(totalProfit),
              growth: profitGrowth,
              iconColor: "#0ea5e9",
              iconBg: "rgba(8,102,255,0.1)",
              onClick: () => navigate("/reports"),
            },
          ].map((stat) => (
            <motion.button
              key={stat.label}
              onClick={stat.onClick}
              variants={fadeUp}
              className="relative text-left bg-white border border-[hsl(var(--border))] rounded-2xl p-4 hover:shadow-md hover:-translate-y-[1px] transition-all duration-200 active:scale-[0.98] overflow-hidden"
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mb-3"
                style={{ background: stat.iconBg }}
              >
                <stat.icon strokeWidth={1.6} className="h-5 w-5" style={{ color: stat.iconColor }} />
              </div>
              <p className="text-[26px] font-black font-mono text-slate-900 leading-none tabular-nums">{stat.value}</p>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium">{stat.label}</p>
              <div className="mt-2 flex items-center gap-1">
                <TrendingUp strokeWidth={2} className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-[10.5px] font-bold text-emerald-600">+{Math.abs(stat.growth)}%</span>
                <span className="text-[10px] text-slate-400 ml-0.5">vs bulan lalu</span>
              </div>
            </motion.button>
          ))}
        </motion.div>

        {/* ── 2-col: Waktu Dunia | WhatsApp Admin ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <LiveClock />
          <AdminWhatsappCard />
        </div>

        {/* ── CEO Daily Quest — owner only ── */}
        {user?.role === "owner" && <CeoDailyQuest />}




      </div>

      {/* ── Right panel (desktop only) ── */}
      <div className="hidden xl:block xl:shrink-0">
        <RightPanel trips={trips} totalJamaah={totalJamaah} />
      </div>

      <AddTripDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: "#fff", color: "hsl(var(--foreground))" }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dash_delete_title}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.name}"</strong> {t.dash_delete_desc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.btn_cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">{t.btn_delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
