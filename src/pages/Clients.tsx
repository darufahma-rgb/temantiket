import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

import { useNavigate, useParams, Link } from "react-router-dom";
import { Users, Plus, Search, Phone, Mail, Pencil, Trash2, ArrowLeft, ShoppingBag } from "lucide-react";
import { PassportScanButton } from "@/components/PassportScanButton";
import { motion } from "framer-motion";
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
  name: string;
  phone: string;
  email: string;
  passportNumber: string;
  birthDate: string;
  notes: string;
}

const emptyForm: ClientFormData = {
  name: "", phone: "", email: "", passportNumber: "", birthDate: "", notes: "",
};

function clientToForm(c: Client): ClientFormData {
  return {
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    passportNumber: c.passportNumber ?? "",
    birthDate: c.birthDate ?? "",
    notes: c.notes ?? "",
  };
}

// ── Detail page ────────────────────────────────────────────────────────────
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
      // Try in-memory cache first, fall back to fetch
      const cached = clients.find((c) => c.id === id);
      if (cached) {
        if (!cancelled) setClient(cached);
      }
      const fresh = await getOneClient(id);
      if (!cancelled) setClient(fresh);
      void fetchOrders({ clientId: id });
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { if (clients.length === 0) void fetchClients(); }, [clients.length, fetchClients]);

  const clientOrders = useMemo(
    () => orders.filter((o) => o.clientId === id),
    [orders, id],
  );

  /** Member index = posisi kronologis client di agency (1-based, oldest = 1).
   *  Stabil selama urutan createdAt tidak berubah. Dipakai sbg Member ID di kartu. */
  const memberIndex = useMemo(() => {
    if (!client) return 1;
    const sorted = [...clients].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const idx = sorted.findIndex((c) => c.id === client.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [clients, client]);

  if (loading && !client) {
    return <div className="p-6 text-sm text-muted-foreground">Memuat klien…</div>;
  }
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
        <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm whitespace-pre-wrap">
          {client.notes}
        </div>
      )}

      {/* Temantiket Member Card — dua sisi, flip + auto-stamp dari order sukses */}
      <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/40 overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-sky-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🪪</span>
            <h2 className="text-sm font-semibold text-foreground">Member Card</h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700">
              {clientOrders.filter((o) => ["Confirmed","Paid","Completed"].includes(o.status)).length} stamp
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">Klik Download di kartu untuk export PNG</span>
        </div>
        <div className="p-4 md:p-5">
        <MemberCard
          client={client}
          memberIndex={memberIndex}
          orders={clientOrders}
          publicUrl={buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))}
        />
        <p className="mt-3 text-[11px] text-muted-foreground">
          Link publik klien:{" "}
          <a
            href={buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sky-600 hover:underline break-all"
          >
            {buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))}
          </a>
        </p>
        </div>
      </section>

      {/* Document Vault */}
      <ClientDocVault client={client} memberIndex={memberIndex} />

      {/* Orders milik klien */}
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
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Belum ada order untuk klien ini.
          </div>
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

      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={clientToForm(client)}
        title="Edit Klien"
        onSubmit={async (form) => {
          await patchClient(client.id, form);
          toast.success("Klien diperbarui");
          setEditOpen(false);
          setClient({ ...client, ...form });
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus klien ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Data order yang terkait akan tetap ada (client_id-nya akan jadi kosong).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                try {
                  await removeClient(client.id);
                  toast.success("Klien dihapus");
                  navigate("/clients");
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

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}{label}
      </div>
      <div className="text-sm font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}

// ── Form dialog (shared add/edit) ──────────────────────────────────────────
function ClientFormDialog({
  open, onOpenChange, initial, title, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ClientFormData;
  title: string;
  onSubmit: (form: ClientFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<ClientFormData>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const update = <K extends keyof ClientFormData>(k: K, v: ClientFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Data dasar klien — bisa dipakai ulang utk berbagai jenis order.</DialogDescription>
            </div>
            <PassportScanButton
              aiOnly
              label="Scan Paspor"
              size="sm"
              className="shrink-0 mt-0.5"
              onScanned={(data) => {
                if (data.name) update("name", data.name);
                if (data.passportNumber) update("passportNumber", data.passportNumber);
                if (data.birthDate) update("birthDate", data.birthDate);
              }}
            />
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nama *">
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Nama lengkap" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telp"><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="08xxx" /></Field>
            <Field label="Email"><Input value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="email@..." /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="No. Paspor"><Input value={form.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} placeholder="A1234567" /></Field>
            <Field label="Tgl Lahir"><Input type="date" value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} /></Field>
          </div>
          <Field label="Catatan">
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="Catatan internal…"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={!form.name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try { await onSubmit(form); }
              catch (e) { toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." }); }
              finally { setSaving(false); }
            }}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
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

// ── Main list page ─────────────────────────────────────────────────────────
export default function Clients() {
  const params = useParams<{ id?: string }>();
  // If route is /clients/:id, render detail
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

  const ordersByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      if (o.clientId) m.set(o.clientId, (m.get(o.clientId) ?? 0) + 1);
    }
    return m;
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" /> Klien
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Daftar kontak independen — satu klien bisa punya banyak order (umrah, tiket, visa).
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Klien Baru
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / telp / email / paspor…" className="pl-9 h-10" />
      </div>

      {loadingClients && clients.length === 0 ? (
        <div className="text-sm text-muted-foreground">Memuat…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada klien. Tambah klien pertama untuk memulai.</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Klien Baru
          </Button>
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          {filtered.map((c) => {
            const count = ordersByClient.get(c.id) ?? 0;
            return (
              <button key={c.id} onClick={() => navigate(`/clients/${c.id}`)}
                className="text-left rounded-2xl border border-border bg-white p-4 hover:shadow-md hover:border-primary/40 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    {c.phone && <div className="text-[12px] text-muted-foreground truncate">{c.phone}</div>}
                  </div>
                  <span className="rounded-full bg-sky-50 text-sky-700 text-[10.5px] font-semibold px-2 py-0.5 shrink-0">
                    {count} order
                  </span>
                </div>
                {c.email && <div className="text-[11.5px] text-muted-foreground mt-2 truncate">{c.email}</div>}
                {c.legacyJamaahId && (
                  <div className="text-[10px] text-muted-foreground mt-1">From jamaah · {c.legacyJamaahId.slice(0, 12)}…</div>
                )}
              </button>
            );
          })}
        </motion.div>
      )}

      <ClientFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={emptyForm}
        title="Klien Baru"
        onSubmit={async (form) => {
          if (!form.name.trim()) return;
          const c = await addClient({
            name: form.name.trim(),
            phone: form.phone.trim(),
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
