import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { useNotificationStore } from "@/store/notificationStore";
import { useRatesStore } from "@/store/ratesStore";
import { MobileFAB } from "@/components/MobileFAB";
import {
  Users, Plus, Search, Phone, Mail, Pencil, Trash2,
  ArrowLeft, ShoppingBag, X, MessageCircle, FileText,
  ChevronRight, BookOpen, User, CreditCard, Calendar,
  MapPin, CalendarClock, CalendarCheck, Building2 as BuildingOffice,
  UserCheck, AlertTriangle, ScanLine, Loader2, ShieldCheck,
  ExternalLink, TrendingUp, Download, Upload, Tag, Star,
  CheckCircle, ChevronLeft, ChevronDown, Zap,
  MoreHorizontal, Filter, LayoutList, LayoutGrid, Instagram, Globe,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { OrderProgressTracker, ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { MarkdownContent } from "@/components/MarkdownContent";
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
import { decrementReferralStamp } from "@/features/clients/clientsRepo";
import { useAIContextStore } from "@/store/aiContextStore";

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
  // Track locally-hidden order stamp IDs (optimistic, complements DB metadata.stampHidden)
  const [localHiddenStampIds, setLocalHiddenStampIds] = useState<Set<string>>(new Set());

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

  // Orders filtered by locally-hidden stamps (real-time UI before page refresh)
  const visibleStampOrders = useMemo(
    () => clientOrders.filter((o) => !localHiddenStampIds.has(o.id)),
    [clientOrders, localHiddenStampIds],
  );

  /** Owner: hapus satu stamp dari order tertentu.
   *  Simpan flag stampHidden=true ke order metadata agar persisten ke DB.
   */
  async function handleDeleteOrderStamp(orderId: string) {
    if (!isOwner) return;
    const order = clientOrders.find((o) => o.id === orderId);
    if (!order) return;
    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    await patchOrder(orderId, { metadata: { ...meta, stampHidden: true } });
    // Optimistic local hide (instant UI update)
    setLocalHiddenStampIds((prev) => new Set([...prev, orderId]));
  }

  /** Owner: hapus satu stamp referral (decrement referral_stamps). */
  async function handleDeleteReferralStamp() {
    if (!isOwner || !client) return;
    const updated = await decrementReferralStamp(client.id);
    setClient(updated);
  }

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
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
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
        <div className="rounded-2xl border border-border bg-secondary/40 p-4">
          <MarkdownContent content={client.notes} size="sm" />
        </div>
      )}

      <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/40 overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-sky-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🪪</span>
            <h2 className="text-sm font-semibold">Member Card</h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700">
              {visibleStampOrders.filter((o) => ["Confirmed","Paid","Completed"].includes(o.status) && !(o.metadata as Record<string, unknown> | null)?.stampHidden).length + (client.referralStamps ?? 0)} stamp
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">Klik Download di kartu untuk export PNG</span>
        </div>
        <div className="p-4 md:p-5">
          <MemberCard
            client={client}
            memberIndex={memberIndex}
            orders={visibleStampOrders.filter((o) => !(o.metadata as Record<string, unknown> | null)?.stampHidden)}
            referralStamps={client.referralStamps ?? 0}
            publicUrl={buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex))}
            isOwner={isOwner}
            onDeleteOrderStamp={isOwner ? handleDeleteOrderStamp : undefined}
            onDeleteReferralStamp={isOwner ? handleDeleteReferralStamp : undefined}
          />
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
                <div key={o.id} className={`rounded-2xl border bg-card overflow-hidden ${isComplete ? "border-emerald-100" : "border-border"}`}>
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
    <div className="rounded-xl border border-border bg-card p-3">
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
    <div className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
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
      whileHover={{ y: -2, boxShadow: "0 8px 22px -6px rgba(0,0,0,0.10)" }}
      whileTap={{ scale: 0.985 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)] cursor-pointer"
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

// ── Chart & sidebar constants ────────────────────────────────────────────────
const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

const SUMBER_KLIEN = [
  { name: "Instagram",    pct: 45, color: "#e1306c", iconBg: "#fce4f0", icon: <Instagram className="h-4 w-4" style={{ color: "#e1306c" }} /> },
  { name: "WhatsApp",     pct: 30, color: "#25d366", iconBg: "#d4f7e3", icon: <MessageCircle className="h-4 w-4" style={{ color: "#25d366" }} /> },
  { name: "Website",      pct: 15, color: "#3b82f6", iconBg: "#dbeafe", icon: <Globe className="h-4 w-4" style={{ color: "#3b82f6" }} /> },
  { name: "Rekomendasi",  pct: 10, color: "#f59e0b", iconBg: "#fef3c7", icon: <Users className="h-4 w-4" style={{ color: "#f59e0b" }} /> },
];

