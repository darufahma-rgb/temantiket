/**
 * OwnerVisaTrackerPage — /visa-tracker
 *
 * Redesigned dashboard: header, 5 stats cards, filter row, pipeline visualization,
 * full data table with KLIEN/NEGARA/JENIS VISA/ID ORDER/TANGGAL AJU/STATUS/PROGRESS/AGEN/AKSI.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getBearer } from "@/lib/authFetch";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, AlertTriangle, CheckCircle2, Clock,
  Wallet, RefreshCw, Loader2,
  Users, BadgeDollarSign, Search, Filter,
  UserCheck, X, Landmark, ExternalLink,
  ChevronLeft, ChevronRight, ChevronDown, Plus,
  MoreVertical, CircleDot,
  Eye, Pencil, Inbox, ClipboardCheck,
  ShieldCheck, FileCheck2, Flag, LayoutGrid, List,
  Download, Send, UserCog, Phone, Mail, Hash, CreditCard,
  CalendarDays, MapPin, Info, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { addWalletTxAsync } from "@/lib/agentWallet";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { fmtIDR } from "@/lib/profit";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { Order } from "@/features/orders/ordersRepo";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];
const DEFAULT_FEE = 200_000;
const DEFAULT_PAGE_SIZE = 6;
const MOBILE_PAGE_SIZE = 5;

// ─── Pipeline stage definitions (7 stages) ───────────────────────────────────
const PIPELINE_STAGES = [
  {
    key: "berkas_masuk",
    label: "Berkas Masuk",
    step: 0,
    Icon: Inbox,
    color: "#64748b",
    iconBg: "#f1f5f9",
    pct: 10,
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    barColor: "bg-slate-400",
  },
  {
    key: "pengecekan",
    label: "Pengecekan",
    step: 1,
    Icon: ClipboardCheck,
    color: "#3b82f6",
    iconBg: "#eff6ff",
    pct: 25,
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    barColor: "bg-blue-400",
  },
  {
    key: "proses_pengajuan",
    label: "Proses Pengajuan",
    step: 2,
    Icon: Send,
    color: "#f97316",
    iconBg: "#fff7ed",
    pct: 42,
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    barColor: "bg-orange-400",
  },
  {
    key: "menunggu_kedutaan",
    label: "Menunggu Kedutaan",
    step: 3,
    Icon: Landmark,
    color: "#f59e0b",
    iconBg: "#fffbeb",
    pct: 58,
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    barColor: "bg-amber-400",
  },
  {
    key: "disetujui",
    label: "Disetujui",
    step: 4,
    Icon: ShieldCheck,
    color: "#4f46e5",
    iconBg: "#eef2ff",
    pct: 75,
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-700",
    barColor: "bg-indigo-400",
  },
  {
    key: "visa_terbit",
    label: "Visa Terbit",
    step: 5,
    Icon: FileCheck2,
    color: "#10b981",
    iconBg: "#ecfdf5",
    pct: 90,
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
    barColor: "bg-green-400",
  },
  {
    key: "selesai",
    label: "Selesai",
    step: 6,
    Icon: Flag,
    color: "#059669",
    iconBg: "#d1fae5",
    pct: 100,
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    barColor: "bg-emerald-500",
  },
] as const;

// ─── Country flags ────────────────────────────────────────────────────────────
const COUNTRY_FLAGS: Record<string, { flag: string; name: string }> = {
  mesir:           { flag: "🇪🇬", name: "Mesir" },
  turki:           { flag: "🇹🇷", name: "Turki" },
  malaysia:        { flag: "🇲🇾", name: "Malaysia" },
  arab_saudi:      { flag: "🇸🇦", name: "Arab Saudi" },
  uni_emirat_arab: { flag: "🇦🇪", name: "Uni Emirat Arab" },
  qatar:           { flag: "🇶🇦", name: "Qatar" },
  jordania:        { flag: "🇯🇴", name: "Jordania" },
  maroko:          { flag: "🇲🇦", name: "Maroko" },
  uzbekistan:      { flag: "🇺🇿", name: "Uzbekistan" },
  pakistan:        { flag: "🇵🇰", name: "Pakistan" },
  iran:            { flag: "🇮🇷", name: "Iran" },
  jerman:          { flag: "🇩🇪", name: "Jerman" },
  perancis:        { flag: "🇫🇷", name: "Perancis" },
  inggris:         { flag: "🇬🇧", name: "Inggris" },
  belanda:         { flag: "🇳🇱", name: "Belanda" },
};

const COUNTRY_OPTIONS = [
  { value: "mesir",           label: "🇪🇬 Mesir" },
  { value: "turki",           label: "🇹🇷 Turki" },
  { value: "malaysia",        label: "🇲🇾 Malaysia" },
  { value: "arab_saudi",      label: "🇸🇦 Arab Saudi" },
  { value: "uni_emirat_arab", label: "🇦🇪 Uni Emirat Arab" },
  { value: "qatar",           label: "🇶🇦 Qatar" },
  { value: "jordania",        label: "🇯🇴 Jordania" },
  { value: "maroko",          label: "🇲🇦 Maroko" },
  { value: "uzbekistan",      label: "🇺🇿 Uzbekistan" },
  { value: "pakistan",        label: "🇵🇰 Pakistan" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); }
  catch { return iso; }
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}

function formatOrderId(order: Order, index: number): string {
  try {
    const d = new Date(order.createdAt);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `ORD-${dd}${mm}-${String(index + 1).padStart(3, "0")}`;
  } catch {
    return `ORD-${order.id.slice(0, 8)}`;
  }
}

function meta(o: Order) {
  return (o.metadata ?? {}) as Record<string, unknown>;
}

function getStageInfo(order: Order) {
  const m = meta(order);
  const step = Number(m.processStep ?? 0);
  const isCompleted = order.status === "Completed" || step >= VISA_STEPS.length;
  if (isCompleted) return PIPELINE_STAGES[6];
  return PIPELINE_STAGES[Math.min(step, 5)];
}

function getCountryInfo(negara: string | undefined | null) {
  if (!negara) return null;
  const key = negara.toLowerCase().replace(/\s+/g, "_");
  return COUNTRY_FLAGS[key] ?? { flag: "🌍", name: negara };
}

// ─── Avatar color palette ─────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "linear-gradient(135deg,#6366f1,#4f46e5)",
  "linear-gradient(135deg,#3b82f6,#1d4ed8)",
  "linear-gradient(135deg,#10b981,#059669)",
  "linear-gradient(135deg,#f97316,#ea580c)",
  "linear-gradient(135deg,#8b5cf6,#7c3aed)",
  "linear-gradient(135deg,#ec4899,#db2777)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#14b8a6,#0d9488)",
];
function avatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type MemberInfo = { userId: string; displayName: string; email: string; role: string };
type ViewMode = "table" | "grid";

// ─────────────────────────────────────────────────────────────────────────────
export default function OwnerVisaTrackerPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders, patchOrder } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; skipped: number; errors: number } | null>(null);

  // Per-row action states
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [creditingId, setCreditingId] = useState<string | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [openAssignPopover, setOpenAssignPopover] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Desktop filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAgen, setFilterAgen] = useState("all");
  const [filterNegara, setFilterNegara] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Desktop pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);

  // Mobile state
  const [mobileFilterStatus, setMobileFilterStatus] = useState("all");
  const [mobilePage, setMobilePage] = useState(1);
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [mobileMoreMenu, setMobileMoreMenu] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchClients()]);
      const mems = await listMembers();
      setMembers(mems.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        email: m.email,
        role: m.role,
      })));
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [search, filterStatus, filterAgen, filterNegara]);
  useEffect(() => { setMobilePage(1); }, [mobileFilterStatus, search]);

  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.userId, m])),
    [members],
  );
  const visaOrders = useMemo(
    () => orders.filter((o) => o.type === "visa_student"),
    [orders],
  );

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = visaOrders.length;
    const selesai = visaOrders.filter((o) => {
      const step = Number(meta(o).processStep ?? 0);
      return o.status === "Completed" || step >= VISA_STEPS.length - 1;
    }).length;
    const kendala = visaOrders.filter((o) => meta(o).visaKendala).length;
    const menungguBayar = visaOrders.filter(
      (o) => meta(o).pelaksanaId && !meta(o).pelaksanaFeeCredited
    ).length;
    const diproses = visaOrders.filter((o) => {
      const step = Number(meta(o).processStep ?? 0);
      const isDone = o.status === "Completed" || step >= VISA_STEPS.length - 1;
      return !!meta(o).pelaksanaId && !isDone;
    }).length;
    const feeTotalSum = visaOrders.reduce(
      (s, o) => s + Number(meta(o).pelaksanaFee ?? DEFAULT_FEE), 0
    );
    const feePaid = visaOrders
      .filter((o) => meta(o).pelaksanaId && meta(o).pelaksanaFeeCredited)
      .reduce((s, o) => s + Number(meta(o).pelaksanaFee ?? DEFAULT_FEE), 0);
    const feeUnpaid = feeTotalSum - feePaid;
    return { total, diproses, selesai, kendala, menungguBayar, feeTotalSum, feePaid, feeUnpaid };
  }, [visaOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pipeline counts ────────────────────────────────────────────────────────
  const pipelineCounts = useMemo(() => {
    const counts = new Array(7).fill(0) as number[];
    visaOrders.forEach((o) => {
      const step = Number(meta(o).processStep ?? 0);
      const isCompleted = o.status === "Completed" || step >= VISA_STEPS.length;
      if (isCompleted) {
        counts[6]++;
      } else {
        counts[Math.min(step, 5)]++;
      }
    });
    return counts;
  }, [visaOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Available countries for filter ────────────────────────────────────────
  const availableCountries = useMemo(() => {
    const seen = new Set<string>();
    visaOrders.forEach((o) => {
      const n = meta(o).negara as string | undefined;
      if (n) seen.add(n);
    });
    return Array.from(seen).sort();
  }, [visaOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Desktop filtered list ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...visaOrders];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => {
        const c = clientMap.get(o.clientId ?? "");
        return (
          (c?.name ?? "").toLowerCase().includes(q) ||
          (c?.passportNumber ?? "").toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.title ?? "").toLowerCase().includes(q)
        );
      });
    }

    if (filterAgen !== "all") {
      if (filterAgen === "__none") {
        list = list.filter((o) => !meta(o).pelaksanaId);
      } else {
        list = list.filter((o) => meta(o).pelaksanaId === filterAgen);
      }
    }

    if (filterNegara !== "all") {
      list = list.filter((o) => {
        const n = meta(o).negara as string | undefined;
        return n === filterNegara;
      });
    }

    if (filterStatus !== "all") {
      list = list.filter((o) => {
        const step = Number(meta(o).processStep ?? 0);
        const isCompleted = o.status === "Completed" || step >= VISA_STEPS.length;
        const stageIdx = isCompleted ? 6 : Math.min(step, 5);
        const stageKey = PIPELINE_STAGES[stageIdx].key;
        if (filterStatus === "kendala") return !!meta(o).visaKendala;
        return stageKey === filterStatus;
      });
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visaOrders, search, filterStatus, filterAgen, filterNegara, clientMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedData = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── Mobile filtered list ───────────────────────────────────────────────────
  const mobileFiltered = useMemo(() => {
    let list = [...visaOrders];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => {
        const c = clientMap.get(o.clientId ?? "");
        return (
          (c?.name ?? "").toLowerCase().includes(q) ||
          (c?.passportNumber ?? "").toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q)
        );
      });
    }
    if (mobileFilterStatus !== "all") {
      list = list.filter((o) => {
        const step = Number(meta(o).processStep ?? 0);
        const isCompleted = o.status === "Completed" || step >= VISA_STEPS.length;
        const stageIdx = isCompleted ? 6 : Math.min(step, 5);
        const stageKey = PIPELINE_STAGES[stageIdx].key;
        if (mobileFilterStatus === "kendala") return !!meta(o).visaKendala;
        if (mobileFilterStatus === "selesai") return isCompleted;
        return stageKey === mobileFilterStatus;
      });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visaOrders, search, mobileFilterStatus, clientMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const mobileTotalPages = Math.max(1, Math.ceil(mobileFiltered.length / MOBILE_PAGE_SIZE));
  const mobilePagedData = mobileFiltered.slice(
    (mobilePage - 1) * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE,
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchClients()]);
    setRefreshing(false);
    toast.success("Data diperbarui!");
  }

  async function handleMigrateProgressSteps() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const authH = await getBearer();
      const res = await fetch("/api/migrate-progress-steps", {
        method: "POST", credentials: "include", headers: { ...authH },
      });
      const json = await res.json();
      if (json.ok) {
        setMigrateResult({ migrated: json.migrated, skipped: json.skipped, errors: json.errors });
        toast.success(`✅ Migrasi selesai: ${json.migrated} diperbarui, ${json.skipped} skip, ${json.errors} error`);
        await fetchOrders();
      } else {
        toast.error("Gagal migrasi: " + (json.message ?? "unknown error"));
      }
    } catch {
      toast.error("Gagal terhubung ke server untuk migrasi.");
    } finally {
      setMigrating(false);
    }
  }

  async function handleAssign(order: Order, memberId: string) {
    setAssigningId(order.id);
    try {
      await patchOrder(order.id, {
        metadata: {
          ...meta(order),
          pelaksanaId: memberId === "__none" ? null : memberId,
        },
      });
      toast.success(memberId === "__none" ? "Pelaksana dilepas" : "Pelaksana berhasil di-assign!");
    } catch {
      toast.error("Gagal assign pelaksana.");
    } finally {
      setAssigningId(null);
    }
  }

  async function handleCreditFee(order: Order) {
    const m = meta(order);
    const pelaksanaId = m.pelaksanaId as string | null;
    if (!pelaksanaId) return;
    if (m.pelaksanaFeeCredited) {
      toast.info("Fee pelaksana sudah pernah dikreditkan untuk order ini.");
      return;
    }
    const fee = Number(m.pelaksanaFee ?? DEFAULT_FEE);
    setCreditingId(order.id);
    try {
      const { persisted, error: walletErr } = await addWalletTxAsync(
        pelaksanaId,
        {
          agentId: pelaksanaId,
          type: "pelaksana_fee",
          pointsDelta: 0,
          amountIDR: fee,
          description: `Fee Pelaksana Visa Student #${order.id.slice(0, 8)}${order.title ? ` — ${order.title}` : ""}`,
          createdBy: user?.id ?? "owner",
          orderId: order.id,
        },
        `pelaksana-${order.id}`,
      );
      if (!persisted) {
        toast.error("Gagal catat fee pelaksana.", { description: walletErr ?? "Coba lagi." });
        return;
      }
      await patchOrder(order.id, { metadata: { ...m, pelaksanaFeeCredited: true } });
      toast.success(`Fee Pelaksana ${fmtIDR(fee)} dikreditkan ke wallet pelaksana!`, { duration: 4000 });
    } catch {
      toast.error("Gagal catat fee pelaksana.");
    } finally {
      setCreditingId(null);
    }
  }

  function handleExportExcel() {
    const headers = ["Klien", "Passport", "Negara", "Jenis Visa", "ID Order", "Tanggal Aju", "Status", "Progress %", "Agen"];
    const rows = filtered.map((o, i) => {
      const c = clientMap.get(o.clientId ?? "");
      const stage = getStageInfo(o);
      const negara = meta(o).negara as string | undefined;
      const ci = getCountryInfo(negara);
      const agen = memberMap.get((meta(o).pelaksanaId as string) ?? "");
      return [
        c?.name ?? o.title ?? `Order #${o.id.slice(0, 8)}`,
        c?.passportNumber ?? "—",
        ci?.name ?? "—",
        "Student Visa",
        formatOrderId(o, i),
        fmtDate(o.createdAt),
        stage.label,
        `${stage.pct}%`,
        agen?.displayName ?? "—",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visa-tracker-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export berhasil diunduh!");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Memuat data visa…</span>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
    <div
      className="md:hidden min-h-screen bg-[#F0F4FB] pb-28"
      style={{ WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
      onClick={() => setMobileMoreMenu(null)}
    >
      {/* Mobile header */}
      <div className="px-4 pt-12 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60"
          >
            <ChevronLeft className="h-5 w-5 text-[#0f1c3f]" strokeWidth={2.5} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#0f1c3f]">Visa Tracker</h1>
            <p className="text-[11px] text-[#64748b] mt-0.5">Monitoring semua berkas visa</p>
          </div>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 text-[#0f1c3f] ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-4 space-y-4">
        {/* Mobile stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Berkas", value: stats.total, bg: "bg-blue-50", ic: "text-blue-600", Icon: FileText },
            { label: "Diproses", value: stats.diproses, bg: "bg-orange-50", ic: "text-orange-600", Icon: CircleDot },
            { label: "Visa Terbit", value: stats.selesai, bg: "bg-green-50", ic: "text-green-600", Icon: CheckCircle2 },
            { label: "Bermasalah", value: stats.kendala, bg: "bg-red-50", ic: "text-red-600", Icon: AlertTriangle },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`}>
                <s.Icon className={`h-4 w-4 ${s.ic}`} strokeWidth={1.5} />
              </div>
              <div className="text-2xl font-bold text-[#0f1c3f]">{s.value}</div>
              <div className="text-[11px] text-[#64748b] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mobile search + filter */}
        <div className="bg-white rounded-2xl shadow-sm p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama klien, ID order…"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-[13px] text-[#0f1c3f] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 active:opacity-60">
                  <X className="h-3.5 w-3.5 text-[#64748b]" strokeWidth={2} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowMobileFilter(true)}
              className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0"
            >
              <Filter className="h-4 w-4 text-[#0f1c3f]" strokeWidth={1.5} />
            </button>
          </div>
          <p className="text-[11px] text-[#64748b] px-1">
            <span className="font-bold text-[#0f1c3f]">{mobileFiltered.length}</span> dari {visaOrders.length} berkas
          </p>
        </div>

        {/* Mobile pipeline tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[{ key: "all", label: "Semua", count: visaOrders.length }, ...PIPELINE_STAGES.slice(0, 5).map((s, i) => ({ key: s.key, label: s.label, count: pipelineCounts[i] }))].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileFilterStatus(tab.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all ${
                mobileFilterStatus === tab.key ? "text-white shadow-sm" : "bg-white text-[#64748b]"
              }`}
              style={mobileFilterStatus === tab.key ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)" } : undefined}
            >
              {tab.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${mobileFilterStatus === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-[#64748b]"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Mobile cards */}
        {mobilePagedData.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <Landmark className="h-10 w-10 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[13px] font-semibold text-[#0f1c3f]">Tidak ada berkas ditemukan</p>
            <p className="text-[11px] text-[#64748b] mt-1">Coba ubah filter atau tambah order baru</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mobilePagedData.map((order) => {
              const m = meta(order);
              const step = Number(m.processStep ?? 0);
              const client = clientMap.get(order.clientId ?? "");
              const pelaksanaId = (m.pelaksanaId as string | null) ?? null;
              const pelaksana = pelaksanaId ? memberMap.get(pelaksanaId) : null;
              const fee = Number(m.pelaksanaFee ?? DEFAULT_FEE);
              const feeCredited = !!(m.pelaksanaFeeCredited as boolean | null);
              const clientName = client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`;
              const stage = getStageInfo(order);
              const negara = m.negara as string | undefined;
              const ci = getCountryInfo(negara);

              return (
                <div key={order.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white text-[13px] font-bold"
                        style={{ background: avatarColor(clientName) }}
                      >
                        {initials(clientName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[14px] font-bold text-[#0f1c3f] truncate">{clientName}</p>
                            {client?.passportNumber && (
                              <p className="text-[10px] text-[#94a3b8] font-mono">{client.passportNumber}</p>
                            )}
                          </div>
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setMobileMoreMenu(mobileMoreMenu === order.id ? null : order.id); }}
                              className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center active:opacity-60"
                            >
                              <MoreVertical className="h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
                            </button>
                            {mobileMoreMenu === order.id && (
                              <div className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-lg border border-gray-100 py-1 w-44" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => navigate(`/orders/detail/${order.id}`)}
                                  className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.5} /> Lihat Detail
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stage.badgeBg} ${stage.badgeText}`}>
                            {stage.label}
                          </span>
                          {ci && <span className="text-[10px] text-[#64748b]">{ci.flag} {ci.name}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-[#64748b]">Progress</span>
                        <span className="text-[10px] font-bold text-[#0f1c3f]">{stage.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${stage.barColor} transition-all duration-500`}
                          style={{ width: `${stage.pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Pelaksana + fee */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Users className="h-3.5 w-3.5 text-[#64748b] shrink-0" strokeWidth={1.5} />
                        {pelaksana
                          ? <span className="text-[11px] font-semibold text-[#0f1c3f] truncate">{pelaksana.displayName}</span>
                          : <span className="text-[11px] text-orange-600 font-medium italic">Belum Ditugaskan</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pelaksanaId && feeCredited && (
                          <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Lunas
                          </span>
                        )}
                        {pelaksanaId && !feeCredited && (
                          <button
                            disabled={creditingId === order.id}
                            onClick={() => void handleCreditFee(order)}
                            className="text-[11px] font-semibold text-white bg-violet-600 px-2.5 py-1 rounded-full active:opacity-60 disabled:opacity-50 flex items-center gap-1"
                          >
                            {creditingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeDollarSign className="h-3 w-3" />}
                            {fmtIDR(fee)}
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/orders/detail/${order.id}`)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-blue-600"
                        >
                          Detail <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile pagination */}
        {mobileTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2">
            <button
              onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
              disabled={mobilePage === 1}
              className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
            <span className="text-[13px] font-semibold text-[#0f1c3f]">{mobilePage} / {mobileTotalPages}</span>
            <button
              onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
              disabled={mobilePage === mobileTotalPages}
              className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* Mobile filter sheet */}
      {showMobileFilter && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilter(false)} />
          <div className="relative bg-white rounded-t-3xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-[16px] font-bold text-[#0f1c3f]">Filter</h3>
              <button onClick={() => setShowMobileFilter(false)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 pb-10">
              <div>
                <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "all", label: "Semua Status" },
                    ...PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label })),
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setMobileFilterStatus(opt.key); setShowMobileFilter(false); }}
                      className={`text-left px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all ${
                        mobileFilterStatus === opt.key
                          ? "text-white"
                          : "bg-gray-50 text-[#0f1c3f] border border-gray-200"
                      }`}
                      style={mobileFilterStatus === opt.key ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)" } : undefined}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {mobileFilterStatus !== "all" && (
                <button
                  onClick={() => { setMobileFilterStatus("all"); setShowMobileFilter(false); }}
                  className="w-full py-3 rounded-2xl border border-gray-200 text-[13px] font-semibold text-[#64748b]"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ══════════════════════════════════════════════════════════════════════ */}
    {/* DESKTOP LAYOUT                                                         */}
    {/* ══════════════════════════════════════════════════════════════════════ */}
    <div
      className="hidden md:block min-h-screen bg-[#F0F4FB] p-6"
      onClick={() => { setOpenRowMenu(null); setOpenAssignPopover(null); }}
    >
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 bg-white rounded-2xl shadow-sm px-6 py-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              <FileCheck2 className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#0f1c3f] leading-tight">Visa Tracker</h1>
              <p className="text-[12px] text-[#64748b] mt-0.5">Monitoring & kontrol semua berkas visa pelajar secara real-time</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sync progress button */}
            <button
              onClick={() => void handleMigrateProgressSteps()}
              disabled={migrating}
              title="Sinkronkan data processStep ke sistem terpadu (sekali saja)"
              className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {migrating ? "Sinkron…" : "Sinkron Progress"}
            </button>
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-[#0f1c3f] transition-colors shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-blue-500" : "text-[#64748b]"}`} strokeWidth={1.5} />
              Refresh Data
            </button>
            <button
              onClick={() => navigate("/orders")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Tambah Tracker
              <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
            </button>
          </div>
        </motion.div>

        {/* ── Migration result banner ─────────────────────────────────────── */}
        {migrateResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-emerald-800 font-medium">
              Sinkronisasi selesai: <strong>{migrateResult.migrated}</strong> diperbarui,{" "}
              <strong>{migrateResult.skipped}</strong> skip, <strong>{migrateResult.errors}</strong> error.
            </p>
            <button onClick={() => setMigrateResult(null)} className="ml-auto">
              <X className="h-3.5 w-3.5 text-emerald-600" />
            </button>
          </div>
        )}

        {/* ── Stats cards (5 cards) ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-5 gap-4"
        >
          {[
            {
              label: "Semua Berkas",
              value: stats.total,
              sub: "100% dari total",
              Icon: FileText,
              iconColor: "#2563eb",
              iconBg: "#eff6ff",
              borderLeft: "border-l-blue-500",
            },
            {
              label: "Diproses",
              value: stats.diproses,
              sub: stats.total > 0 ? `${((stats.diproses / stats.total) * 100).toFixed(1)}%` : "0%",
              Icon: Clock,
              iconColor: "#f97316",
              iconBg: "#fff7ed",
              borderLeft: "border-l-orange-400",
            },
            {
              label: "Visa Terbit",
              value: stats.selesai,
              sub: stats.total > 0 ? `+${((stats.selesai / stats.total) * 100).toFixed(1)}%` : "+0%",
              Icon: CheckCircle2,
              iconColor: "#10b981",
              iconBg: "#ecfdf5",
              borderLeft: "border-l-green-500",
            },
            {
              label: "Menunggu Pembayaran",
              value: stats.menungguBayar,
              sub: stats.total > 0 ? `+${((stats.menungguBayar / stats.total) * 100).toFixed(1)}%` : "+0%",
              Icon: Wallet,
              iconColor: "#8b5cf6",
              iconBg: "#f5f3ff",
              borderLeft: "border-l-violet-500",
            },
            {
              label: "Bermasalah",
              value: stats.kendala,
              sub: stats.total > 0 ? `+${((stats.kendala / stats.total) * 100).toFixed(1)}%` : "+0%",
              Icon: AlertTriangle,
              iconColor: "#ef4444",
              iconBg: "#fef2f2",
              borderLeft: "border-l-red-500",
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 + i * 0.04 }}
              className={`bg-white rounded-2xl shadow-sm border-l-4 ${card.borderLeft} p-5 flex items-start justify-between gap-3`}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide leading-tight mb-1">{card.label}</p>
                <p className="text-3xl font-extrabold text-[#0f1c3f] leading-none">{card.value}</p>
                <p className="text-[11px] text-[#94a3b8] mt-1.5 font-medium">{card.sub}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: card.iconBg }}>
                <card.Icon className="h-5 w-5" style={{ color: card.iconColor }} strokeWidth={1.5} />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Filter row ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap"
        >
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" strokeWidth={1.5} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama klien, nomor paspor, ID order..."
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-[13px] text-[#0f1c3f] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-[#94a3b8] hover:text-[#64748b]" strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Status dropdown */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-[13px] text-[#0f1c3f] focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none cursor-pointer min-w-[150px]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
          >
            <option value="all">Semua Status</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
            <option value="kendala">⚠️ Ada Kendala</option>
          </select>

          {/* Agent dropdown */}
          <select
            value={filterAgen}
            onChange={(e) => setFilterAgen(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-[13px] text-[#0f1c3f] focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none cursor-pointer min-w-[150px]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
          >
            <option value="all">Semua Agen</option>
            <option value="__none">— Belum Ditugaskan —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.displayName}</option>
            ))}
          </select>

          {/* Country dropdown */}
          <select
            value={filterNegara}
            onChange={(e) => setFilterNegara(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 pr-8 text-[13px] text-[#0f1c3f] focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none cursor-pointer min-w-[150px]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
          >
            <option value="all">Semua Negara</option>
            {availableCountries.length > 0
              ? availableCountries.map((n) => {
                  const ci = getCountryInfo(n);
                  return <option key={n} value={n}>{ci ? `${ci.flag} ${ci.name}` : n}</option>;
                })
              : COUNTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))
            }
          </select>

          {/* Filter button */}
          <button
            onClick={() => {}}
            className="h-10 px-4 rounded-xl border border-gray-200 bg-white flex items-center gap-2 text-[13px] font-semibold text-[#0f1c3f] hover:bg-gray-50 transition-colors"
          >
            <Filter className="h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
            Filter
          </button>

          {/* Clear filters */}
          {(filterStatus !== "all" || filterAgen !== "all" || filterNegara !== "all" || search) && (
            <button
              onClick={() => { setSearch(""); setFilterStatus("all"); setFilterAgen("all"); setFilterNegara("all"); }}
              className="h-10 px-3 rounded-xl text-[12px] font-medium text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} /> Reset
            </button>
          )}

          {/* View mode toggle */}
          <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode("table")}
              className={`p-2 rounded-lg transition-all ${viewMode === "table" ? "bg-white shadow-sm text-[#0f1c3f]" : "text-[#94a3b8] hover:text-[#64748b]"}`}
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-[#0f1c3f]" : "text-[#94a3b8] hover:text-[#64748b]"}`}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>

        {/* ── Pipeline Status section ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white rounded-2xl shadow-sm p-5"
        >
          <h2 className="text-[14px] font-bold text-[#0f1c3f] mb-5">Pipeline Status Visa</h2>
          <div className="flex items-start gap-0 overflow-x-auto pb-2">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.key} className="flex items-start flex-1 min-w-[100px]">
                {/* Stage column */}
                <div className="flex flex-col items-center flex-1 px-1">
                  {/* Icon circle */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-sm"
                    style={{ background: stage.iconBg, border: `1.5px solid ${stage.color}20` }}
                  >
                    <stage.Icon className="h-5 w-5" style={{ color: stage.color }} strokeWidth={1.5} />
                  </div>
                  {/* Count */}
                  <div className="text-2xl font-extrabold leading-none" style={{ color: stage.color }}>
                    {pipelineCounts[i]}
                  </div>
                  {/* Label */}
                  <p className="text-[10px] font-semibold text-[#64748b] text-center mt-1 leading-tight max-w-[80px]">
                    {stage.label}
                  </p>
                </div>
                {/* Arrow connector */}
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="flex items-center pt-4 shrink-0">
                    <div className="flex items-center gap-0.5">
                      {[...Array(3)].map((_, di) => (
                        <div key={di} className="w-1.5 h-0.5 rounded-full bg-gray-300" />
                      ))}
                      <ChevronRight className="h-3.5 w-3.5 text-gray-300 -ml-0.5" strokeWidth={2} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Daftar Tracker table ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl shadow-sm overflow-hidden"
        >
          {/* Table header bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-[14px] font-bold text-[#0f1c3f]">Daftar Tracker</h2>
              <p className="text-[11px] text-[#94a3b8] mt-0.5">
                Menampilkan {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} dari {filtered.length} data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-[12px] font-semibold text-[#64748b] transition-colors"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                Export Excel
              </button>
              <div className="flex items-center gap-1.5 text-[12px] text-[#64748b] font-medium bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
                {pageSize} / halaman
              </div>
            </div>
          </div>

          {/* Table content */}
          {viewMode === "table" ? (
            filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <Landmark className="h-8 w-8 text-gray-300" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-[#0f1c3f]">Tidak ada berkas ditemukan</p>
                <p className="text-[12px] text-[#94a3b8]">Coba ubah filter atau tambah order Visa Student Entry baru.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-gray-100">
                      {["KLIEN", "NEGARA", "JENIS VISA", "ID ORDER", "TANGGAL AJU", "STATUS", "PROGRESS", "AGEN", "AKSI"].map((col) => (
                        <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedData.map((order, idx) => {
                      const m = meta(order);
                      const globalIdx = (page - 1) * pageSize + idx;
                      const client = clientMap.get(order.clientId ?? "");
                      const pelaksanaId = (m.pelaksanaId as string | null) ?? null;
                      const pelaksana = pelaksanaId ? memberMap.get(pelaksanaId) : null;
                      const fee = Number(m.pelaksanaFee ?? DEFAULT_FEE);
                      const feeCredited = !!(m.pelaksanaFeeCredited as boolean | null);
                      const clientName = client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`;
                      const stage = getStageInfo(order);
                      const negara = m.negara as string | undefined;
                      const ci = getCountryInfo(negara);

                      return (
                        <motion.tr
                          key={order.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="border-b border-gray-50 hover:bg-[#F8FAFC] transition-colors group"
                        >
                          {/* KLIEN */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
                              className="flex items-center gap-3 group/klien text-left hover:opacity-80 transition-opacity"
                            >
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                style={{ background: avatarColor(clientName) }}
                              >
                                {initials(clientName)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[#0f1c3f] truncate max-w-[140px] group-hover/klien:text-blue-600 transition-colors">{clientName}</p>
                                <p className="text-[10px] text-[#94a3b8] font-mono">{client?.passportNumber ?? "—"}</p>
                              </div>
                              <Info className="h-3 w-3 text-blue-400 opacity-0 group-hover/klien:opacity-100 transition-opacity shrink-0" strokeWidth={2} />
                            </button>
                          </td>

                          {/* NEGARA */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {ci ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-lg leading-none">{ci.flag}</span>
                                <span className="text-[12px] font-medium text-[#0f1c3f]">{ci.name}</span>
                              </div>
                            ) : (
                              <span className="text-[12px] text-[#94a3b8]">—</span>
                            )}
                          </td>

                          {/* JENIS VISA */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-[12px] font-medium text-[#0f1c3f]">Student Visa</span>
                          </td>

                          {/* ID ORDER */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <span className="text-[12px] font-mono font-semibold text-[#0f1c3f]">{formatOrderId(order, globalIdx)}</span>
                              <button
                                onClick={() => { void navigator.clipboard.writeText(order.id); toast.success("ID disalin!"); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="h-3 w-3 text-[#94a3b8] hover:text-blue-500" strokeWidth={1.5} />
                              </button>
                            </div>
                          </td>

                          {/* TANGGAL AJU */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-[12px] text-[#64748b]">{fmtDate(order.createdAt)}</span>
                          </td>

                          {/* STATUS */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${stage.badgeBg} ${stage.badgeText}`}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stage.color }} />
                                {stage.label}
                              </span>
                              <div className="flex items-center gap-1.5 pl-0.5">
                                <span className="text-[10px] text-[#94a3b8]">Langkah {stage.step + 1}/7</span>
                                {!!(m.visaKendala as string | undefined) && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                                    <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} /> Kendala
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* PROGRESS */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${stage.barColor}`}
                                  style={{ width: `${stage.pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-[#64748b] shrink-0 w-8 text-right">{stage.pct}%</span>
                            </div>
                          </td>

                          {/* AGEN — inline assignment */}
                          <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenAssignPopover(openAssignPopover === order.id ? null : order.id);
                                  setOpenRowMenu(null);
                                }}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all hover:shadow-sm ${
                                  pelaksana
                                    ? "border-blue-100 bg-blue-50 hover:border-blue-300"
                                    : "border-dashed border-orange-200 bg-orange-50 hover:border-orange-400"
                                }`}
                              >
                                {pelaksana ? (
                                  <>
                                    <div
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                                      style={{ background: avatarColor(pelaksana.displayName) }}
                                    >
                                      {initials(pelaksana.displayName)}
                                    </div>
                                    <span className="text-[11px] font-semibold text-blue-800 max-w-[90px] truncate">{pelaksana.displayName}</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCog className="h-3.5 w-3.5 text-orange-500" strokeWidth={1.5} />
                                    <span className="text-[11px] font-medium text-orange-600">Tugaskan</span>
                                  </>
                                )}
                                <ChevronDown className="h-3 w-3 text-gray-400 shrink-0 ml-0.5" strokeWidth={2} />
                                {assigningId === order.id && <Loader2 className="h-3 w-3 animate-spin text-blue-400 shrink-0" />}
                              </button>

                              {openAssignPopover === order.id && (
                                <div className="absolute left-0 top-[calc(100%+4px)] z-40 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                                  <p className="px-4 pt-1 pb-2 text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Pilih Staff</p>
                                  {members.map((mb) => (
                                    <button
                                      key={mb.userId}
                                      onClick={() => { void handleAssign(order, mb.userId); setOpenAssignPopover(null); }}
                                      disabled={assigningId === order.id}
                                      className="w-full text-left px-4 py-2 text-[12px] text-[#0f1c3f] hover:bg-blue-50 flex items-center gap-2.5 disabled:opacity-50 transition-colors"
                                    >
                                      <div
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                                        style={{ background: avatarColor(mb.displayName) }}
                                      >
                                        {initials(mb.displayName)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className={`truncate ${pelaksanaId === mb.userId ? "font-bold text-blue-600" : ""}`}>{mb.displayName}</p>
                                        <p className="text-[10px] text-gray-400 truncate">{mb.role}</p>
                                      </div>
                                      {pelaksanaId === mb.userId && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" strokeWidth={2} />}
                                    </button>
                                  ))}
                                  {pelaksanaId && (
                                    <>
                                      <div className="mx-3 my-1.5 border-t border-gray-100" />
                                      <button
                                        onClick={() => { void handleAssign(order, "__none"); setOpenAssignPopover(null); }}
                                        className="w-full text-left px-4 py-2 text-[12px] text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                      >
                                        <X className="h-3.5 w-3.5" strokeWidth={2} /> Lepas Staff
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* AKSI */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {/* View */}
                              <button
                                onClick={() => navigate(`/orders/detail/${order.id}`)}
                                className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center transition-colors group/btn"
                                title="Lihat detail"
                              >
                                <Eye className="h-4 w-4 text-[#94a3b8] group-hover/btn:text-blue-500 transition-colors" strokeWidth={1.5} />
                              </button>

                              {/* More actions */}
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenRowMenu(openRowMenu === order.id ? null : order.id); }}
                                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
                                  title="Aksi lainnya"
                                >
                                  <MoreVertical className="h-4 w-4 text-[#94a3b8]" strokeWidth={1.5} />
                                </button>

                                {openRowMenu === order.id && (
                                  <div className="absolute right-0 top-9 z-30 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 w-52" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => { navigate(`/orders/detail/${order.id}`); setOpenRowMenu(null); }}
                                      className="w-full text-left px-4 py-2.5 text-[13px] text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2.5"
                                    >
                                      <Eye className="h-4 w-4 text-blue-500" strokeWidth={1.5} /> Lihat Detail
                                    </button>

                                    <div className="mx-3 my-1.5 border-t border-gray-100" />

                                    <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Assign Pelaksana</p>
                                    {members.slice(0, 5).map((mb) => (
                                      <button
                                        key={mb.userId}
                                        onClick={() => { void handleAssign(order, mb.userId); setOpenRowMenu(null); }}
                                        disabled={assigningId === order.id}
                                        className="w-full text-left px-4 py-2 text-[12px] text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2"
                                      >
                                        <div
                                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                                          style={{ background: avatarColor(mb.displayName) }}
                                        >
                                          {initials(mb.displayName)}
                                        </div>
                                        <span className={pelaksanaId === mb.userId ? "font-bold text-blue-600" : ""}>{mb.displayName}</span>
                                        {pelaksanaId === mb.userId && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 ml-auto" strokeWidth={2} />}
                                      </button>
                                    ))}
                                    {pelaksanaId && (
                                      <button
                                        onClick={() => { void handleAssign(order, "__none"); setOpenRowMenu(null); }}
                                        className="w-full text-left px-4 py-2 text-[12px] text-red-500 hover:bg-red-50 flex items-center gap-2"
                                      >
                                        <X className="h-3.5 w-3.5" strokeWidth={2} /> Lepas Pelaksana
                                      </button>
                                    )}

                                    {pelaksanaId && !feeCredited && (
                                      <>
                                        <div className="mx-3 my-1.5 border-t border-gray-100" />
                                        <button
                                          disabled={creditingId === order.id}
                                          onClick={() => { void handleCreditFee(order); setOpenRowMenu(null); }}
                                          className="w-full text-left px-4 py-2.5 text-[13px] text-violet-700 hover:bg-violet-50 flex items-center gap-2.5 disabled:opacity-50"
                                        >
                                          <BadgeDollarSign className="h-4 w-4 text-violet-500" strokeWidth={1.5} />
                                          Bayar Fee {fmtIDR(fee)}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* Grid view */
            <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedData.map((order, idx) => {
                const m = meta(order);
                const client = clientMap.get(order.clientId ?? "");
                const pelaksanaId = (m.pelaksanaId as string | null) ?? null;
                const pelaksana = pelaksanaId ? memberMap.get(pelaksanaId) : null;
                const clientName = client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`;
                const stage = getStageInfo(order);
                const negara = m.negara as string | undefined;
                const ci = getCountryInfo(negara);
                const globalIdx = (page - 1) * pageSize + idx;

                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-[#F8FAFC] rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => navigate(`/orders/detail/${order.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                          style={{ background: avatarColor(clientName) }}
                        >
                          {initials(clientName)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-[#0f1c3f] truncate">{clientName}</p>
                          <p className="text-[10px] text-[#94a3b8] font-mono">{client?.passportNumber ?? "—"}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${stage.badgeBg} ${stage.badgeText}`}>
                        {stage.label}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[11px] text-[#64748b] mb-3">
                      {ci && <div className="flex items-center gap-1.5">{ci.flag} <span>{ci.name}</span></div>}
                      <div className="flex items-center gap-1.5"><span className="font-mono font-semibold">{formatOrderId(order, globalIdx)}</span></div>
                      <div>{fmtDate(order.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div className={`h-full rounded-full ${stage.barColor}`} style={{ width: `${stage.pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-[#64748b]">{stage.pct}%</span>
                    </div>
                    {pelaksana && (
                      <p className="text-[10px] text-[#94a3b8] mt-2">Agen: <span className="font-semibold text-[#64748b]">{pelaksana.displayName}</span></p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* ── Pagination ────────────────────────────────────────────────── */}
          {filtered.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <p className="text-[12px] text-[#94a3b8]">
                Halaman {page} dari {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-[#64748b]" strokeWidth={2} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i < 5 ? i + 1 : i === 5 ? -1 : totalPages;
                  } else if (page >= totalPages - 3) {
                    p = i === 0 ? 1 : i === 1 ? -1 : totalPages - (6 - i);
                  } else {
                    p = i === 0 ? 1 : i === 1 ? -1 : i === 6 ? totalPages : i === 5 ? -2 : page + (i - 3);
                  }
                  if (p < 0) {
                    return <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-[#94a3b8] text-[12px]">…</span>;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-[13px] font-semibold transition-all ${
                        p === page
                          ? "text-white shadow-sm"
                          : "border border-gray-200 text-[#64748b] hover:bg-gray-50"
                      }`}
                      style={p === page ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)" } : undefined}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-[#64748b]" strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </motion.div>

      </div>
    </div>

    {/* ── Client Detail Panel (slide-in from right) ─────────────────────────── */}
    <AnimatePresence>
      {selectedOrder && (() => {
        const so = selectedOrder;
        const sm = meta(so);
        const sc = clientMap.get(so.clientId ?? "");
        const sPelaksanaId = (sm.pelaksanaId as string | null) ?? null;
        const sPelaksana = sPelaksanaId ? memberMap.get(sPelaksanaId) : null;
        const sStage = getStageInfo(so);
        const sNegara = sm.negara as string | undefined;
        const sCi = getCountryInfo(sNegara);
        const sClientName = sc?.name ?? so.title ?? `Order #${so.id.slice(0, 8)}`;
        const sKendala = sm.visaKendala as string | undefined;
        const sNotes = sm.notes as string | undefined ?? so.notes;
        const sFee = Number(sm.pelaksanaFee ?? DEFAULT_FEE);
        const sFeeCredited = !!(sm.pelaksanaFeeCredited as boolean | null);

        return (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm hidden md:block"
              onClick={() => setSelectedOrder(null)}
            />
            {/* Panel */}
            <motion.div
              key="panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white shadow-2xl flex flex-col hidden md:flex"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100" style={{ background: "linear-gradient(135deg,#1e40af,#2563eb)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[13px] font-bold shrink-0 border-2 border-white/30"
                    style={{ background: avatarColor(sClientName) }}
                  >
                    {initials(sClientName)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold text-white truncate">{sClientName}</p>
                    <p className="text-[11px] text-blue-200 font-mono">{sc?.passportNumber ?? "—"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-white" strokeWidth={2} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Status + progress */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full ${sStage.badgeBg} ${sStage.badgeText}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: sStage.color }} />
                      {sStage.label}
                    </span>
                    <span className="text-[12px] font-bold text-[#64748b]">Langkah {sStage.step + 1} / 7</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-[#64748b]">Progress Keseluruhan</span>
                      <span className="text-[12px] font-bold text-[#0f1c3f]">{sStage.pct}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${sStage.pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className={`h-full rounded-full ${sStage.barColor}`}
                      />
                    </div>
                  </div>
                  {/* Stage steps mini-timeline */}
                  <div className="flex items-center gap-0.5 pt-1">
                    {PIPELINE_STAGES.map((ps, i) => {
                      const done = i < sStage.step + 1;
                      const active = i === sStage.step;
                      return (
                        <div key={ps.key} title={ps.label} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className={`h-1.5 w-full rounded-full transition-all ${done ? (active ? "" : "bg-gray-300") : "bg-gray-100"}`}
                            style={active ? { background: sStage.color } : undefined} />
                          {active && <span className="text-[8px] text-center text-[#64748b] leading-tight font-semibold max-w-[50px] truncate">{ps.label}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Kendala warning */}
                {sKendala && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" strokeWidth={2} />
                    <div>
                      <p className="text-[12px] font-bold text-red-700 mb-0.5">Ada Kendala</p>
                      <p className="text-[12px] text-red-600 leading-relaxed">{sKendala}</p>
                    </div>
                  </div>
                )}

                {/* Client info */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-2">Informasi Klien</p>
                  {[
                    { icon: Users, label: "Nama Lengkap", value: sc?.name ?? "—" },
                    { icon: CreditCard, label: "Nomor Paspor", value: sc?.passportNumber ?? "—", mono: true },
                    { icon: Phone, label: "Telepon / WhatsApp", value: sc?.phone ?? "—" },
                    { icon: Mail, label: "Email", value: sc?.email ?? "—" },
                  ].map(({ icon: Icon, label, value, mono }) => (
                    <div key={label} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#94a3b8] font-medium">{label}</p>
                        <p className={`text-[13px] font-semibold text-[#0f1c3f] truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order info */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-2">Detail Order</p>
                  {[
                    { icon: Hash, label: "ID Order", value: so.id.slice(0, 16) + "…", mono: true },
                    { icon: MapPin, label: "Negara Tujuan", value: sCi ? `${sCi.flag} ${sCi.name}` : "—" },
                    { icon: CalendarDays, label: "Tanggal Pengajuan", value: fmtDate(so.createdAt) },
                    { icon: FileText, label: "Jenis Visa", value: "Student Visa" },
                  ].map(({ icon: Icon, label, value, mono }) => (
                    <div key={label} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#94a3b8] font-medium">{label}</p>
                        <p className={`text-[13px] font-semibold text-[#0f1c3f] truncate ${mono ? "font-mono" : ""}`}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Assigned staff */}
                <div>
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-2">Staff Penanganan</p>
                  {sPelaksana ? (
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ background: avatarColor(sPelaksana.displayName) }}
                      >
                        {initials(sPelaksana.displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-blue-800">{sPelaksana.displayName}</p>
                        <p className="text-[11px] text-blue-500">{sPelaksana.role}</p>
                      </div>
                      {sFeeCredited ? (
                        <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Lunas
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                          Fee: {fmtIDR(sFee)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-orange-50 border border-dashed border-orange-200 rounded-2xl px-4 py-3">
                      <UserCog className="h-5 w-5 text-orange-400 shrink-0" strokeWidth={1.5} />
                      <p className="text-[13px] text-orange-600 font-medium italic">Belum ada staff yang ditugaskan</p>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {sNotes && (
                  <div>
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-2">Catatan</p>
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                      <p className="text-[13px] text-amber-900 leading-relaxed">{sNotes}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
                <button
                  onClick={() => navigate(`/orders/detail/${so.id}`)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
                >
                  <Eye className="h-4 w-4" strokeWidth={2} />
                  Buka Detail Order
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-12 h-12 rounded-2xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <X className="h-4 w-4 text-[#64748b]" strokeWidth={2} />
                </button>
              </div>
            </motion.div>
          </>
        );
      })()}
    </AnimatePresence>
    </>
  );
}
