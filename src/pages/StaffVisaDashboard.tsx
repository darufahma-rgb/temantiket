/**
 * StaffVisaDashboard — /staff/visa
 *
 * Dashboard pelaksana lapangan visa student.
 * Visual language matches AgentDashboard: white cards, slate borders,
 * blue accent, same grid rhythm.
 *
 * Staff-specific: assigned berkas, progress update, fee pelaksana.
 * No HPP/margin/leaderboard/sales data.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText, AlertTriangle, CheckCircle2,
  Clock, Wallet, ChevronRight, RefreshCw, Loader2,
  MessageSquare, TrendingUp, BadgeCheck,
  ClipboardList, LayoutDashboard, UserCircle,
  ArrowUpRight, Zap, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { pullWalletTxs, walletBalance, type WalletTransaction } from "@/lib/agentWallet";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { fmtIDR } from "@/lib/profit";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 },
  }),
};

function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); } catch { return iso; }
}

function StepBadge({ step }: { step: number }) {
  const s = VISA_STEPS[Math.min(step, VISA_STEPS.length - 1)];
  const done = step >= VISA_STEPS.length - 1;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
      done ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
    }`}>
      {s?.emoji} {s?.label ?? "—"}
    </span>
  );
}

type DashTab = "berkas" | "komisi";

export default function StaffVisaDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders, patchOrder } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<DashTab>(() =>
    searchParams.get("tab") === "komisi" ? "komisi" : "berkas"
  );

  const staffId = user?.id ?? "";

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchClients()]);
      if (staffId) {
        const txs = await pullWalletTxs(staffId);
        setWalletTxs(txs);
      }
      setLoading(false);
    })();
  }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "komisi") setActiveTab("komisi");
    else if (tabParam === "berkas") setActiveTab("berkas");
  }, [searchParams]);

  const myOrders = useMemo(
    () => orders.filter(
      (o) => o.type === "visa_student" &&
        (o.metadata as Record<string, unknown>)?.pelaksanaId === staffId,
    ),
    [orders, staffId],
  );

  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  const walletBal = useMemo(() => {
    const pelaksanaTxs = walletTxs.filter((t) => t.type === "pelaksana_fee" || t.type === "payout");
    return walletBalance(pelaksanaTxs);
  }, [walletTxs]);

  const komisiTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "pelaksana_fee"),
    [walletTxs],
  );

  const stats = useMemo(() => {
    const total   = myOrders.length;
    const selesai = myOrders.filter(
      (o) => Number((o.metadata as Record<string, unknown>)?.processStep ?? 0) >= VISA_STEPS.length - 1,
    ).length;
    const kendala = myOrders.filter(
      (o) => (o.metadata as Record<string, unknown>)?.visaKendala,
    ).length;
    const proses = Math.max(0, total - selesai - kendala);
    return { total, selesai, kendala, proses };
  }, [myOrders]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchOrders();
    const txs = await pullWalletTxs(staffId);
    setWalletTxs(txs);
    setRefreshing(false);
  }

  async function handleAdvance(orderId: string, currentStep: number) {
    const nextStep = currentStep + 1;
    if (nextStep >= VISA_STEPS.length) return;
    setAdvancing(orderId);
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await patchOrder(orderId, {
        metadata: {
          ...(order.metadata as Record<string, unknown>),
          processStep: nextStep,
          [`stepUpdatedAt_${nextStep}`]: new Date().toISOString(),
        },
      });
    } finally {
      setAdvancing(null);
    }
  }

  async function handleSaveNote(orderId: string) {
    setSavingNote(orderId);
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const note = notes[orderId] ?? "";
      await patchOrder(orderId, {
        metadata: {
          ...(order.metadata as Record<string, unknown>),
          visaKendala: note.trim() || null,
        },
      });
      setEditingNote(null);
    } finally {
      setSavingNote(null);
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

  const navButtons = [
    { icon: UserCircle, label: "Profil Staff", path: "/settings" },
    { icon: LayoutDashboard, label: "Staff Card", path: "/settings" },
  ];

  const TABS: { key: DashTab; label: string; icon: React.ElementType }[] = [
    { key: "berkas", label: "Visa Saya", icon: ClipboardList },
    { key: "komisi", label: "Komisi Saya", icon: Wallet },
  ];

  return (
    <div className="pb-8 md:p-6 max-w-5xl md:mx-auto space-y-4 md:space-y-5">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Mobile header */}
        <div className="md:hidden rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">
              Staff Dashboard
            </p>
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          <div className="px-4 pb-2">
            <h1 className="text-[16px] font-extrabold text-slate-900 tracking-tight leading-snug">
              Halo, {user?.displayName ?? "Staff"} 👋
            </h1>
            <p className="text-[10.5px] text-slate-400 mt-0.5">Pelaksana Visa Student</p>
          </div>
          <div className="px-3 pb-3.5 grid grid-cols-2 gap-2">
            {navButtons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => navigate(btn.path)}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all active:scale-95"
              >
                <btn.icon className="h-4 w-4 stroke-[1.5]" />
                <span className="text-[10px] font-semibold leading-none text-center">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex rounded-3xl bg-white border border-slate-100 shadow-sm p-6 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1">
              Staff Dashboard
            </p>
            <h1 className="text-[26px] font-extrabold leading-tight text-slate-900 tracking-tight">
              Halo, {user?.displayName ?? "Staff"} 👋
            </h1>
            <p className="text-[12.5px] text-slate-400 mt-1">
              Kelola berkas visa yang ditugaskan ke kamu di sini.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3.5">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-blue-50 border border-blue-200 text-blue-700">
                🏛️ Pelaksana Visa Student
              </span>
              {user?.email && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-slate-50 border border-slate-200 text-slate-500">
                  {user.email}
                </span>
              )}
              {navButtons.map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => navigate(btn.path)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all active:scale-95"
                >
                  <btn.icon className="h-3.5 w-3.5 stroke-[1.5]" />
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors shrink-0 mt-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* ── Stats Grid (6 cards) ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 md:gap-3">
        {([
          {
            icon: ClipboardList,
            label: "Ditugaskan",
            value: String(stats.total),
            sub: "total berkas",
            iconBg: "bg-blue-50",
            iconColor: "text-blue-600",
          },
          {
            icon: Clock,
            label: "Diproses",
            value: String(stats.proses),
            sub: "sedang berjalan",
            iconBg: "bg-sky-50",
            iconColor: "text-sky-600",
          },
          {
            icon: CheckCircle2,
            label: "Selesai",
            value: String(stats.selesai),
            sub: "visa terbit",
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
          },
          {
            icon: AlertTriangle,
            label: "Kendala",
            value: String(stats.kendala),
            sub: "perlu tindak",
            iconBg: stats.kendala > 0 ? "bg-amber-50" : "bg-slate-50",
            iconColor: stats.kendala > 0 ? "text-amber-500" : "text-slate-400",
          },
          {
            icon: Wallet,
            label: "Fee Earned",
            value: fmtIDR(walletBal.totalCreditIDR),
            sub: "total dikreditkan",
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
          },
          {
            icon: FileText,
            label: "Belum Cair",
            value: fmtIDR(Math.max(0, walletBal.totalCreditIDR - walletBal.totalDebitIDR)),
            sub: "belum dicairkan",
            iconBg: "bg-orange-50",
            iconColor: "text-orange-500",
          },
        ] as const).map((card, i) => (
          <motion.div
            key={card.label}
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <div className="rounded-2xl border border-slate-100 bg-white p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow h-full">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-tight">
                  {card.label}
                </p>
                <div className={`h-6 w-6 md:h-7 md:w-7 rounded-xl flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
                  <card.icon className="h-3 w-3 md:h-3.5 md:w-3.5 stroke-[1.75]" />
                </div>
              </div>
              <p className="text-[15px] md:text-[18px] font-extrabold text-slate-800 leading-none font-mono">
                {card.value}
              </p>
              <p className="text-[8.5px] md:text-[9.5px] text-slate-400 mt-1 leading-tight">{card.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 bg-slate-50/60 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              activeTab === key
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════
           TAB: VISA SAYA
         ════════════════════════════════════════════ */}
      {activeTab === "berkas" && (
        <motion.div
          key="tab-berkas"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-3"
        >
          {/* Section header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-slate-700">Daftar Berkas Ditugaskan</h2>
              {myOrders.length > 0 && (
                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                  {myOrders.length}
                </span>
              )}
            </div>
            {stats.kendala > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                <AlertTriangle className="h-3 w-3" /> {stats.kendala} kendala
              </span>
            )}
          </div>

          {/* Empty state */}
          {myOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Target className="h-8 w-8 text-blue-300 stroke-[1.25]" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-600">Belum ada berkas ditugaskan</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                    Owner akan menugaskan berkas visa student ke kamu dari halaman order.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[...myOrders]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((order, idx) => {
                  const meta = (order.metadata ?? {}) as Record<string, unknown>;
                  const currentStep = Number(meta.processStep ?? 0);
                  const isDone = currentStep >= VISA_STEPS.length - 1;
                  const kendala = (meta.visaKendala as string | null) ?? null;
                  const client = clientMap.get(order.clientId ?? "");
                  const isEditing = editingNote === order.id;

                  return (
                    <motion.div
                      key={order.id}
                      custom={idx}
                      variants={fadeUp}
                      initial="hidden"
                      animate="visible"
                      className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
                        isDone
                          ? "border-emerald-200"
                          : kendala
                          ? "border-amber-200"
                          : "border-slate-100"
                      }`}
                    >
                      {/* Card header */}
                      <div className="px-4 pt-4 pb-3 border-b border-slate-50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[13px] font-bold text-slate-800 leading-tight">
                                {client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`}
                              </p>
                              <StepBadge step={currentStep} />
                              {kendala && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                  ⚠️ Kendala
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-slate-400">
                              <span>{fmtDate(order.createdAt)}</span>
                              <span className="font-mono opacity-60">#{order.id.slice(0, 8)}</span>
                              {client?.phone && <span>· {client.phone}</span>}
                              {client?.passportNumber && (
                                <span className="font-mono">· Paspor {client.passportNumber}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/orders/detail/${order.id}`)}
                            className="flex items-center gap-0.5 text-[10.5px] text-blue-600 font-semibold hover:text-blue-800 transition-colors shrink-0"
                          >
                            Lihat Detail <ArrowUpRight className="h-3 w-3 stroke-[2]" />
                          </button>
                        </div>
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {/* Progress track */}
                        <div className="flex items-center gap-1">
                          {VISA_STEPS.map((step, i) => {
                            const done   = i < currentStep;
                            const active = i === currentStep;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                                <div className={`h-1.5 w-full rounded-full transition-colors ${
                                  done ? "bg-emerald-500" : active ? "bg-blue-500" : "bg-slate-100"
                                }`} />
                                <span className={`text-[8px] text-center leading-tight ${
                                  active ? "text-blue-700 font-bold" : done ? "text-emerald-600" : "text-slate-300"
                                }`}>
                                  {step.emoji}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Kendala note */}
                        {kendala && !isEditing && (
                          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-800 flex-1 leading-relaxed">{kendala}</p>
                            <button
                              onClick={() => {
                                setNotes((n) => ({ ...n, [order.id]: kendala }));
                                setEditingNote(order.id);
                              }}
                              className="text-[10px] text-amber-700 font-bold hover:underline shrink-0"
                            >
                              Edit
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <div className="space-y-2">
                            <textarea
                              autoFocus
                              value={notes[order.id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [order.id]: e.target.value }))}
                              placeholder="Tulis kendala / catatan progress di sini…"
                              className="w-full min-h-[72px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                                disabled={savingNote === order.id}
                                onClick={() => void handleSaveNote(order.id)}
                              >
                                {savingNote === order.id
                                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  : <MessageSquare className="h-3 w-3 mr-1" />}
                                Simpan Catatan
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] rounded-lg"
                                onClick={() => setEditingNote(null)}
                              >
                                Batal
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Action row */}
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                          {!isDone ? (
                            <Button
                              size="sm"
                              className="h-8 text-[11px] bg-blue-600 hover:bg-blue-700 text-white flex-1 rounded-xl"
                              disabled={advancing === order.id}
                              onClick={() => void handleAdvance(order.id, currentStep)}
                            >
                              {advancing === order.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 mr-1" />
                              )}
                              Update: {VISA_STEPS[currentStep + 1]?.label ?? "Selesai"}
                            </Button>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 flex-1">
                              <CheckCircle2 className="h-4 w-4" /> Visa Terbit — Selesai
                            </div>
                          )}
                          {!isEditing && (
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-8 text-[11px] rounded-xl shrink-0 ${
                                kendala
                                  ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                  : "border-slate-200 text-slate-600"
                              }`}
                              onClick={() => {
                                setNotes((n) => ({ ...n, [order.id]: (meta.visaKendala as string) ?? "" }));
                                setEditingNote(order.id);
                              }}
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {kendala ? "Update Kendala" : "Catat Kendala"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════
           TAB: KOMISI SAYA
         ════════════════════════════════════════════ */}
      {activeTab === "komisi" && (
        <motion.div
          key="tab-komisi"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Fee summary card — mirrors Agent Fee Komisi card */}
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Wallet className="h-3.5 w-3.5 text-emerald-600 stroke-[1.75]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-bold text-slate-700">Fee Pelaksana Visa</p>
                    <p className="text-[10px] text-slate-400">Terpisah dari komisi agen penjual</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/settings")}
                  className="flex items-center gap-0.5 text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Profil <ArrowUpRight className="h-3 w-3 stroke-[2]" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-center py-1">
                  <div className="text-[24px] md:text-[30px] font-extrabold font-mono text-slate-800 leading-tight">
                    {fmtIDR(walletBal.netIDR)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">saldo wallet saat ini</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                    <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">Dikreditkan</div>
                    <div className="text-[13px] font-extrabold font-mono text-emerald-700 mt-0.5">{fmtIDR(walletBal.totalCreditIDR)}</div>
                    <div className="text-[9px] text-slate-400">{komisiTxs.length} berkas</div>
                  </div>
                  <div className="rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
                    <div className="text-[9px] text-orange-600 font-bold uppercase tracking-wide">Dicairkan</div>
                    <div className="text-[13px] font-extrabold font-mono text-orange-700 mt-0.5">{fmtIDR(walletBal.totalDebitIDR)}</div>
                    <div className="text-[9px] text-slate-400">{walletTxs.filter((t) => t.type === "payout").length} pencairan</div>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
                    <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Berkas Selesai</div>
                    <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{stats.selesai}</div>
                    <div className="text-[9px] text-slate-400">dari {stats.total}</div>
                  </div>
                </div>
                {walletBal.totalCreditIDR === 0 && (
                  <p className="text-center text-[11px] text-slate-400 italic">
                    Komisi dikreditkan setelah owner menandai berkas selesai.
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Fee history — mirrors Agent order history card */}
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            {komisiTxs.length > 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center">
                      <TrendingUp className="h-3.5 w-3.5 text-blue-600 stroke-[1.75]" />
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-slate-700">Riwayat Fee Pelaksana</p>
                      <p className="text-[10px] text-slate-400">{komisiTxs.length} entri tercatat</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {komisiTxs.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                      <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                        <BadgeCheck className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-slate-700 truncate">{tx.description}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(tx.createdAt)}</p>
                      </div>
                      <span className="text-[12px] font-extrabold font-mono text-emerald-700 shrink-0">
                        +{fmtIDR(tx.amountIDR)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Wallet className="h-7 w-7 text-blue-300 stroke-[1.25]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-slate-600">Belum ada riwayat fee</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                      Fee pelaksana dikreditkan setelah berkas visa selesai diproses.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Info note — mirrors Agent Dashboard footer tip */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-[11px] text-slate-500 leading-relaxed">
            <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="h-3.5 w-3.5 text-blue-500 stroke-[1.75]" />
            </div>
            <p>
              <strong className="text-slate-700">Tentang Fee Pelaksana Visa:</strong>{" "}
              Fee ini adalah kompensasi pelaksanaan lapangan visa student — bukan komisi agen penjual.
              Jumlah per berkas ditetapkan oleh owner dan dikreditkan ke wallet saat berkas selesai.
              Label resmi: <strong className="text-blue-700">Fee Pelaksana Visa</strong>.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
