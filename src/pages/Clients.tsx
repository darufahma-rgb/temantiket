import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Users, Plus, Search, Phone, Mail, Pencil, Trash2,
  ArrowLeft, ShoppingBag, X, MessageCircle, FileText,
  ChevronRight, BookOpen, User, CreditCard, Calendar,
  MapPin, CalendarClock, CalendarCheck, Building2 as BuildingOffice,
  UserCheck, AlertTriangle, ScanLine, Loader2, ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { OrderProgressTracker, ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { scanPassport } from "@/lib/ocrPassport";
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
  name: string;
  phone: string;
  email: string;
  passportNumber: string;
  birthDate: string;
  birthPlace: string;
  passportExpiry: string;
  passportIssueDate: string;
  passportIssuingOffice: string;
  gender: "L" | "P" | "";
  notes: string;
  /** user_id dari agen/owner yang closing/mereferensikan klien ini. "" = belum dipilih. */
  referredBy: string;
  /** client_id dari klien lain yang mengajak klien ini (referral antar klien). "" = belum dipilih. */
  referredByClientId: string;
}

const emptyForm: ClientFormData = {
  name: "", phone: "", email: "",
  passportNumber: "", birthDate: "", birthPlace: "",
  passportExpiry: "", passportIssueDate: "", passportIssuingOffice: "",
  gender: "", notes: "", referredBy: "", referredByClientId: "",
};

function clientToForm(c: Client): ClientFormData {
  return {
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    passportNumber: c.passportNumber ?? "",
    birthDate: c.birthDate ?? "",
    birthPlace: c.birthPlace ?? "",
    passportExpiry: c.passportExpiry ?? "",
    passportIssueDate: c.passportIssueDate ?? "",
    passportIssuingOffice: c.passportIssuingOffice ?? "",
    gender: c.gender ?? "",
    notes: c.notes ?? "",
    referredBy: c.createdByAgent ?? "",
    referredByClientId: c.referredByClientId ?? "",
  };
}

// ── Expiry validation ────────────────────────────────────────────────────────
function getExpiryStatus(expiry: string): "ok" | "warning" | "expired" | null {
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  if (isNaN(exp.getTime())) return null;
  if (exp < today) return "expired";
  const sixMonths = new Date(today);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  if (exp < sixMonths) return "warning";
  return "ok";
}

