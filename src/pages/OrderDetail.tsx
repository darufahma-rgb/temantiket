import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Save, ExternalLink, Eye, FileText, Crown } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import ClientViewDialog from "@/components/ClientViewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { useRatesStore } from "@/store/ratesStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useTripsStore } from "@/store/tripsStore";
import { buildRateSnapshotPatch } from "@/lib/ledgerSync";
import { InvoiceButton } from "@/components/InvoiceButton";
import {
  ORDER_STATUSES, ORDER_TYPES, ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI,
  type Order, type OrderStatus, type OrderType,
} from "@/features/orders/ordersRepo";
import { voaOpCost, kurirOpCost } from "@/lib/profit";
import {
  type PaymentStatus,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  PAYMENT_STATUS_EMOJI,
  derivePaymentStatus,
  buildWhatsAppReminderUrl,
} from "@/lib/paymentStatus";
import { FlightOrderEditor, type FlightMeta } from "@/features/orders/FlightOrderEditor";
import { toast } from "sonner";
import { getCommissionForOrderType } from "@/lib/productCommissions";
import { addWalletTxAsync } from "@/lib/agentWallet";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { VisaEntryPanel } from "@/components/VisaEntryPanel";
import { useAIContextStore } from "@/store/aiContextStore";

/** Award 20 poin ke agent penjual saat order → Completed (idempotent via upsert). */
async function awardOrderCompletionPoints(agentId: string, orderId: string) {
  try {
    const session = (await supabase?.auth.getSession())?.data.session;
    const token = session?.access_token;
    if (!token) return;
    const res = await fetch("/api/award-completion-points", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agentId, orderId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.warn("[award-order-points] gagal:", j?.error ?? res.status);
    }
  } catch (e) {
    console.warn("[award-order-points] exception:", e);
  }
}

/** Cabut poin jika order diubah kembali dari Completed ke status lain. */
async function revokeOrderPoints(orderId: string) {
  try {
    const session = (await supabase?.auth.getSession())?.data.session;
    const token = session?.access_token;
    if (!token) return;
    const res = await fetch("/api/revoke-order-points", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.warn("[revoke-order-points] gagal:", j?.error ?? res.status);
    }
  } catch (e) {
    console.warn("[revoke-order-points] exception:", e);
  }
}

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

type FeeCurrency = "IDR" | "SAR" | "USD";
const FEE_CURRENCIES: { value: FeeCurrency; flag: string; label: string }[] = [
  { value: "IDR", flag: "🇮🇩", label: "IDR" },
  { value: "SAR", flag: "🇸🇦", label: "SAR" },
  { value: "USD", flag: "🇺🇸", label: "USD" },
];

function toIDRAmount(amount: number, currency: FeeCurrency, rates: Record<string, number>): number {
  if (!amount || !Number.isFinite(amount)) return 0;
  if (currency === "SAR") return Math.round(amount * (rates.SAR ?? 4250));
  if (currency === "USD") return Math.round(amount * (rates.USD ?? 16000));
  return Math.round(amount);
}

