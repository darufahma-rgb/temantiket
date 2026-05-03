import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ShoppingBag, Plus, Search, ArrowLeft, ChevronRight, TrendingUp, Wallet } from "lucide-react";
import { motion } from "framer-motion";
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
import { useClientsStore, type Client } from "@/store/clientsStore";
import { useAuthStore } from "@/store/authStore";
import {
  ORDER_TYPES, ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI,
  type OrderType,
} from "@/features/orders/ordersRepo";
import { PassportScanButton } from "@/components/PassportScanButton";
import { decidePassportSync } from "@/features/clients/passportSync";
import { toast } from "sonner";
import { getCommissionForOrderType, loadProductCommissions } from "@/lib/productCommissions";
import { cn } from "@/lib/utils";

function fmtIDRShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}Rb`;
  return String(n);
}

// Mata uang default per tipe order — visa Mesir dijual dalam EGP, sisanya IDR.
const CURRENCY_BY_TYPE: Record<OrderType, "IDR" | "EGP"> = {
  umrah: "IDR",
  flight: "IDR",
  visa_voa: "EGP",
  visa_student: "EGP",
};
const CURRENCY_SYMBOL: Record<"IDR" | "EGP", string> = { IDR: "Rp", EGP: "EGP" };

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

  const totalRevenue = useMemo(() => orders.reduce((s, o) => s + (o.totalPrice ?? 0), 0), [orders]);
  const draftCount   = useMemo(() => orders.filter(o => o.status === "Draft").length, [orders]);
  const doneCount    = useMemo(() => orders.filter(o => ["Done", "Paid", "Completed"].includes(o.status)).length, [orders]);

  const heading = typeFilter
    ? `Order — ${ORDER_TYPE_LABEL[typeFilter]}`
    : "Semua Order";

  const STATUS_STYLE: Record<string, string> = {
    Draft:     "bg-gray-100 text-gray-500",
    Confirmed: "bg-amber-100 text-amber-700",
    Paid:      "bg-emerald-100 text-emerald-700",
    Done:      "bg-purple-100 text-purple-700",
    Completed: "bg-purple-100 text-purple-700",
  };

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
           MOBILE LAYOUT  (md:hidden)
      ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden">
        <div className="px-3.5 pt-2 pb-6 space-y-3">

          {/* ── Header row ── */}
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              {typeFilter
                ? <span className="text-[22px]">{ORDER_TYPE_EMOJI[typeFilter]}</span>
                : <ShoppingBag className="h-5 w-5 text-violet-500" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9.5px] text-[hsl(var(--muted-foreground))] leading-none uppercase tracking-wide">Order</p>
              <h1 className="text-[15px] font-extrabold text-[hsl(var(--foreground))] leading-tight truncate">
                {typeFilter ? ORDER_TYPE_LABEL[typeFilter] : "Order Hub"}
              </h1>
            </div>
            {(typeFilter || clientIdParam) && (
              <button
                onClick={() => navigate("/orders")}
                className="h-8 w-8 rounded-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] flex items-center justify-center active:scale-95 transition-transform shrink-0"
              >
                <ArrowLeft className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              </button>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="h-8 px-3.5 rounded-full bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform shadow-sm shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Baru
            </button>
          </div>

          {/* ── Hero stats card ── */}
          <div className="rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 p-4 text-white relative overflow-hidden shadow-lg shadow-violet-300/30">
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/10 pointer-events-none" />
            <div className="relative">
              <p className="text-[8.5px] font-bold uppercase tracking-widest opacity-70">Total Order</p>
              <h2 className="text-[26px] font-extrabold leading-tight mt-0.5 tabular-nums">{orders.length}</h2>
              <div className="flex items-stretch gap-1.5 mt-3">
                {[
                  { icon: Wallet,      label: "Revenue",  value: `Rp ${fmtIDRShort(totalRevenue)}` },
                  { icon: ShoppingBag, label: "Draft",    value: String(draftCount) },
                  { icon: TrendingUp,  label: "Selesai",  value: String(doneCount) },
                ].map((s) => (
                  <div key={s.label} className="flex-1 bg-white/20 rounded-xl px-2 py-1.5 text-center">
                    <p className="text-[12px] font-extrabold leading-none">{s.value}</p>
                    <p className="text-[7px] opacity-75 mt-0.5 leading-none uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Type filter chips ── */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-0.5 px-0.5">
            <button
              onClick={() => navigate(clientIdParam ? `/orders?clientId=${clientIdParam}` : "/orders")}
              className={cn(
                "shrink-0 h-8 px-3.5 rounded-full text-[11px] font-bold border transition active:scale-95 whitespace-nowrap",
                !typeFilter ? "bg-violet-500 text-white border-transparent shadow-sm" : "bg-white text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]"
              )}
            >Semua</button>
            {ORDER_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => navigate(`/orders/${t}${clientIdParam ? `?clientId=${clientIdParam}` : ""}`)}
                className={cn(
                  "shrink-0 h-8 px-3.5 rounded-full text-[11px] font-bold border transition active:scale-95 flex items-center gap-1 whitespace-nowrap",
                  typeFilter === t ? "bg-violet-500 text-white border-transparent shadow-sm" : "bg-white text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]"
                )}
              >
                <span>{ORDER_TYPE_EMOJI[t]}</span>{ORDER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* ── Search bar ── */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))] pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul / klien / status…"
              className="w-full h-11 pl-10 pr-10 rounded-2xl text-[12.5px] outline-none bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] text-[10px] font-bold active:scale-90"
              >✕</button>
            )}
          </div>

          {/* ── Client filter badge ── */}
          {clientIdParam && clientNameById.get(clientIdParam) && (
            <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-200 rounded-2xl px-3.5 py-2.5">
              <div className="h-7 w-7 rounded-full bg-violet-500 flex items-center justify-center text-white text-[11px] font-extrabold shrink-0">
                {clientNameById.get(clientIdParam)!.charAt(0).toUpperCase()}
              </div>
              <p className="text-[11.5px] text-violet-800 font-semibold flex-1 truncate">
                Klien: {clientNameById.get(clientIdParam)}
              </p>
              <button onClick={() => navigate("/orders")} className="text-[10px] text-violet-500 font-bold active:opacity-70 shrink-0">Hapus</button>
            </div>
          )}

          {/* ── Order list ── */}
          {loadingOrders && orders.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border animate-pulse p-3.5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[hsl(var(--secondary))] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-[hsl(var(--secondary))] rounded w-3/4" />
                    <div className="h-2.5 bg-[hsl(var(--secondary))] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-10 text-center flex flex-col items-center">
              <div className="h-14 w-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-3 border border-violet-100">
                <ShoppingBag className="h-7 w-7 text-violet-400" />
              </div>
              <p className="text-[13px] font-bold text-[hsl(var(--foreground))]">Belum ada order</p>
              <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] mt-1 leading-snug">Buat order baru untuk memulai.</p>
              <button
                onClick={() => setAddOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 h-9 px-5 rounded-full text-[11.5px] font-bold text-white shadow-md active:scale-95 transition-transform"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#4f46e5)" }}
              >
                <Plus className="h-3.5 w-3.5" /> Order Baru
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((o) => {
                const clientName = o.clientId ? clientNameById.get(o.clientId) : null;
                return (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/orders/detail/${o.id}`)}
                    className="w-full flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-white px-3.5 py-3 text-left active:scale-[0.98] transition-transform hover:border-violet-300 hover:shadow-sm"
                  >
                    <div className="h-11 w-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-[22px] shrink-0">
                      {ORDER_TYPE_EMOJI[o.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-bold text-[hsl(var(--foreground))] truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                        {ORDER_TYPE_LABEL[o.type]}{clientName ? ` · ${clientName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={cn("text-[9.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", STATUS_STYLE[o.status] ?? "bg-gray-100 text-gray-500")}>
                        {o.status}
                      </span>
                      <span className="text-[11px] font-extrabold text-[hsl(var(--foreground))] tabular-nums">{fmtIDR(o.totalPrice)}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden md:block)
      ══════════════════════════════════════════════════════════ */}
      <motion.div
        className="hidden md:block p-4 md:p-6 max-w-6xl mx-auto space-y-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
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
          <motion.div
            className="space-y-2"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.042, delayChildren: 0.04 } } }}
          >
            {filtered.map((o) => (
              <motion.div
                key={o.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } },
                }}
              >
                <Link to={`/orders/detail/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3 hover:bg-secondary/50 hover:border-primary/30 transition-all hover:shadow-sm">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="text-2xl">{ORDER_TYPE_EMOJI[o.type]}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {ORDER_TYPE_LABEL[o.type]}
                        {o.clientId && clientNameById.get(o.clientId) && (
                          <>
                            {" · "}
                            <span
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/clients/${o.clientId}`); }}
                              className="hover:underline hover:text-primary cursor-pointer"
                            >
                              {clientNameById.get(o.clientId)}
                            </span>
                          </>
                        )}
                        {" · "}{o.status}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-mono font-semibold shrink-0">{fmtIDR(o.totalPrice)}</div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* ── Dialog (shared) ── */}
      <NewOrderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultType={typeFilter ?? "umrah"}
        defaultClientId={clientIdParam}
        onSubmit={async (draft) => {
          const { agentFee, ...rest } = draft;
          const o = await addOrder({ ...rest, metadata: { agentFee }, tripId: null, packageId: null, jamaahId: null, notes: null });
          toast.success("Order dibuat");
          setAddOpen(false);
          navigate(`/orders/detail/${o.id}`);
        }}
      />
    </>
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
  open, onOpenChange, defaultType, defaultClientId, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultType: OrderType;
  defaultClientId?: string;
  onSubmit: (draft: {
    type: OrderType; status: "Draft"; title: string | null;
    totalPrice: number; costPrice: number; currency: string; clientId: string | null;
    agentFee: number;
  }) => Promise<void>;
}) {
  const { clients, addClient, patchClient } = useClientsStore();

  const [type, setType] = useState<OrderType>(defaultType);
  const [title, setTitle] = useState("");
  // Track apakah user udah ngedit judul manual — kalau iya, jangan auto-overwrite
  // pas type/client berubah. Reset ke false setiap dialog dibuka.
  const [titleEdited, setTitleEdited] = useState(false);
  const [totalPrice, setTotalPrice] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const [clientId, setClientId] = useState<string>(defaultClientId ?? "");
  const [currency, setCurrency] = useState<"IDR" | "EGP">(CURRENCY_BY_TYPE[defaultType]);
  // Track apakah user udah pilih currency manual — kalau iya, jangan ikut
  // berubah saat tipe order diganti.
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [agentFee, setAgentFee] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const currencySymbol = CURRENCY_SYMBOL[currency];

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setTitle("");
      setTitleEdited(false);
      setTotalPrice("");
      setCostPrice("");
      setClientId(defaultClientId ?? "");
      setCurrency(CURRENCY_BY_TYPE[defaultType]);
      setCurrencyEdited(false);
      // Auto-fill fee komisi dari settings saat dialog dibuka
      const fee = getCommissionForOrderType(defaultType, loadProductCommissions());
      setAgentFee(fee > 0 ? String(fee) : "");
    }
  }, [open, defaultType, defaultClientId]);

  // Auto-update currency saat tipe berubah (selama user belum pilih manual).
  useEffect(() => {
    if (!open || currencyEdited) return;
    setCurrency(CURRENCY_BY_TYPE[type]);
  }, [open, type, currencyEdited]);

  // Auto-update agent fee saat tipe order berubah.
  useEffect(() => {
    if (!open) return;
    const fee = getCommissionForOrderType(type, loadProductCommissions());
    setAgentFee(fee > 0 ? String(fee) : "");
  }, [open, type]);

  // Auto-fill judul: "[Tipe Order] - [Nama Klien]" (atau cuma tipe kalau gak
  // ada klien). Cuma jalan kalau user belum ngetik manual.
  useEffect(() => {
    if (!open || titleEdited) return;
    const typeLabel = ORDER_TYPE_LABEL[type];
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    const next = client ? `${typeLabel} - ${client.name}` : "";
    setTitle(next);
  }, [open, type, clientId, clients, titleEdited]);

  // Hasil scan paspor → match ke client lama (update field kosong) atau bikin
  // client baru. Selesai → auto-pilih client di dropdown supaya judul auto-fill.
  const handlePassportScanned = async (
    passport: Parameters<React.ComponentProps<typeof PassportScanButton>["onScanned"]>[0],
    photoDataUrl: string,
  ) => {
    const decision = decidePassportSync(clients, passport, { photoDataUrl });
    if (decision.kind === "noop") {
      toast.error("Hasil scan kurang jelas", { description: decision.reason });
      return;
    }
    let target: Client;
    if (decision.kind === "match") {
      target = decision.client;
      // Update field yg masih kosong di client lama (non-destructive).
      if (Object.keys(decision.patch).length > 0) {
        try {
          await patchClient(target.id, decision.patch);
          toast.success(`Klien "${target.name}" diperbarui dari paspor`);
        } catch (e) {
          // Update gagal tapi match tetep valid — lanjut select aja.
          console.warn("[NewOrderDialog] patch client failed:", e);
          toast.success(`Klien "${target.name}" dipilih`);
        }
      } else {
        toast.success(`Klien "${target.name}" dipilih`);
      }
    } else {
      // create
      try {
        target = await addClient(decision.draft);
        toast.success(`Klien baru "${target.name}" dibuat`);
      } catch (e) {
        toast.error("Gagal buat klien baru", {
          description: e instanceof Error ? e.message : "Coba lagi.",
        });
        return;
      }
    }
    setClientId(target.id);
  };

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
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Klien (opsional)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
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
              <PassportScanButton
                label="Scan Paspor"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onScanned={handlePassportScanned}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Judul</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }}
              placeholder="mis. Tiket Jakarta-Jeddah Mei"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Harga Modal
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="px-2 h-9 rounded-md border bg-muted/40 text-[11px] font-semibold inline-flex items-center shrink-0">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0"
                />
              </div>
              <p className="text-[10px] text-muted-foreground pt-0.5">
                Bayar ke supplier
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Harga Jual
              </Label>
              <div className="flex items-center gap-1.5">
                <Select
                  value={currency}
                  onValueChange={(v) => { setCurrency(v as "IDR" | "EGP"); setCurrencyEdited(true); }}
                >
                  <SelectTrigger className="w-[68px] shrink-0 px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IDR">Rp</SelectItem>
                    <SelectItem value="EGP">EGP</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0"
                />
              </div>
              <p className="text-[10px] text-muted-foreground pt-0.5">
                Tagihan ke klien
              </p>
            </div>
          </div>

          {/* Fee Komisi Agen */}
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Fee Komisi Agen
            </Label>
            <div className="flex items-center gap-1.5">
              <span className="px-2 h-9 rounded-md border bg-muted/40 text-[11px] font-semibold inline-flex items-center shrink-0">
                Rp
              </span>
              <Input
                type="number"
                inputMode="numeric"
                value={agentFee}
                onChange={(e) => setAgentFee(e.target.value)}
                placeholder="0 (auto dari settings)"
                className="flex-1 min-w-0"
              />
            </div>
            <p className="text-[10px] text-muted-foreground pt-0.5">
              Auto-isi dari pengaturan fee per produk · bisa diubah manual
            </p>
          </div>

          {/* Profit preview */}
          {(Number(totalPrice) > 0 || Number(costPrice) > 0) && (() => {
            const profit = (Number(totalPrice) || 0) - (Number(costPrice) || 0);
            const fee = Number(agentFee) || 0;
            const net = profit - fee;
            const positive = profit >= 0;
            const netPositive = net >= 0;
            return (
              <div className="space-y-1.5">
                <div className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                  positive ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                }`}>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Profit Kotor
                  </span>
                  <span className={`text-[14px] font-extrabold font-mono ${positive ? "text-emerald-700" : "text-red-600"}`}>
                    {positive ? "+" : ""}{currencySymbol} {Math.abs(profit).toLocaleString("id-ID")}
                  </span>
                </div>
                {fee > 0 && (
                  <div className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                    netPositive ? "bg-sky-50 border-sky-200" : "bg-red-50 border-red-200"
                  }`}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Net (- fee agen)
                    </span>
                    <span className={`text-[14px] font-extrabold font-mono ${netPositive ? "text-sky-700" : "text-red-600"}`}>
                      {netPositive ? "+" : ""}{currencySymbol} {Math.abs(net).toLocaleString("id-ID")}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
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
                  costPrice: Number(costPrice) || 0,
                  currency,
                  clientId: clientId || null,
                  agentFee: Number(agentFee) || 0,
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
