/**
 * StaffVisaDashboard — /staff/visa
 *
 * Dashboard khusus pelaksana lapangan visa student.
 * Menampilkan semua order visa_student yang di-assign ke staff ini,
 * progress tracker setiap berkas, kendala, dan akumulasi komisi.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, FileText, AlertTriangle, CheckCircle2,
  Clock, Wallet, ChevronRight, RefreshCw, Loader2,
  MessageSquare, TrendingUp,
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
import { supabase } from "@/lib/supabase";
import { useOrdersStore as useOrdersPatch } from "@/store/ordersStore";

const PELAKSANA_FEE = 200_000;

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];

function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); } catch { return iso; }
}

function StepBadge({ step }: { step: number }) {
  const s = VISA_STEPS[Math.min(step, VISA_STEPS.length - 1)];
  const done = step >= VISA_STEPS.length - 1;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
      done
        ? "bg-emerald-100 text-emerald-700"
        : "bg-sky-100 text-sky-700"
    }`}>
      {s?.emoji} {s?.label ?? "—"}
    </span>
  );
}

export default function StaffVisaDashboard() {
  const navigate = useNavigate();
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

  const walletBal = useMemo(() => walletBalance(walletTxs), [walletTxs]);
  const komisiTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "order_bonus"),
    [walletTxs],
  );

  const stats = useMemo(() => {
    const total = myOrders.length;
    const selesai = myOrders.filter(
      (o) => Number((o.metadata as Record<string, unknown>)?.processStep ?? 0) >= VISA_STEPS.length - 1,
    ).length;
    const kendala = myOrders.filter(
      (o) => (o.metadata as Record<string, unknown>)?.visaKendala,
    ).length;
    return { total, selesai, kendala, proses: total - selesai };
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

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Header Card */}
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
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                🏛️ Pelaksana Visa
              </span>
            </div>
            <h1 className="text-xl font-extrabold mt-1 leading-tight">{user?.displayName ?? "Staff"}</h1>
            <p className="text-[12px] opacity-80">{user?.email}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Total Berkas", value: String(stats.total), sub: "ditugaskan" },
            { label: "Selesai", value: String(stats.selesai), sub: "visa terbit" },
            { label: "Proses", value: String(stats.proses), sub: "sedang berjalan" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/10 backdrop-blur p-2.5 text-center">
              <div className="text-xl font-extrabold font-mono">{s.value}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{s.label}</div>
              <div className="text-[9px] opacity-60">{s.sub}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Wallet Komisi */}
      <div className="rounded-2xl border border-emerald-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold">Akumulasi Komisi</p>
            <p className="text-[11px] text-muted-foreground">Rp 200.000 per berkas yang diselesaikan</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-center py-1">
            <div className="text-3xl font-extrabold font-mono text-emerald-700">{fmtIDR(walletBal.netIDR)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">saldo wallet saat ini</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">Total Dikreditkan</div>
              <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">{fmtIDR(walletBal.totalCreditIDR)}</div>
              <div className="text-[10px] text-muted-foreground">{komisiTxs.length} berkas</div>
            </div>
            <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
              <div className="text-[10px] text-orange-700 font-semibold uppercase tracking-wide">Total Dicairkan</div>
              <div className="text-sm font-bold font-mono text-orange-700 mt-0.5">{fmtIDR(walletBal.totalDebitIDR)}</div>
              <div className="text-[10px] text-muted-foreground">{walletTxs.filter((t) => t.type === "payout").length} pencairan</div>
            </div>
          </div>
          {walletBal.totalCreditIDR === 0 && (
            <p className="text-center text-[11px] text-muted-foreground italic">
              Komisi akan masuk otomatis saat owner menandai berkas selesai.
            </p>
          )}
        </div>
      </div>

      {/* Daftar Berkas */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1 mb-3">
          <p className="text-sm font-semibold">Daftar Berkas Visa Student</p>
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
                        const done = i < currentStep;
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

      {/* Riwayat Komisi */}
      {komisiTxs.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold">Riwayat Komisi Berkas</p>
              <p className="text-[11px] text-muted-foreground">{komisiTxs.length} berkas tercatat</p>
            </div>
          </div>
          <div className="divide-y">
            {komisiTxs.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-7 w-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground truncate">{tx.description}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {fmtDate(tx.createdAt)}
                  </p>
                </div>
                <span className="text-[12px] font-bold font-mono text-emerald-700 shrink-0">
                  +{fmtIDR(tx.amountIDR)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