function fmtNative(amount: number, currency: FeeCurrency): string {
  if (currency === "IDR") return fmtIDR(amount);
  if (currency === "SAR") return `SAR ${amount.toLocaleString("id-ID")}`;
  return `USD ${amount.toLocaleString("id-ID")}`;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orders, getOneOrder, patchOrder, removeOrder, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();
  const rates = useRatesStore((s) => s.rates);
  const packages = usePackagesStore((s) => s.packages);
  const trips = useTripsStore((s) => s.trips);
  const currentUser = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Order>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientViewOpen, setClientViewOpen] = useState(false);
  const [members, setMembers] = useState<MemberInfo[]>([]);

  const { setPageContext, setActiveItem, setOnApplyEdit, clearContext } = useAIContextStore();

  useEffect(() => {
    setPageContext({ pageId: "order-detail", pageTitle: "Detail Order" });
    return () => clearContext();
  }, [setPageContext, clearContext]);

  useEffect(() => {
    if (order) {
      const client = clients.find((c) => c.id === order.clientId);
      const contentLines = [
        `Tipe: ${order.type}`,
        `Status: ${order.status}`,
        `Harga: ${order.currency} ${Number(order.totalPrice).toLocaleString("id-ID")}`,
        `Modal: ${order.currency} ${Number(order.costPrice ?? 0).toLocaleString("id-ID")}`,
        client ? `Klien: ${client.name} (${client.phone})` : null,
        order.title ? `Judul: ${order.title}` : null,
        order.notes ? `Catatan: ${order.notes}` : null,
      ].filter(Boolean).join("\n");
      setActiveItem({
        id: order.id,
        title: order.title ?? `Order ${order.type} — ${order.status}`,
        content: contentLines,
        type: "order",
      });
      setOnApplyEdit((newNotes: string) => {
        setDraft((prev) => ({ ...prev, notes: newNotes }));
        toast.success("Catatan order diperbarui oleh AITEM — klik Simpan untuk menyimpan 💾");
      });
    } else {
      setActiveItem(null);
      setOnApplyEdit(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status, order?.notes, clients.length]);

  useEffect(() => {
    if (clients.length === 0) void fetchClients();
    if (orders.length === 0) void fetchOrders();
    void listMembers().then((m) => setMembers(m)).catch(() => {});
  }, [clients.length, orders.length, fetchClients, fetchOrders, listMembers]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cached = orders.find((o) => o.id === id);
      if (cached && !cancelled) { setOrder(cached); setDraft(cached); }
      const fresh = await getOneOrder(id);
      if (!cancelled) {
        setOrder(fresh);
        if (fresh) {
          // Don't auto-populate agentFee here — members might not be loaded
          // yet so we can't verify whether createdByAgent is an actual agent.
          // A separate useEffect below handles role-aware auto-populate.
          setDraft(fresh);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Role-aware auto-populate of agentFee ───────────────────────────────
  // Fires when BOTH order AND members are ready. Only auto-populates agentFee
  // when createdByAgent points to a member with role === "agent". Owner/staff
  // set as "referral source" never trigger this.
  useEffect(() => {
    if (!order || members.length === 0) return;
    const isRealAgent = members.some(
      (m) => m.userId === order.createdByAgent && m.role === "agent",
    );
    if (!isRealAgent) return;
    const existingFee = Number((order.metadata as Record<string, unknown> | null)?.agentFee ?? 0);
    if (existingFee > 0) return; // already set — don't overwrite
    const autoFee = getCommissionForOrderType(order.type);
    if (autoFee <= 0) return;
    setDraft((prev) => ({
      ...prev,
      metadata: { ...((prev.metadata ?? order.metadata) ?? {}), agentFee: autoFee },
    }));
  }, [order, members]); // eslint-disable-line react-hooks/exhaustive-deps

  // True only when createdByAgent points to a real agent member (role === "agent").
  // Owner/staff set as "referral source" do NOT qualify — no fee deduction for them.
  const isValidAgentOrder = useMemo(
    () =>
      !!order?.createdByAgent &&
      members.some((m) => m.userId === order.createdByAgent && m.role === "agent"),
    [order, members],
  );

  const dirty = useMemo(() => {
    if (!order) return false;
    return (
      draft.title !== order.title ||
      draft.status !== order.status ||
      Number(draft.totalPrice ?? 0) !== Number(order.totalPrice) ||
      Number(draft.costPrice ?? 0) !== Number(order.costPrice) ||
      (draft.clientId ?? null) !== (order.clientId ?? null) ||
      (draft.notes ?? null) !== (order.notes ?? null) ||
      JSON.stringify(draft.metadata ?? {}) !== JSON.stringify(order.metadata ?? {}) ||
      Number(draft.paidAmount ?? order.paidAmount ?? 0) !== Number(order.paidAmount ?? 0) ||
      (draft.paymentStatus ?? order.paymentStatus ?? "UNPAID") !== (order.paymentStatus ?? "UNPAID")
    );
  }, [draft, order]);

  if (loading && !order) {
    return <div className="p-6 text-sm text-muted-foreground">Memuat order…</div>;
  }
  if (!order) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground mb-3">Order tidak ditemukan.</div>
        <Button variant="outline" onClick={() => navigate("/orders")}><ArrowLeft className="h-4 w-4 mr-1.5" /> Kembali</Button>
      </div>
    );
  }

  const linkedClient = order.clientId ? clients.find((c) => c.id === order.clientId) : null;

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const newStatus = (draft.status as OrderStatus) ?? order.status;
      const isPaidTransition =
        (newStatus === "Paid" || newStatus === "Completed") &&
        order.status !== newStatus;
      // Snapshot EGP/SAR rate when order first becomes Paid/Completed
      let metaPatch = (draft.metadata as Record<string, unknown>) ?? order.metadata ?? {};
      if (isPaidTransition) {
        metaPatch = buildRateSnapshotPatch(metaPatch, rates.EGP ?? 515, rates.SAR ?? 4250);
      }

      // ── Pre-compute wallet credit decisions ────────────────────────────────
      // willBeCompleted fires even when status is already Completed so the owner
      // can assign a field agent AFTER closing the order — idempotency key on
      // the wallet upsert (wtx-voa-{orderId}) prevents double-credit.
      const willBeCompleted = newStatus === "Completed";

      // VOA field-agent fee
      const voaFieldAgentId = (metaPatch.voaFieldAgentId as string | undefined) ?? null;
      const voaFieldFee     = Number(metaPatch.voaAgentFee ?? 0);
      const shouldCreditVoa = order.type === "visa_voa" &&
        willBeCompleted && !!voaFieldAgentId && voaFieldFee > 0 &&
        !metaPatch.voaFeeCredited;

      // Kurir fee
      const kurirAgentIdPre   = (metaPatch.kurirAgentId as string | undefined) ?? null;
      const kurirFeeAmountPre = Number(metaPatch.kurirFee ?? 0);
      const shouldCreditKurir = willBeCompleted && !!kurirAgentIdPre &&
        kurirFeeAmountPre > 0 && !metaPatch.kurirFeeCredited;

      // Visa Student pelaksana (field-staff) fee — auto-deducted from profit & auto-credited on Completed.
      // Fee langsung dikurangi dari harga customer saat status Completed, tidak perlu klik manual.
      const pelaksanaIdForCredit  = (metaPatch.pelaksanaId as string | undefined) ?? null;
      const pelaksanaFeeForCredit = Number(metaPatch.pelaksanaFee ?? 200_000);
      const shouldCreditPelaksana = order.type === "visa_student" &&
        willBeCompleted && !!pelaksanaIdForCredit &&
        pelaksanaFeeForCredit > 0 && !metaPatch.pelaksanaFeeCredited;

      // Agent order commission (sales agent, not VOA field agent).
      // Only credit if createdByAgent resolves to a member with role === "agent".
      // Owner/staff set as "referral source" do NOT get a commission credit.
      // isValidAgentOrder is the single source of truth for this check.
      const agentCommId = isValidAgentOrder ? (order.createdByAgent ?? null) : null;
      const agentFeeStored = metaPatch.agentFee !== undefined && metaPatch.agentFee !== null
        ? Number(metaPatch.agentFee)
        : -1;
      const agentFeeAmount = agentCommId
        ? (agentFeeStored >= 0 ? agentFeeStored : getCommissionForOrderType(order.type))
        : 0;

      // BUG FIX: jika agentFee belum ada di metadata (agentFeeStored < 0) tapi kita
      // resolve ke global rate, persist ke metaPatch SEKARANG agar ledger & Reports
      // membaca nilai yang sama dengan yang dikreditkan ke wallet.
      if (agentCommId && agentFeeStored < 0 && agentFeeAmount > 0) {
        metaPatch = { ...metaPatch, agentFee: agentFeeAmount };
      }

      const shouldCreditAgent = willBeCompleted && !!agentCommId &&
        agentFeeAmount > 0 && !metaPatch.agentFeeCredited;

      // ── Step 1: Save order WITHOUT "credited" flags ────────────────────────
      // Flags are only stamped AFTER Supabase confirms each wallet insert.
      // This prevents the flag being set while the wallet stays empty.
      // Compute payment status from paid_amount (derive, then respect explicit REFUNDED)
      const newPaidAmount = Number(draft.paidAmount ?? order.paidAmount ?? 0);
      const newTotalForPayment = Number(draft.totalPrice ?? order.totalPrice ?? 0);
      const explicitPS = (draft.paymentStatus ?? order.paymentStatus) as PaymentStatus | undefined;
      const computedPS: PaymentStatus = derivePaymentStatus(newPaidAmount, newTotalForPayment, explicitPS);

      await patchOrder(order.id, {
        title:         draft.title ?? null,
        status:        newStatus,
        totalPrice:    Number(draft.totalPrice ?? 0),
        costPrice:     Number(draft.costPrice ?? 0),
        clientId:      (draft.clientId as string | null) ?? null,
        notes:         (draft.notes as string | null) ?? null,
        metadata:      metaPatch,
        paidAmount:    newPaidAmount,
        paymentStatus: computedPS,
      });

      // ── Step 2: Wallet credits — awaited & idempotent ──────────────────────
      // addWalletTxAsync upserts to Supabase (no fire-and-forget).
      // Deterministic idempotency key means retrying the same order never
      // produces a duplicate wallet row.
      const orderId8   = order.id.slice(0, 8);
      const flagsPatch: Record<string, unknown> = {};

      if (shouldCreditVoa) {
        const agentName = members.find((m) => m.userId === voaFieldAgentId)?.displayName ?? "agent lapangan";
        console.log(`[OrderDetail] crediting VOA wallet: agent=${voaFieldAgentId} amount=${voaFieldFee} order=${order.id}`);
        const { persisted, error: walletErr } = await addWalletTxAsync(
          voaFieldAgentId!,
          {
            agentId:     voaFieldAgentId!,
            type:        "voa_agent_fee",
            pointsDelta: 0,
            amountIDR:   voaFieldFee,
            description: `Fee Agent Lapangan VOA #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy:   currentUser?.id ?? "system",
          },
          `voa-${order.id}`,
        );
        if (persisted) {
          flagsPatch.voaFeeCredited = true;
          toast.success(`Fee VOA masuk wallet ${agentName}: ${fmtIDR(voaFieldFee)}`, {
            description: "Pemasukan agent lapangan VOA otomatis terekap di akun mereka.",
            duration: 5000,
          });
        } else {
          // Surface real database error — never mark as credited
          const errMsg = walletErr ?? "Gagal konek ke server";
          console.error(`[OrderDetail] VOA wallet credit FAILED — agent=${voaFieldAgentId}:`, errMsg);
          toast.error(`Gagal catat fee VOA ke wallet ${agentName}`, {
            description: `Error: ${errMsg}. Fee TIDAK dicatat ke database — coba simpan ulang.`,
            duration: 10000,
          });
        }
      }

      if (shouldCreditKurir) {
        const kurirName = members.find((m) => m.userId === kurirAgentIdPre)?.displayName ?? "kurir";
        console.log(`[OrderDetail] crediting kurir wallet: agent=${kurirAgentIdPre} amount=${kurirFeeAmountPre}`);
        const { persisted, error: walletErr } = await addWalletTxAsync(
          kurirAgentIdPre!,
          {
            agentId:     kurirAgentIdPre!,
            type:        "kurir_fee",
            pointsDelta: 0,
            amountIDR:   kurirFeeAmountPre,
            description: `Fee Kurir Setoran #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy:   currentUser?.id ?? "system",
          },
          `kurir-${order.id}`,
        );
        if (persisted) {
          flagsPatch.kurirFeeCredited = true;
          toast.success(`Fee kurir dicatat ke wallet ${kurirName}: ${fmtIDR(kurirFeeAmountPre)}`, {
            description: "Agen kurir otomatis mendapat kredit dari fee setoran uang.",
            duration: 5000,
          });
        } else {
          const errMsg = walletErr ?? "Gagal konek ke server";
          console.error(`[OrderDetail] kurir wallet credit FAILED — agent=${kurirAgentIdPre}:`, errMsg);
          toast.error(`Gagal catat fee kurir ke wallet ${kurirName}`, {
            description: `Error: ${errMsg}. Fee TIDAK dicatat ke database — coba simpan ulang.`,
            duration: 10000,
          });
        }
      }

      if (shouldCreditAgent) {
        const orderLabel = ORDER_TYPE_LABEL[order.type];
        console.log(`[OrderDetail] crediting sales agent wallet: agent=${agentCommId} amount=${agentFeeAmount}`);
        const { persisted, error: walletErr } = await addWalletTxAsync(
          agentCommId!,
          {
            agentId:     agentCommId!,
            type:        "order_bonus",
            pointsDelta: 0,
            amountIDR:   agentFeeAmount,
            description: `Komisi order ${orderLabel} #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy:   currentUser?.id ?? "system",
          },
          `agent-${order.id}`,
        );
        if (persisted) {
          flagsPatch.agentFeeCredited = true;
          toast.success(`Komisi agen dicatat: ${fmtIDR(agentFeeAmount)} · +20 poin`, {
            description: `Order "${order.title || orderLabel}" selesai — wallet & poin agen diperbarui.`,
            duration: 5000,
          });
        } else {
          const errMsg = walletErr ?? "Gagal konek ke server";
          console.error(`[OrderDetail] agent commission credit FAILED — agent=${agentCommId}:`, errMsg);
          toast.error(`Gagal catat komisi agen ke wallet`, {
            description: `Error: ${errMsg}. Komisi TIDAK dicatat ke database — coba simpan ulang.`,
            duration: 10000,
          });
        }
      }

      // ── Points: award/revoke 20 pts ke agent penjual ───────────────────────
      // Selalu award saat order → Completed untuk agent penjual valid,
      // tanpa bergantung pada apakah ada komisi/fee (idempotent via upsert).
      if (willBeCompleted && !!agentCommId) {
        void awardOrderCompletionPoints(agentCommId!, order.id);
        // Hanya tampilkan toast tambahan jika agent tidak punya fee (shouldCreditAgent sudah tampilkan)
        if (!shouldCreditAgent && order.status !== "Completed") {
          toast.success(`Order selesai · +20 poin diberikan ke agen`, { duration: 3500 });
        }
      }

      // Cabut poin jika order dikembalikan dari Completed ke status lain
      if (order.status === "Completed" && newStatus !== "Completed" && !!agentCommId) {
        void revokeOrderPoints(order.id);
        toast.info("Poin agen dicabut karena order dikembalikan dari Completed.", { duration: 4000 });
      }

      // Pelaksana lapangan visa_student — otomatis dikreditkan saat Completed.
      // Fee ini langsung dipotong dari profit customer, bukan perlu klik manual.
      if (shouldCreditPelaksana) {
        const pelaksanaName = members.find((m) => m.userId === pelaksanaIdForCredit)?.displayName ?? "pelaksana lapangan";
        console.log(`[OrderDetail] crediting pelaksana wallet: id=${pelaksanaIdForCredit} amount=${pelaksanaFeeForCredit} order=${order.id}`);
        const { persisted, error: walletErr } = await addWalletTxAsync(
          pelaksanaIdForCredit!,
          {
            agentId:     pelaksanaIdForCredit!,
            type:        "pelaksana_fee",
            pointsDelta: 0,
            amountIDR:   pelaksanaFeeForCredit,
            description: `Fee Pelaksana Visa Student #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy:   currentUser?.id ?? "system",
          },
          `pelaksana-${order.id}`,
        );
        if (persisted) {
          flagsPatch.pelaksanaFeeCredited = true;
          toast.success(`Fee pelaksana otomatis dikreditkan ke wallet ${pelaksanaName}: ${fmtIDR(pelaksanaFeeForCredit)}`, {
            description: "Fee langsung dipotong dari harga customer dan masuk wallet pelaksana.",
            duration: 5000,
          });
        } else {
          const errMsg = walletErr ?? "Gagal konek ke server";
          console.error(`[OrderDetail] pelaksana wallet credit FAILED — id=${pelaksanaIdForCredit}:`, errMsg);
          toast.error(`Gagal catat fee pelaksana ke wallet ${pelaksanaName}`, {
            description: `Error: ${errMsg}. Fee TIDAK dicatat ke database — coba simpan ulang.`,
            duration: 10000,
          });
        }
      }

      // ── Step 3: Stamp credited flags only after confirmed cloud inserts ─────
      if (Object.keys(flagsPatch).length > 0) {
        await patchOrder(order.id, { metadata: { ...metaPatch, ...flagsPatch } });
      }

      const fresh = await getOneOrder(order.id);
      if (fresh) { setOrder(fresh); setDraft(fresh); }

      // Trigger side-effect notifications after status change
      if (isPaidTransition) {
        if (linkedClient) {
          toast.success(`Member Card "${linkedClient.name}" +1 poin`, {
            description: "Stamp otomatis ditambahkan ke kartu member klien.",
            duration: 4500,
          });
        }
        toast.info("Buku Besar diperbarui", {
          description: `Kurs snapshot: 1 EGP ≈ Rp ${rates.EGP ?? 515} · 1 SAR ≈ Rp ${rates.SAR ?? 4250}`,
          duration: 4000,
        });
      }

      toast.success("Order disimpan");
    } catch (e) {
      toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally { setSaving(false); }
  };

  return (
    <motion.div
      className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${order.type}`)} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold truncate flex items-center gap-2">
              <span className="text-xl md:text-2xl">{ORDER_TYPE_EMOJI[order.type]}</span>
              {order.title || ORDER_TYPE_LABEL[order.type]}
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              {ORDER_TYPE_LABEL[order.type]} · ID {order.id.slice(0, 8)}…
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.type === "flight" && currentUser?.role !== "staff" && (
            <Button
              variant="outline"
              onClick={() => setClientViewOpen(true)}
              className="border-sky-200 text-sky-700 hover:bg-sky-50"
              title="Preview untuk klien (siap kirim WhatsApp)"
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Client View
            </Button>
          )}
          {currentUser?.role !== "staff" && (
            <InvoiceButton order={order} client={linkedClient ?? null} phone={linkedClient?.phone} variant="default" className="gradient-primary text-white border-0 hover:opacity-90 shadow-sm" />
          )}
          {currentUser?.role !== "staff" && (
            <Button onClick={handleSave} disabled={!dirty || saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          )}
          {currentUser?.role !== "staff" && (
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Flight-specific editor (Magic Parser, route, harga, passport sync) */}
      {order.type === "flight" && (
        <FlightOrderEditor
          value={(draft.metadata as FlightMeta) ?? (order.metadata as FlightMeta) ?? {}}
          clientId={(draft.clientId ?? order.clientId) as string | null}
          onChange={(meta, total, clientId) => {
            setDraft((d) => ({
              ...d,
              metadata: meta as Record<string, unknown>,
              totalPrice: total,
              clientId,
            }));
          }}
          onAutoTitle={(t) => {
            setDraft((d) => ({ ...d, title: d.title?.trim() ? d.title : t }));
          }}
        />
      )}

      {/* Generic editable form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Judul">
          <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={currentUser?.role === "staff"} />
        </Field>
        <Field label="Tipe (read-only)">
          <Select value={draft.type as OrderType ?? order.type} disabled>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{ORDER_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {currentUser?.role !== "staff" && (
          <Field label="Status">
            <Select value={draft.status as OrderStatus ?? order.status} onValueChange={(v) => setDraft({ ...draft, status: v as OrderStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        {currentUser?.role !== "staff" && (
          <Field label={`Harga Modal (${order.currency})`}>
            <Input type="number" value={String(draft.costPrice ?? 0)} onChange={(e) => setDraft({ ...draft, costPrice: Number(e.target.value) || 0 })} />
          </Field>
        )}
        {currentUser?.role !== "staff" && (
          <Field label={`Harga Jual (${order.currency})`}>
            <Input type="number" value={String(draft.totalPrice ?? 0)} onChange={(e) => setDraft({ ...draft, totalPrice: Number(e.target.value) || 0 })} />
          </Field>
        )}
        {isValidAgentOrder && currentUser?.role !== "staff" && (() => {
          const meta = (draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>;
          const agentFeeCurrency = ((meta.agentFeeCurrency as FeeCurrency | undefined) ?? "IDR");
          const agentFeeRaw = Number(meta.agentFeeRaw ?? meta.agentFee ?? 0);
          const agentFeeIDR = Number(meta.agentFee ?? 0);
          const ag = members.find((m) => m.userId === order.createdByAgent);
          return (
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  Fee Komisi Agen
                </label>
                <Select
                  value={agentFeeCurrency}
                  onValueChange={(v) => {
                    const cur = v as FeeCurrency;
                    const idr = toIDRAmount(agentFeeRaw, cur, rates);
                    setDraft({ ...draft, metadata: { ...meta, agentFeeCurrency: cur, agentFee: idr } });
                  }}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0"
                  value={String(agentFeeRaw || 0)}
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 0;
                    const idr = toIDRAmount(raw, agentFeeCurrency, rates);
                    setDraft({ ...draft, metadata: { ...meta, agentFeeRaw: raw, agentFeeCurrency, agentFee: idr } });
                  }}
                />
                {agentFeeCurrency !== "IDR" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    ≈ {fmtIDR(toIDRAmount(agentFeeRaw, agentFeeCurrency, rates))} — disimpan dalam IDR
                  </div>
                )}
                {agentFeeCurrency === "IDR" && agentFeeIDR > 0 && (
                  <div className="text-[10px] text-orange-600 mt-0.5 font-medium">
                    {fmtIDR(agentFeeIDR)} masuk wallet agen saat Completed
                  </div>
                )}
              </div>
              {ag && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1 pl-0.5">
                  Agen penjual:
                  <Link to={`/agents/${order.createdByAgent}`} className="text-sky-600 hover:underline font-semibold flex items-center gap-0.5 ml-0.5">
                    {ag.displayName} <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
              )}
            </div>
          );
        })()}
        {currentUser?.role !== "staff" && (
          <Field label="Klien">
            <Select value={(draft.clientId ?? order.clientId) || "__none"} onValueChange={(v) => setDraft({ ...draft, clientId: v === "__none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Pilih klien" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Tanpa klien —</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        {currentUser?.role !== "staff" && (
          <Field label="Currency"><Input value={order.currency} disabled /></Field>
        )}
      </div>

      <Field label="Catatan">
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
          placeholder="Tulis catatan dalam format Markdown… (# Judul, **bold**, - list)"
        />
        {draft.notes && draft.notes.trim().length > 0 && (
          <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3.5 py-3">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Preview
            </p>
            <MarkdownContent content={draft.notes} size="sm" />
          </div>
        )}
      </Field>

      {/* ── Pembayaran Klien ────────────────────────────────────────────────── */}
      {currentUser?.role !== "staff" && (() => {
        const totalPrice = Number(draft.totalPrice ?? order.totalPrice ?? 0);
        const paidAmount = Number(draft.paidAmount ?? order.paidAmount ?? 0);
        const remaining  = Math.max(0, totalPrice - paidAmount);
        const ps: PaymentStatus = derivePaymentStatus(paidAmount, totalPrice, draft.paymentStatus ?? order.paymentStatus);
        const currency   = order.currency;
        const fmtNat = (v: number) => currency === "EGP" ? `EGP ${v.toLocaleString("en")}` : fmtIDR(v);

        return (
          <div className="rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-base">💰</span>
                <div>
                  <div className="text-sm font-semibold">Status Pembayaran Klien</div>
                  <div className="text-[11px] text-muted-foreground">Catat berapa yang sudah diterima dari klien</div>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${PAYMENT_STATUS_STYLE[ps]}`}>
                {PAYMENT_STATUS_EMOJI[ps]} {PAYMENT_STATUS_LABEL[ps]}
              </span>
            </div>

            {/* Progress bar */}
            {totalPrice > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10.5px] text-muted-foreground">
                  <span>Progres Pembayaran</span>
                  <span className="font-mono font-semibold">{Math.min(100, Math.round((paidAmount / totalPrice) * 100))}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ps === "PAID" ? "bg-emerald-500" : ps === "DP" ? "bg-amber-400" : "bg-red-300"
                    }`}
                    style={{ width: `${Math.min(100, (paidAmount / totalPrice) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white border border-border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Total Order</div>
                <div className="text-[13px] font-extrabold font-mono text-foreground">{fmtNat(totalPrice)}</div>
              </div>
              <div className="rounded-xl bg-white border border-emerald-200 p-2.5">
                <div className="text-[10px] text-emerald-700 uppercase tracking-wide mb-0.5">Sudah Dibayar</div>
                <div className="text-[13px] font-extrabold font-mono text-emerald-700">{fmtNat(paidAmount)}</div>
              </div>
              <div className={`rounded-xl bg-white border p-2.5 ${remaining > 0 ? "border-red-200" : "border-emerald-200"}`}>
                <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${remaining > 0 ? "text-red-600" : "text-emerald-700"}`}>Sisa Tagihan</div>
                <div className={`text-[13px] font-extrabold font-mono ${remaining > 0 ? "text-red-600" : "text-emerald-700"}`}>{fmtNat(remaining)}</div>
              </div>
            </div>

            {/* Input: record payment */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Total Diterima ({currency})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max={totalPrice}
                  step="1000"
                  placeholder="0"
                  value={String(paidAmount || 0)}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value) || 0, totalPrice);
                    const newPS = derivePaymentStatus(v, totalPrice, ps === "REFUNDED" ? "REFUNDED" : undefined);
                    setDraft({ ...draft, paidAmount: v, paymentStatus: newPS });
                  }}
                  className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, paidAmount: totalPrice, paymentStatus: "PAID" })}
                  className="h-9 px-3 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 transition-colors whitespace-nowrap"
                >
                  Lunas
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, paidAmount: 0, paymentStatus: "UNPAID" })}
                  className="h-9 px-3 rounded-md text-[11px] font-bold bg-red-100 text-red-600 border border-red-200 hover:bg-red-200 transition-colors whitespace-nowrap"
                >
                  Reset
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Masukkan jumlah total yang sudah diterima, lalu klik Simpan untuk memperbarui status.
              </p>
            </div>

            {/* WhatsApp reminder */}
            {linkedClient?.phone && remaining > 0 && (
              <div className="border-t border-green-100 pt-3">
                <a
                  href={buildWhatsAppReminderUrl(
                    linkedClient.phone,
                    linkedClient.name,
                    order.title || ORDER_TYPE_LABEL[order.type],
                    remaining,
                    currentUser?.agencyName ?? undefined,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-[12px] font-bold text-white bg-[#25D366] hover:bg-[#1ebe5b] transition-colors shadow-sm"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                  </svg>
                  Ingatkan Pembayaran via WhatsApp
                </a>
              </div>
            )}
          </div>
        );
      })()}

      {/* Linked entities */}
      {(linkedClient || order.packageId || order.tripId || order.jamaahId) && (
        <div className="rounded-2xl border border-border bg-secondary/30 p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Tautan</div>
          {linkedClient && (
            <Link to={`/clients/${linkedClient.id}`} className="flex items-center gap-2 text-sm hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Klien: <span className="font-semibold">{linkedClient.name}</span>
            </Link>
          )}
          {order.packageId && (
            <Link to={`/packages/${order.packageId}`} className="flex items-center gap-2 text-sm hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Paket Trip:{" "}
              <span className="font-semibold">
                {packages.find((p) => p.id === order.packageId)?.name ?? <span className="font-mono text-xs">{order.packageId}</span>}
              </span>
            </Link>
          )}
          {order.tripId && (
            <Link to={`/trips/${order.tripId}`} className="flex items-center gap-2 text-sm hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Trip:{" "}
              <span className="font-semibold">
                {trips.find((t) => t.id === order.tripId)?.name ?? <span className="font-mono text-xs">{order.tripId}</span>}
              </span>
            </Link>
          )}
          {order.jamaahId && (
            <div className="flex items-center gap-2 text-sm">
              {order.tripId ? (
                <Link to={`/trips/${order.tripId}/jamaah/${order.jamaahId}`} className="flex items-center gap-2 hover:underline text-sky-700">
                  <ExternalLink className="h-3.5 w-3.5" /> Profil Jamaah
                </Link>
              ) : (
                <>
                  <span className="text-muted-foreground">Jamaah:</span>
                  <span className="font-mono text-xs">{order.jamaahId}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── VOA Biaya Operasional Panel ─────────────────────────────────────── */}
      {order.type === "visa_voa" && currentUser?.role !== "staff" && (() => {
        const meta = (draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>;
        const fieldAgentId = (meta.voaFieldAgentId as string | undefined) ?? "__none";
        const selectedAgent = members.find((m) => m.userId === fieldAgentId);
        const voaFeeCurrency = ((meta.voaFeeCurrency as FeeCurrency | undefined) ?? "IDR");
        const totalOpex = voaOpCost({ ...order, metadata: meta });

        const voaFields = [
          { label: `Fee Agent – ${selectedAgent?.displayName ?? "belum dipilih"}`, rawKey: "voaAgentFeeRaw", idrKey: "voaAgentFee", disabled: !selectedAgent },
          { label: "Ongkos Transport / Perjalanan", rawKey: "voaTransportFeeRaw", idrKey: "voaTransportFee", disabled: false },
          { label: "Biaya Operasional Lainnya", rawKey: "voaOtherFeeRaw", idrKey: "voaOtherFee", disabled: false },
        ] as const;

        const onVoaCurrencyChange = (newCur: FeeCurrency) => {
          const newMeta: Record<string, unknown> = { ...meta, voaFeeCurrency: newCur };
          for (const f of voaFields) {
            const raw = Number(meta[f.rawKey] ?? meta[f.idrKey] ?? 0);
            newMeta[f.idrKey] = toIDRAmount(raw, newCur, rates);
          }
          setDraft({ ...draft, metadata: newMeta });
        };

        return (
          <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50 to-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🛂</span>
                <div>
                  <div className="text-sm font-semibold">Operasional VOA — Agent Lapangan</div>
                  <div className="text-[11px] text-muted-foreground">Pilih agent bertugas · fee otomatis masuk ke wallet mereka saat order Completed</div>
                </div>
              </div>
              <Select value={voaFeeCurrency} onValueChange={(v) => onVoaCurrencyChange(v as FeeCurrency)}>
                <SelectTrigger className="h-8 w-24 text-xs border-purple-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent selector */}
            <Field label="Agent Lapangan (bertugas di bandara)">
              <Select
                value={fieldAgentId}
                onValueChange={(v) => setDraft({
                  ...draft,
                  metadata: { ...meta, voaFieldAgentId: v === "__none" ? null : v },
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih agent lapangan…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Tidak ada / belum ditentukan —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName}
                      <span className="ml-1.5 text-[10px] text-muted-foreground capitalize">({m.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Fee fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {voaFields.map((f) => {
                const rawVal = Number(meta[f.rawKey] ?? meta[f.idrKey] ?? 0);
                const idrVal = toIDRAmount(rawVal, voaFeeCurrency, rates);
                return (
                  <div key={f.rawKey} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {f.label} ({voaFeeCurrency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={f.disabled}
                      placeholder="0"
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm disabled:opacity-50"
                      value={String(rawVal || 0)}
                      onChange={(e) => {
                        const raw = Number(e.target.value) || 0;
                        const idr = toIDRAmount(raw, voaFeeCurrency, rates);
                        setDraft({ ...draft, metadata: { ...meta, [f.rawKey]: raw, [f.idrKey]: idr } });
                      }}
                    />
                    {voaFeeCurrency !== "IDR" && rawVal > 0 && (
                      <div className="text-[10px] text-muted-foreground">≈ {fmtIDR(idrVal)}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            {totalOpex > 0 && (
              <div className="border-t border-purple-100 pt-3 flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11.5px] text-purple-700 font-semibold">
                  Total Biaya Operasional: {fmtIDR(totalOpex)}
                </div>
                {selectedAgent && Number(meta.voaAgentFee ?? 0) > 0 && (
                  <div className="text-[10.5px] px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                    🔄 {fmtIDR(Number(meta.voaAgentFee ?? 0))} masuk wallet {selectedAgent.displayName} saat Completed
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Biaya Kurir Setoran Panel — semua jenis order, owner only ──────── */}
      {currentUser?.role !== "staff" && (() => {
        const meta = (draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>;
        const kurirCurrency = ((meta.kurirFeeCurrency as FeeCurrency | undefined) ?? "IDR");
        const kurirAgentId = (meta.kurirAgentId as string | undefined) ?? "__none";
        const selectedKurir = members.find((m) => m.userId === kurirAgentId);
        const totalKurir = kurirOpCost({ ...order, metadata: meta });

        const kurirFields = [
          { label: "Fee Jasa Kurir", rawKey: "kurirFeeRaw", idrKey: "kurirFee" },
          { label: "Ongkos Transport", rawKey: "kurirTransportFeeRaw", idrKey: "kurirTransportFee" },
          { label: "Biaya Lainnya", rawKey: "kurirOtherFeeRaw", idrKey: "kurirOtherFee" },
        ] as const;

        const onKurirCurrencyChange = (newCur: FeeCurrency) => {
          const newMeta: Record<string, unknown> = { ...meta, kurirFeeCurrency: newCur };
          for (const f of kurirFields) {
            const raw = Number(meta[f.rawKey] ?? meta[f.idrKey] ?? 0);
            newMeta[f.idrKey] = toIDRAmount(raw, newCur, rates);
          }
          setDraft({ ...draft, metadata: newMeta });
        };

        return (
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🚴</span>
                <div>
                  <div className="text-sm font-semibold">Biaya Kurir Setoran Uang</div>
                  <div className="text-[11px] text-muted-foreground">Isi jika customer bayar tunai via kurir · memotong profit & masuk wallet agen yang dipilih</div>
                </div>
              </div>
              <Select value={kurirCurrency} onValueChange={(v) => onKurirCurrencyChange(v as FeeCurrency)}>
                <SelectTrigger className="h-8 w-24 text-xs border-amber-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delegasi kurir ke agent */}
            <Field label="Delegasi ke Agent / Kurir">
              <Select
                value={kurirAgentId}
                onValueChange={(v) => setDraft({
                  ...draft,
                  metadata: { ...meta, kurirAgentId: v === "__none" ? null : v },
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih agent kurir yang bertugas…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Tanpa delegasi —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName}
                      <span className="ml-1.5 text-[10px] text-muted-foreground capitalize">({m.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Fee fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {kurirFields.map((f) => {
                const rawVal = Number(meta[f.rawKey] ?? meta[f.idrKey] ?? 0);
                const idrVal = toIDRAmount(rawVal, kurirCurrency, rates);
                return (
                  <div key={f.rawKey} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {f.label} ({kurirCurrency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      value={String(rawVal || 0)}
                      onChange={(e) => {
                        const raw = Number(e.target.value) || 0;
                        const idr = toIDRAmount(raw, kurirCurrency, rates);
                        setDraft({ ...draft, metadata: { ...meta, [f.rawKey]: raw, [f.idrKey]: idr } });
                      }}
                    />
                    {kurirCurrency !== "IDR" && rawVal > 0 && (
                      <div className="text-[10px] text-muted-foreground">≈ {fmtIDR(idrVal)}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalKurir > 0 && (
              <div className="border-t border-amber-100 pt-3 flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11.5px] text-amber-700 font-semibold">
                  Total Biaya Kurir: {fmtIDR(totalKurir)}
                  {kurirCurrency !== "IDR" && (
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                      ({fmtNative(
                        (Number(meta.kurirFeeRaw ?? 0) + Number(meta.kurirTransportFeeRaw ?? 0) + Number(meta.kurirOtherFeeRaw ?? 0)),
                        kurirCurrency
                      )} {kurirCurrency})
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {selectedKurir && Number(meta.kurirFee ?? 0) > 0 && (
                    <div className="text-[10.5px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                      🔄 {fmtIDR(Number(meta.kurirFee ?? 0))} masuk wallet {selectedKurir.displayName} saat Completed
                    </div>
                  )}
                  <div className="text-[10.5px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                    ✂️ Memotong profit bersih transaksi
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Total preview — hidden from staff */}
      {currentUser?.role !== "staff" && (() => {
        const total = Number(draft.totalPrice ?? order.totalPrice);
        const cost = Number(draft.costPrice ?? order.costPrice ?? 0);
        const meta = (draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>;
        // Only deduct agentFee when createdByAgent is a real sales agent (role === "agent").
        // Direct owner orders or orders where a staff/owner is set as referral source → 0.
        const agentFee = isValidAgentOrder ? Number(meta.agentFee ?? 0) : 0;
        const pelaksanaFee = order.type === "visa_student" && meta.pelaksanaId
          ? Number(meta.pelaksanaFee ?? 200_000)
          : 0;
        const voaOpexTotal = order.type === "visa_voa"
          ? voaOpCost({ ...order, metadata: meta })
          : 0;
        const kurirOpexTotal = kurirOpCost({ ...order, metadata: meta });
        const profit = total - cost;
        const net = profit - agentFee - pelaksanaFee - voaOpexTotal - kurirOpexTotal;
        const profitPositive = profit >= 0;
        const netPositive = net >= 0;
        const hasDeductions = agentFee > 0 || pelaksanaFee > 0 || voaOpexTotal > 0 || kurirOpexTotal > 0;
        return (
          <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-white border border-sky-100 p-5 space-y-3">
            {/* Badge "Order Langsung Owner" — tampil kalau user adalah owner & tidak ada agent */}
            {currentUser?.role === "owner" && !isValidAgentOrder && (
              <div className="flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10.5px] font-semibold text-amber-700">
                <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                Order Langsung Owner — tidak ada komisi agen
              </div>
            )}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pendapatan Kotor</div>
              <div className="text-2xl md:text-3xl font-extrabold font-mono mt-1">
                {order.currency !== "IDR" ? `${order.currency} ` : ""}{total.toLocaleString("id-ID")}
              </div>
            </div>
            {cost > 0 && (
              <div className="border-t border-sky-100 pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Modal (Harga Visa)</span>
                  <span className="font-mono text-slate-600">−{order.currency !== "IDR" ? `${order.currency} ` : "Rp "}{cost.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-sky-100 pt-2">
                  <span className="text-muted-foreground font-medium">Profit Kotor</span>
                  <span className={`font-bold font-mono ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                    {profitPositive ? "+" : "−"}{order.currency !== "IDR" ? `${order.currency} ` : "Rp "}{Math.abs(profit).toLocaleString("id-ID")}
                  </span>
                </div>
                {voaOpexTotal > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fee Agent Lapangan 🛂</span>
                      <span className="font-mono text-purple-600">−{fmtIDR(Number(meta.voaAgentFee ?? 0))}</span>
                    </div>
                    {Number(meta.voaTransportFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Ongkos Transport VOA</span>
                        <span className="font-mono text-purple-600">−{fmtIDR(Number(meta.voaTransportFee ?? 0))}</span>
                      </div>
                    )}
                    {Number(meta.voaOtherFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Biaya Lainnya VOA</span>
                        <span className="font-mono text-purple-600">−{fmtIDR(Number(meta.voaOtherFee ?? 0))}</span>
                      </div>
                    )}
                  </>
                )}
                {kurirOpexTotal > 0 && (
                  <>
                    {Number(meta.kurirFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Fee Jasa Kurir 🚴</span>
                        <span className="font-mono text-amber-700">−{fmtIDR(Number(meta.kurirFee ?? 0))}</span>
                      </div>
                    )}
                    {Number(meta.kurirTransportFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Ongkos Transport Kurir</span>
                        <span className="font-mono text-amber-700">−{fmtIDR(Number(meta.kurirTransportFee ?? 0))}</span>
                      </div>
                    )}
                    {Number(meta.kurirOtherFee ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Biaya Lainnya Kurir</span>
                        <span className="font-mono text-amber-700">−{fmtIDR(Number(meta.kurirOtherFee ?? 0))}</span>
                      </div>
                    )}
                  </>
                )}
                {agentFee > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <button
                      className="text-muted-foreground hover:text-sky-700 hover:underline transition-colors flex items-center gap-1 text-left"
                      onClick={() => order.createdByAgent && navigate(`/agents/${order.createdByAgent}`)}
                      title="Buka profil agen"
                    >
                      Fee Agen Penjual <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </button>
                    <span className="font-mono text-orange-600">−{fmtIDR(agentFee)}</span>
                  </div>
                )}
                {pelaksanaFee > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <button
                      className="text-muted-foreground hover:text-violet-700 hover:underline transition-colors flex items-center gap-1 text-left"
                      onClick={() => { const pid = meta.pelaksanaId as string | undefined; if (pid) navigate(`/staff/${pid}`); }}
                      title="Buka profil pelaksana"
                    >
                      Fee Pelaksana Visa <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </button>
                    <span className="font-mono text-violet-600">−{fmtIDR(pelaksanaFee)}</span>
                  </div>
                )}
                {hasDeductions && (
                  <div className="flex items-center justify-between text-sm font-semibold border-t border-sky-100 pt-2">
                    <span>Profit Bersih</span>
                    <span className={`font-bold font-mono ${netPositive ? "text-sky-700" : "text-red-600"}`}>
                      {netPositive ? "+" : ""}{fmtIDR(net)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Visa Entry Panel — hanya untuk visa_student */}
      {order.type === "visa_student" && (
        <VisaEntryPanel
          order={{ ...order, metadata: (draft.metadata ?? order.metadata) as Record<string, unknown> }}
          onMetaChange={(newMeta) =>
            setDraft((d) => ({ ...d, metadata: newMeta }))
          }
        />
      )}

      {/* Metadata viewer — hidden from staff */}
      {currentUser?.role !== "staff" && order.metadata && Object.keys(order.metadata).length > 0 && (
        <details className="rounded-2xl border border-border bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Metadata{order.type === "umrah" ? " (Breakdown Kalkulator)" : ""}
          </summary>
          <pre className="text-[11px] mt-3 bg-secondary/40 p-3 rounded overflow-auto max-h-96">
            {JSON.stringify(order.metadata, null, 2)}
          </pre>
        </details>
      )}

      {order.type === "flight" && (
        <ClientViewDialog
          open={clientViewOpen}
          onClose={() => setClientViewOpen(false)}
          data={{
            kind: "flight",
            meta: ((draft.metadata as Record<string, unknown>) ?? order.metadata) as import("@/features/orders/FlightOrderEditor").FlightMeta,
            client: linkedClient ?? null,
            title: (draft.title as string | null) ?? order.title,
            totalPrice: Number(draft.totalPrice ?? order.totalPrice),
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus order ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Klien & data jamaah/paket terkait tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                try {
                  await removeOrder(order.id);
                  toast.success("Order dihapus");
                  navigate("/orders");
                } catch (e) {
                  toast.error("Gagal hapus", { description: e instanceof Error ? e.message : "Coba lagi." });
                }
              }}
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
