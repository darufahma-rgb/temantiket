import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Users, Plus, Search, Phone, Mail, Pencil, Trash2,
  ArrowLeft, ShoppingBag, X, MessageCircle, FileText,
  ChevronRight, BookOpen,
} from "lucide-react";
import { PassportScanButton } from "@/components/PassportScanButton";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClientsStore, type Client } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI } from "@/features/orders/ordersRepo";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import MemberCard from "@/components/MemberCard";
import { ClientDocVault } from "@/components/ClientDocVault";
import { buildMemberSlug, buildPublicMemberUrl } from "@/lib/memberSlug";

// ── helpers ────────────────────────────────────────────────────────────────
const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

interface ClientFormData {
  name: string; phone: string; email: string;
  passportNumber: string; birthDate: string; notes: string;
}
const emptyForm: ClientFormData = { name: "", phone: "", email: "", passportNumber: "", birthDate: "", notes: "" };

function clientToForm(c: Client): ClientFormData {
  return { name: c.name, phone: c.phone ?? "", email: c.email ?? "", passportNumber: c.passportNumber ?? "", birthDate: c.birthDate ?? "", notes: c.notes ?? "" };
}

// ── Avatar helpers ──────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  "from-sky-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-purple-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-sky-500",
  "from-indigo-400 to-violet-500",
  "from-fuchsia-400 to-rose-500",
];
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function getGradient(name: string) {
  return AVATAR_GRADIENTS[(name.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length];
}

// ── Payment status helpers ──────────────────────────────────────────────────
const STATUS_RANK: Record<string, number> = { Completed: 5, Paid: 4, Confirmed: 3, Draft: 2, Cancelled: 1, none: 0 };

type StatusBadge = { label: string; bg: string; text: string; border: string };

function deriveStatusBadge(bestStatus: string): StatusBadge {
  if (bestStatus === "Completed" || bestStatus === "Paid")
    return { label: "Lunas", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  if (bestStatus === "Confirmed")
    return { label: "DP", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  if (bestStatus === "Draft")
    return { label: "Prospek", bg: "bg-sky-50", text: "text-sky-600", border: "border-sky-200" };
  return { label: "Baru", bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200" };
}

// ── Detail page ─────────────────────────────────────────────────────────────
function ClientDetailInner({ id }: { id: string }) {
  const navigate = useNavigate();
  const { clients, fetchClients, getOneClient, patchClient, removeClient } = useClientsStore();
  const { orders, fetchOrders } = useOrdersStore();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cached = clients.find((c) => c.id === id);
      if (cached && !cancelled) setClient(cached);
      const fresh = await getOneClient(id);
      if (!cancelled) setClient(fresh);
      void fetchOrders({ clientId: id });
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { if (clients.length === 0) void fetchClients(); }, [clients.length, fetchClients]);

  const clientOrders = useMemo(() => orders.filter((o) => o.clientId === id), [orders, id]);

  const memberIndex = useMemo(() => {
    if (!client) return 1;
    const sorted = [...clients].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const idx = sorted.findIndex((c) => c.id === client.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [clients, client]);

  if (loading && !client) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Memuat klien…</div>;
  if (!client) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground mb-3">Klien tidak ditemukan.</div>
        <Button variant="outline" onClick={() => navigate("/clients")}><ArrowLeft className="h-4 w-4 mr-1.5" /> Kembali</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/clients")} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl md:text-2xl font-bold">{client.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telp" value={client.phone || "—"} />
        <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={client.email || "—"} />
        <InfoRow label="No. Paspor" value={client.passportNumber || "—"} />
        <InfoRow label="Tgl Lahir" value={client.birthDate || "—"} />
        {client.legacyJamaahId && <InfoRow label="Jamaah ID (legacy)" value={client.legacyJamaahId} />}
      </div>

      {client.notes && (
        <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm whitespace-pre-wrap">{client.notes}</div>
      )}

      <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/40 overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-sky-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🪪</span>
            <h2 className="text-sm font-semibold">Member Card</h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700">
              {clientOrders.filter((o) => ["Confirmed","Paid","Completed"].includes(o.status)).length} stamp
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">Klik Download di kartu untuk export PNG</span>
        </div>
        <div className="p-4 md:p-5">
          <MemberCard client={client} memberIndex={memberIndex} orders={clientOrders} publicUrl={buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))} />
          <p className="mt-3 text-[11px] text-muted-foreground">
            Link publik klien:{" "}
            <a href={buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))} target="_blank" rel="noreferrer" className="font-mono text-sky-600 hover:underline break-all">
              {buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))}
            </a>
          </p>
        </div>
      </section>

      <ClientDocVault client={client} memberIndex={memberIndex} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Order ({clientOrders.length})
          </h2>
          <Button size="sm" onClick={() => navigate(`/orders/umrah?clientId=${id}`)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Order Baru
          </Button>
        </div>
        {clientOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Belum ada order untuk klien ini.</div>
        ) : (
          <div className="space-y-2">
            {clientOrders.map((o) => (
              <Link key={o.id} to={`/orders/detail/${o.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3 hover:bg-secondary/50 transition">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="text-xl">{ORDER_TYPE_EMOJI[o.type]}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</div>
                    <div className="text-[11px] text-muted-foreground">{ORDER_TYPE_LABEL[o.type]} · {o.status}</div>
                  </div>
                </div>
                <div className="text-sm font-mono font-semibold">{fmtIDR(o.totalPrice)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} initial={clientToForm(client)} title="Edit Klien"
        onSubmit={async (form) => { await patchClient(client.id, form); toast.success("Klien diperbarui"); setEditOpen(false); setClient({ ...client, ...form }); }} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus klien ini?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak bisa dibatalkan. Data order yang terkait akan tetap ada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                try { await removeClient(client.id); toast.success("Klien dihapus"); navigate("/clients"); }
                catch (e) { toast.error("Gagal hapus", { description: e instanceof Error ? e.message : "Coba lagi." }); }
              }}>Ya, Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-sm font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}

// ── Form dialog ─────────────────────────────────────────────────────────────
function ClientFormDialog({ open, onOpenChange, initial, title, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: ClientFormData; title: string;
  onSubmit: (form: ClientFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<ClientFormData>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);
  const update = <K extends keyof ClientFormData>(k: K, v: ClientFormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Data dasar klien — bisa dipakai ulang utk berbagai jenis order.</DialogDescription>
            </div>
            <PassportScanButton aiOnly label="Scan Paspor" size="sm" className="shrink-0 mt-0.5"
              onScanned={(data) => {
                if (data.name) update("name", data.name);
                if (data.passportNumber) update("passportNumber", data.passportNumber);
                if (data.birthDate) update("birthDate", data.birthDate);
              }} />
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nama *"><Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Nama lengkap" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telp"><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="08xxx" /></Field>
            <Field label="Email"><Input value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="email@..." /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="No. Paspor"><Input value={form.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} placeholder="A1234567" /></Field>
            <Field label="Tgl Lahir"><Input type="date" value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} /></Field>
          </div>
          <Field label="Catatan">
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)}
              className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="Catatan internal…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button disabled={!form.name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try { await onSubmit(form); }
              catch (e) { toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." }); }
              finally { setSaving(false); }
            }}>{saving ? "Menyimpan…" : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

// ── Skeleton card ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3.5 bg-slate-200 rounded-full w-3/5" />
          <div className="h-2.5 bg-slate-100 rounded-full w-2/5" />
        </div>
        <div className="h-5 w-14 bg-slate-100 rounded-full" />
      </div>
      <div className="border-t border-border/50 px-4 py-2.5 flex gap-6">
        <div className="h-3 bg-slate-100 rounded-full w-12" />
        <div className="h-3 bg-slate-100 rounded-full w-16" />
        <div className="h-3 bg-slate-100 rounded-full w-10" />
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ hasQuery, onAdd }: { hasQuery: boolean; onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      {hasQuery ? (
        <>
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Search className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-foreground">Tidak ditemukan</p>
          <p className="text-xs text-muted-foreground mt-1">Coba kata kunci yang berbeda</p>
        </>
      ) : (
        <>
          {/* Minimalist SVG illustration */}
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="mb-5 opacity-80">
            <circle cx="40" cy="40" r="38" fill="#f0f9ff" stroke="#bae6fd" strokeWidth="1.5" />
            <circle cx="40" cy="30" r="11" fill="#7dd3fc" opacity="0.6" />
            <path d="M18 62c0-12.15 9.85-22 22-22s22 9.85 22 22" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />
            <circle cx="40" cy="30" r="7" fill="#0ea5e9" opacity="0.85" />
            <circle cx="57" cy="23" r="5" fill="#bae6fd" opacity="0.6" />
            <circle cx="23" cy="23" r="5" fill="#bae6fd" opacity="0.6" />
          </svg>
          <p className="text-sm font-semibold text-foreground">Belum ada jamaah terdaftar</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
            Tambahkan klien pertama untuk mulai kelola order perjalanan mereka.
          </p>
          <Button className="mt-5 rounded-xl" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Tambah Klien Pertama
          </Button>
        </>
      )}
    </motion.div>
  );
}

// ── Mobile client card ──────────────────────────────────────────────────────
function ClientCard({
  client,
  orderCount,
  bestStatus,
  latestLabel,
  totalPrice,
  onNavigate,
}: {
  client: Client;
  orderCount: number;
  bestStatus: string;
  latestLabel: string | null;
  totalPrice: number;
  onNavigate: () => void;
}) {
  const badge = deriveStatusBadge(bestStatus);
  const initials = getInitials(client.name);
  const gradient = getGradient(client.name);

  const waNumber = client.phone.replace(/\D/g, "");
  const waLink = waNumber ? `https://wa.me/${waNumber.startsWith("0") ? "62" + waNumber.slice(1) : waNumber}` : null;

  const infoLine = useMemo(() => {
    if (orderCount === 0) return "Belum ada order";
    if (latestLabel) return `${ORDER_TYPE_EMOJI[latestLabel as keyof typeof ORDER_TYPE_EMOJI] ?? "📦"} ${ORDER_TYPE_LABEL[latestLabel as keyof typeof ORDER_TYPE_LABEL] ?? latestLabel}`;
    return `${orderCount} order`;
  }, [orderCount, latestLabel]);

  const billLine = useMemo(() => {
    if (bestStatus === "Completed" || bestStatus === "Paid") return "Sisa Tagihan: Rp\u00a00";
    if (orderCount > 0 && totalPrice > 0) return `Nilai Order: ${fmtIDR(totalPrice)}`;
    return null;
  }, [bestStatus, orderCount, totalPrice]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-2xl border border-border bg-white overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)] active:scale-[0.99] transition-transform"
    >
      {/* Top — clickable area → detail */}
      <button
        onClick={onNavigate}
        className="w-full text-left flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/80 transition-colors"
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
          <span className="text-white text-xs font-bold tracking-wide">{initials}</span>
        </div>

        {/* Name + info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-foreground truncate">{client.name}</span>
            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="text-[11.5px] text-muted-foreground truncate">{infoLine}</span>
            {billLine && (
              <>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <span className="text-[11px] text-muted-foreground/70 shrink-0 truncate">{billLine}</span>
              </>
            )}
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </button>

      {/* Divider */}
      <div className="h-px bg-border/50 mx-4" />

      {/* Quick actions */}
      <div className="flex items-center px-2 py-1.5">
        {/* WhatsApp */}
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-[11.5px] font-medium">WA</span>
          </a>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-muted-foreground/30">
            <MessageCircle className="h-4 w-4" />
            <span className="text-[11.5px]">WA</span>
          </div>
        )}

        <div className="w-px h-5 bg-border/50" />

        {/* Dokumen */}
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sky-600 hover:bg-sky-50 transition-colors"
          title="Lihat Dokumen"
        >
          <BookOpen className="h-4 w-4" />
          <span className="text-[11.5px] font-medium">Dokumen</span>
        </button>

        <div className="w-px h-5 bg-border/50" />

        {/* Orders */}
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors"
          title="Lihat Order"
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="text-[11.5px] font-medium">
            {orderCount > 0 ? `${orderCount} Order` : "Order"}
          </span>
        </button>
      </div>
    </motion.div>
  );
}

// ── Main list page ──────────────────────────────────────────────────────────
export default function Clients() {
  const params = useParams<{ id?: string }>();
  if (params.id) return <ClientDetailInner id={params.id} />;

  const navigate = useNavigate();
  const { clients, loadingClients, fetchClients, addClient } = useClientsStore();
  const { orders, fetchOrders } = useOrdersStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchClients();
    void fetchOrders();
  }, [isAuthenticated, fetchClients, fetchOrders]);

  // Per-client order summary
  const clientOrderSummary = useMemo(() => {
    const map = new Map<string, { count: number; bestStatus: string; latestType: string | null; totalPrice: number }>();
    for (const o of orders) {
      if (!o.clientId) continue;
      const cur = map.get(o.clientId) ?? { count: 0, bestStatus: "none", latestType: null, totalPrice: 0 };
      cur.count++;
      cur.totalPrice += o.totalPrice;
      if ((STATUS_RANK[o.status] ?? 0) > (STATUS_RANK[cur.bestStatus] ?? 0)) {
        cur.bestStatus = o.status;
        cur.latestType = o.type;
      }
      map.set(o.clientId, cur);
    }
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    const s = debouncedQ.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      c.phone.toLowerCase().includes(s) ||
      (c.email ?? "").toLowerCase().includes(s) ||
      (c.passportNumber ?? "").toLowerCase().includes(s),
    );
  }, [debouncedQ, clients]);

  const isLoading = loadingClients && clients.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ── */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Users className="h-[18px] w-[18px] text-sky-500" />
            Klien
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isLoading ? "Memuat…" : `${clients.length} kontak terdaftar`}
          </p>
        </div>
        <Button size="sm" className="rounded-xl h-8 px-3" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Tambah
        </Button>
      </div>

      {/* ── Sticky search bar ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 px-5 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, nomor WA, paspor…"
            className="pl-9 pr-9 h-9 text-sm bg-slate-50 border-slate-200 rounded-xl focus:bg-white focus:border-sky-300 transition-colors"
          />
          <AnimatePresence>
            {q && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        {/* Result count hint */}
        {q && !isLoading && (
          <p className="text-[10.5px] text-muted-foreground mt-1.5 ml-0.5">
            {filtered.length} dari {clients.length} klien
          </p>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-5 py-3">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasQuery={!!debouncedQ} onAdd={() => setAddOpen(true)} />
        ) : (
          <AnimatePresence mode="popLayout">
            {/* Mobile: single column. md+: 2-col. lg+: 3-col */}
            <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
              {filtered.map((c) => {
                const summary = clientOrderSummary.get(c.id);
                return (
                  <ClientCard
                    key={c.id}
                    client={c}
                    orderCount={summary?.count ?? 0}
                    bestStatus={summary?.bestStatus ?? "none"}
                    latestLabel={summary?.latestType ?? null}
                    totalPrice={summary?.totalPrice ?? 0}
                    onNavigate={() => navigate(`/clients/${c.id}`)}
                  />
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {/* Bottom padding for mobile nav */}
        <div className="h-6" />
      </div>

      <ClientFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={emptyForm}
        title="Klien Baru"
        onSubmit={async (form) => {
          if (!form.name.trim()) return;
          const c = await addClient({
            name: form.name.trim(), phone: form.phone.trim(),
            email: form.email.trim() || undefined,
            passportNumber: form.passportNumber.trim() || undefined,
            birthDate: form.birthDate || undefined,
            notes: form.notes.trim() || undefined,
          });
          toast.success("Klien dibuat", { description: c.name });
          setAddOpen(false);
          navigate(`/clients/${c.id}`);
        }}
      />
    </div>
  );
}
