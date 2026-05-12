/**
 * StaffManagementCenter — /staff-performance
 * Owner-only operations center untuk mengelola seluruh staff internal.
 * Menggantikan halaman "Pantau Kinerja Staff" yang lama.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Users, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  Star, Award, Zap, Target, Filter, ChevronDown, ChevronUp, ExternalLink,
  BarChart3, Activity, Briefcase, CircleDot, MessageCircle, Bell, ClipboardList,
  StickyNote, Plus, X, Phone, Send, Search, UserCheck, Calendar, Flag,
  Wallet, History, Eye, ChevronRight, BadgeCheck, Sparkles, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore, type Order } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { usePresenceStore } from "@/store/presenceStore";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Period = "today" | "week" | "month" | "all";
type SortKey = "name" | "completed" | "fee" | "active" | "rate";
type FilterKey = "all" | "online" | "top" | "alert" | "idle";

interface StaffExtra {
  whatsapp_number?: string | null;
  agent_notes?: string | null;
}

interface StaffTask {
  id: string;
  agency_id: string;
  assigned_to: string;
  created_by: string;
  title: string;
  description?: string | null;
  priority: "rendah" | "normal" | "tinggi" | "urgent";
  status: "pending" | "diproses" | "menunggu_customer" | "revisi" | "selesai" | "bermasalah";
  due_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffNote {
  id: string;
  target_user_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

interface StaffMetrics {
  staff: MemberInfo;
  extra: StaffExtra;
  total: number;
  completed: number;
  active: number;
  cancelled: number;
  totalFee: number;
  feeCredited: number;
  feePending: number;
  profitContribution: number;
  completionRate: number;
  lastActive: string;
  recentOrders: Order[];
  byType: Record<string, number>;
  alerts: string[];
  badges: string[];
  stuckOrders: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  try { return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); }
  catch { return iso.slice(0, 10); }
};

const fmtRelative = (iso: string) => {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 2) return "baru saja";
    if (m < 60) return `${m} mnt lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} hari lalu`;
    return fmtDate(iso);
  } catch { return "—"; }
};

const fmtDateShort = (iso: string) => {
  try { return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(iso)); }
  catch { return iso.slice(0, 10); }
};

function periodStart(p: Period): number {
  const now = new Date();
  if (p === "today") { now.setHours(0, 0, 0, 0); return now.getTime(); }
  if (p === "week")  { now.setDate(now.getDate() - 7); return now.getTime(); }
  if (p === "month") { now.setDate(now.getDate() - 30); return now.getTime(); }
  return 0;
}

function cleanWa(num: string): string {
  const n = num.replace(/\D/g, "");
  if (n.startsWith("0")) return "62" + n.slice(1);
  if (n.startsWith("62")) return n;
  return "62" + n;
}

const TYPE_LABEL: Record<string, string> = {
  visa_student: "Visa Pelajar", visa_voa: "Visa VOA", umrah: "Umrah", flight: "Tiket",
};

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  Completed: { cls: "bg-emerald-100 text-emerald-700", label: "Selesai" },
  Paid:      { cls: "bg-sky-100 text-sky-700",         label: "Lunas" },
  Confirmed: { cls: "bg-blue-100 text-blue-700",       label: "Confirmed" },
  Pending:   { cls: "bg-amber-100 text-amber-700",     label: "Proses" },
  Draft:     { cls: "bg-slate-100 text-slate-500",     label: "Draft" },
  Cancelled: { cls: "bg-red-100 text-red-600",         label: "Batal" },
};

const TASK_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending:           { label: "Pending",         cls: "bg-slate-100 text-slate-600" },
  diproses:          { label: "Diproses",        cls: "bg-blue-100 text-blue-700" },
  menunggu_customer: { label: "Tunggu Customer", cls: "bg-amber-100 text-amber-700" },
  revisi:            { label: "Revisi",          cls: "bg-orange-100 text-orange-700" },
  selesai:           { label: "Selesai",         cls: "bg-emerald-100 text-emerald-700" },
  bermasalah:        { label: "Bermasalah",      cls: "bg-red-100 text-red-600" },
};

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
  rendah:  { label: "Rendah",  cls: "text-slate-500" },
  normal:  { label: "Normal",  cls: "text-blue-600" },
  tinggi:  { label: "Tinggi",  cls: "text-amber-600" },
  urgent:  { label: "URGENT",  cls: "text-red-600" },
};

const BADGE_DEFS: Array<{ key: string; emoji: string; label: string; check: (m: StaffMetrics) => boolean }> = [
  { key: "top_executor",    emoji: "⚡", label: "Top Executor",      check: (m) => m.completionRate >= 90 && m.completed >= 5 },
  { key: "closing_master",  emoji: "🏆", label: "Closing Master",    check: (m) => m.completed >= 10 },
  { key: "problem_solver",  emoji: "🎯", label: "Problem Solver",    check: (m) => m.active > 0 && m.stuckOrders === 0 },
  { key: "reliable",        emoji: "⭐", label: "Andalan",           check: (m) => m.completionRate >= 80 },
  { key: "airport_spec",    emoji: "✈️", label: "Airport Specialist", check: (m) => (m.byType["flight"] ?? 0) >= 5 },
  { key: "visa_spec",       emoji: "🛂", label: "Visa Specialist",   check: (m) => ((m.byType["visa_voa"] ?? 0) + (m.byType["visa_student"] ?? 0)) >= 5 },
  { key: "customer_fav",    emoji: "❤️", label: "Customer Favorite", check: (m) => m.profitContribution >= 10_000_000 },
  { key: "most_reliable",   emoji: "🌟", label: "Most Reliable",     check: (m) => m.total >= 20 && m.completionRate >= 75 },
];

// ─────────────────────────────────────────────────────────────────────────────
// BUILD METRICS
// ─────────────────────────────────────────────────────────────────────────────

function buildMetrics(staff: MemberInfo, extra: StaffExtra, orders: Order[], cutoff: number): StaffMetrics {
  const sid = staff.userId;

  const allOrders = orders.filter((o) => {
    const m = o.metadata as Record<string, unknown>;
    return m.pelaksanaId === sid || m.voaFieldAgentId === sid || m.kurirAgentId === sid;
  });

  const filtered = cutoff > 0 ? allOrders.filter((o) => new Date(o.updatedAt).getTime() >= cutoff) : allOrders;

  const completed  = filtered.filter((o) => o.status === "Completed");
  const active     = filtered.filter((o) => ["Confirmed", "Paid", "Pending"].includes(o.status));
  const cancelled  = filtered.filter((o) => o.status === "Cancelled");

  let totalFee = 0, feeCredited = 0;
  for (const o of filtered) {
    const m = o.metadata as Record<string, unknown>;
    if (m.pelaksanaId === sid) { const f = Number(m.pelaksanaFee ?? 200_000); totalFee += f; if (m.pelaksanaFeeCredited) feeCredited += f; }
    if (m.voaFieldAgentId === sid) { const f = Number(m.voaAgentFee ?? 0); totalFee += f; if (m.voaFeeCredited) feeCredited += f; }
    if (m.kurirAgentId === sid) { const f = Number(m.kurirFee ?? 0); totalFee += f; if (m.kurirFeeCredited) feeCredited += f; }
  }

  const profitContribution = completed.reduce((sum, o) => sum + Math.max(0, (o.totalPrice || 0) - (o.costPrice || 0)), 0);
  const completionRate = filtered.length > 0 ? (completed.length / filtered.length) * 100 : 0;
  const lastActive = allOrders.reduce((l, o) => o.updatedAt > l ? o.updatedAt : l, "");
  const recentOrders = [...allOrders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const byType: Record<string, number> = {};
  for (const o of filtered) byType[o.type] = (byType[o.type] ?? 0) + 1;

  const stuckOrders = active.filter((o) => Date.now() - new Date(o.updatedAt).getTime() > 7 * 24 * 3600_000).length;

  const alerts: string[] = [];
  if (stuckOrders > 0) alerts.push(`${stuckOrders} order aktif > 7 hari tanpa update`);
  if (active.length >= 8) alerts.push(`Beban tinggi: ${active.length} order aktif`);
  if (!lastActive && filtered.length === 0) alerts.push("Belum ada penugasan");
  if (lastActive) { const d = (Date.now() - new Date(lastActive).getTime()) / 86_400_000; if (d > 14) alerts.push("Tidak aktif > 14 hari"); }

  const partialMetrics = { staff, extra, total: filtered.length, completed: completed.length, active: active.length, cancelled: cancelled.length, totalFee, feeCredited, feePending: totalFee - feeCredited, profitContribution, completionRate, lastActive, recentOrders, byType, alerts, stuckOrders, badges: [] as string[] };
  const badges = BADGE_DEFS.filter((b) => b.check(partialMetrics)).map((b) => `${b.emoji} ${b.label}`);

  return { ...partialMetrics, badges };
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK MODAL
// ─────────────────────────────────────────────────────────────────────────────

function TaskModal({
  open, onClose, targetStaff, agencyId, currentUserId, onSaved,
}: {
  open: boolean; onClose: () => void; targetStaff: MemberInfo | null;
  agencyId: string; currentUserId: string; onSaved: (task: StaffTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<StaffTask["priority"]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setDesc(""); setPriority("normal"); setDueDate(""); setNotes(""); };

  async function handleSave() {
    if (!title.trim() || !targetStaff || !supabase) return;
    setSaving(true);
    try {
      const row = {
        agency_id: agencyId, assigned_to: targetStaff.userId, created_by: currentUserId,
        title: title.trim(), description: desc.trim() || null, priority,
        status: "pending" as const, due_date: dueDate || null, notes: notes.trim() || null,
      };
      const { data, error } = await supabase.from("staff_tasks").insert(row).select().single();
      if (error) throw error;
      toast.success("Tugas berhasil dibuat");
      onSaved(data as StaffTask);
      reset();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("does not exist") || msg.includes("42P01")) {
        toast.error("Tabel staff_tasks belum ada. Jalankan SQL migration terlebih dahulu.");
      } else { toast.error("Gagal membuat tugas: " + msg); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-500" />
            Buat Tugas — {targetStaff?.displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Judul Tugas *</label>
            <Input className="mt-1" placeholder="Contoh: Follow up dokumen visa customer A" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Deskripsi</label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="Detail tugas..." value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Prioritas</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as StaffTask["priority"])}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rendah">Rendah</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="tinggi">Tinggi</SelectItem>
                  <SelectItem value="urgent">🔴 URGENT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Deadline</label>
              <Input type="date" className="mt-1 h-9" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Catatan Tambahan</label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="Catatan untuk staff..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }}>Batal</Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={!title.trim() || saving}>
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Buat Tugas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER MODAL
// ─────────────────────────────────────────────────────────────────────────────

const REMINDER_PRESETS = [
  "Segera follow up customer yang menunggu",
  "Deadline dokumen hari ini — harap segera proses",
  "Mohon update progress order ke sistem",
  "Dokumen customer belum lengkap — harap koordinasi",
  "Harap respon customer dalam 1 jam",
  "Cek status visa customer yang pending",
  "Meeting briefing hari ini pukul 13.00",
  "Pastikan data order sudah diinput sebelum closing",
];

function ReminderModal({
  open, onClose, targetStaff,
}: {
  open: boolean; onClose: () => void; targetStaff: MemberInfo | null;
}) {
  const [message, setMessage] = useState("");
  const waNum = (targetStaff as unknown as { extra?: StaffExtra })?.extra?.whatsapp_number;

  function handleSend() {
    if (!message.trim()) return;
    const name = targetStaff?.displayName ?? "Staff";
    const fullMsg = `[Temantiket Reminder]\n\nHai ${name},\n\n${message.trim()}\n\n— Owner Temantiket`;
    if (waNum) {
      window.open(`https://wa.me/${cleanWa(waNum)}?text=${encodeURIComponent(fullMsg)}`, "_blank");
    } else {
      navigator.clipboard.writeText(fullMsg).then(() => toast.success("Pesan disalin ke clipboard"));
    }
    setMessage("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setMessage(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            Kirim Reminder — {targetStaff?.displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Preset Pesan</p>
            <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {REMINDER_PRESETS.map((p) => (
                <button key={p} onClick={() => setMessage(p)}
                  className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-slate-700">
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pesan Custom</label>
            <Textarea className="mt-1 resize-none" rows={3} placeholder="Tulis pesan reminder..." value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {!waNum && (
            <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
              Nomor WA tidak ditemukan — pesan akan disalin ke clipboard.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => { setMessage(""); onClose(); }}>Batal</Button>
          <Button size="sm" disabled={!message.trim()} onClick={handleSend}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {waNum ? <MessageCircle className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {waNum ? "Kirim WA" : "Salin Pesan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function NoteModal({
  open, onClose, targetStaff, agencyId, currentUserId, existingNotes, onSaved,
}: {
  open: boolean; onClose: () => void; targetStaff: MemberInfo | null;
  agencyId: string; currentUserId: string; existingNotes: StaffNote[];
  onSaved: (note: StaffNote) => void;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!content.trim() || !targetStaff || !supabase) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("staff_internal_notes")
        .insert({ agency_id: agencyId, target_user_id: targetStaff.userId, author_id: currentUserId, content: content.trim() })
        .select().single();
      if (error) throw error;
      toast.success("Catatan internal disimpan");
      onSaved(data as StaffNote);
      setContent("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("does not exist") || msg.includes("42P01")) {
        toast.error("Tabel staff_internal_notes belum ada. Jalankan SQL migration terlebih dahulu.");
      } else { toast.error("Gagal simpan catatan: " + msg); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setContent(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-purple-500" />
            Catatan Internal — {targetStaff?.displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-[11px] text-muted-foreground">Catatan ini bersifat PRIVATE — hanya terlihat oleh owner.</p>
          {existingNotes.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {existingNotes.slice(0, 5).map((n) => (
                <div key={n.id} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <p className="text-[12px] text-slate-700">{n.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmtRelative(n.created_at)}</p>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Catatan Baru</label>
            <Textarea className="mt-1 resize-none" rows={3}
              placeholder='Contoh: "Bagus handling customer VIP — cocok untuk tugas airport"'
              value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => { setContent(""); onClose(); }}>Tutup</Button>
          <Button size="sm" disabled={!content.trim() || saving} onClick={() => void handleSave()}>
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Simpan Catatan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF DETAIL SHEET (right-side drawer)
// ─────────────────────────────────────────────────────────────────────────────

type DrawerTab = "overview" | "tasks" | "aktivitas" | "fee" | "catatan";

function StaffDetailSheet({
  open, onClose, metrics, tasks, notes, clients, navigate, onUpdateTaskStatus,
}: {
  open: boolean; onClose: () => void; metrics: StaffMetrics | null;
  tasks: StaffTask[]; notes: StaffNote[]; clients: Map<string, { name: string }>;
  navigate: (to: string) => void;
  onUpdateTaskStatus: (taskId: string, status: StaffTask["status"]) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");

  if (!metrics) return null;
  const { staff, extra, badges } = metrics;
  const myTasks = tasks.filter((t) => t.assigned_to === staff.userId);
  const myNotes = notes.filter((n) => n.target_user_id === staff.userId);
  const waNum = extra.whatsapp_number;

  const TABS: Array<{ id: DrawerTab; label: string; icon: React.ReactNode }> = [
    { id: "overview",  label: "Overview",  icon: <Eye className="h-3.5 w-3.5" /> },
    { id: "tasks",     label: `Tugas (${myTasks.filter(t => t.status !== "selesai").length})`, icon: <ClipboardList className="h-3.5 w-3.5" /> },
    { id: "aktivitas", label: "Aktivitas", icon: <Activity className="h-3.5 w-3.5" /> },
    { id: "fee",       label: "Fee",       icon: <Wallet className="h-3.5 w-3.5" /> },
    { id: "catatan",   label: "Catatan",   icon: <StickyNote className="h-3.5 w-3.5" /> },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white font-bold text-[22px] shadow-md">
                {(staff.displayName || staff.email).slice(0, 1).toUpperCase()}
              </div>
              <span className={cn("absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white", metrics.lastActive && (Date.now() - new Date(metrics.lastActive).getTime()) < 3_600_000 ? "bg-emerald-500" : "bg-slate-300")} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-[16px] font-bold leading-tight">{staff.displayName || "—"}</SheetTitle>
              <p className="text-[11px] text-muted-foreground">{staff.email}</p>
              <p className="text-[11px] text-muted-foreground">Bergabung {fmtDate(staff.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {waNum && (
                <button onClick={() => window.open(`https://wa.me/${cleanWa(waNum)}`, "_blank")}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                  <Phone className="h-3 w-3" /> WA
                </button>
              )}
              <button onClick={() => { onClose(); navigate(`/staff/${staff.userId}`); }}
                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">
                <ExternalLink className="h-3 w-3" /> Kartu
              </button>
            </div>
          </div>
          {/* Badges */}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {badges.map((b) => (
                <span key={b} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 border border-amber-200">
                  {b}
                </span>
              ))}
            </div>
          )}
        </SheetHeader>

        {/* Tab bar */}
        <div className="flex border-b shrink-0 bg-white overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors",
                tab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div className="space-y-4">
                {/* KPI grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Total Penugasan", value: metrics.total, color: "text-foreground", bg: "bg-slate-50" },
                    { label: "Selesai", value: metrics.completed, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Aktif", value: metrics.active, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Dibatalkan", value: metrics.cancelled, color: "text-red-500", bg: "bg-red-50" },
                  ].map((k) => (
                    <div key={k.label} className={cn("rounded-xl p-3 border", k.bg)}>
                      <p className="text-[10px] text-muted-foreground font-medium">{k.label}</p>
                      <p className={cn("text-[22px] font-extrabold", k.color)}>{k.value}</p>
                    </div>
                  ))}
                </div>
                {/* Completion rate */}
                <div className="rounded-xl border bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-muted-foreground">Tingkat Penyelesaian</span>
                    <span className="font-bold text-emerald-600">{Math.round(metrics.completionRate)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, metrics.completionRate)}%` }} />
                  </div>
                </div>
                {/* Order by type */}
                {Object.keys(metrics.byType).length > 0 && (
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-2">Order per Tipe</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(metrics.byType).map(([type, count]) => (
                        <div key={type} className="rounded-lg bg-slate-50 border px-2.5 py-1.5 text-center">
                          <p className="text-[10px] text-muted-foreground">{TYPE_LABEL[type] ?? type}</p>
                          <p className="text-[15px] font-extrabold">{count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Alerts */}
                {metrics.alerts.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                    {metrics.alerts.map((a, i) => (
                      <p key={i} className="text-[11px] text-amber-700 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {a}
                      </p>
                    ))}
                  </div>
                )}
                {/* WA number */}
                {waNum && (
                  <div className="rounded-xl border bg-white p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground">WhatsApp</p>
                      <p className="text-[13px] font-semibold">{waNum}</p>
                    </div>
                    <button onClick={() => window.open(`https://wa.me/${cleanWa(waNum)}`, "_blank")}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" /> Chat
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── TASKS ── */}
            {tab === "tasks" && (
              <div className="space-y-2">
                {myTasks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto opacity-30 mb-2" />
                    <p className="text-[12px]">Belum ada tugas untuk staff ini.</p>
                  </div>
                )}
                {myTasks.map((t) => {
                  const sc = TASK_STATUS_CFG[t.status] ?? { label: t.status, cls: "bg-slate-100 text-slate-600" };
                  const pc = PRIORITY_CFG[t.priority] ?? { label: t.priority, cls: "text-slate-500" };
                  const isOverdue = t.due_date && new Date(t.due_date).getTime() < Date.now() && t.status !== "selesai";
                  return (
                    <div key={t.id} className={cn("rounded-xl border bg-white p-3 space-y-2", isOverdue && "border-red-200 bg-red-50/30")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold leading-snug">{t.title}</p>
                          {t.description && <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>}
                        </div>
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", sc.cls)}>{sc.label}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-[10px] font-semibold", pc.cls)}>{pc.label}</span>
                        {t.due_date && <span className={cn("text-[10px]", isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>{isOverdue ? "⚠️ " : ""}Deadline: {fmtDateShort(t.due_date)}</span>}
                        <span className="text-[10px] text-muted-foreground">{fmtRelative(t.created_at)}</span>
                      </div>
                      {t.status !== "selesai" && (
                        <div className="flex gap-1.5 flex-wrap">
                          {(["diproses", "selesai", "bermasalah"] as StaffTask["status"][]).map((s) => (
                            <button key={s} onClick={() => onUpdateTaskStatus(t.id, s)}
                              className={cn("text-[9px] font-semibold px-2 py-1 rounded-lg border transition-colors",
                                TASK_STATUS_CFG[s]?.cls, "hover:opacity-80")}>
                              {TASK_STATUS_CFG[s]?.label ?? s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── AKTIVITAS ── */}
            {tab === "aktivitas" && (
              <div className="space-y-2">
                {metrics.recentOrders.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto opacity-30 mb-2" />
                    <p className="text-[12px]">Belum ada aktivitas order.</p>
                  </div>
                )}
                {metrics.recentOrders.map((o) => {
                  const client = clients.get(o.clientId ?? "");
                  const sc = STATUS_CFG[o.status] ?? { cls: "bg-slate-100 text-slate-500", label: o.status };
                  return (
                    <button key={o.id} onClick={() => { onClose(); navigate(`/orders/detail/${o.id}`); }}
                      className="w-full text-left rounded-xl border bg-white p-3 hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold truncate">{client?.name ?? o.title ?? `Order #${o.id.slice(0, 8)}`}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{TYPE_LABEL[o.type] ?? o.type}</span>
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-semibold", sc.cls)}>{sc.label}</span>
                            <span className="text-[10px] text-muted-foreground">{fmtRelative(o.updatedAt)}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── FEE ── */}
            {tab === "fee" && (
              <div className="space-y-3">
                {[
                  { label: "Total Fee", value: metrics.totalFee, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-100" },
                  { label: "Sudah Dicairkan", value: metrics.feeCredited, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
                  { label: "Belum Dicairkan", value: metrics.feePending, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
                  { label: "Kontribusi Profit", value: metrics.profitContribution, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
                ].map((f) => (
                  <div key={f.label} className={cn("rounded-xl border p-3", f.bg, f.border)}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</p>
                    <p className={cn("text-[20px] font-extrabold font-mono mt-0.5", f.color)}>{fmtIDR(f.value)}</p>
                  </div>
                ))}
                {metrics.feePending > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[11px] text-amber-700">Fee belum cair: {fmtIDR(metrics.feePending)}. Gunakan menu "Sinkronkan Fee Lapangan" di profil agen.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── CATATAN ── */}
            {tab === "catatan" && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground bg-slate-50 border rounded-lg px-3 py-2">Catatan internal bersifat PRIVATE — hanya terlihat oleh owner.</p>
                {myNotes.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <StickyNote className="h-7 w-7 mx-auto opacity-30 mb-2" />
                    <p className="text-[12px]">Belum ada catatan internal.</p>
                  </div>
                )}
                {myNotes.map((n) => (
                  <div key={n.id} className="rounded-xl border bg-white p-3">
                    <p className="text-[12px] text-slate-700 leading-relaxed">{n.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{fmtRelative(n.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function StaffManagementCenter() {
  const navigate = useNavigate();
  const listMembers = useAuthStore((s) => s.listMembers);
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients: clientList, fetchClients } = useClientsStore();
  const isOnline = usePresenceStore((s) => s.isOnline);

  const [staffMembers, setStaffMembers] = useState<MemberInfo[]>([]);
  const [extraMap, setExtraMap] = useState<Map<string, StaffExtra>>(new Map());
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [period, setPeriod]   = useState<Period>("all");
  const [sortBy, setSortBy]   = useState<SortKey>("completed");
  const [filterBy, setFilterBy] = useState<FilterKey>("all");
  const [search, setSearch]   = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Drawer + modals
  const [drawerStaffId, setDrawerStaffId]     = useState<string | null>(null);
  const [taskTargetId, setTaskTargetId]       = useState<string | null>(null);
  const [reminderTargetId, setReminderTargetId] = useState<string | null>(null);
  const [noteTargetId, setNoteTargetId]       = useState<string | null>(null);

  const agencyId = user?.agencyId ?? "";
  const currentUserId = user?.id ?? "";

  async function loadData() {
    if (!supabase || !agencyId) return;
    try {
      const [members] = await Promise.all([listMembers(), fetchOrders(), fetchClients()]);
      const staffOnly = members.filter((m) => m.role === "staff");
      setStaffMembers(staffOnly);

      // Fetch WA numbers + notes from agency_members
      const { data: extras } = await supabase
        .from("agency_members")
        .select("user_id, whatsapp_number, agent_notes")
        .eq("agency_id", agencyId);
      if (extras) {
        setExtraMap(new Map(extras.map((e: { user_id: string; whatsapp_number?: string; agent_notes?: string }) =>
          [e.user_id, { whatsapp_number: e.whatsapp_number, agent_notes: e.agent_notes }]
        )));
      }

      // Fetch tasks (graceful fallback)
      try {
        const { data: taskData, error: taskErr } = await supabase
          .from("staff_tasks").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false });
        if (!taskErr) setTasks((taskData ?? []) as StaffTask[]);
      } catch { /* table may not exist yet */ }

      // Fetch internal notes (graceful fallback)
      try {
        const { data: noteData, error: noteErr } = await supabase
          .from("staff_internal_notes").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false });
        if (!noteErr) setNotes((noteData ?? []) as StaffNote[]);
      } catch { /* table may not exist yet */ }

    } catch (e) {
      toast.error("Gagal memuat data: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadData();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success("Data diperbarui.");
  };

  const clientMap = useMemo(() => new Map(clientList.map((c) => [c.id, c])), [clientList]);
  const cutoff = useMemo(() => periodStart(period), [period]);

  const allMetrics = useMemo(() =>
    staffMembers.map((s) => buildMetrics(s, extraMap.get(s.userId) ?? {}, orders, cutoff)),
    [staffMembers, extraMap, orders, cutoff],
  );

  // ── Summary stats ──────────────────────────────────────────────────────────
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const todayCutoff = now.getTime();
  const monthCutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.getTime(); })();

  const summary = useMemo(() => {
    const totalStaff    = allMetrics.length;
    const onlineCount   = allMetrics.filter((m) => isOnline(m.staff.userId)).length;
    const ordersToday   = orders.filter((o) => new Date(o.updatedAt).getTime() >= todayCutoff).length;
    const totalActive   = allMetrics.reduce((s, m) => s + m.active, 0);
    const totalFeeMonth = allMetrics.reduce((s, m) => {
      const sids = new Set([m.staff.userId]);
      const mOrders = orders.filter((o) => {
        const md = o.metadata as Record<string, unknown>;
        return (sids.has(md.pelaksanaId as string) || sids.has(md.voaFieldAgentId as string) || sids.has(md.kurirAgentId as string)) && new Date(o.updatedAt).getTime() >= monthCutoff;
      });
      let fee = 0;
      for (const o of mOrders) {
        const md = o.metadata as Record<string, unknown>;
        const sid = m.staff.userId;
        if (md.pelaksanaId === sid) fee += Number(md.pelaksanaFee ?? 200_000);
        if (md.voaFieldAgentId === sid) fee += Number(md.voaAgentFee ?? 0);
        if (md.kurirAgentId === sid) fee += Number(md.kurirFee ?? 0);
      }
      return s + fee;
    }, 0);
    const completionRate = allMetrics.length > 0 ? Math.round(allMetrics.reduce((s, m) => s + m.completionRate, 0) / allMetrics.length) : 0;
    const totalCompleted = allMetrics.reduce((s, m) => s + m.completed, 0);
    const pendingTasks   = tasks.filter((t) => t.status !== "selesai").length;
    const alertCount     = allMetrics.reduce((s, m) => s + m.alerts.length, 0);
    return { totalStaff, onlineCount, ordersToday, totalActive, totalFeeMonth, completionRate, totalCompleted, pendingTasks, alertCount };
  }, [allMetrics, orders, tasks, isOnline, todayCutoff, monthCutoff]);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...allMetrics];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.staff.displayName.toLowerCase().includes(q) || m.staff.email.toLowerCase().includes(q));
    }
    if (filterBy === "online")  list = list.filter((m) => isOnline(m.staff.userId));
    if (filterBy === "top")     list = list.filter((m) => m.completionRate >= 80 || m.completed >= 5);
    if (filterBy === "alert")   list = list.filter((m) => m.alerts.length > 0);
    if (filterBy === "idle")    list = list.filter((m) => !m.lastActive || (Date.now() - new Date(m.lastActive).getTime()) > 14 * 86_400_000);
    list.sort((a, b) => {
      if (sortBy === "completed") return b.completed - a.completed;
      if (sortBy === "fee")       return b.totalFee - a.totalFee;
      if (sortBy === "active")    return b.active - a.active;
      if (sortBy === "rate")      return b.completionRate - a.completionRate;
      return a.staff.displayName.localeCompare(b.staff.displayName, "id");
    });
    return list;
  }, [allMetrics, search, filterBy, sortBy, isOnline]);

  const drawerMetrics = allMetrics.find((m) => m.staff.userId === drawerStaffId) ?? null;
  const taskTarget    = staffMembers.find((s) => s.userId === taskTargetId) ?? null;
  const reminderTarget = (() => { const m = allMetrics.find((m) => m.staff.userId === reminderTargetId); return m ? { ...m.staff, extra: m.extra } : null; })();
  const noteTarget    = staffMembers.find((s) => s.userId === noteTargetId) ?? null;

  async function handleUpdateTaskStatus(taskId: string, status: StaffTask["status"]) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from("staff_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", taskId);
      if (error) throw error;
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t));
      toast.success("Status tugas diperbarui");
    } catch (e) { toast.error("Gagal update status: " + (e instanceof Error ? e.message : String(e))); }
  }

  const PERIOD_OPTS: { id: Period; label: string }[] = [
    { id: "today", label: "Hari Ini" }, { id: "week", label: "7 Hari" },
    { id: "month", label: "30 Hari" }, { id: "all", label: "Semua" },
  ];

  const FILTER_OPTS: { id: FilterKey; label: string }[] = [
    { id: "all",    label: "Semua" },   { id: "online", label: "🟢 Online" },
    { id: "top",    label: "⭐ Top" },  { id: "alert",  label: "⚠️ Alert" },
    { id: "idle",   label: "😴 Idle" },
  ];

  if (user && user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm font-semibold text-muted-foreground">Halaman ini hanya untuk owner.</p>
        <Button size="sm" onClick={() => navigate(-1)}>Kembali</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-base font-medium">Memuat Manajemen Staff…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-16 space-y-6">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-muted-foreground shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-bold flex items-center gap-3 tracking-tight leading-tight">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shrink-0">
                <Settings2 className="h-5 w-5 text-white" strokeWidth={1.8} />
              </div>
              Manajemen Staff
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staffMembers.length} staff aktif · kontrol operasional realtime
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void handleRefresh()} disabled={refreshing}
          className="h-10 gap-2 text-sm px-4 shrink-0">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── KPI SUMMARY BAR ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Total Staff",     value: summary.totalStaff,            icon: Users,         color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-100" },
          { label: "Sedang Online",   value: summary.onlineCount,           icon: UserCheck,     color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          { label: "Order Hari Ini",  value: summary.ordersToday,           icon: Briefcase,     color: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-100" },
          { label: "Order Aktif",     value: summary.totalActive,           icon: CircleDot,     color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-100" },
          { label: "Fee 30 Hari",     value: fmtIDR(summary.totalFeeMonth), icon: Wallet,        color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-100" },
          { label: "Completion Rate", value: `${summary.completionRate}%`,  icon: Target,        color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          { label: "Task Pending",    value: summary.pendingTasks,          icon: ClipboardList, color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-100" },
          { label: "Staff dgn Alert", value: summary.alertCount,            icon: AlertTriangle, color: "text-red-500",     bg: "bg-red-50",     border: "border-red-100" },
        ].map((kpi) => (
          <div key={kpi.label} className={cn("rounded-2xl border p-4 sm:p-5 flex items-center gap-4 bg-white shadow-sm", kpi.border)}>
            <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0", kpi.bg)}>
              <kpi.icon className={cn("h-6 w-6", kpi.color)} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground leading-tight">{kpi.label}</p>
              <p className="text-[22px] font-extrabold font-mono leading-tight mt-0.5">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── ALERT STRIP ─────────────────────────────────────────────────────── */}
      {summary.alertCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm font-semibold text-amber-700">
            {summary.alertCount} alert aktif — cek detail staff di bawah atau gunakan filter "Alert".
          </p>
        </motion.div>
      )}

      {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
          <Input
            className="pl-10 h-11 text-sm"
            placeholder="Cari nama atau email staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Period */}
          <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
            {PERIOD_OPTS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={cn("px-3.5 py-2 text-[13px] font-semibold transition-colors border-r border-slate-200 last:border-r-0",
                  period === p.id ? "bg-blue-500 text-white" : "text-slate-500 hover:bg-slate-50")}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_OPTS.map((f) => (
              <button key={f.id} onClick={() => setFilterBy(f.id)}
                className={cn("px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-colors border",
                  filterBy === f.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {([
              { id: "completed" as SortKey, label: "Selesai" }, { id: "rate" as SortKey, label: "Rate" },
              { id: "fee" as SortKey, label: "Fee" }, { id: "active" as SortKey, label: "Aktif" },
            ]).map((s) => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                className={cn("px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors",
                  sortBy === s.id ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── EMPTY STATE ────────────────────────────────────────────────────── */}
      {staffMembers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <Users className="h-14 w-14 opacity-25" />
          <p className="text-base font-semibold">Belum ada staff internal.</p>
          <p className="text-sm">Undang staff dari Pengaturan → Tim.</p>
          <Button variant="outline" onClick={() => navigate("/settings")} className="mt-1">
            Buka Pengaturan
          </Button>
        </div>
      )}

      {/* ── STAFF CARDS ────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        <div className="space-y-4">
          {displayed.map((m, idx) => {
            const online = isOnline(m.staff.userId);
            const isExpanded = expandedId === m.staff.userId;

            return (
              <motion.div key={m.staff.userId}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.035 }}
                className="rounded-2xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">

                {/* ── Card Header ── */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="relative shrink-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : m.staff.userId)}>
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white font-bold text-[22px] shadow-sm">
                      {(m.staff.displayName || m.staff.email).slice(0, 1).toUpperCase()}
                    </div>
                    <span className={cn("absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white",
                      online ? "bg-emerald-500" : "bg-slate-300")} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : m.staff.userId)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[15px] font-bold">{m.staff.displayName || m.staff.email}</p>
                      {online && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">
                          online
                        </span>
                      )}
                      {m.badges.slice(0, 2).map((b) => (
                        <span key={b} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold shrink-0">
                          {b}
                        </span>
                      ))}
                      {m.alerts.length > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold flex items-center gap-1 shrink-0">
                          <AlertTriangle className="h-3 w-3" /> {m.alerts.length} alert
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground mt-1 truncate">
                      {m.staff.email} · {m.lastActive ? `aktif ${fmtRelative(m.lastActive)}` : "belum aktif"}
                    </p>
                  </div>

                  {/* Stats chips — desktop */}
                  <div className="hidden sm:flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground font-medium">Selesai</p>
                      <p className="text-[22px] font-extrabold text-emerald-600 leading-tight">{m.completed}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground font-medium">Aktif</p>
                      <p className="text-[22px] font-extrabold text-blue-500 leading-tight">{m.active}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground font-medium">Rate</p>
                      <p className="text-[18px] font-extrabold leading-tight">{Math.round(m.completionRate)}%</p>
                    </div>
                    <div className="text-right min-w-[90px]">
                      <p className="text-[11px] text-muted-foreground font-medium">Total Fee</p>
                      <p className="text-[13px] font-bold text-purple-600 font-mono">{fmtIDR(m.totalFee)}</p>
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <button className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-muted-foreground shrink-0"
                    onClick={() => setExpandedId(isExpanded ? null : m.staff.userId)}>
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </button>
                </div>

                {/* ── Quick Actions ── */}
                <div className="px-5 pb-4 flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
                  <button onClick={() => { setTaskTargetId(m.staff.userId); }}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-100">
                    <ClipboardList className="h-3.5 w-3.5" /> Tugas
                    {tasks.filter(t => t.assigned_to === m.staff.userId && t.status !== "selesai").length > 0 && (
                      <span className="h-5 w-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {tasks.filter(t => t.assigned_to === m.staff.userId && t.status !== "selesai").length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setReminderTargetId(m.staff.userId)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border border-amber-100">
                    <Bell className="h-3.5 w-3.5" /> Reminder
                  </button>
                  {m.extra.whatsapp_number && (
                    <button onClick={() => window.open(`https://wa.me/${cleanWa(m.extra.whatsapp_number!)}`, "_blank")}
                      className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-100">
                      <MessageCircle className="h-3.5 w-3.5" /> WA
                    </button>
                  )}
                  <button onClick={() => navigate(`/staff/${m.staff.userId}`)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200">
                    <BadgeCheck className="h-3.5 w-3.5" /> Kartu
                  </button>
                  <button onClick={() => setNoteTargetId(m.staff.userId)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors border border-purple-100">
                    <StickyNote className="h-3.5 w-3.5" /> Catatan
                    {notes.filter(n => n.target_user_id === m.staff.userId).length > 0 && (
                      <span className="h-5 w-5 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {notes.filter(n => n.target_user_id === m.staff.userId).length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setDrawerStaffId(m.staff.userId)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-100 ml-auto">
                    <Eye className="h-3.5 w-3.5" /> Detail Lengkap
                  </button>
                </div>

                {/* ── Expanded Section ── */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                      <div className="border-t">
                        {/* KPI grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100">
                          {[
                            { label: "Total Penugasan", value: m.total,     color: "text-foreground" },
                            { label: "Selesai",         value: m.completed, color: "text-emerald-600" },
                            { label: "Aktif",           value: m.active,    color: "text-blue-600" },
                            { label: "Dibatalkan",      value: m.cancelled, color: "text-red-500" },
                          ].map((k) => (
                            <div key={k.label} className="bg-white px-5 py-4 text-center">
                              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                              <p className={cn("text-[28px] font-extrabold leading-tight mt-0.5", k.color)}>{k.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Progress + Fee */}
                        <div className="px-5 py-4 space-y-4">
                          {/* Completion rate bar */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-muted-foreground">Tingkat Penyelesaian</span>
                              <span className="font-bold text-emerald-600 text-base">{Math.round(m.completionRate)}%</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                              <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                                initial={{ width: 0 }} animate={{ width: `${Math.min(100, m.completionRate)}%` }}
                                transition={{ delay: 0.1, duration: 0.5 }} />
                            </div>
                          </div>

                          {/* Fee breakdown */}
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: "Total Fee",    val: m.totalFee,     cls: "bg-purple-50 border-purple-100 text-purple-700" },
                              { label: "Sudah Cair",   val: m.feeCredited,  cls: "bg-emerald-50 border-emerald-100 text-emerald-700" },
                              { label: "Belum Cair",   val: m.feePending,   cls: "bg-amber-50 border-amber-100 text-amber-700" },
                            ].map((f) => (
                              <div key={f.label} className={cn("rounded-xl border p-3.5", f.cls)}>
                                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{f.label}</p>
                                <p className="text-[13px] font-extrabold font-mono mt-1">{fmtIDR(f.val)}</p>
                              </div>
                            ))}
                          </div>

                          {/* Order type breakdown */}
                          {Object.keys(m.byType).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(m.byType).map(([type, count]) => (
                                <div key={type} className="rounded-xl border bg-slate-50 px-3.5 py-2 flex items-center gap-2">
                                  <span className="text-[13px] text-muted-foreground font-medium">{TYPE_LABEL[type] ?? type}</span>
                                  <span className="text-[16px] font-extrabold">{count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Recent orders */}
                        {m.recentOrders.length > 0 && (
                          <div className="px-5 pb-5 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order Terbaru</p>
                            {m.recentOrders.slice(0, 4).map((o) => {
                              const client = clientMap.get(o.clientId ?? "");
                              const sc = STATUS_CFG[o.status] ?? { cls: "bg-slate-100 text-slate-500", label: o.status };
                              return (
                                <button key={o.id} onClick={() => navigate(`/orders/detail/${o.id}`)}
                                  className="w-full text-left flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 hover:bg-sky-50 hover:border-sky-100 transition-colors group">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold truncate">
                                      {client?.name ?? o.title ?? `#${o.id.slice(0, 8)}`}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-medium">
                                        {TYPE_LABEL[o.type] ?? o.type}
                                      </span>
                                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", sc.cls)}>
                                        {sc.label}
                                      </span>
                                      <span className="text-[12px] text-muted-foreground">{fmtRelative(o.updatedAt)}</span>
                                    </div>
                                  </div>
                                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Alerts */}
                        {m.alerts.length > 0 && (
                          <div className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
                            {m.alerts.map((a, i) => (
                              <p key={i} className="text-sm text-amber-700 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" /> {a}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </AnimatePresence>

      {/* ── BADGE LEGEND ───────────────────────────────────────────────────── */}
      {staffMembers.length > 0 && (
        <div className="rounded-2xl border bg-gradient-to-br from-slate-50 to-blue-50 p-5 sm:p-6">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Badge Internal Temantiket
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BADGE_DEFS.map((b) => (
              <div key={b.key} className="rounded-xl bg-white border p-3.5">
                <p className="text-[14px] font-bold">{b.emoji} {b.label}</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{
                  b.key === "top_executor"   ? "≥90% rate & ≥5 selesai" :
                  b.key === "closing_master" ? "≥10 order selesai" :
                  b.key === "problem_solver" ? "Aktif tanpa order terbengkalai" :
                  b.key === "reliable"       ? "≥80% completion rate" :
                  b.key === "airport_spec"   ? "≥5 order tiket" :
                  b.key === "visa_spec"      ? "≥5 order visa" :
                  b.key === "customer_fav"   ? "Kontribusi profit ≥10jt" :
                  "≥20 order, ≥75% rate"
                }</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DRAWERS & MODALS ────────────────────────────────────────────────── */}
      <StaffDetailSheet
        open={!!drawerStaffId} onClose={() => setDrawerStaffId(null)}
        metrics={drawerMetrics} tasks={tasks} notes={notes}
        clients={clientMap as Map<string, { name: string }>}
        navigate={navigate} onUpdateTaskStatus={handleUpdateTaskStatus}
      />

      <TaskModal
        open={!!taskTargetId} onClose={() => setTaskTargetId(null)}
        targetStaff={staffMembers.find((s) => s.userId === taskTargetId) ?? null}
        agencyId={agencyId} currentUserId={currentUserId}
        onSaved={(task) => setTasks((prev) => [task, ...prev])}
      />

      <ReminderModal
        open={!!reminderTargetId} onClose={() => setReminderTargetId(null)}
        targetStaff={reminderTarget ? { ...reminderTarget, extra: reminderTarget.extra } as MemberInfo & { extra: StaffExtra } : null}
      />

      <NoteModal
        open={!!noteTargetId} onClose={() => setNoteTargetId(null)}
        targetStaff={staffMembers.find((s) => s.userId === noteTargetId) ?? null}
        agencyId={agencyId} currentUserId={currentUserId}
        existingNotes={notes.filter((n) => n.target_user_id === noteTargetId)}
        onSaved={(note) => setNotes((prev) => [note, ...prev])}
      />
    </div>
  );
}
