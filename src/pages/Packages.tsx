import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { MobilePackageCardSkeleton } from "@/components/MobileSkeletons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileFAB } from "@/components/MobileFAB";
import ProgressTracker from "@/pages/ProgressTracker";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin, Users, Calendar, MoreHorizontal, Plus, Search, Pencil, Trash2,
  Package as PackageIcon, Plane, Star, Calculator, ScanLine, WalletCards,
  TrendingUp, Clock, Tag, ChevronRight, ArrowLeft, Globe, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { usePackages } from "@/features/packages/usePackages";
import { PackageFormDialog } from "@/features/packages/PackageFormDialog";
import type { Package } from "@/features/packages/packagesRepo";
import { listAllAgencyJamaah, type Jamaah } from "@/features/trips/tripsRepo";
import { computeProfessionalQuote, type HotelRow, type TransportRow, type VisaRow, type DestinationRow, type StaffRow } from "@/features/calculator/pricing";
import { useRatesStore } from "@/store/ratesStore";
import { useRegional } from "@/lib/regional";

const statusVariant: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Calculated: "bg-primary/10 text-primary",
  Confirmed: "bg-warning/10 text-warning",
  Paid: "bg-success/10 text-success",
  Completed: "bg-emerald-500/10 text-emerald-600",
};

interface ProfessionalCalcState {
  packageName: string;
  destination: string;
  pax: number;
  hotels: HotelRow[];
  transports: TransportRow[];
  visas: VisaRow[];
  destinations: DestinationRow[];
  staffs: StaffRow[];
  commissionFee: number;
  marginPercent: number;
  discount: number;
}

type EnrichedPackage = Package & {
  startDate?: string;
  departureDate?: string;
  returnDate?: string;
  airline?: string;
  maskapai?: string;
  hotelLevel?: string | number;
  hotelStars?: string | number;
  hotel?: string;
};

const CALC_STORAGE_KEY = "travelhub.package.calculations.v1";

function readPackageCalculations(): Record<string, ProfessionalCalcState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CALC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getDepartureInfo(pkg: EnrichedPackage, occupied: number) {
  const dateValue = pkg.departureDate ?? pkg.startDate;
  if (occupied >= pkg.people) {
    return { status: "Full", label: "Kuota penuh", className: "bg-rose-500 text-white", dot: "bg-rose-500" };
  }
  if (!dateValue) {
    return { status: "Tersedia", label: "Jadwal belum set", className: "bg-sky-500 text-white", dot: "bg-sky-500" };
  }
  const now = new Date();
  const departure = new Date(dateValue);
  const diffDays = Math.ceil((departure.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86_400_000);
  if (diffDays < 0) {
    return { status: "Selesai", label: "Perjalanan selesai", className: "bg-slate-500 text-white", dot: "bg-slate-400" };
  }
  if (diffDays <= 30) {
    return { status: "🔥 Promo", label: `${diffDays} hari lagi`, className: "bg-amber-400 text-amber-900", dot: "bg-amber-400" };
  }
  return { status: "Tersedia", label: `${diffDays} Hari Lagi`, className: "bg-sky-500 text-white", dot: "bg-sky-500" };
}

function getLogistics(pkg: EnrichedPackage) {
  const airline = pkg.airline ?? pkg.maskapai ?? "—";
  const hotel = pkg.hotelLevel ?? pkg.hotelStars ?? pkg.hotel ?? "—";
  const hotelLabel = typeof hotel === "number" ? `${hotel}★` : String(hotel).includes("★") ? String(hotel) : String(hotel);
  return { airline, hotel: hotelLabel, days: `${pkg.days} Hari` };
}

function formatJt(val: number): string {
  if (val === 0) return "—";
  if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}M`;
  if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(0)}jt`;
  if (val >= 1_000) return `Rp ${(val / 1_000).toFixed(0)}rb`;
  return `Rp ${val}`;
}