// ── Main list page ──────────────────────────────────────────────────────────
export default function Clients() {
  const params = useParams<{ id?: string }>();

  const navigate = useNavigate();
  const { clients, loadingClients, fetchClients, addClient, loaded: clientsLoaded } = useClientsStore();
  const { orders, fetchOrders, loaded: ordersLoaded } = useOrdersStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userRole = useAuthStore((s) => s.user?.role);
  const isOwner = userRole === "owner";
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [addOpen, setAddOpen] = useState(false);
  const [memberNameMap, setMemberNameMap] = useState<Map<string, string>>(new Map());
  const [showSearch, setShowSearch] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const [mobileStatusFilter, setMobileStatusFilter] = useState<"all" | "aktif" | "jamaah" | "loyal">("all");
  const MOBILE_PAGE_SIZE = 10;
  const location = useLocation();

  // ── Mobile: notification + rates ──────────────────────────────────
  const { notifications, fetchNotifications } = useNotificationStore();
  useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);
  const mUnread = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const usdRate = useRatesStore((s) => s.rates.USD ?? 16_000);
  const mUser   = useAuthStore((s) => s.user);

  // month-over-month comparisons for stats card
  const nowD2 = new Date();
  const thisMonthStr2 = `${nowD2.getFullYear()}-${String(nowD2.getMonth()+1).padStart(2,"0")}`;
  const lastMonthD2   = new Date(nowD2.getFullYear(), nowD2.getMonth()-1, 1);
  const lastMonthStr2 = `${lastMonthD2.getFullYear()}-${String(lastMonthD2.getMonth()+1).padStart(2,"0")}`;
  function mGrow(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }
  // Per-client order summary — must be declared before lastMonthLoyal which depends on it
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

  const lastMonthClients     = useMemo(() => clients.filter(c => (c.createdAt ?? "").startsWith(lastMonthStr2)).length, [clients, lastMonthStr2]);
  const lastMonthAktif       = useMemo(() => {
    const lastOrders = orders.filter(o => (o.createdAt ?? "").startsWith(lastMonthStr2) && ["Confirmed","Paid","Done","Completed"].includes(o.status));
    const ids = new Set(lastOrders.map(o => o.clientId).filter(Boolean));
    return ids.size;
  }, [orders, lastMonthStr2]);
  const lastMonthJamaah      = useMemo(() => {
    const lastOrders = orders.filter(o => (o.createdAt ?? "").startsWith(lastMonthStr2) && o.type === "umrah");
    const ids = new Set(lastOrders.map(o => o.clientId).filter(Boolean));
    return ids.size;
  }, [orders, lastMonthStr2]);
  const lastMonthLoyal       = useMemo(() => clients.filter(c => (clientOrderSummary.get(c.id)?.count ?? 0) > 1 && (c.createdAt ?? "").startsWith(lastMonthStr2)).length, [clients, clientOrderSummary, lastMonthStr2]);

  function mFmtUSD(idr: number) {
    const v = idr / usdRate;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000)     return (v / 1_000).toFixed(1) + "k";
    return v.toFixed(0);
  }
  function mGetInitials(name?: string) {
    if (!name) return "A";
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  }
  const totalClientRevIDR = useMemo(() => orders.filter(o => o.status !== "Cancelled").reduce((s, o) => s + (o.totalPrice ?? 0), 0), [orders]);

  // Desktop-specific state
  const [activeTab, setActiveTab] = useState<"all" | "aktif" | "vip" | "baru" | "tidakAktif">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [quickNote, setQuickNote] = useState("");

  const { setPageContext, setPageData, clearContext } = useAIContextStore();
  useEffect(() => {
    setPageContext({ pageId: "clients", pageTitle: "Data Klien" });
    return () => clearContext();
  }, [setPageContext, clearContext]);

  useEffect(() => {
    setPageData({
      totalClients: clients.length,
      recentClients: clients.slice(0, 10).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      })),
    });
  }, [clients.length, setPageData]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!clientsLoaded) void fetchClients();
    if (!ordersLoaded) void fetchOrders();
  }, [isAuthenticated, clientsLoaded, ordersLoaded, fetchClients, fetchOrders]);

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

  // Mobile stats
  const clientIdsWithActiveOrder = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) {
      if (o.clientId && ["Confirmed","Paid","Done","Completed"].includes(o.status)) s.add(o.clientId);
    }
    return s;
  }, [orders]);
  const clientIdsWithUmrah = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) {
      if (o.clientId && o.type === "umrah") s.add(o.clientId);
    }
    return s;
  }, [orders]);
  const klienAktif    = useMemo(() => clients.filter(c => clientIdsWithActiveOrder.has(c.id)).length, [clients, clientIdsWithActiveOrder]);
  const jamaahAktif   = useMemo(() => clients.filter(c => clientIdsWithUmrah.has(c.id)).length, [clients, clientIdsWithUmrah]);
  const klienLoyal    = useMemo(() => clients.filter(c => (clientOrderSummary.get(c.id)?.count ?? 0) > 1 || (c.referralStamps ?? 0) > 0).length, [clients, clientOrderSummary]);

  // Mobile filtered + paginated
  const mobileFiltered = useMemo(() => {
    let out = filtered;
    if (mobileStatusFilter === "aktif")  out = out.filter(c => clientIdsWithActiveOrder.has(c.id));
    if (mobileStatusFilter === "jamaah") out = out.filter(c => clientIdsWithUmrah.has(c.id));
    if (mobileStatusFilter === "loyal")  out = out.filter(c => (clientOrderSummary.get(c.id)?.count ?? 0) > 1 || (c.referralStamps ?? 0) > 0);
    return out;
  }, [filtered, mobileStatusFilter, clientIdsWithActiveOrder, clientIdsWithUmrah, clientOrderSummary]);
  const totalMobilePages = Math.max(1, Math.ceil(mobileFiltered.length / MOBILE_PAGE_SIZE));
  const mobilePaged = useMemo(() => mobileFiltered.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE), [mobileFiltered, mobilePage, MOBILE_PAGE_SIZE]);

  // Desktop computed
  const thirtyDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; }, []);
  const klienVIP       = useMemo(() => clients.filter(c => (clientOrderSummary.get(c.id)?.count ?? 0) >= 3), [clients, clientOrderSummary]);
  const klienBaru      = useMemo(() => clients.filter(c => new Date(c.createdAt) >= thirtyDaysAgo), [clients, thirtyDaysAgo]);
  const klienTidakAktif = useMemo(() => clients.filter(c => !clientIdsWithActiveOrder.has(c.id)), [clients, clientIdsWithActiveOrder]);
  const totalOrderCount = orders.length;
  const totalBelanja    = useMemo(() => orders.reduce((s, o) => s + (o.totalPrice ?? 0), 0), [orders]);
  const avgBelanja      = useMemo(() => {
    const withOrders = clients.filter(c => (clientOrderSummary.get(c.id)?.count ?? 0) > 0);
    if (withOrders.length === 0) return 0;
    const total = withOrders.reduce((s, c) => s + (clientOrderSummary.get(c.id)?.totalPrice ?? 0), 0);
    return total / withOrders.length;
  }, [clients, clientOrderSummary]);

  // Tab filtering for desktop
  const tabFiltered = useMemo(() => {
    let base = filtered;
    if (activeTab === "aktif")       base = base.filter(c => clientIdsWithActiveOrder.has(c.id));
    else if (activeTab === "vip")    base = base.filter(c => (clientOrderSummary.get(c.id)?.count ?? 0) >= 3);
    else if (activeTab === "baru")   base = base.filter(c => new Date(c.createdAt) >= thirtyDaysAgo);
    else if (activeTab === "tidakAktif") base = base.filter(c => !clientIdsWithActiveOrder.has(c.id));
    return base;
  }, [filtered, activeTab, clientIdsWithActiveOrder, clientOrderSummary, thirtyDaysAgo]);

  const totalDesktopPages = Math.max(1, Math.ceil(tabFiltered.length / pageSize));
  const pagedClients = useMemo(
    () => tabFiltered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [tabFiltered, currentPage, pageSize],
  );

  // Recent clients (last 5 added)
  const recentClients = useMemo(
    () => [...clients].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [clients],
  );

  // Chart data
  const chartData = useMemo(() => [
    { name: "Klien Aktif",    value: klienAktif },
    { name: "Klien Baru",     value: klienBaru.length },
    { name: "VIP",            value: klienVIP.length },
    { name: "Tidak Aktif",    value: klienTidakAktif.length - klienBaru.length < 0 ? 0 : klienTidakAktif.length - klienBaru.length },
  ], [klienAktif, klienBaru.length, klienVIP.length, klienTidakAktif.length]);

  const tabs = [
    { id: "all"        as const, label: "Semua",       count: clients.length },
    { id: "aktif"      as const, label: "Aktif",        count: klienAktif },
    { id: "vip"        as const, label: "⭐ VIP",       count: klienVIP.length },
    { id: "baru"       as const, label: "Baru",         count: klienBaru.length },
    { id: "tidakAktif" as const, label: "Tidak Aktif",  count: klienTidakAktif.length },
  ];

  const fmtCompact = (v: number) => {
    if (v >= 1_000_000_000) return `Rp${(v / 1_000_000_000).toFixed(2)}M`;
    if (v >= 1_000_000)     return `Rp${(v / 1_000_000).toFixed(2)} M`;
    if (v >= 1_000)         return `Rp${(v / 1_000).toFixed(0)}K`;
    return fmtIDR(v);
  };

  const statCards = [
    { label: "Total Klien",       value: clients.length.toLocaleString("id-ID"),  icon: <Users className="h-5 w-5 text-blue-600" />,   iconBg: "#dbeafe", trend: "18%" },
    { label: "Klien Aktif",       value: klienAktif.toLocaleString("id-ID"),       icon: <CheckCircle className="h-5 w-5 text-emerald-600" />, iconBg: "#d1fae5", trend: "16%" },
    { label: "Total Order",       value: totalOrderCount.toLocaleString("id-ID"),  icon: <ShoppingBag className="h-5 w-5 text-violet-600" />, iconBg: "#ede9fe", trend: "21%" },
    { label: "Total Belanja",     value: fmtCompact(totalBelanja),                icon: <TrendingUp className="h-5 w-5 text-pink-600" />,    iconBg: "#fce7f3", trend: "24%" },
    { label: "Rata-rata Belanja", value: fmtCompact(avgBelanja),                  icon: <Star className="h-5 w-5 text-amber-600" />,         iconBg: "#fef3c7", trend: "17%" },
  ];

  if (params.id) return <ClientDetailInner id={params.id} />;

  const sharedDialog = (
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
  );

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
           MOBILE LAYOUT (md:hidden) — Native App Style
      ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen bg-[#F2F5FB] pb-[76px] -mx-4">

        {/* ── GLOBAL APP HEADER ── */}
        <div className="bg-white px-5 pt-12 pb-3 flex items-center justify-between gap-3" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0038B8] to-[#33A6FF] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z"/></svg>
            </div>
            <div>
              <p className="text-[13px] font-black text-[#0f1c3f] leading-none tracking-tight">temantiket</p>
              <p className="text-[8px] text-slate-400 font-medium leading-none mt-0.5">mudah, cepat, amanah</p>
            </div>
          </div>
          <button onClick={() => navigate("/reports")} className="flex items-center gap-1.5 bg-[#F2F5FB] rounded-full px-3 py-1.5 active:opacity-70" style={{ WebkitTapHighlightColor: "transparent" }}>
            <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[12px] font-bold text-[#0f1c3f]">USD {mFmtUSD(totalClientRevIDR)}</span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigate("/notifications")} className="relative h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-70" style={{ WebkitTapHighlightColor: "transparent" }}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {mUnread > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">{mUnread > 9 ? "9+" : mUnread}</span>}
            </button>
            <button onClick={() => navigate("/settings")} className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0038B8] to-[#33A6FF] flex items-center justify-center shadow-sm active:opacity-80" style={{ WebkitTapHighlightColor: "transparent" }}>
              <span className="text-white text-[12px] font-extrabold">{mGetInitials(mUser?.displayName)}</span>
            </button>
          </div>
        </div>

        {/* ── PAGE HEADER ── */}
        <div className="bg-white px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-60 shrink-0" style={{ WebkitTapHighlightColor: "transparent" }}>
                <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
              <div className="min-w-0">
                <h1 className="text-[20px] font-black text-[#0f1c3f] leading-tight">Klien & Jamaah</h1>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-snug">Kelola data klien, jamaah,<br />dan riwayat perjalanan</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => { setShowSearch(s => !s); if (showSearch) setQ(""); }} className="h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>
                {showSearch ? <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} /> : <Search className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />}
              </button>
              <button onClick={() => setAddOpen(true)} className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-bold text-white shadow-md active:opacity-80" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Tambah Klien
              </button>
            </div>
          </div>

          {/* Animated search bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                <div className="relative mt-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input autoFocus type="text" value={q} onChange={(e) => { setQ(e.target.value); setMobilePage(1); }} placeholder="Cari nama, email, atau nomor paspor…" className="w-full h-11 pl-10 pr-10 rounded-2xl text-[13px] outline-none bg-[#F2F5FB] border border-transparent text-[#0f1c3f] placeholder-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all" />
                  {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center active:opacity-60"><X className="h-3 w-3 text-slate-500" /></button>}
                </div>
                {q && <p className="text-[10.5px] text-slate-400 mt-1.5 ml-1">{mobileFiltered.length} dari {clients.length} klien</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-4 pt-4 space-y-4">

          {/* ── STATS CARD (4-col single row) ── */}
          <div className="bg-white rounded-[20px] px-2 py-4" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="grid grid-cols-4 divide-x divide-slate-100">
              {([
                { label: "Total Klien",  value: clients.length, prev: lastMonthClients, icon: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, color: "#2563eb", bg: "#eff6ff", filter: "all"    as const },
                { label: "Klien Aktif", value: klienAktif,      prev: lastMonthAktif,  icon: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>, color: "#16a34a", bg: "#ecfdf5", filter: "aktif"  as const },
                { label: "Jamaah Aktif",value: jamaahAktif,     prev: lastMonthJamaah, icon: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><circle cx="19" cy="8" r="3"/></svg>, color: "#7c3aed", bg: "#f5f3ff", filter: "jamaah" as const },
                { label: "Klien Loyal", value: klienLoyal,      prev: lastMonthLoyal,  icon: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>, color: "#d97706", bg: "#fffbeb", filter: "loyal"  as const },
              ] as const).map((stat, i) => {
                const change = mGrow(stat.value, stat.prev);
                const up = change >= 0;
                return (
                  <button key={stat.label} onClick={() => { setMobileStatusFilter(mobileStatusFilter === stat.filter ? "all" : stat.filter); setMobilePage(1); }}
                    className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${i > 0 ? "px-1" : "pr-1"}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: stat.bg, color: stat.color }}>{stat.icon}</div>
                    <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none mt-0.5">{stat.value}</p>
                    <p className="text-[8px] font-semibold text-slate-400 text-center leading-tight uppercase tracking-wide px-0.5">{stat.label}</p>
                    <div className="flex items-center gap-0.5">
                      {up ? <TrendingUp className="h-2.5 w-2.5 text-emerald-500" strokeWidth={2.5} /> : <TrendingUp className="h-2.5 w-2.5 text-red-400 rotate-180" strokeWidth={2.5} />}
                      <span className={`text-[8.5px] font-bold ${up ? "text-emerald-500" : "text-red-400"}`}>{change === 0 ? "0%" : `${up ? "+" : ""}${change}%`}</span>
                    </div>
                    <span className="text-[7.5px] text-slate-300 font-medium">vs bulan lalu</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── FILTER PILLS ── */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {([
              { id: "all",    label: "Semua Status" },
              { id: "aktif",  label: "Aktif" },
              { id: "jamaah", label: "Jamaah Umrah" },
              { id: "loyal",  label: "Klien Loyal" },
            ] as const).map((f) => (
              <button key={f.id} onClick={() => { setMobileStatusFilter(f.id); setMobilePage(1); }}
                className={`shrink-0 h-9 px-4 rounded-full text-[11px] font-bold border transition-all active:scale-95 whitespace-nowrap ${mobileStatusFilter === f.id ? "text-white border-transparent shadow-md" : "bg-white text-slate-500 border-slate-200"}`}
                style={mobileStatusFilter === f.id ? { background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
              >
                {f.label}
              </button>
            ))}
            <button className="shrink-0 h-9 w-9 rounded-full bg-white border border-slate-200 flex items-center justify-center active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            </button>
          </div>

          {/* ── DAFTAR KLIEN ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-extrabold text-[#0f1c3f]">Daftar Klien</p>
              <span className="text-[12px] font-semibold text-slate-400">{mobileFiltered.length} Klien</span>
            </div>

            {isLoading ? (
              <div className="bg-white rounded-[20px] overflow-hidden divide-y divide-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                    <div className="h-11 w-11 rounded-full bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2"><div className="h-3 bg-slate-100 rounded-full w-3/4" /><div className="h-2.5 bg-slate-100 rounded-full w-1/2" /><div className="flex gap-1.5 mt-1"><div className="h-4 w-10 bg-slate-100 rounded-full" /><div className="h-4 w-16 bg-slate-100 rounded-full" /></div></div>
                    <div className="shrink-0 space-y-1.5"><div className="h-3 w-12 bg-slate-100 rounded-full" /><div className="h-3 w-3 bg-slate-100 rounded" /></div>
                  </div>
                ))}
              </div>
            ) : mobileFiltered.length === 0 ? (
              <div className="bg-white rounded-[20px] px-4 py-12 text-center flex flex-col items-center" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div className="h-14 w-14 rounded-2xl bg-[#eff6ff] flex items-center justify-center mb-3"><Users className="h-6 w-6 text-[#0066FF]" strokeWidth={1.8} /></div>
                <p className="text-[14px] font-bold text-[#0f1c3f]">Belum ada klien</p>
                <p className="text-[11px] text-slate-400 mt-1">{q ? "Coba kata kunci lain." : "Tambahkan klien pertama untuk memulai."}</p>
                {!q && <button onClick={() => setAddOpen(true)} className="mt-4 inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl text-[12px] font-bold text-white shadow-sm active:opacity-80" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}><Plus className="h-3.5 w-3.5" /> Tambah Klien</button>}
              </div>
            ) : (
              <motion.div
                className="bg-white rounded-[20px] overflow-hidden divide-y divide-slate-100"
                style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
                initial="hidden" animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } } }}
              >
                {mobilePaged.map((c) => {
                  const summary     = clientOrderSummary.get(c.id);
                  const orderCount  = summary?.count ?? 0;
                  const initials    = getInitials(c.name);
                  const gradient    = getGradient(c.name);
                  const isAktif     = clientIdsWithActiveOrder.has(c.id);
                  const isJamaah    = clientIdsWithUmrah.has(c.id);
                  const isLoyal     = orderCount > 1 || (c.referralStamps ?? 0) > 0;
                  return (
                    <motion.button
                      key={c.id}
                      variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } } }}
                      onClick={() => navigate(`/clients/${c.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 transition-colors"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {/* Avatar */}
                      <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                        <span className="text-white text-[13px] font-extrabold tracking-wide">{initials}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-extrabold text-[#0f1c3f] truncate leading-snug">{c.name}</p>
                        {c.passportNumber
                          ? <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Paspor: {c.passportNumber}</p>
                          : c.phone
                            ? <p className="text-[10px] text-slate-400 mt-0.5">{c.phone}</p>
                            : null
                        }
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          {isAktif && <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Aktif</span>}
                          {isJamaah && <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb] border border-blue-200">Jamaah Umrah</span>}
                          {isLoyal && <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Klien Loyal</span>}
                        </div>
                      </div>

                      {/* Order count + chevron */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {orderCount > 0 && <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">{orderCount} Order</span>}
                        <ChevronRight className="h-4 w-4 text-slate-300" strokeWidth={2} />
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}

            {/* Pagination */}
            {totalMobilePages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button onClick={() => setMobilePage(p => Math.max(1, p - 1))} disabled={mobilePage === 1} className="h-9 w-9 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 disabled:opacity-30 active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, totalMobilePages) }, (_, i) => {
                  let page = i + 1;
                  if (totalMobilePages > 5) {
                    if (mobilePage <= 3) page = i + 1;
                    else if (mobilePage >= totalMobilePages - 2) page = totalMobilePages - 4 + i;
                    else page = mobilePage - 2 + i;
                  }
                  return (
                    <button key={page} onClick={() => setMobilePage(page)}
                      className={`h-9 w-9 rounded-full text-[12px] font-bold transition-all ${mobilePage === page ? "text-white shadow-md" : "bg-white text-slate-500 shadow-sm"}`}
                      style={mobilePage === page ? { background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
                    >{page}</button>
                  );
                })}
                <button onClick={() => setMobilePage(p => Math.min(totalMobilePages, p + 1))} disabled={mobilePage === totalMobilePages} className="h-9 w-9 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 disabled:opacity-30 active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── AKSI CEPAT ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-extrabold text-[#0f1c3f]">Aksi Cepat</p>
              <button className="text-[11px] text-[#0066FF] font-bold active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>Lihat Semua</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Import Klien", icon: <Upload   className="h-5 w-5" style={{ color: "#2563eb" }} strokeWidth={1.8} />, iconBg: "#eff6ff", action: () => toast.info("Segera hadir") },
                { label: "Export Data",  icon: <Download className="h-5 w-5" style={{ color: "#16a34a" }} strokeWidth={1.8} />, iconBg: "#ecfdf5", action: () => toast.info("Segera hadir") },
                { label: "Grup Klien",  icon: <Users    className="h-5 w-5" style={{ color: "#7c3aed" }} strokeWidth={1.8} />, iconBg: "#f5f3ff", action: () => toast.info("Segera hadir") },
                { label: "Tag Klien",   icon: <Tag      className="h-5 w-5" style={{ color: "#d97706" }} strokeWidth={1.8} />, iconBg: "#fffbeb", action: () => toast.info("Segera hadir") },
              ].map((item) => (
                <button key={item.label} onClick={item.action} className="bg-white rounded-[16px] p-3 flex flex-col items-center gap-2 active:opacity-70 transition-opacity" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)", WebkitTapHighlightColor: "transparent" }}>
                  <div className="h-11 w-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: item.iconBg }}>{item.icon}</div>
                  <p className="text-[9px] font-bold text-[#0f1c3f] text-center leading-tight">{item.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="h-2" />
        </div>

        {/* ── FAB ── */}
        <button onClick={() => setAddOpen(true)} className="fixed bottom-20 right-4 h-14 w-14 rounded-full text-white flex items-center justify-center shadow-xl active:scale-95 transition-transform z-40" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", boxShadow: "0 8px 24px rgba(0,102,255,0.40)", WebkitTapHighlightColor: "transparent" }}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        </button>

        {/* ── BOTTOM NAV ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50" style={{ background: "white", boxShadow: "0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.08)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="grid grid-cols-5 h-[60px]">
            {([
              { label: "Home",    path: "/",         icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
              { label: "Order",   path: "/orders",   icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
              { label: "Klien",   path: "/clients",  icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={a ? 2.5 : 1.8}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
              { label: "Paket",   path: "/packages", icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
              { label: "Lainnya", path: "/settings", icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg> },
            ] as const).map(tab => {
              const isActive = tab.path === "/clients";
              return (
                <button key={tab.path} onClick={() => navigate(tab.path)}
                  className={`flex flex-col items-center justify-center gap-1 transition-colors active:opacity-60 ${isActive ? "text-[#0066FF]" : "text-slate-400"}`}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {tab.icon(isActive)}
                  <span className={`text-[9px] ${isActive ? "font-extrabold" : "font-semibold"}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════
           DESKTOP LAYOUT (hidden md:flex) — Dashboard style
      ══════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex h-full overflow-hidden">

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground leading-tight">Klien</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Kelola data klien dan pantau seluruh interaksi dalam satu tempat.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" /> Tambah Klien <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-9 px-4 rounded-xl gap-1.5" onClick={() => toast.info("Segera hadir")}>
                <Download className="h-4 w-4" /> Import Klien
              </Button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="px-6 py-4 grid grid-cols-5 gap-3 bg-white border-b border-slate-100">
            {statCards.map((stat) => (
              <div key={stat.label} className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground leading-none">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1.5 leading-none truncate">{stat.value}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: stat.iconBg }}>
                    {stat.icon}
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2.5">
                  <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-600 font-medium">{stat.trend}</span>
                  <span className="text-xs text-muted-foreground">vs bulan lalu</span>
                </div>
              </div>
            ))}
          </div>

          {/* Search + filter row */}
          <div className="px-6 py-3 flex items-center gap-2 bg-white border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setCurrentPage(1); }}
                placeholder="Cari nama, nomor WA, paspor, email..."
                className="pl-9 h-10 rounded-xl bg-slate-50 border-slate-200 text-sm"
              />
            </div>
            <select className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white text-foreground" onChange={() => {}}>
              <option>Semua Status</option>
              <option>Aktif</option>
              <option>Tidak Aktif</option>
            </select>
            <select className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white text-foreground" onChange={() => {}}>
              <option>Semua Tipe</option>
              <option>VIP</option>
              <option>Baru</option>
            </select>
            <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl gap-1.5 shrink-0">
              <Filter className="h-4 w-4" /> Filter
            </Button>
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden shrink-0">
              <button className="h-10 w-10 flex items-center justify-center bg-blue-600 text-white">
                <LayoutList className="h-4 w-4" />
              </button>
              <button className="h-10 w-10 flex items-center justify-center text-muted-foreground hover:bg-slate-50 transition-colors">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6 bg-white border-b border-slate-100">
            <div className="flex items-center">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === tab.id ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Client list */}
          <div className="flex-1 overflow-auto bg-white">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : tabFiltered.length === 0 ? (
              <EmptyState hasQuery={!!debouncedQ} onAdd={() => setAddOpen(true)} />
            ) : (
              <table className="w-full">
                <tbody>
                  {pagedClients.map((c) => {
                    const summary = clientOrderSummary.get(c.id);
                    const orderCount = summary?.count ?? 0;
                    const totalSpend = summary?.totalPrice ?? 0;
                    const isAktif = clientIdsWithActiveOrder.has(c.id);
                    const isVIP = orderCount >= 3;
                    const payStatus = summary?.bestStatus ?? "none";
                    const initials = getInitials(c.name);
                    const gradient = getGradient(c.name);
                    const waNumber = (c.phone ?? "").replace(/\D/g, "");
                    const waLink = waNumber
                      ? `https://wa.me/${waNumber.startsWith("0") ? "62" + waNumber.slice(1) : waNumber}`
                      : null;
                    const lastOrder = orders
                      .filter((o) => o.clientId === c.id)
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                    const lastOrderDate = lastOrder
                      ? new Date(lastOrder.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                      : "—";

                    return (
                      <tr
                        key={c.id}
                        className="border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer transition-colors group"
                        onClick={() => navigate(`/clients/${c.id}`)}
                      >
                        {/* Avatar + name */}
                        <td className="px-6 py-3.5 min-w-[220px]">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                              <span className="text-white text-xs font-bold">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.phone || "—"}</p>
                              {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Badges */}
                        <td className="px-3 py-3.5 min-w-[120px]">
                          <div className="flex flex-wrap gap-1">
                            {isVIP && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                ⭐ VIP
                              </span>
                            )}
                            {isAktif && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Aktif
                              </span>
                            )}
                            {payStatus === "Confirmed" && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                DP
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Total Order */}
                        <td className="px-3 py-3.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Order</p>
                          <p className="text-sm font-semibold mt-0.5">{orderCount}</p>
                        </td>

                        {/* Total Belanja */}
                        <td className="px-3 py-3.5 min-w-[140px]">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Belanja</p>
                          <p className="text-sm font-semibold mt-0.5">{totalSpend > 0 ? fmtIDR(totalSpend) : "—"}</p>
                        </td>

                        {/* Terakhir Order */}
                        <td className="px-3 py-3.5 min-w-[130px]">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Terakhir Order</p>
                          <p className="text-sm font-semibold mt-0.5">{lastOrderDate}</p>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {waLink ? (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noreferrer"
                                className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                                title="WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center">
                                <MessageCircle className="h-4 w-4" />
                              </div>
                            )}
                            <button
                              onClick={() => navigate(`/clients/${c.id}`)}
                              className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-100 transition-colors"
                              title="Dokumen"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            <button
                              className="h-8 w-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100 transition-colors"
                              title="Lainnya"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
            <p className="text-xs text-muted-foreground">
              Menampilkan {tabFiltered.length === 0 ? 0 : Math.min((currentPage - 1) * pageSize + 1, tabFiltered.length)}–{Math.min(currentPage * pageSize, tabFiltered.length)} dari {tabFiltered.length} klien
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalDesktopPages) }, (_, i) => {
                let page = i + 1;
                if (totalDesktopPages > 5) {
                  if (currentPage <= 3) page = i + 1;
                  else if (currentPage >= totalDesktopPages - 2) page = totalDesktopPages - 4 + i;
                  else page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page
                        ? "bg-blue-600 text-white"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              {totalDesktopPages > 5 && currentPage < totalDesktopPages - 2 && (
                <span className="text-slate-400 px-1 text-sm">…</span>
              )}
              {totalDesktopPages > 6 && (
                <button
                  onClick={() => setCurrentPage(totalDesktopPages)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === totalDesktopPages
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {totalDesktopPages}
                </button>
              )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalDesktopPages, p + 1))}
                disabled={currentPage === totalDesktopPages}
                className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="ml-2 h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white text-foreground"
              >
                {[6, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>{n} / halaman</option>
                ))}
              </select>
            </div>
          </div>
        </div>

      </div>

      {sharedDialog}
    </>
  );
}