// ── Date mask helper: converts YYYY-MM-DD ↔ DD/MM/YYYY ──────────────────────
function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return iso;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
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
  const { orders, fetchOrders, patchOrder } = useOrdersStore();
  const userRole = useAuthStore((s) => s.user?.role);
  const isOwner = userRole === "owner";
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [referredByName, setReferredByName] = useState<string | null>(null);
  const [referredByClientName, setReferredByClientName] = useState<string | null>(null);
  const [advancingOrderId, setAdvancingOrderId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOwner || !client?.createdByAgent) { setReferredByName(null); return; }
    useAuthStore.getState().listMembers()
      .then((list) => {
        const found = list.find((m) => m.userId === client.createdByAgent);
        setReferredByName(found?.displayName ?? null);
      })
      .catch(() => {});
  }, [isOwner, client?.createdByAgent]);

  useEffect(() => {
    if (!client?.referredByClientId) { setReferredByClientName(null); return; }
    const found = clients.find((c) => c.id === client.referredByClientId);
    if (found) { setReferredByClientName(found.name); return; }
    // Fallback: fetch langsung kalau belum ada di cache
    import("@/features/clients/clientsRepo").then(({ getClient }) =>
      getClient(client.referredByClientId!)
    ).then((c) => setReferredByClientName(c?.name ?? null)).catch(() => {});
  }, [client?.referredByClientId, clients]);

  const clientOrders = useMemo(() => orders.filter((o) => o.clientId === id), [orders, id]);

  async function handleAdvanceStep(orderId: string, type: string, currentStep: number, metadata: Record<string, unknown>) {
    const steps = ORDER_PROCESS_STEPS[type];
    if (!steps) return;
    const nextStep = currentStep + 1;
    if (nextStep >= steps.length) return;
    setAdvancingOrderId(orderId);
    try {
      await patchOrder(orderId, { metadata: { ...metadata, processStep: nextStep } });
      toast.success(`✅ Proses diperbarui: ${steps[nextStep].label}`);
    } catch (e) {
      toast.error("Gagal memperbarui proses.", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setAdvancingOrderId(null);
    }
  }

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
        {isOwner && referredByName && (
          <InfoRow
            icon={<UserCheck className="h-3.5 w-3.5 text-violet-400" />}
            label="Closing / Referensi"
            value={referredByName}
          />
        )}
        {referredByClientName && (
          <InfoRow
            icon={<span className="text-sm">🤝</span>}
            label="Direferensikan oleh klien"
            value={referredByClientName}
          />
        )}
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
          <div className="space-y-3">
            {[...clientOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => {
              const meta = (o.metadata ?? {}) as Record<string, unknown>;
              const currentStep = Number(meta.processStep ?? 0);
              const steps = ORDER_PROCESS_STEPS[o.type];
              const isComplete = steps ? currentStep >= steps.length - 1 : false;
              const isAdvancing = advancingOrderId === o.id;
              const canAdvance = !isComplete && (isOwner || userRole === "agent");
              return (
                <div key={o.id} className={`rounded-2xl border bg-white overflow-hidden ${isComplete ? "border-emerald-100" : "border-border"}`}>
                  {/* Header row */}
                  <Link
                    to={`/orders/detail/${o.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition border-b border-border/60"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-xl shrink-0">{ORDER_TYPE_EMOJI[o.type]}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</div>
                        <div className="text-[11px] text-muted-foreground">{ORDER_TYPE_LABEL[o.type]} · {o.status}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {userRole !== "staff" && (
                        <div className="text-sm font-mono font-semibold">{fmtIDR(o.totalPrice)}</div>
                      )}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                  </Link>

                  {/* Progress tracker */}
                  {steps && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <div className="h-4 w-4 rounded bg-sky-100 flex items-center justify-center">
                          <span className="text-[9px]">📍</span>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progress Proses</span>
                      </div>
                      <OrderProgressTracker
                        type={o.type}
                        currentStep={currentStep}
                        onAdvance={canAdvance ? () => void handleAdvanceStep(o.id, o.type, currentStep, meta) : undefined}
                        isAdvancing={isAdvancing}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} initial={clientToForm(client)} title="Edit Klien" currentClientId={client.id}
        onSubmit={async (form) => {
          await patchClient(client.id, {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || undefined,
            passportNumber: form.passportNumber.trim() || undefined,
            birthDate: form.birthDate || undefined,
            birthPlace: form.birthPlace.trim() || undefined,
            passportExpiry: form.passportExpiry || undefined,
            passportIssueDate: form.passportIssueDate || undefined,
            passportIssuingOffice: form.passportIssuingOffice.trim() || undefined,
            gender: (form.gender as "L" | "P" | "") || undefined,
            notes: form.notes.trim() || undefined,
            createdByAgent: form.referredBy || null,
            referredByClientId: form.referredByClientId || null,
          });
          toast.success("Klien diperbarui");
          setEditOpen(false);
          setClient({ ...client, ...form });
        }} />

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

// ── Date-mask input (DD/MM/YYYY ↔ YYYY-MM-DD) ───────────────────────────────
function DateMaskInput({
  value, onChange, placeholder = "DD/MM/YYYY", disabled,
}: {
  value: string; onChange: (iso: string) => void; placeholder?: string; disabled?: boolean;
}) {
  const [display, setDisplay] = useState(isoToDisplay(value));
  useEffect(() => { setDisplay(isoToDisplay(value)); }, [value]);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let masked = digits;
    if (digits.length > 2) masked = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) masked = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    setDisplay(masked);
    if (digits.length === 8) {
      const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
      onChange(`${yyyy}-${mm}-${dd}`);
    } else {
      onChange("");
    }
  };

  return (
    <Input
      value={display}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      maxLength={10}
      disabled={disabled}
      className={disabled ? "animate-pulse bg-slate-100" : ""}
    />
  );
}

// ── Skeleton field shimmer ───────────────────────────────────────────────────
function SkeletonInput() {
  return <div className="h-9 rounded-md bg-slate-200 animate-pulse w-full" />;
}

// ── Form dialog ──────────────────────────────────────────────────────────────
type MemberOption = { userId: string; displayName: string; role: string };

function ClientFormDialog({ open, onOpenChange, initial, title, onSubmit, currentClientId }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: ClientFormData; title: string;
  onSubmit: (form: ClientFormData) => Promise<void>;
  currentClientId?: string;
}) {
  const [form, setForm] = useState<ClientFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { clients } = useClientsStore();

  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    setMembersLoading(true);
    useAuthStore.getState().listMembers()
      .then((list) => setMembers(
        list.filter((m) => m.role === "owner" || m.role === "agent")
      ))
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [open]);
  const update = <K extends keyof ClientFormData>(k: K, v: ClientFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const expiryStatus = getExpiryStatus(form.passportExpiry);
  const canSave = form.name.trim() && !saving && !scanning && expiryStatus !== "expired";

  const handleScanFile = async (file: File) => {
    setScanning(true);
    setScanProgress(0);
    try {
      const result = await scanPassport(file, setScanProgress, { aiOnly: true });
      if (result.name) update("name", result.name);
      if (result.passportNumber) update("passportNumber", result.passportNumber);
      if (result.birthDate) update("birthDate", result.birthDate);
      if (result.expiryDate) update("passportExpiry", result.expiryDate);
      if (result.gender) update("gender", result.gender);
      toast.success("Scan selesai!", { description: "Data paspor berhasil dibaca." });
    } catch (e) {
      toast.error("Scan gagal", { description: e instanceof Error ? e.message : "Coba foto ulang lebih jelas." });
    } finally {
      setScanning(false);
      setScanProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!scanning && !saving) onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold">{title}</DialogTitle>
              <DialogDescription className="text-xs">Data dasar klien — bisa dipakai ulang untuk berbagai jenis order.</DialogDescription>
            </div>
            {/* Scan button */}
            <div className="shrink-0 mt-0.5">
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleScanFile(f); }} />
              <Button type="button" variant="outline" size="sm"
                className="border-sky-300 text-sky-700 hover:bg-sky-50 h-8 px-3 text-xs font-medium"
                disabled={scanning || saving}
                onClick={() => fileInputRef.current?.click()}>
                {scanning ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Scanning… {scanProgress > 0 ? `${scanProgress}%` : ""}</>
                ) : (
                  <><ScanLine className="h-3.5 w-3.5 mr-1.5" />Scan Paspor</>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Scan progress bar */}
        {scanning && (
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden -mt-1 mb-1">
            <div className="h-full bg-sky-400 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, scanProgress)}%` }} />
          </div>
        )}

        <div className="space-y-3 pt-1">
          {/* Nama */}
          <Field label="Nama" required icon={<User className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
            {scanning ? <SkeletonInput /> : (
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Nama lengkap sesuai paspor" />
            )}
          </Field>

          {/* Telp + Email */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telp" icon={<Phone className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="08xxx" disabled={scanning} />
            </Field>
            <Field label="Email" icon={<Mail className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              <Input value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="email@..." disabled={scanning} />
            </Field>
          </div>

          {/* Divider: Passport section */}
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data Paspor</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {/* No. Paspor + Jenis Kelamin */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="No. Paspor" icon={<CreditCard className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              {scanning ? <SkeletonInput /> : (
                <Input value={form.passportNumber} onChange={(e) => update("passportNumber", e.target.value.toUpperCase())} placeholder="A1234567" className="font-mono" />
              )}
            </Field>
            <Field label="Jenis Kelamin" icon={<UserCheck className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              {scanning ? <SkeletonInput /> : (
                <select value={form.gender}
                  onChange={(e) => update("gender", e.target.value as "L" | "P" | "")}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— Pilih —</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              )}
            </Field>
          </div>

          {/* Tgl Lahir + Tempat Lahir */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tgl Lahir" icon={<Calendar className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              {scanning ? <SkeletonInput /> : (
                <DateMaskInput value={form.birthDate} onChange={(v) => update("birthDate", v)} />
              )}
            </Field>
            <Field label="Tempat Lahir" icon={<MapPin className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              <Input value={form.birthPlace} onChange={(e) => update("birthPlace", e.target.value)} placeholder="Kota lahir" disabled={scanning} />
            </Field>
          </div>

          {/* Tgl Pengeluaran + Tgl Expiry */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tgl Pengeluaran" icon={<CalendarCheck className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              <DateMaskInput value={form.passportIssueDate} onChange={(v) => update("passportIssueDate", v)} disabled={scanning} />
            </Field>
            <Field label="Tgl Habis Berlaku" icon={<CalendarClock className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
              {scanning ? <SkeletonInput /> : (
                <DateMaskInput value={form.passportExpiry} onChange={(v) => update("passportExpiry", v)} />
              )}
            </Field>
          </div>

          {/* Expiry alert */}
          {expiryStatus === "expired" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" strokeWidth={1.75} />
              <p className="text-xs text-red-700 font-medium leading-snug">
                Paspor sudah <span className="font-bold">EXPIRED</span>. Klien tidak dapat melakukan perjalanan. Wajib perpanjang sebelum booking.
              </p>
            </div>
          )}
          {expiryStatus === "warning" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
              <p className="text-xs text-amber-700 font-medium leading-snug">
                ⚠️ Peringatan: Masa berlaku paspor kurang dari 6 bulan. Segera lakukan perpanjangan!
              </p>
            </div>
          )}
          {expiryStatus === "ok" && form.passportExpiry && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" strokeWidth={1.75} />
              <p className="text-xs text-emerald-700 font-medium">Paspor masih berlaku dan aman untuk perjalanan.</p>
            </div>
          )}

          {/* Kantor Pengeluaran */}
          <Field label="Kantor Pengeluaran" icon={<BuildingOffice className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
            <Input value={form.passportIssuingOffice} onChange={(e) => update("passportIssuingOffice", e.target.value)} placeholder="Contoh: Kantor Imigrasi Jakarta Selatan" disabled={scanning} />
          </Field>

          {/* Divider: Sumber Klien */}
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sumber Klien</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {/* Closing / Referensi dari */}
          <Field label="Closing / Referensi dari" icon={<UserCheck className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
            <select
              value={form.referredBy}
              onChange={(e) => update("referredBy", e.target.value)}
              disabled={scanning || membersLoading}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Belum dipilih —</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName} {m.role === "owner" ? "(Owner)" : "(Agen)"}
                </option>
              ))}
            </select>
            {membersLoading && (
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Memuat daftar anggota…
              </p>
            )}
            {!membersLoading && members.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Belum ada agen/owner terdaftar.</p>
            )}
          </Field>

          {/* Direferensikan oleh klien */}
          <Field label="Direferensikan oleh Klien" icon={<span className="text-[11px]">🤝</span>}>
            <select
              value={form.referredByClientId}
              onChange={(e) => update("referredByClientId", e.target.value)}
              disabled={scanning}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Tidak ada / belum dipilih —</option>
              {clients
                .filter((c) => c.id !== currentClientId)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Jika klien ini datang karena ajakan klien lain, pilih referrernya di sini. Saat order klien ini Confirmed/Paid/Selesai, referrer otomatis dapat +1 stamp.
            </p>
          </Field>

          {/* Catatan */}
          <Field label="Catatan" icon={<FileText className="h-3 w-3 text-blue-500" strokeWidth={1.75} />}>
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)}
              className="w-full min-h-[56px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Catatan internal…" disabled={scanning} />
          </Field>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={scanning || saving}>Batal</Button>
          <Button size="sm" disabled={!canSave}
            title={expiryStatus === "expired" ? "Paspor expired — tidak bisa disimpan" : undefined}
            onClick={async () => {
              if (expiryStatus === "warning") {
                const ok = window.confirm(
                  "⚠️ Paspor kurang dari 6 bulan. Jamaah mungkin ditolak imigrasi.\n\nLanjutkan menyimpan?"
                );
                if (!ok) return;
              }
              setSaving(true);
              try { await onSubmit(form); }
              catch (e) { toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." }); }
              finally { setSaving(false); }
            }}>
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, icon, children }: {
  label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}{label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
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
  referredByName,
}: {
  client: Client;
  orderCount: number;
  bestStatus: string;
  latestLabel: string | null;
  totalPrice: number;
  onNavigate: () => void;
  referredByName?: string;
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
          {referredByName && (
            <div className="flex items-center gap-1 mt-1">
              <UserCheck className="h-2.5 w-2.5 text-violet-400 shrink-0" strokeWidth={2} />
              <span className="text-[10.5px] text-violet-500 font-medium truncate">{referredByName}</span>
            </div>
          )}
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
  const userRole = useAuthStore((s) => s.user?.role);
  const isOwner = userRole === "owner";
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [addOpen, setAddOpen] = useState(false);
  const [memberNameMap, setMemberNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchClients();
    void fetchOrders();
  }, [isAuthenticated, fetchClients, fetchOrders]);

  useEffect(() => {
    if (!isOwner) return;
    useAuthStore.getState().listMembers()
      .then((list) => {
        const m = new Map<string, string>();
        for (const mem of list) m.set(mem.userId, mem.displayName);
        setMemberNameMap(m);
      })
      .catch(() => {});
  }, [isOwner]);

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
                    referredByName={isOwner && c.createdByAgent ? memberNameMap.get(c.createdByAgent) : undefined}
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
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || undefined,
            passportNumber: form.passportNumber.trim() || undefined,
            birthDate: form.birthDate || undefined,
            birthPlace: form.birthPlace.trim() || undefined,
            passportExpiry: form.passportExpiry || undefined,
            passportIssueDate: form.passportIssueDate || undefined,
            passportIssuingOffice: form.passportIssuingOffice.trim() || undefined,
            gender: form.gender || undefined,
            notes: form.notes.trim() || undefined,
            createdByAgent: form.referredBy || undefined,
            referredByClientId: form.referredByClientId || null,
          });
          toast.success("Klien dibuat", { description: c.name });
          setAddOpen(false);
          navigate(`/clients/${c.id}`);
        }}
      />
    </div>
  );
}