const CATEGORIES = [
  { key: "all",      label: "Semua"     },
  { key: "umrah",    label: "Umrah"     },
  { key: "haji",     label: "Haji Plus" },
  { key: "citytour", label: "City Tour" },
  { key: "tiket",    label: "Tiket Saja"},
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

function matchCategory(pkg: Package, cat: CategoryKey): boolean {
  if (cat === "all") return true;
  const haystack = `${pkg.name} ${pkg.destination}`.toLowerCase();
  if (cat === "umrah")    return haystack.includes("umrah");
  if (cat === "haji")     return haystack.includes("haji");
  if (cat === "citytour") return haystack.includes("tour") || haystack.includes("wisata") || haystack.includes("city");
  if (cat === "tiket")    return haystack.includes("tiket") || haystack.includes("ticket");
  return true;
}

export default function Packages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "progress" ? "progress" : "paket";
  const { items, loading, create, update, remove } = usePackages();
  const rates = useRatesStore((s) => s.rates);
  const { formatCurrency } = useRegional();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Package | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const [allJamaah, setAllJamaah] = useState<Jamaah[]>([]);
  const [category, setCategory] = useState<CategoryKey>("all");
  const [mobilePage, setMobilePage] = useState(1);
  const MOBILE_PAGE_SIZE = 8;
  const filterScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshLocalData = () => setLocalVersion((v) => v + 1);
    window.addEventListener("focus", refreshLocalData);
    return () => window.removeEventListener("focus", refreshLocalData);
  }, []);

  useEffect(() => {
    let alive = true;
    listAllAgencyJamaah()
      .then((rows) => { if (alive) setAllJamaah(rows); })
      .catch(() => { if (alive) setAllJamaah([]); });
    return () => { alive = false; };
  }, [localVersion, items.length]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return items.filter((p) => {
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.destination.toLowerCase().includes(q);
      return matchQ && matchCategory(p, category);
    });
  }, [items, debouncedQuery, category]);

  useEffect(() => { setMobilePage(1); }, [debouncedQuery, category]);

  const mobilePageCount = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const mobilePagedItems = filtered.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE);

  const mobileStats = useMemo(() => {
    const now = new Date();
    let aktif = 0, perjalanan = 0, selesai = 0;
    items.forEach((p) => {
      const ep = p as EnrichedPackage;
      const dateValue = ep.departureDate ?? ep.startDate;
      if (!dateValue) { aktif++; return; }
      const dep = new Date(dateValue);
      const diffDays = Math.ceil((dep.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86_400_000);
      if (diffDays < -7)       { selesai++;     }
      else if (diffDays <= 14) { perjalanan++;  }
      else                     { aktif++;       }
    });
    return { total: items.length, aktif, perjalanan, selesai };
  }, [items]);

  const openCreate  = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  const openEdit    = useCallback((pkg: Package) => { setEditing(pkg); setFormOpen(true); }, []);

  const jamaahByPackage = useMemo(() => {
    return allJamaah.reduce<Record<string, Jamaah[]>>((acc, j) => {
      acc[j.tripId] = [...(acc[j.tripId] ?? []), j];
      return acc;
    }, {});
  }, [allJamaah]);

  const calculations = useMemo(() => readPackageCalculations(), [localVersion, items]);

  const getFinancialSnapshot = (pkg: Package, occupied: number) => {
    const calc = calculations[pkg.id];
    if (calc && calc.hotels && Array.isArray(calc.hotels)) {
      const quote = computeProfessionalQuote({ ...calc, rates });
      const safePax = Math.max(1, calc.pax);
      const revenue = quote.perPaxFinal * occupied;
      const margin  = (quote.netProfit / safePax) * occupied;
      return { revenue, margin };
    }
    const perPax    = pkg.people > 0 ? pkg.totalIDR / pkg.people : 0;
    const hppPerPax = pkg.people > 0 ? (pkg.hpp ?? 0) / pkg.people : 0;
    return { revenue: perPax * occupied, margin: (perPax - hppPerPax) * occupied };
  };

  const openShortcut = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    navigate(path);
  }, [navigate]);

  const handleSubmit = async (draft: Parameters<typeof create>[0]) => {
    if (editing) { await update(editing.id, draft); toast.success("Paket diperbarui"); }
    else         { await create(draft);              toast.success("Paket dibuat");      }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await remove(deletingId);
      toast.success("Paket dihapus");
      setDeletingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hapus paket gagal.");
    }
  };

  const deletingPkg = items.find((p) => p.id === deletingId);

  return (
    <>
      {/* ════════════════════════════════════════════
          MOBILE LAYOUT — md:hidden
      ════════════════════════════════════════════ */}
      <div
        className="md:hidden -mx-5 -mt-4 min-h-screen pb-32"
        style={{ background: "#F0F4FB", fontFamily: "'Manrope', sans-serif" }}
      >
        {/* ── Header ── */}
        <div
          className="sticky top-0 z-30 px-5"
          style={{
            background: "rgba(240,244,251,0.96)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            paddingTop: "calc(60px + env(safe-area-inset-top, 0px))",
          }}
        >
          <div className="flex items-center gap-2 pb-3">
            <button
              onClick={() => navigate(-1)}
              className="h-9 w-9 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2.2} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[17px] font-extrabold text-[#0f1c3f] leading-tight truncate">Paket &amp; Trip</h1>
              <p className="text-[10px] text-slate-500 font-medium leading-none mt-0.5 truncate">
                Kelola dan kalkulasi paket Umroh, Haji &amp; Trip.
              </p>
            </div>
            <button
              onClick={openCreate}
              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 active:opacity-80 transition-opacity text-white shadow-sm"
              style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* ── Page Tabs (Paket / Progress) ── */}
          <div className="flex gap-2 pb-3">
            {([
              { key: "paket",    label: "Paket",    icon: PackageIcon },
              { key: "progress", label: "Progress", icon: TrendingUp  },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSearchParams(key === "paket" ? {} : { tab: key })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all",
                  activeTab === key
                    ? "text-white shadow-sm"
                    : "bg-white text-slate-500"
                )}
                style={activeTab === key ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : {}}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 space-y-4 pt-2">

          {/* ── Progress Tab ── */}
          {activeTab === "progress" && (
            <div className="rounded-3xl bg-white p-4 shadow-sm">
              <ProgressTracker />
            </div>
          )}

          {activeTab === "paket" && (
            <>
              {/* ── Stats Cards ── */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Paket",       value: mobileStats.total,      icon: PackageIcon, iconBg: "#EEF2FF", iconColor: "#4F46E5" },
                  { label: "Paket Aktif",        value: mobileStats.aktif,      icon: TrendingUp,  iconBg: "#ECFDF5", iconColor: "#10B981" },
                  { label: "Dalam Perjalanan",   value: mobileStats.perjalanan, icon: Plane,       iconBg: "#F0F9FF", iconColor: "#0EA5E9" },
                  { label: "Paket Selesai",      value: mobileStats.selesai,    icon: Clock,       iconBg: "#F8FAFC", iconColor: "#64748B" },
                ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
                  <div key={label} className="rounded-2xl bg-white p-3.5 shadow-sm">
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center mb-2.5"
                      style={{ background: iconBg }}
                    >
                      <Icon className="h-4.5 w-4.5" style={{ color: iconColor }} strokeWidth={1.8} />
                    </div>
                    <p className="text-[22px] font-extrabold text-[#0f1c3f] leading-none">{value}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* ── Search Bar ── */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  placeholder="Cari nama paket atau tujuan…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-2xl text-[13px] text-[#0f1c3f] font-medium outline-none transition-all bg-white shadow-sm"
                  style={{ border: "1.5px solid #E2E8F0" }}
                  onFocus={(e) => { e.target.style.borderColor = "#0066FF"; e.target.style.boxShadow = "0 0 0 3px rgba(0,102,255,0.10)"; }}
                  onBlur={(e)  => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              {/* ── Category Tabs ── */}
              <div
                className="flex gap-2 overflow-x-auto pb-0.5"
                style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
              >
                {CATEGORIES.map(({ key, label }) => {
                  const count = key === "all" ? items.length : items.filter((p) => matchCategory(p, key)).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setCategory(key)}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[11.5px] font-bold transition-all",
                        category === key
                          ? "text-white shadow-sm"
                          : "bg-white text-slate-600 border border-slate-200"
                      )}
                      style={category === key ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : {}}
                    >
                      {label}
                      <span
                        className={cn(
                          "text-[10px] font-extrabold rounded-full px-1.5 py-0.5",
                          category === key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ── Loading skeletons ── */}
              {loading && (
                <div className="space-y-3">
                  <MobilePackageCardSkeleton />
                  <MobilePackageCardSkeleton />
                  <MobilePackageCardSkeleton />
                </div>
              )}

              {/* ── Empty state ── */}
              {!loading && filtered.length === 0 && (
                <div className="rounded-3xl bg-white shadow-sm py-10 text-center space-y-3">
                  <div
                    className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto"
                    style={{ background: "#EEF2FF" }}
                  >
                    <PackageIcon className="h-7 w-7 text-[#4F46E5]" strokeWidth={1.6} />
                  </div>
                  <p className="text-[13px] font-semibold text-slate-500">
                    {query || category !== "all" ? "Paket tidak ditemukan." : "Belum ada paket."}
                  </p>
                  {!query && category === "all" && (
                    <button
                      onClick={openCreate}
                      className="inline-flex items-center gap-1.5 h-9 px-5 rounded-xl text-[12px] font-bold text-white active:scale-95 transition-transform"
                      style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Buat Paket Pertama
                    </button>
                  )}
                </div>
              )}

              {/* ── Package Cards ── */}
              {!loading && filtered.length > 0 && (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${category}-${mobilePage}`}
                    className="space-y-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    {mobilePagedItems.map((pkg) => {
                      const enriched    = pkg as EnrichedPackage;
                      const occupied    = jamaahByPackage[pkg.id]?.length ?? 0;
                      const remaining   = Math.max(0, pkg.people - occupied);
                      const occupancyPct = Math.min(100, Math.round((occupied / Math.max(1, pkg.people)) * 100));
                      const departure   = getDepartureInfo(enriched, occupied);
                      const logistics   = getLogistics(enriched);
                      const perPax      = pkg.people > 0 ? pkg.totalIDR / pkg.people : 0;
                      const barColor    = occupancyPct >= 90 ? "#10B981" : occupancyPct >= 60 ? "#0066FF" : "#F59E0B";

                      return (
                        <motion.div
                          key={pkg.id}
                          className="rounded-3xl overflow-hidden bg-white shadow-sm"
                          style={{ border: "1px solid rgba(226,232,240,0.8)" }}
                          whileTap={{ scale: 0.985 }}
                          transition={{ duration: 0.15 }}
                        >
                          {/* Cover Image */}
                          <div className="relative w-full h-[140px]">
                            {pkg.coverImage ? (
                              <img
                                src={pkg.coverImage}
                                alt={pkg.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-4xl"
                                style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}
                              >
                                {pkg.emoji}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

                            {/* Status badge */}
                            <span className={cn("absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm", departure.className)}>
                              {departure.status}
                            </span>

                            {/* 3-dot menu */}
                            <div className="absolute top-2.5 right-2.5" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="h-7 w-7 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm active:opacity-70 transition-opacity">
                                    <MoreHorizontal className="h-4 w-4 text-white" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="text-sm">
                                  <DropdownMenuItem onClick={() => openEdit(pkg)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setDeletingId(pkg.id)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Hapus
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* Date pill bottom-left */}
                            <div className="absolute bottom-3 left-3 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                                <Calendar className="h-3 w-3 shrink-0" />
                                {departure.label}
                              </span>
                            </div>

                            {/* Price pill bottom-right */}
                            <div className="absolute bottom-3 right-3">
                              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white">
                                {formatJt(perPax)}<span className="opacity-75">/pax</span>
                              </span>
                            </div>
                          </div>

                          {/* Card body */}
                          <div className="p-4 space-y-3">
                            {/* Name + destination */}
                            <div>
                              <h3 className="text-[16px] font-extrabold text-[#0f1c3f] leading-tight">
                                {pkg.name}
                              </h3>
                              <p className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-slate-500 truncate">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                                {pkg.destination}
                              </p>
                            </div>

                            {/* Info pills row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 bg-[#F0F9FF] text-sky-700 rounded-lg px-2.5 py-1 text-[10.5px] font-bold">
                                <Clock className="h-3 w-3" strokeWidth={2} /> {logistics.days}
                              </span>
                              <span className="inline-flex items-center gap-1 bg-[#F8FAFC] text-slate-600 rounded-lg px-2.5 py-1 text-[10.5px] font-bold">
                                <Plane className="h-3 w-3" strokeWidth={2} /> {logistics.airline}
                              </span>
                              <span className="inline-flex items-center gap-1 bg-[#F0FDF4] text-emerald-700 rounded-lg px-2.5 py-1 text-[10.5px] font-bold">
                                <Users className="h-3 w-3" strokeWidth={2} /> Sisa {remaining}
                              </span>
                            </div>

                            {/* Occupancy bar */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10.5px] font-semibold text-slate-500">Okupansi Jamaah</span>
                                <span className="text-[10.5px] font-bold text-[#0f1c3f]">{occupied} / {pkg.people}</span>
                              </div>
                              <div className="h-2 w-full rounded-full overflow-hidden bg-slate-100">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${occupancyPct}%`, background: barColor }}
                                />
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                onClick={() => navigate(`/packages/${pkg.id}`)}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-white text-[12px] font-bold active:scale-[0.98] transition-transform"
                                style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}
                              >
                                Lihat Detail
                                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={(e) => openShortcut(e, `/packages/${pkg.id}?tab=calculator`)}
                                className="h-9 w-9 rounded-xl flex items-center justify-center bg-[#F0F4FB] active:scale-95 transition-transform"
                                title="Kalkulasi"
                              >
                                <Calculator className="h-4 w-4 text-[#0066FF]" strokeWidth={1.8} />
                              </button>
                              <button
                                onClick={(e) => openShortcut(e, `/packages/${pkg.id}?tab=jamaah`)}
                                className="h-9 w-9 rounded-xl flex items-center justify-center bg-[#F0F4FB] active:scale-95 transition-transform"
                                title="Jamaah"
                              >
                                <Users className="h-4 w-4 text-[#0066FF]" strokeWidth={1.8} />
                              </button>
                              <button
                                onClick={(e) => openShortcut(e, `/packages/${pkg.id}?tab=jamaah&ocr=1`)}
                                className="h-9 w-9 rounded-xl flex items-center justify-center bg-[#F0F4FB] active:scale-95 transition-transform"
                                title="OCR Paspor"
                              >
                                <ScanLine className="h-4 w-4 text-[#0066FF]" strokeWidth={1.8} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              )}

              {/* ── Pagination ── */}
              {!loading && mobilePageCount > 1 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                    disabled={mobilePage === 1}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white shadow-sm text-[12px] font-bold text-[#0f1c3f] disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
                    Prev
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: mobilePageCount }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setMobilePage(p)}
                        className={cn(
                          "h-8 w-8 rounded-xl text-[12px] font-bold transition-all",
                          p === mobilePage
                            ? "text-white shadow-sm"
                            : "bg-white text-slate-600"
                        )}
                        style={p === mobilePage ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : {}}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setMobilePage((p) => Math.min(mobilePageCount, p + 1))}
                    disabled={mobilePage === mobilePageCount}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white shadow-sm text-[12px] font-bold text-[#0f1c3f] disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
              )}

              {/* ── Quick Actions ── */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-extrabold text-[#0f1c3f]">Aksi Cepat</h2>
                  <button className="text-[12px] font-bold text-[#0066FF] active:opacity-70" onClick={openCreate}>
                    + Tambah Baru
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Paket Baru",
                      sub:   "Buat paket perjalanan baru",
                      iconBg: "#EEF2FF",
                      iconColor: "#4F46E5",
                      Icon: PackageIcon,
                      action: openCreate,
                    },
                    {
                      label: "Kelola Itinerary",
                      sub:   "Susun agenda perjalanan",
                      iconBg: "#F0F9FF",
                      iconColor: "#0EA5E9",
                      Icon: Globe,
                      action: () => navigate("/itinerary"),
                    },
                    {
                      label: "Kalkulator",
                      sub:   "Hitung HPP & harga jual",
                      iconBg: "#ECFDF5",
                      iconColor: "#10B981",
                      Icon: Calculator,
                      action: () => navigate("/calculator"),
                    },
                    {
                      label: "Harga Tiket",
                      sub:   "Pantau harga tiket pesawat",
                      iconBg: "#FFF7ED",
                      iconColor: "#F59E0B",
                      Icon: Tag,
                      action: () => navigate("/ticket-prices"),
                    },
                  ].map(({ label, sub, iconBg, iconColor, Icon, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="rounded-2xl bg-white shadow-sm p-4 text-left active:scale-95 transition-transform"
                    >
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center mb-3"
                        style={{ background: iconBg }}
                      >
                        <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={1.8} />
                      </div>
                      <p className="text-[13px] font-bold text-[#0f1c3f] leading-tight">{label}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          DESKTOP LAYOUT — hidden md:block
      ════════════════════════════════════════════ */}
      <div className="hidden md:block space-y-4">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base md:text-2xl font-bold text-[hsl(var(--foreground))] leading-tight">Paket Trip</h1>
            <p className="text-[11px] md:text-xs text-[hsl(var(--muted-foreground))] mt-0.5 hidden sm:block">
              {activeTab === "paket" ? "Kelola semua paket perjalanan kamu." : "Pantau progres jamaah & status paket."}
            </p>
          </div>
          {activeTab === "paket" && (
            <Button onClick={openCreate} className="btn-glow h-7 md:h-9 px-2.5 md:px-3 rounded-xl text-[11px] md:text-sm shrink-0">
              <Plus className="h-3 w-3 mr-1" />
              Tambah
            </Button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-[hsl(var(--secondary))] w-fit">
          {([
            { key: "paket",    label: "Paket",    icon: PackageIcon },
            { key: "progress", label: "Progress", icon: TrendingUp  },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSearchParams(key === "paket" ? {} : { tab: key })}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                activeTab === key ? "bg-white shadow-sm text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "progress" && <ProgressTracker />}

        {activeTab === "paket" && (
          <>
            {/* ── Desktop Search ── */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder="Cari paket..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-9 text-sm rounded-xl bg-[hsl(var(--secondary))] border-0 focus-visible:ring-1 focus-visible:ring-[hsl(var(--primary))]"
              />
            </div>

            {/* ── Content ── */}
            {loading ? (
              <div className="space-y-3">
                <MobilePackageCardSkeleton />
                <MobilePackageCardSkeleton />
                <MobilePackageCardSkeleton />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--border))] py-7 text-center space-y-2 mx-0">
                <PackageIcon strokeWidth={1.5} className="h-6 w-6 text-[hsl(var(--muted-foreground))] mx-auto" />
                <p className="text-[12px] text-[hsl(var(--muted-foreground))]">
                  {query || category !== "all" ? "Paket tidak ditemukan." : "Belum ada paket."}
                </p>
                {!query && category === "all" && (
                  <Button variant="outline" onClick={openCreate} className="h-7 text-[11px] rounded-xl">
                    <Plus className="h-3 w-3 mr-1" /> Buat paket pertama
                  </Button>
                )}
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-4"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
              >
                {filtered.map((pkg) => {
                  const enriched = pkg as EnrichedPackage;
                  const occupied = jamaahByPackage[pkg.id]?.length ?? 0;
                  const occupancyPct = Math.min(100, Math.round((occupied / Math.max(1, pkg.people)) * 100));
                  const departure = getDepartureInfo(enriched, occupied);
                  const logistics = getLogistics(enriched);
                  const financial = getFinancialSnapshot(pkg, occupied);
                  const progressColor = occupancyPct >= 90 ? "from-emerald-500 to-green-500" : occupancyPct >= 60 ? "from-sky-400 to-sky-500" : "from-amber-400 to-amber-500";

                  return (
                    <motion.div
                      key={pkg.id}
                      onClick={() => navigate(`/packages/${pkg.id}`)}
                      className="group overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_14px_40px_-24px_rgba(14,165,233,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_20px_48px_-24px_rgba(15,23,42,0.30)] cursor-pointer"
                      style={{ fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }}
                      variants={{
                        hidden:   { opacity: 0, y: 18, scale: 0.96 },
                        visible:  { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
                      }}
                    >
                      <div className="relative h-24 overflow-hidden">
                        {pkg.coverImage ? (
                          <img src={pkg.coverImage} alt={pkg.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl md:text-4xl" style={{ background: "linear-gradient(135deg,hsl(198 92% 39%),hsl(205 90% 50%))" }}>
                            {pkg.emoji}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                        <Badge className={`${departure.className} border-0 absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm`}>
                          {departure.status}
                        </Badge>
                        <div className="absolute bottom-3 left-3 right-3">
                          <p className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-sky-700 backdrop-blur-sm">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span className="truncate">{departure.label}</span>
                          </p>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-extrabold leading-tight text-slate-950 truncate">{pkg.name}</h3>
                            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500 truncate">
                              <MapPin className="h-3 w-3 shrink-0 text-sky-500" /> {pkg.destination}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-sm">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(pkg); }}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeletingId(pkg.id); }} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Hapus
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="rounded-2xl bg-sky-50/70 p-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-600">Okupansi Jemaah</span>
                            <span className="font-extrabold text-slate-900">{occupied} / {pkg.people} Jemaah</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-sky-100">
                            <div className={`h-full rounded-full bg-gradient-to-r ${progressColor} transition-all duration-500`} style={{ width: `${occupancyPct}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              <WalletCards className="h-3 w-3" /> Revenue
                            </p>
                            <p className="mt-1 text-[13px] font-extrabold text-slate-950 truncate">{formatCurrency(Math.round(financial.revenue))}</p>
                          </div>
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              <TrendingUp className="h-3 w-3" /> Margin
                            </p>
                            <p className="mt-1 text-[13px] font-extrabold text-emerald-700 truncate">{formatCurrency(Math.round(financial.margin))}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-semibold text-slate-600">
                          <span className="flex min-w-0 items-center gap-1 rounded-xl bg-white px-2 py-2 ring-1 ring-slate-100">
                            <Plane className="h-3 w-3 shrink-0 text-sky-500" /><span className="truncate">{logistics.airline}</span>
                          </span>
                          <span className="flex min-w-0 items-center gap-1 rounded-xl bg-white px-2 py-2 ring-1 ring-slate-100">
                            <Star className="h-3 w-3 shrink-0 text-sky-500" /><span className="truncate">{logistics.hotel}</span>
                          </span>
                          <span className="flex min-w-0 items-center gap-1 rounded-xl bg-white px-2 py-2 ring-1 ring-slate-100">
                            <Calendar className="h-3 w-3 shrink-0 text-sky-500" /><span className="truncate">{logistics.days}</span>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 border-t border-sky-100 bg-slate-50/80">
                        <button type="button" onClick={(e) => openShortcut(e, `/packages/${pkg.id}?tab=calculator`)} className="flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-sky-50 hover:text-sky-600">
                          <Calculator className="h-3.5 w-3.5" /> Kalkulasi
                        </button>
                        <button type="button" onClick={(e) => openShortcut(e, `/packages/${pkg.id}?tab=jamaah`)} className="flex items-center justify-center gap-1.5 border-x border-sky-100 px-2 py-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-sky-50 hover:text-sky-600">
                          <Users className="h-3.5 w-3.5" /> Jemaah
                        </button>
                        <button type="button" onClick={(e) => openShortcut(e, `/packages/${pkg.id}?tab=jamaah&ocr=1`)} className="flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-sky-50 hover:text-sky-600">
                          <ScanLine className="h-3.5 w-3.5" /> OCR
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            <PackageFormDialog
              open={formOpen}
              onOpenChange={setFormOpen}
              initial={editing}
              onSubmit={handleSubmit}
            />

            <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
              <AlertDialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">Hapus paket ini?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm">
                    "{deletingPkg?.name}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2">
                  <AlertDialogCancel className="flex-1 h-9 rounded-xl text-sm">Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="flex-1 h-9 rounded-xl text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      {/* ── Dialogs also available in mobile context (portals) ── */}
      <div className="md:hidden">
        <PackageFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editing}
          onSubmit={handleSubmit}
        />
        <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
          <AlertDialogContent className="max-w-sm w-[calc(100%-2rem)] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">Hapus paket ini?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                "{deletingPkg?.name}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2">
              <AlertDialogCancel className="flex-1 h-9 rounded-xl text-sm">Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="flex-1 h-9 rounded-xl text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
