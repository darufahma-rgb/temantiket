/**
 * OwnerVisaTrackerPage — /visa-tracker
 *
 * Dashboard operasional owner untuk monitoring & kontrol semua berkas
 * Visa Student Entry. Tampilkan ringkasan, tabel semua berkas, assignment
 * pelaksana inline, dan pelacakan pembayaran fee pelaksana.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText, AlertTriangle, CheckCircle2, Clock,
  Wallet, ChevronRight, RefreshCw, Loader2,
  Users, BadgeDollarSign, Search, Filter,
  UserCheck, X, CircleDot, Landmark, ExternalLink,
  ChevronLeft, Plus, Bell, MoreVertical, ChevronDown,
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
const MOBILE_PAGE_SIZE = 5;

function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); } catch { return iso; }
}

type MemberInfo = { userId: string; displayName: string; email: string; role: string };

type FilterStatus = "all" | "belum" | "proses" | "selesai" | "kendala" | "belum_dibayar";

function StepBadge({ step }: { step: number }) {
  const s = VISA_STEPS[Math.min(step, VISA_STEPS.length - 1)];
  const done = step >= VISA_STEPS.length - 1;
  if (done) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      🎉 Visa Terbit
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
      {s?.emoji} {s?.label ?? "—"}
    </span>
  );
}

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

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterPelaksana, setFilterPelaksana] = useState<string>("all");

  // Mobile-only state
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

  // Reset mobile page when filters change
  useEffect(() => { setMobilePage(1); }, [search, filterStatus, filterPelaksana]);

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

  const meta = (o: Order) => (o.metadata ?? {}) as Record<string, unknown>;

  const stats = useMemo(() => {
    const total         = visaOrders.length;
    const belum         = visaOrders.filter((o) => !meta(o).pelaksanaId).length;
    const selesai       = visaOrders.filter((o) => Number(meta(o).processStep ?? 0) >= VISA_STEPS.length - 1).length;
    const kendala       = visaOrders.filter((o) => meta(o).visaKendala).length;
    const proses        = total - belum - selesai;
    const feeTotalSum   = visaOrders.reduce((s, o) => s + Number(meta(o).pelaksanaFee ?? DEFAULT_FEE), 0);
    const feePaid       = visaOrders.filter((o) => meta(o).pelaksanaId && meta(o).pelaksanaFeeCredited).reduce((s, o) => s + Number(meta(o).pelaksanaFee ?? DEFAULT_FEE), 0);
    const feeUnpaid     = visaOrders.filter((o) => meta(o).pelaksanaId && !meta(o).pelaksanaFeeCredited).reduce((s, o) => s + Number(meta(o).pelaksanaFee ?? DEFAULT_FEE), 0);
    return { total, belum, proses: proses < 0 ? 0 : proses, selesai, kendala, feeTotalSum, feePaid, feeUnpaid };
  }, [visaOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = [...visaOrders];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => {
        const client = clientMap.get(o.clientId ?? "");
        return (
          (client?.name ?? "").toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.title ?? "").toLowerCase().includes(q)
        );
      });
    }

    if (filterPelaksana !== "all") {
      if (filterPelaksana === "__none") {
        list = list.filter((o) => !meta(o).pelaksanaId);
      } else {
        list = list.filter((o) => meta(o).pelaksanaId === filterPelaksana);
      }
    }

    if (filterStatus !== "all") {
      list = list.filter((o) => {
        const m = meta(o);
        const step = Number(m.processStep ?? 0);
        const isDone = step >= VISA_STEPS.length - 1;
        switch (filterStatus) {
          case "belum":        return !m.pelaksanaId;
          case "selesai":      return isDone;
          case "kendala":      return !!m.visaKendala;
          case "belum_dibayar": return !!m.pelaksanaId && !m.pelaksanaFeeCredited;
          case "proses":       return !!m.pelaksanaId && !isDone;
          default:             return true;
        }
      });
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visaOrders, search, filterStatus, filterPelaksana, clientMap]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }

  async function handleMigrateProgressSteps() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await fetch("/api/migrate-progress-steps", { method: "POST", credentials: "include" });
      const json = await res.json();
      if (json.ok) {
        setMigrateResult({ migrated: json.migrated, skipped: json.skipped, errors: json.errors });
        toast.success(`✅ Migrasi selesai: ${json.migrated} order diperbarui, ${json.skipped} skip, ${json.errors} error`);
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
      toast.success(memberId === "__none" ? "Pelaksana dilepas" : "Pelaksana lapangan berhasil di-assign!");
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
          agentId:     pelaksanaId,
          type:        "pelaksana_fee",
          pointsDelta: 0,
          amountIDR:   fee,
          description: `Fee Pelaksana Visa Student #${order.id.slice(0, 8)}${order.title ? ` — ${order.title}` : ""}`,
          createdBy:   user?.id ?? "owner",
          orderId:     order.id,
        },
        `pelaksana-${order.id}`,
      );
      if (!persisted) {
        toast.error("Gagal catat fee pelaksana.", { description: walletErr ?? "Coba lagi." });
        return;
      }
      await patchOrder(order.id, {
        metadata: { ...m, pelaksanaFeeCredited: true },
      });
      toast.success(`Fee Pelaksana ${fmtIDR(fee)} dikreditkan ke wallet pelaksana!`, { duration: 4000 });
    } catch {
      toast.error("Gagal catat fee pelaksana.");
    } finally {
      setCreditingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Memuat data visa…</span>
      </div>
    );
  }

  // Mobile computed values
  const mobileTabs: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all",    label: "Semua",     count: visaOrders.length },
    { key: "belum",  label: "Belum Ditugaskan", count: stats.belum  },
    { key: "proses", label: "Diproses",  count: stats.proses  },
    { key: "selesai",label: "Selesai",   count: stats.selesai },
    { key: "kendala",label: "Kendala",   count: stats.kendala },
  ];
  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const mobilePagedList  = filtered.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE);

  function initials(name: string) {
    return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
  }

  return (
    <>
    {/* ══════════════ MOBILE LAYOUT ══════════════ */}
    <div
      className="md:hidden min-h-screen bg-[#F0F4FB] pb-28"
      style={{ WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
      onClick={() => setMobileMoreMenu(null)}
    >
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5 text-[#0f1c3f]" strokeWidth={2.5} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#0f1c3f] leading-tight">Visa Tracker</h1>
            <p className="text-[11px] text-[#64748b] mt-0.5 leading-snug">
              Pantau semua pengajuan visa dalam satu tempat
            </p>
          </div>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
        >
          <RefreshCw className={`h-4.5 w-4.5 text-[#0f1c3f] ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-4 space-y-4">

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Pengajuan",  value: stats.total,   bg: "bg-blue-50",   ic: "text-blue-600",   icon: FileText      },
            { label: "Belum Ditugaskan", value: stats.belum,   bg: "bg-orange-50", ic: "text-orange-600", icon: Clock         },
            { label: "Sedang Diproses",  value: stats.proses,  bg: "bg-indigo-50", ic: "text-indigo-600", icon: CircleDot     },
            { label: "Visa Terbit",      value: stats.selesai, bg: "bg-green-50",  ic: "text-green-600",  icon: CheckCircle2  },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg} ${s.ic}`}>
                <s.icon className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div className="text-2xl font-bold text-[#0f1c3f]">{s.value}</div>
              <div className="text-[11px] text-[#64748b] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + filter row */}
        <div className="bg-white rounded-2xl shadow-sm p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama klien, ID order…"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-[13px] text-[#0f1c3f] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/30 focus:border-[#0066FF]/50"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 active:opacity-60">
                  <X className="h-3.5 w-3.5 text-[#64748b]" strokeWidth={2} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowMobileFilter(true)}
              className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
            >
              <Filter className="h-4 w-4 text-[#0f1c3f]" strokeWidth={1.5} />
            </button>
          </div>
          <p className="text-[11px] text-[#64748b] px-1">
            Menampilkan <span className="font-bold text-[#0f1c3f]">{filtered.length}</span> dari {visaOrders.length} berkas
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {mobileTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all active:opacity-60 ${
                filterStatus === tab.key
                  ? "text-white shadow-sm"
                  : "bg-white text-[#64748b]"
              }`}
              style={filterStatus === tab.key
                ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" }
                : undefined}
            >
              {tab.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                filterStatus === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-[#64748b]"
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Visa cards */}
        {mobilePagedList.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <Landmark className="h-10 w-10 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[13px] font-semibold text-[#0f1c3f]">Tidak ada berkas ditemukan</p>
            <p className="text-[11px] text-[#64748b] mt-1">Coba ubah filter atau tambah order baru</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mobilePagedList.map((order) => {
              const m          = meta(order);
              const step       = Number(m.processStep ?? 0);
              const isDone     = step >= VISA_STEPS.length - 1;
              const kendala    = (m.visaKendala as string | null) ?? null;
              const pelaksanaId  = (m.pelaksanaId as string | null) ?? null;
              const fee        = Number(m.pelaksanaFee ?? DEFAULT_FEE);
              const feeCredited = !!(m.pelaksanaFeeCredited as boolean | null);
              const client     = clientMap.get(order.clientId ?? "");
              const pelaksana  = pelaksanaId ? memberMap.get(pelaksanaId) : null;
              const clientName = client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`;

              const statusColor = isDone
                ? { border: "border-green-200", badge: "bg-green-100 text-green-700", text: "Visa Terbit" }
                : kendala
                ? { border: "border-amber-200", badge: "bg-amber-100 text-amber-700", text: "Ada Kendala" }
                : !pelaksanaId
                ? { border: "border-orange-200", badge: "bg-orange-100 text-orange-700", text: "Belum Ditugaskan" }
                : { border: "border-indigo-100", badge: "bg-indigo-100 text-indigo-700", text: "Diproses" };

              return (
                <div key={order.id} className={`bg-white rounded-3xl shadow-sm border ${statusColor.border} overflow-hidden`}>
                  <div className="p-4">
                    {/* Card header */}
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white text-[13px] font-bold"
                        style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}>
                        {initials(clientName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[14px] font-bold text-[#0f1c3f] truncate">{clientName}</p>
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
                                  onClick={() => { navigate(`/orders/detail/${order.id}`); setMobileMoreMenu(null); }}
                                  className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-[#0066FF]" strokeWidth={1.5} /> Lihat Detail
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor.badge}`}>{statusColor.text}</span>
                          <span className="text-[10px] text-[#64748b] font-mono">#{order.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-[#64748b]">{fmtDate(order.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Kendala note */}
                    {kendala && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800">{kendala}</p>
                      </div>
                    )}

                    {/* Progress timeline */}
                    <div className="mt-3">
                      <div className="flex items-center gap-1">
                        {VISA_STEPS.map((s, i) => {
                          const done   = i < step;
                          const active = i === step;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <div className={`h-1.5 w-full rounded-full ${done ? "bg-green-500" : active ? "bg-[#0066FF]" : "bg-gray-100"}`} />
                              <span className={`text-[9px] ${active ? "text-[#0066FF] font-bold" : done ? "text-green-600" : "text-gray-300"}`}>{s.emoji}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Pelaksana + fee row */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="h-3.5 w-3.5 text-[#64748b] shrink-0" strokeWidth={1.5} />
                        {pelaksana
                          ? <span className="text-[11px] font-semibold text-[#0f1c3f] truncate">{pelaksana.displayName}</span>
                          : <span className="text-[11px] text-orange-600 font-medium italic">Belum Ditugaskan</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pelaksanaId && feeCredited && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Fee Dibayar
                          </span>
                        )}
                        {pelaksanaId && !feeCredited && (
                          <button
                            disabled={creditingId === order.id}
                            onClick={() => void handleCreditFee(order)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-violet-600 px-3 py-1.5 rounded-full active:opacity-60 disabled:opacity-50"
                          >
                            {creditingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeDollarSign className="h-3 w-3" />}
                            Bayar {fmtIDR(fee)}
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/orders/detail/${order.id}`)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] active:opacity-60"
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

        {/* Pagination */}
        {mobileTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2">
            <button
              onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
              disabled={mobilePage === 1}
              className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center disabled:opacity-40 active:opacity-60"
            >
              <ChevronLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
            <span className="text-[13px] font-semibold text-[#0f1c3f]">{mobilePage} / {mobileTotalPages}</span>
            <button
              onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
              disabled={mobilePage === mobileTotalPages}
              className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center disabled:opacity-40 active:opacity-60"
            >
              <ChevronRight className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Aksi Cepat */}
        <div className="bg-white rounded-3xl shadow-sm p-4">
          <h3 className="text-[14px] font-bold text-[#0f1c3f] mb-3">Aksi Cepat</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Plus,       label: "Pengajuan Baru",    sub: "Tambah berkas baru",     action: () => navigate("/orders"), bg: "bg-blue-50",   ic: "text-blue-600"   },
              { icon: Search,     label: "Cek Status Visa",   sub: "Cari berdasarkan ref",   action: () => document.querySelector("input")?.focus(),           bg: "bg-green-50",  ic: "text-green-600"  },
              { icon: FileText,   label: "Dokumen Saya",      sub: "Kelola dokumen visa",    action: () => toast.info("Segera hadir! 🚀"),                       bg: "bg-purple-50", ic: "text-purple-600" },
              { icon: Bell,       label: "Pengingat",         sub: "Atur notifikasi visa",   action: () => toast.info("Segera hadir! 🚀"),                       bg: "bg-amber-50",  ic: "text-amber-600"  },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="text-left p-3 rounded-2xl border border-gray-100 bg-gray-50/60 active:opacity-60 transition-opacity"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${item.bg} ${item.ic}`}>
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="text-[12px] font-semibold text-[#0f1c3f] leading-tight">{item.label}</div>
                <div className="text-[10px] text-[#64748b] mt-0.5">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Fee summary card */}
        <div className="bg-white rounded-3xl shadow-sm p-4">
          <h3 className="text-[14px] font-bold text-[#0f1c3f] mb-3">Ringkasan Fee Pelaksana</h3>
          <div className="space-y-2.5">
            {[
              { label: "Total Fee",      value: stats.feeTotalSum, color: "text-[#0f1c3f]",    icon: BadgeDollarSign },
              { label: "Sudah Dibayar",  value: stats.feePaid,     color: "text-green-600",    icon: CheckCircle2   },
              { label: "Belum Dibayar",  value: stats.feeUnpaid,   color: "text-red-500",      icon: Wallet         },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2">
                  <row.icon className="h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
                  <span className="text-[12px] text-[#64748b]">{row.label}</span>
                </div>
                <span className={`text-[13px] font-bold font-mono ${row.color}`}>{fmtIDR(row.value)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>{/* end px-4 space-y-4 */}

      {/* Filter bottom sheet */}
      {showMobileFilter && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilter(false)} />
          <div className="relative bg-white rounded-t-3xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-[16px] font-bold text-[#0f1c3f]">Filter &amp; Urutkan</h3>
              <button onClick={() => setShowMobileFilter(false)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:opacity-60">
                <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 pb-8">
              {/* Status filter */}
              <div>
                <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "all" as FilterStatus,           label: "Semua Status"         },
                    { key: "belum" as FilterStatus,         label: "⏳ Belum Ditugaskan"  },
                    { key: "proses" as FilterStatus,        label: "🔄 Sedang Diproses"   },
                    { key: "selesai" as FilterStatus,       label: "✅ Selesai / Terbit"  },
                    { key: "kendala" as FilterStatus,       label: "⚠️ Ada Kendala"       },
                    { key: "belum_dibayar" as FilterStatus, label: "💸 Fee Belum Dibayar" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setFilterStatus(opt.key); setShowMobileFilter(false); }}
                      className={`text-left px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all active:opacity-60 ${
                        filterStatus === opt.key
                          ? "text-white"
                          : "bg-gray-50 text-[#0f1c3f] border border-gray-200"
                      }`}
                      style={filterStatus === opt.key ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : undefined}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Pelaksana filter */}
              <div>
                <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Pelaksana</p>
                <div className="relative">
                  <select
                    value={filterPelaksana}
                    onChange={(e) => setFilterPelaksana(e.target.value)}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] text-[#0f1c3f] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/30 pr-8"
                  >
                    <option value="all">Semua Pelaksana</option>
                    <option value="__none">— Belum Ditugaskan —</option>
                    {members.map((mb) => (
                      <option key={mb.userId} value={mb.userId}>{mb.displayName}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748b]" strokeWidth={2} />
                </div>
              </div>
              {/* Clear */}
              {(filterStatus !== "all" || filterPelaksana !== "all") && (
                <button
                  onClick={() => { setFilterStatus("all"); setFilterPelaksana("all"); setShowMobileFilter(false); }}
                  className="w-full py-3 rounded-2xl border border-gray-200 text-[13px] font-semibold text-[#64748b] active:opacity-60"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>{/* end md:hidden */}

    {/* ══════════════ DESKTOP LAYOUT ══════════════ */}
    <div className="hidden md:block p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-extrabold text-foreground">Laporan Visa Student Entry</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitoring & kontrol semua berkas visa pelajar</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* One-time migration button — converts old 5-step progress to new unified 6-step */}
          <button
            onClick={() => void handleMigrateProgressSteps()}
            disabled={migrating}
            title="Sinkronkan data processStep lama ke sistem langkah terpadu (jalankan sekali)"
            className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 hover:text-amber-700 transition-colors border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg px-2.5 py-1.5"
          >
            {migrating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
            {migrating ? "Migrasi…" : "Sinkron Progress"}
          </button>
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Migration result banner ── */}
      {migrateResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-emerald-800 font-medium">
            Sinkronisasi selesai: <strong>{migrateResult.migrated}</strong> order diperbarui,{" "}
            <strong>{migrateResult.skipped}</strong> sudah sinkron, <strong>{migrateResult.errors}</strong> error.
          </p>
          <button onClick={() => setMigrateResult(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Stats grid ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          { label: "Semua Berkas Visa",         value: stats.total,   icon: FileText,      color: "bg-sky-50 border-sky-100 text-sky-700",           iconCls: "text-sky-400" },
          { label: "Belum Didelegasikan",        value: stats.belum,   icon: Clock,         color: "bg-orange-50 border-orange-100 text-orange-700",  iconCls: "text-orange-400" },
          { label: "Sedang Diproses",            value: stats.proses,  icon: CircleDot,     color: "bg-indigo-50 border-indigo-100 text-indigo-700",  iconCls: "text-indigo-400" },
          { label: "Visa Terbit / Selesai",      value: stats.selesai, icon: CheckCircle2,  color: "bg-emerald-50 border-emerald-100 text-emerald-700", iconCls: "text-emerald-400" },
          { label: "Berkas Bermasalah",          value: stats.kendala, icon: AlertTriangle, color: "bg-amber-50 border-amber-100 text-amber-700",     iconCls: "text-amber-400" },
          { label: "Total Fee Pelaksana",        value: fmtIDR(stats.feeTotalSum), icon: BadgeDollarSign, color: "bg-violet-50 border-violet-100 text-violet-700", iconCls: "text-violet-400", isText: true },
          { label: "Fee Sudah Dibayar",          value: fmtIDR(stats.feePaid),    icon: Wallet,          color: "bg-emerald-50 border-emerald-100 text-emerald-700", iconCls: "text-emerald-400", isText: true },
          { label: "Fee Belum Dibayar",          value: fmtIDR(stats.feeUnpaid),  icon: Wallet,          color: "bg-red-50 border-red-100 text-red-700",   iconCls: "text-red-400", isText: true },
        ].map(({ label, value, icon: Icon, color, iconCls, isText }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <div className="flex items-start justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
              <Icon className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} />
            </div>
            <p className={`font-extrabold ${isText ? "text-sm font-mono" : "text-xl md:text-2xl"}`}>{value}</p>
          </div>
        ))}
      </motion.div>

      {/* ── Filters ── */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari nama klien atau ID order…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="h-9 w-[180px] text-[12px]">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="belum">⏳ Belum Didelegasikan</SelectItem>
              <SelectItem value="proses">🔄 Sedang Diproses</SelectItem>
              <SelectItem value="selesai">✅ Selesai / Visa Terbit</SelectItem>
              <SelectItem value="kendala">⚠️ Ada Kendala</SelectItem>
              <SelectItem value="belum_dibayar">💸 Fee Belum Dibayar</SelectItem>
            </SelectContent>
          </Select>

          {/* Pelaksana filter */}
          <Select value={filterPelaksana} onValueChange={setFilterPelaksana}>
            <SelectTrigger className="h-9 w-[200px] text-[12px]">
              <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Filter pelaksana" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Pelaksana</SelectItem>
              <SelectItem value="__none">— Belum Ditugaskan —</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear filters */}
          {(filterStatus !== "all" || filterPelaksana !== "all" || search) && (
            <button
              onClick={() => { setSearch(""); setFilterStatus("all"); setFilterPelaksana("all"); }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Reset filter
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Menampilkan <span className="font-bold text-foreground">{filtered.length}</span> dari {visaOrders.length} berkas visa
        </p>
      </div>

      {/* ── Berkas list ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center">
            <Landmark className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-sm font-semibold">Tidak ada berkas ditemukan</p>
            <p className="text-xs text-muted-foreground mt-1">Coba ubah filter atau tambah order Visa Student Entry baru.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order, idx) => {
            const m = meta(order);
            const step         = Number(m.processStep ?? 0);
            const isDone       = step >= VISA_STEPS.length - 1;
            const kendala      = (m.visaKendala as string | null) ?? null;
            const pelaksanaId  = (m.pelaksanaId as string | null) ?? null;
            const fee          = Number(m.pelaksanaFee ?? DEFAULT_FEE);
            const feeCredited  = !!(m.pelaksanaFeeCredited as boolean | null);
            const client       = clientMap.get(order.clientId ?? "");
            const pelaksana    = pelaksanaId ? memberMap.get(pelaksanaId) : null;
            const agenId       = order.createdByAgent as string | null;
            const agenPenjual  = agenId
              ? (memberMap.get(agenId)?.displayName ?? `#${agenId.slice(0, 8)}`)
              : null;

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.02 }}
                className={`rounded-2xl border bg-white overflow-hidden ${
                  isDone ? "border-emerald-200" :
                  kendala ? "border-amber-200" :
                  !pelaksanaId ? "border-orange-200" :
                  "border-border"
                }`}
              >
                {/* Row header */}
                <div className="px-4 pt-4 pb-3 flex items-start gap-3 flex-wrap">
                  {/* Left: client info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-bold leading-tight">
                        {client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`}
                      </p>
                      <StepBadge step={step} />
                      {kendala && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> Kendala
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
                      <span className="font-mono">#{order.id.slice(0, 8)}</span>
                      <span>·</span>
                      <span>{fmtDate(order.createdAt)}</span>
                      {client?.phone && <><span>·</span><span>{client.phone}</span></>}
                      {agenPenjual && (
                        <><span>·</span>
                        <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold">
                          Agen: {agenPenjual}
                        </span></>
                      )}
                    </div>
                  </div>

                  {/* Right: view detail */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] shrink-0"
                    onClick={() => navigate(`/orders/detail/${order.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Detail
                  </Button>
                </div>

                {/* Progress bar */}
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-1">
                    {VISA_STEPS.map((s, i) => {
                      const done   = i < step;
                      const active = i === step;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className={`h-1 w-full rounded-full ${done ? "bg-emerald-500" : active ? "bg-indigo-500" : "bg-muted/30"}`} />
                          <span className={`text-[8px] ${active ? "text-indigo-600 font-bold" : done ? "text-emerald-600" : "text-muted-foreground/40"}`}>{s.emoji}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Kendala note */}
                {kendala && (
                  <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800">{kendala}</p>
                  </div>
                )}

                {/* Bottom row: pelaksana + fee */}
                <div className="px-4 pb-4 pt-1 border-t border-border/50 mt-1 flex items-center gap-3 flex-wrap">

                  {/* Assign Pelaksana Lapangan */}
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <Select
                      value={pelaksanaId ?? "__none"}
                      onValueChange={(v) => void handleAssign(order, v)}
                      disabled={assigningId === order.id}
                    >
                      <SelectTrigger className={`h-8 text-[11px] flex-1 ${!pelaksanaId ? "border-orange-200 bg-orange-50" : "border-indigo-200 bg-indigo-50"}`}>
                        <SelectValue>
                          {pelaksana
                            ? <span className="flex items-center gap-1"><UserCheck className="h-3 w-3 text-indigo-600" />{pelaksana.displayName}</span>
                            : <span className="text-orange-600 font-medium">⚠ Belum Ditugaskan</span>
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— Lepas Pelaksana —</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.displayName}
                            <span className="text-[10px] text-muted-foreground ml-1">({m.role})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {assigningId === order.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                  </div>

                  {/* Fee Pelaksana */}
                  {pelaksanaId && (
                    <div className="flex items-center gap-2 shrink-0">
                      {feeCredited ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Fee {fmtIDR(fee)} — Sudah Dibayar
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 text-[11px] bg-violet-600 hover:bg-violet-700 text-white"
                          disabled={creditingId === order.id}
                          onClick={() => void handleCreditFee(order)}
                        >
                          {creditingId === order.id
                            ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                            : <BadgeDollarSign className="h-3 w-3 mr-1.5" />
                          }
                          Bayar Fee {fmtIDR(fee)}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* If no pelaksana, fee column shows pending */}
                  {!pelaksanaId && (
                    <span className="text-[10px] text-orange-600 italic shrink-0">
                      Fee menunggu delegasi
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}
