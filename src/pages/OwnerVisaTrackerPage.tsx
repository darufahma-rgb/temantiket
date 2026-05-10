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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { addWalletTx } from "@/lib/agentWallet";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { fmtIDR } from "@/lib/profit";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { Order } from "@/features/orders/ordersRepo";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];
const DEFAULT_FEE = 200_000;

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

  // Per-row action states
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [creditingId, setCreditingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterPelaksana, setFilterPelaksana] = useState<string>("all");

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
    const fee = Number(m.pelaksanaFee ?? DEFAULT_FEE);
    setCreditingId(order.id);
    try {
      addWalletTx(pelaksanaId, {
        agentId: pelaksanaId,
        type: "pelaksana_fee",
        pointsDelta: 0,
        amountIDR: fee,
        description: `Fee Pelaksana Visa Student #${order.id.slice(0, 8)}${order.title ? ` — ${order.title}` : ""}`,
        createdBy: user?.id ?? "owner",
      });
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

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-foreground">Laporan Visa Student Entry</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitoring & kontrol semua berkas visa pelajar</p>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

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
  );
}
