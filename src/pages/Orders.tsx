import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ShoppingBag, Plus, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { useAuthStore } from "@/store/authStore";
import {
  ORDER_TYPES, ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI,
  type OrderType,
} from "@/features/orders/ordersRepo";
import { toast } from "sonner";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

function isOrderType(v: string | undefined): v is OrderType {
  return !!v && (ORDER_TYPES as readonly string[]).includes(v);
}

export default function Orders() {
  const params = useParams<{ type?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const typeFilter: OrderType | undefined = isOrderType(params.type) ? params.type : undefined;
  const clientIdParam = searchParams.get("clientId") || undefined;

  const { orders, loadingOrders, fetchOrders, addOrder } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchOrders();
    if (clients.length === 0) void fetchClients();
  }, [isAuthenticated, fetchOrders, fetchClients, clients.length]);

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    let out = orders;
    if (typeFilter) out = out.filter((o) => o.type === typeFilter);
    if (clientIdParam) out = out.filter((o) => o.clientId === clientIdParam);
    const s = q.trim().toLowerCase();
    if (s) {
      out = out.filter((o) =>
        (o.title ?? "").toLowerCase().includes(s) ||
        (clientNameById.get(o.clientId ?? "") ?? "").toLowerCase().includes(s) ||
        o.status.toLowerCase().includes(s),
      );
    }
    return out;
  }, [orders, typeFilter, clientIdParam, q, clientNameById]);

  const heading = typeFilter
    ? `Order — ${ORDER_TYPE_LABEL[typeFilter]}`
    : "Semua Order";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(typeFilter || clientIdParam) && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="h-8 px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              {typeFilter ? <span className="text-2xl">{ORDER_TYPE_EMOJI[typeFilter]}</span> : <ShoppingBag className="h-5 w-5" />}
              {heading}
            </h1>
            {clientIdParam && clientNameById.get(clientIdParam) && (
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Filter: klien <span className="font-semibold">{clientNameById.get(clientIdParam)}</span>
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Order Baru
        </Button>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={!typeFilter} onClick={() => navigate(clientIdParam ? `/orders?clientId=${clientIdParam}` : "/orders")}>
          Semua
        </FilterChip>
        {ORDER_TYPES.map((t) => (
          <FilterChip key={t} active={typeFilter === t} onClick={() => navigate(`/orders/${t}${clientIdParam ? `?clientId=${clientIdParam}` : ""}`)}>
            <span className="mr-1">{ORDER_TYPE_EMOJI[t]}</span>{ORDER_TYPE_LABEL[t]}
          </FilterChip>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul / klien / status…" className="pl-9 h-10" />
      </div>

      {loadingOrders && orders.length === 0 ? (
        <div className="text-sm text-muted-foreground">Memuat…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada order. Buat order baru untuk memulai.</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Order Baru
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Link key={o.id} to={`/orders/detail/${o.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3 hover:bg-secondary/50 hover:border-primary/30 transition">
              <div className="min-w-0 flex items-center gap-3">
                <span className="text-2xl">{ORDER_TYPE_EMOJI[o.type]}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {ORDER_TYPE_LABEL[o.type]}
                    {o.clientId && clientNameById.get(o.clientId) && ` · ${clientNameById.get(o.clientId)}`}
                    {" · "}{o.status}
                  </div>
                </div>
              </div>
              <div className="text-sm font-mono font-semibold shrink-0">{fmtIDR(o.totalPrice)}</div>
            </Link>
          ))}
        </div>
      )}

      <NewOrderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultType={typeFilter ?? "umrah"}
        defaultClientId={clientIdParam}
        clients={clients}
        onSubmit={async (draft) => {
          const o = await addOrder({ ...draft, metadata: {}, tripId: null, packageId: null, jamaahId: null, notes: null });
          toast.success("Order dibuat");
          setAddOpen(false);
          navigate(`/orders/detail/${o.id}`);
        }}
      />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-white text-muted-foreground border-border hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function NewOrderDialog({
  open, onOpenChange, defaultType, defaultClientId, clients, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultType: OrderType;
  defaultClientId?: string;
  clients: { id: string; name: string }[];
  onSubmit: (draft: {
    type: OrderType; status: "Draft"; title: string | null;
    totalPrice: number; currency: string; clientId: string | null;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<OrderType>(defaultType);
  const [title, setTitle] = useState("");
  const [totalPrice, setTotalPrice] = useState<string>("");
  const [clientId, setClientId] = useState<string>(defaultClientId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setTitle("");
      setTotalPrice("");
      setClientId(defaultClientId ?? "");
    }
  }, [open, defaultType, defaultClientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order Baru</DialogTitle>
          <DialogDescription>Field minimum — detail bisa di-edit setelah dibuat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipe Order</Label>
            <Select value={type} onValueChange={(v) => setType(v as OrderType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ORDER_TYPE_EMOJI[t]} {ORDER_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Judul</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Tiket Jakarta-Jeddah Mei" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Klien (opsional)</Label>
            <Select value={clientId || "__none"} onValueChange={(v) => setClientId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Pilih klien" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Tanpa klien —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Harga (IDR)</Label>
            <Input type="number" inputMode="numeric" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({
                  type,
                  status: "Draft",
                  title: title.trim() || null,
                  totalPrice: Number(totalPrice) || 0,
                  currency: "IDR",
                  clientId: clientId || null,
                });
              } catch (e) {
                toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." });
              } finally { setSaving(false); }
            }}
          >
            {saving ? "Menyimpan…" : "Buat Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
