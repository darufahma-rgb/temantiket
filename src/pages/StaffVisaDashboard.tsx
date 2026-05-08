/**
 * StaffVisaDashboard — /staff/visa
 *
 * Dashboard khusus pelaksana lapangan visa student.
 * Tab "Berkas": daftar order visa_student yang di-assign ke staff ini.
 * Tab "Komisi": riwayat fee pelaksana & saldo wallet.
 *
 * URL param: ?tab=komisi → langsung buka tab Komisi.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText, AlertTriangle, CheckCircle2,
  Clock, Wallet, ChevronRight, RefreshCw, Loader2,
  MessageSquare, TrendingUp, Landmark, BadgeCheck,
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

  // Sync tab from URL param when it changes
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
    return { total, selesai, kendala, proses: total - selesai - kendala < 0 ? 0 : total - selesai - kendala };
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

  const TABS: { key: DashTab; label: string; icon: React.ElementType }[] = [
    { key: "berkas", label: "Berkas Visa", icon: Landmark },
    { key: "komisi", label: "Komisi & Fee", icon: Wallet },
  ];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* ── Top row ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-bold text-foreground">Dashboard Pelaksana Visa</h1>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Hero card ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-2xl font-extrabold shrink-0">
            {(user?.displayName ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
              🏛️ Pelaksana Visa Student
            </span>
            <h2 className="text-xl font-extrabold mt-1 leading-tight">{user?.displayName ?? "Staff"}</h2>
            <p className="text-[12px] opacity-80">{user?.email}</p>
          </div>
        </div>

        {/* Stats grid — 4 columns */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: "Total",   value: String(stats.total),   sub: "ditugaskan",   icon: "📋" },
            { label: "Proses",  value: String(stats.proses),  sub: "berjalan",     icon: "⏳" },
            { label: "Selesai", value: String(stats.selesai), sub: "visa terbit",  icon: "✅" },
            { label: "Kendala", value: String(stats.kendala), sub: "perlu tindak", icon: "⚠️" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-2.5 text-center ${
              s.label === "Kendala" && stats.kendala > 0
                ? "bg-amber-400/20 border border-amber-300/30"
                : "bg-white/10 backdrop-blur"
            }`}>
              <div className="text-lg font-extrabold font-mono">{s.value}</div>
              <div className="text-[9px] opacity-80 mt-0.5">{s.label}</div>
              <div className="text-[8px] opacity-60">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Saldo wallet mini */}
        <div className="mt-3 rounded-2xl bg-white/10 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 opacity-70" />
            <span className="text-[11px] opacity-80">Saldo Fee Pelaksana</span>
          </div>
          <span className="text-[14px] font-extrabold font-mono">{fmtIDR(walletBal.netIDR)}</span>
        </div>
      </motion.div>

      {/* ── Tab switcher ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-secondary/40 self-start">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              activeTab === key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
           TAB: BERKAS VISA
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "berkas" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold">Daftar Berkas Ditugaskan</p>
            {stats.kendala > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-3 w-3" /> {stats.kendala} kendala
              </span>
            )}
          </div>

          {myOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-semibold">Belum ada berkas ditugaskan</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  Owner akan menugaskan berkas visa student ke kamu dari halaman order.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[...myOrders]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((order) => {
                  const meta = (order.metadata ?? {}) as Record<string, unknown>;
                  const currentStep = Number(meta.processStep ?? 0);
                  const isDone = currentStep >= VISA_STEPS.length - 1;
                  const kendala = (meta.visaKendala as string | null) ?? null;
                  const client = clientMap.get(order.clientId ?? "");
                  const isEditing = editingNote === order.id;

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl border bg-white p-4 space-y-3 ${
                        isDone
                          ? "border-emerald-200"
                          : kendala
                          ? "border-amber-200"
                          : "border-border"
                      }`}
                    >
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold leading-tight">
                              {client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`}
                            </p>
                            <StepBadge step={currentStep} />
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
                            <span>{fmtDate(order.createdAt)}</span>
                            {client?.phone && <span>· {client.phone}</span>}
                            {client?.email && <span>· {client.email}</span>}
                            {client?.passportNumber && (
                              <span className="font-mono">· Paspor {client.passportNumber}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => navigate(`/orders/detail/${order.id}`)}
                          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          Detail <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Progress track */}
                      <div className="flex items-center gap-1">
                        {VISA_STEPS.map((step, i) => {
                          const done   = i < currentStep;
                          const active = i === currentStep;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                              <div className={`h-1.5 w-full rounded-full ${
                                done ? "bg-emerald-500" : active ? "bg-sky-500" : "bg-muted/40"
                              }`} />
                              <span className={`text-[8px] text-center leading-tight ${
                                active ? "text-sky-700 font-bold" : done ? "text-emerald-600" : "text-muted-foreground/50"
                              }`}>
                                {step.emoji}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Kendala note */}
                      {kendala && !isEditing && (
                        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-800 flex-1">{kendala}</p>
                          <button
                            onClick={() => {
                              setNotes((n) => ({ ...n, [order.id]: kendala }));
                              setEditingNote(order.id);
                            }}
                            className="text-[10px] text-amber-700 font-semibold hover:underline shrink-0"
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
                            className="w-full min-h-[72px] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
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
                              className="h-7 text-[11px]"
                              onClick={() => setEditingNote(null)}
                            >
                              Batal
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Action row */}
                      <div className="flex items-center gap-2 pt-1 border-t">
                        {!isDone && (
                          <Button
                            size="sm"
                            className="h-8 text-[11px] bg-sky-600 hover:bg-sky-700 text-white flex-1"
                            disabled={advancing === order.id}
                            onClick={() => void handleAdvance(order.id, currentStep)}
                          >
                            {advancing === order.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 mr-1" />
                            )}
                            {VISA_STEPS[currentStep + 1]?.label ?? "Selesai"}
                          </Button>
                        )}
                        {isDone && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 flex-1">
                            <CheckCircle2 className="h-4 w-4" /> Visa Terbit — Selesai
                          </div>
                        )}
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-8 text-[11px] shrink-0 ${kendala ? "border-amber-300 text-amber-700" : ""}`}
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
                    </motion.div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
           TAB: KOMISI & FEE
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "komisi" && (
        <div className="space-y-4">
          {/* Ringkasan saldo */}
          <div className="rounded-2xl border border-emerald-100 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold">Saldo Fee Pelaksana Visa</p>
                <p className="text-[11px] text-muted-foreground">
                  Fee Pelaksana — terpisah dari komisi agen penjual
                </p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-center py-1">
                <div className="text-3xl font-extrabold font-mono text-emerald-700">
                  {fmtIDR(walletBal.netIDR)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">saldo wallet saat ini</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">Dikreditkan</div>
                  <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
                    {fmtIDR(walletBal.totalCreditIDR)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{komisiTxs.length} berkas</div>
                </div>
                <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
                  <div className="text-[10px] text-orange-700 font-semibold uppercase tracking-wide">Dicairkan</div>
                  <div className="text-sm font-bold font-mono text-orange-700 mt-0.5">
                    {fmtIDR(walletBal.totalDebitIDR)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {walletTxs.filter((t) => t.type === "payout").length} pencairan
                  </div>
                </div>
                <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                  <div className="text-[10px] text-sky-700 font-semibold uppercase tracking-wide">Berkas Selesai</div>
                  <div className="text-sm font-bold font-mono text-sky-700 mt-0.5">{stats.selesai}</div>
                  <div className="text-[10px] text-muted-foreground">dari {stats.total}</div>
                </div>
              </div>
              {walletBal.totalCreditIDR === 0 && (
                <p className="text-center text-[11px] text-muted-foreground italic">
                  Komisi akan masuk otomatis saat owner menandai berkas selesai dan mengkreditkan fee.
                </p>
              )}
            </div>
          </div>

          {/* Riwayat per-berkas */}
          {komisiTxs.length > 0 ? (
            <div className="rounded-2xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold">Riwayat Fee Pelaksana</p>
                  <p className="text-[11px] text-muted-foreground">{komisiTxs.length} entri tercatat</p>
                </div>
              </div>
              <div className="divide-y">
                {komisiTxs.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-7 w-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{tx.description}</p>
                      <p className="text-[10px] text-muted-foreground/70">{fmtDate(tx.createdAt)}</p>
                    </div>
                    <span className="text-[12px] font-bold font-mono text-emerald-700 shrink-0">
                      +{fmtIDR(tx.amountIDR)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted/30 flex items-center justify-center">
                <Wallet className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-semibold">Belum ada riwayat fee</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  Fee pelaksana akan dikreditkan oleh owner setelah berkas visa selesai diproses.
                </p>
              </div>
            </div>
          )}

          {/* Info catatan */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] text-blue-700 space-y-0.5">
            <p className="font-semibold">Tentang Fee Pelaksana Visa</p>
            <p className="opacity-80">Fee ini adalah kompensasi untuk tugas pelaksanaan lapangan visa student. Jumlah per berkas ditetapkan oleh owner dan dikreditkan ke wallet setelah proses selesai.</p>
            <p className="opacity-70 mt-1">Label: <strong>Fee Pelaksana Visa</strong> — bukan komisi agen penjual.</p>
          </div>
        </div>
      )}
    </div>
  );
}
