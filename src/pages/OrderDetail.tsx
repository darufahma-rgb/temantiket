import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Save, ExternalLink, Eye } from "lucide-react";
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
import { FlightOrderEditor, type FlightMeta } from "@/features/orders/FlightOrderEditor";
import { toast } from "sonner";
import { getCommissionForOrderType } from "@/lib/productCommissions";
import { addWalletTx } from "@/lib/agentWallet";
import { useAuthStore } from "@/store/authStore";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orders, getOneOrder, patchOrder, removeOrder, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();
  const rates = useRatesStore((s) => s.rates);
  const packages = usePackagesStore((s) => s.packages);
  const trips = useTripsStore((s) => s.trips);
  const currentUser = useAuthStore((s) => s.user);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Order>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientViewOpen, setClientViewOpen] = useState(false);

  useEffect(() => {
    if (clients.length === 0) void fetchClients();
    if (orders.length === 0) void fetchOrders();
  }, [clients.length, orders.length, fetchClients, fetchOrders]);

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
          // Auto-populate agentFee from productCommissions if order belongs to
          // an agent and fee hasn't been set yet (0 or missing).
          if (fresh.createdByAgent && !Number((fresh.metadata as Record<string, unknown>)?.agentFee)) {
            const autoFee = getCommissionForOrderType(fresh.type);
            if (autoFee > 0) {
              setDraft({
                ...fresh,
                metadata: { ...(fresh.metadata ?? {}), agentFee: autoFee },
              });
            } else {
              setDraft(fresh);
            }
          } else {
            setDraft(fresh);
          }
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = useMemo(() => {
    if (!order) return false;
    return (
      draft.title !== order.title ||
      draft.status !== order.status ||
      Number(draft.totalPrice ?? 0) !== Number(order.totalPrice) ||
      Number(draft.costPrice ?? 0) !== Number(order.costPrice) ||
      (draft.clientId ?? null) !== (order.clientId ?? null) ||
      (draft.notes ?? null) !== (order.notes ?? null) ||
      JSON.stringify(draft.metadata ?? {}) !== JSON.stringify(order.metadata ?? {})
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
      const isCompletedTransition =
        newStatus === "Completed" && order.status !== "Completed";

      // Snapshot EGP/SAR rate when order first becomes Paid/Completed
      let metaPatch = (draft.metadata as Record<string, unknown>) ?? order.metadata ?? {};
      if (isPaidTransition) {
        metaPatch = buildRateSnapshotPatch(metaPatch, rates.EGP ?? 515, rates.SAR ?? 4250);
      }

      await patchOrder(order.id, {
        title: draft.title ?? null,
        status: newStatus,
        totalPrice: Number(draft.totalPrice ?? 0),
        costPrice: Number(draft.costPrice ?? 0),
        clientId: (draft.clientId as string | null) ?? null,
        notes: (draft.notes as string | null) ?? null,
        metadata: metaPatch,
      });

      const fresh = await getOneOrder(order.id);
      if (fresh) { setOrder(fresh); setDraft(fresh); }

      // ── Agent commission recording ──────────────────────────────────────────
      // When status → Completed and this order was brought in by an agent,
      // automatically credit the agent's wallet with the commission fee.
      if (isCompletedTransition && order.createdByAgent) {
        const agentId = order.createdByAgent;
        // Use the manually set agentFee from metadata, or fall back to the
        // global product commission config for this order type.
        const feeAmount =
          Number(metaPatch.agentFee) ||
          getCommissionForOrderType(order.type);

        if (feeAmount > 0) {
          const orderLabel = ORDER_TYPE_LABEL[order.type];
          const orderId8 = order.id.slice(0, 8);
          addWalletTx(agentId, {
            agentId,
            type: "order_bonus",
            pointsDelta: 0,
            amountIDR: feeAmount,
            description: `Komisi order ${orderLabel} #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy: currentUser?.id ?? "system",
          });

          toast.success(`Komisi agen dicatat: ${fmtIDR(feeAmount)}`, {
            description: `Order "${order.title || orderLabel}" selesai — wallet agen diperbarui.`,
            duration: 5000,
          });
        }
      }

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
      className="p-4 md:p-6 max-w-4xl mx-auto space-y-5"
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
              <span className="text-2xl">{ORDER_TYPE_EMOJI[order.type]}</span>
              {order.title || ORDER_TYPE_LABEL[order.type]}
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              {ORDER_TYPE_LABEL[order.type]} · ID {order.id.slice(0, 8)}…
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.type === "flight" && (
            <Button
              variant="outline"
              onClick={() => setClientViewOpen(true)}
              className="border-sky-200 text-sky-700 hover:bg-sky-50"
              title="Preview untuk klien (siap kirim WhatsApp)"
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Client View
            </Button>
          )}
          <InvoiceButton order={order} client={linkedClient ?? null} phone={linkedClient?.phone} variant="default" className="gradient-primary text-white border-0 hover:opacity-90 shadow-sm" />
          <Button onClick={handleSave} disabled={!dirty || saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Menyimpan…" : "Simpan"}
          </Button>
          <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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
          <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>
        <Field label="Tipe (read-only)">
          <Select value={draft.type as OrderType ?? order.type} disabled>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{ORDER_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={draft.status as OrderStatus ?? order.status} onValueChange={(v) => setDraft({ ...draft, status: v as OrderStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={`Harga Modal (${order.currency})`}>
          <Input type="number" value={String(draft.costPrice ?? 0)} onChange={(e) => setDraft({ ...draft, costPrice: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={`Harga Jual (${order.currency})`}>
          <Input type="number" value={String(draft.totalPrice ?? 0)} onChange={(e) => setDraft({ ...draft, totalPrice: Number(e.target.value) || 0 })} />
        </Field>
        {order.createdByAgent && (
          <Field label="Fee Komisi Agen (IDR)">
            <Input
              type="number"
              value={String(Number(((draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>).agentFee ?? 0))}
              onChange={(e) => setDraft({
                ...draft,
                metadata: {
                  ...((draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>),
                  agentFee: Number(e.target.value) || 0,
                },
              })}
            />
          </Field>
        )}
        <Field label="Klien">
          <Select value={(draft.clientId ?? order.clientId) || "__none"} onValueChange={(v) => setDraft({ ...draft, clientId: v === "__none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Pilih klien" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Tanpa klien —</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency"><Input value={order.currency} disabled /></Field>
      </div>

      <Field label="Catatan">
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </Field>

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
              <span className="text-muted-foreground">Jamaah lama:</span> <span className="font-mono text-xs">{order.jamaahId}</span>
            </div>
          )}
        </div>
      )}

      {/* Total preview */}
      {(() => {
        const total = Number(draft.totalPrice ?? order.totalPrice);
        const cost = Number(draft.costPrice ?? order.costPrice ?? 0);
        const meta = (draft.metadata ?? order.metadata ?? {}) as Record<string, unknown>;
        const agentFee = order.createdByAgent ? Number(meta.agentFee ?? 0) : 0;
        const profit = total - cost;
        const net = profit - agentFee;
        const profitPositive = profit >= 0;
        const netPositive = net >= 0;
        return (
          <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-white border border-sky-100 p-5 space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Harga Jual</div>
              <div className="text-2xl md:text-3xl font-extrabold font-mono mt-1">
                {fmtIDR(total)}
              </div>
            </div>
            {cost > 0 && (
              <div className="border-t border-sky-100 pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Profit Kotor</span>
                  <span className={`font-bold font-mono ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                    {profitPositive ? "+" : ""}{fmtIDR(profit)}
                  </span>
                </div>
                {agentFee > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fee Komisi Agen</span>
                      <span className="font-mono text-orange-600">−{fmtIDR(agentFee)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold border-t border-sky-100 pt-2">
                      <span>Net Profit</span>
                      <span className={`font-bold font-mono ${netPositive ? "text-sky-700" : "text-red-600"}`}>
                        {netPositive ? "+" : ""}{fmtIDR(net)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Metadata viewer (esp. for umrah breakdown) */}
      {order.metadata && Object.keys(order.metadata).length > 0 && (
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
