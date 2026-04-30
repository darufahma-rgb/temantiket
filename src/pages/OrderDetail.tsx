import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Trash2, Save, ExternalLink } from "lucide-react";
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
import {
  ORDER_STATUSES, ORDER_TYPES, ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI,
  type Order, type OrderStatus, type OrderType,
} from "@/features/orders/ordersRepo";
import { FlightOrderEditor, type FlightMeta } from "@/features/orders/FlightOrderEditor";
import { toast } from "sonner";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orders, getOneOrder, patchOrder, removeOrder, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Order>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

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
        if (fresh) setDraft(fresh);
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
      await patchOrder(order.id, {
        title: draft.title ?? null,
        status: (draft.status as OrderStatus) ?? order.status,
        totalPrice: Number(draft.totalPrice ?? 0),
        clientId: (draft.clientId as string | null) ?? null,
        notes: (draft.notes as string | null) ?? null,
        metadata: (draft.metadata as Record<string, unknown>) ?? order.metadata,
      });
      const fresh = await getOneOrder(order.id);
      if (fresh) { setOrder(fresh); setDraft(fresh); }
      toast.success("Order disimpan");
    } catch (e) {
      toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
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
        <Field label="Total Harga (IDR)">
          <Input type="number" value={String(draft.totalPrice ?? 0)} onChange={(e) => setDraft({ ...draft, totalPrice: Number(e.target.value) || 0 })} />
        </Field>
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
              <ExternalLink className="h-3.5 w-3.5" /> Paket Trip: <span className="font-mono text-xs">{order.packageId}</span>
            </Link>
          )}
          {order.tripId && (
            <Link to={`/trips/${order.tripId}`} className="flex items-center gap-2 text-sm hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Trip: <span className="font-mono text-xs">{order.tripId}</span>
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
      <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-white border border-sky-100 p-5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
        <div className="text-2xl md:text-3xl font-extrabold font-mono mt-1">
          {fmtIDR(Number(draft.totalPrice ?? order.totalPrice))}
        </div>
      </div>

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
    </div>
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
