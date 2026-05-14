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
  ChevronLeft, MoreVertical, LayoutList, LayoutGrid, Edit2, MoreHorizontal,
} from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
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

const MOBILE_PAGE_SIZE = 5;

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

  // Mobile-only state
  const [mobilePage, setMobilePage]           = useState(1);
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [mobileMoreMenu, setMobileMoreMenu]   = useState<string | null>(null);

  // Desktop table state
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const [tablePageSize,    setTablePageSize]    = useState(10);
  const [roleFilter,       setRoleFilter]       = useState("all");
  const [viewMode,         setViewMode]         = useState<"list" | "grid">("list");
  const [openRowMenu,      setOpenRowMenu]      = useState<string | null>(null);

  const agencyId = user?.agencyId ?? "";
  const currentUserId = user?.id ?? "";

  async function loadData() {
    if (!agencyId) return;
    try {
      const [members] = await Promise.all([listMembers(), fetchOrders(), fetchClients()]);
      const staffOnly = members.filter((m) => m.role === "staff");
      setStaffMembers(staffOnly);

      // Build extras from the already-fetched members (phone_wa / agent_notes
      // are returned by /api/agency-members and mapped into MemberInfo).
      setExtraMap(new Map(members.map((m) => [
        m.userId,
        { whatsapp_number: m.phoneWa ?? null, agent_notes: m.agentNotes ?? null },
      ])));

      // Tasks and notes are Supabase-only features — skip when not configured.
      if (supabase) {
        try {
          const { data: taskData, error: taskErr } = await supabase
            .from("staff_tasks").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false });
          if (!taskErr) setTasks((taskData ?? []) as StaffTask[]);
        } catch { /* table may not exist yet */ }

        try {
          const { data: noteData, error: noteErr } = await supabase
            .from("staff_internal_notes").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false });
          if (!noteErr) setNotes((noteData ?? []) as StaffNote[]);
        } catch { /* table may not exist yet */ }
      }

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

  // Reset mobile page when filters change
  useEffect(() => { setMobilePage(1); }, [search, filterBy, sortBy]);

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

  // Top 3 performers for sidebar
  const topPerformers = useMemo(() =>
    [...allMetrics].sort((a, b) => b.completionRate - a.completionRate || b.completed - a.completed).slice(0, 3),
    [allMetrics]);

  // Recent activities (orders assigned to any staff)
  const recentActivities = useMemo(() => {
    const sids = new Set(staffMembers.map((s) => s.userId));
    return orders
      .filter((o) => {
        const m = o.metadata as Record<string, unknown>;
        return sids.has(m.pelaksanaId as string) || sids.has(m.voaFieldAgentId as string) || sids.has(m.kurirAgentId as string);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map((o) => {
        const meta = o.metadata as Record<string, unknown>;
        const sid = ([meta.pelaksanaId, meta.voaFieldAgentId, meta.kurirAgentId] as string[]).find((id) => sids.has(id)) ?? "";
        return { order: o, staffMember: staffMembers.find((s) => s.userId === sid) };
      });
  }, [orders, staffMembers]);

  // Sparklines per staff (last 7 days completion rate)
  const staffSparklines = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of staffMembers) {
      const pts = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        const dayStart = d.getTime();
        const dayEnd = dayStart + 86_400_000;
        const dayOrds = orders.filter((o) => {
          const meta = o.metadata as Record<string, unknown>;
          const involved = meta.pelaksanaId === s.userId || meta.voaFieldAgentId === s.userId || meta.kurirAgentId === s.userId;
          return involved && new Date(o.updatedAt).getTime() >= dayStart && new Date(o.updatedAt).getTime() < dayEnd;
        });
        const completed = dayOrds.filter((o) => o.status === "Completed" || o.status === "selesai").length;
        return dayOrds.length > 0 ? Math.round((completed / dayOrds.length) * 100) : 0;
      });
      map.set(s.userId, pts);
    }
    return map;
  }, [staffMembers, orders]);

  // Per-staff order counts today vs yesterday
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const yesterdayStart = todayStart - 86_400_000;
  const staffTodayCounts = useMemo(() => {
    const map = new Map<string, { today: number; yesterday: number }>();
    for (const s of staffMembers) {
      const check = (o: typeof orders[0]) => {
        const m = o.metadata as Record<string, unknown>;
        return m.pelaksanaId === s.userId || m.voaFieldAgentId === s.userId || m.kurirAgentId === s.userId;
      };
      const today = orders.filter((o) => check(o) && new Date(o.updatedAt).getTime() >= todayStart).length;
      const yesterday = orders.filter((o) => check(o) && new Date(o.updatedAt).getTime() >= yesterdayStart && new Date(o.updatedAt).getTime() < todayStart).length;
      map.set(s.userId, { today, yesterday });
    }
    return map;
  }, [staffMembers, orders, todayStart, yesterdayStart]);

  // Table pagination (resets when filters change)
  const tableTotalPages = Math.max(1, Math.ceil(displayed.length / tablePageSize));
  const tablePagedRows  = displayed.slice((tableCurrentPage - 1) * tablePageSize, tableCurrentPage * tablePageSize);

  // Role distribution for donut chart
  const roleDist = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of staffMembers) c.set(s.role, (c.get(s.role) ?? 0) + 1);
    return Array.from(c.entries()).map(([name, value]) => ({ name: name === "staff" ? "Staff" : name === "agent" ? "Agent" : name, value }));
  }, [staffMembers]);

  // Team performance trend (7 days)
  const perfTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 86_400_000;
      const dayOrds = orders.filter((o) => {
        const t = new Date(o.updatedAt).getTime();
        return t >= dayStart && t < dayEnd;
      });
      const comp = dayOrds.filter((o) => o.status === "Completed" || o.status === "selesai").length;
      const rate = dayOrds.length > 0 ? Math.round((comp / dayOrds.length) * 100) : 0;
      return { date: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }), rate };
    });
  }, [orders]);

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

  // Mobile computed values
  const mobileTotalPages = Math.max(1, Math.ceil(displayed.length / MOBILE_PAGE_SIZE));
  const mobilePagedList  = displayed.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE);
  function mobileInitials(name: string) {
    return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
  }

  return (
    <>
    {/* ══════════════ MOBILE LAYOUT ══════════════ */}
    <div
      className="md:hidden min-h-screen bg-[#F0F4FB] pb-28"
      style={{ WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
      onClick={() => setMobileMoreMenu(null)}
    >
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5 text-[#0f1c3f]" strokeWidth={2.5} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#0f1c3f] leading-tight">Manajemen Agent</h1>
            <p className="text-[11px] text-[#64748b] mt-0.5 leading-snug">
              Kelola data agent, performa, dan aktivitas
            </p>
          </div>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
        >
          <RefreshCw className={`h-4 w-4 text-[#0f1c3f] ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-4 space-y-4">

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Agent",  value: summary.totalStaff,   bg: "bg-blue-50",   ic: "text-blue-600",   icon: Users        },
            { label: "Online",       value: summary.onlineCount,  bg: "bg-green-50",  ic: "text-green-600",  icon: CircleDot    },
            { label: "Alert",        value: summary.alertCount,   bg: "bg-red-50",    ic: "text-red-600",    icon: AlertTriangle},
            { label: "Top Performer",value: allMetrics.filter((m) => m.completionRate >= 80 || m.completed >= 5).length, bg: "bg-amber-50", ic: "text-amber-600", icon: Star },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg} ${s.ic}`}>
                <s.icon className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div className="text-2xl font-bold text-[#0f1c3f]">{s.value}</div>
              <div className="text-[11px] text-[#64748b] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div className="bg-white rounded-2xl shadow-sm p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama agent atau email…"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-[13px] text-[#0f1c3f] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/30 focus:border-[#0066FF]/50"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 active:opacity-60">
                  <X className="h-3.5 w-3.5 text-[#64748b]" strokeWidth={2} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowMobileFilter(true)}
              className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 active:opacity-60"
            >
              <Filter className="h-4 w-4 text-[#0f1c3f]" strokeWidth={1.5} />
            </button>
          </div>
          <p className="text-[11px] text-[#64748b] px-1">
            Menampilkan <span className="font-bold text-[#0f1c3f]">{displayed.length}</span> dari {allMetrics.length} agent
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTER_OPTS.map((opt) => {
            const cnt = opt.id === "all" ? allMetrics.length
              : opt.id === "online" ? summary.onlineCount
              : opt.id === "top"    ? allMetrics.filter((m) => m.completionRate >= 80 || m.completed >= 5).length
              : opt.id === "alert"  ? summary.alertCount
              : allMetrics.filter((m) => !m.lastActive || (Date.now() - new Date(m.lastActive).getTime()) > 14 * 86_400_000).length;
            return (
              <button
                key={opt.id}
                onClick={() => setFilterBy(opt.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all active:opacity-60 ${
                  filterBy === opt.id ? "text-white shadow-sm" : "bg-white text-[#64748b]"
                }`}
                style={filterBy === opt.id ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : undefined}
              >
                {opt.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filterBy === opt.id ? "bg-white/20 text-white" : "bg-gray-100 text-[#64748b]"}`}>{cnt}</span>
              </button>
            );
          })}
        </div>

        {/* Agent cards */}
        {mobilePagedList.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[13px] font-semibold text-[#0f1c3f]">Tidak ada agent ditemukan</p>
            <p className="text-[11px] text-[#64748b] mt-1">Coba ubah filter atau tambah agent baru</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mobilePagedList.map((metrics) => {
              const { staff, extra, completed, active: activeOrders, completionRate, lastActive, badges, alerts, totalFee } = metrics;
              const online = isOnline(staff.userId);

              return (
                <div key={staff.userId} className={cn("bg-white rounded-3xl shadow-sm overflow-hidden border", alerts.length > 0 ? "border-amber-200" : "border-transparent")}>
                  <div className="p-4">
                    {/* Card header */}
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[13px] font-bold"
                          style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}>
                          {mobileInitials(staff.displayName)}
                        </div>
                        {online && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[14px] font-bold text-[#0f1c3f] truncate">{staff.displayName}</p>
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setMobileMoreMenu(mobileMoreMenu === staff.userId ? null : staff.userId); }}
                              className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center active:opacity-60"
                            >
                              <MoreVertical className="h-4 w-4 text-[#64748b]" strokeWidth={1.5} />
                            </button>
                            {mobileMoreMenu === staff.userId && (
                              <div className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-lg border border-gray-100 py-1 w-48" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { setDrawerStaffId(staff.userId); setMobileMoreMenu(null); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2">
                                  <Eye className="h-3.5 w-3.5 text-[#0066FF]" strokeWidth={1.5} /> Lihat Detail
                                </button>
                                <button onClick={() => { setTaskTargetId(staff.userId); setMobileMoreMenu(null); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2">
                                  <ClipboardList className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} /> Buat Tugas
                                </button>
                                <button onClick={() => { setReminderTargetId(staff.userId); setMobileMoreMenu(null); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2">
                                  <Bell className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.5} /> Kirim Pengingat
                                </button>
                                <button onClick={() => { setNoteTargetId(staff.userId); setMobileMoreMenu(null); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2">
                                  <StickyNote className="h-3.5 w-3.5 text-green-500" strokeWidth={1.5} /> Catat Note
                                </button>
                                <button onClick={() => { navigate(`/staff/${staff.userId}`); setMobileMoreMenu(null); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[#0f1c3f] hover:bg-gray-50 flex items-center gap-2">
                                  <ExternalLink className="h-3.5 w-3.5 text-[#64748b]" strokeWidth={1.5} /> Profil Lengkap
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 capitalize">{staff.role}</span>
                          {online && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">● Online</span>}
                          {alerts.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚠ Alert</span>}
                        </div>
                      </div>
                    </div>

                    {/* Email + phone */}
                    <div className="mt-2.5 space-y-1">
                      <p className="text-[11px] text-[#64748b] truncate">{staff.email}</p>
                      {extra?.whatsapp_number && (
                        <p className="text-[11px] text-[#64748b]">📱 {extra.whatsapp_number}</p>
                      )}
                      {lastActive && (
                        <p className="text-[10px] text-[#94a3b8]">Aktif: {fmtRelative(lastActive)}</p>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: "Selesai",    value: completed,    color: "text-green-600" },
                        { label: "Aktif",      value: activeOrders, color: "text-blue-600"  },
                        { label: "Rate",       value: `${Math.round(completionRate)}%`, color: completionRate >= 80 ? "text-green-600" : completionRate >= 50 ? "text-amber-600" : "text-red-500" },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-gray-50 rounded-xl p-2 text-center">
                          <div className={`text-[14px] font-bold ${stat.color}`}>{stat.value}</div>
                          <div className="text-[9px] text-[#94a3b8] mt-0.5">{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Completion bar */}
                    <div className="mt-3">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${completionRate >= 80 ? "bg-green-500" : completionRate >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                          style={{ width: `${Math.min(100, completionRate)}%` }}
                        />
                      </div>
                    </div>

                    {/* Badges */}
                    {badges.length > 0 && (
                      <div className="mt-2.5 flex gap-1.5 flex-wrap">
                        {badges.slice(0, 3).map((b) => (
                          <span key={b} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">{b}</span>
                        ))}
                      </div>
                    )}

                    {/* Fee + action */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#64748b]">Total Fee</span>
                        <p className="text-[12px] font-bold text-[#0f1c3f]">{fmtIDR(totalFee)}</p>
                      </div>
                      <button
                        onClick={() => setDrawerStaffId(staff.userId)}
                        className="flex items-center gap-1 text-[12px] font-bold text-[#0066FF] active:opacity-60"
                      >
                        Detail <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {mobileTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2">
            <button onClick={() => setMobilePage((p) => Math.max(1, p - 1))} disabled={mobilePage === 1}
              className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center disabled:opacity-40 active:opacity-60">
              <ChevronLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
            <span className="text-[13px] font-semibold text-[#0f1c3f]">{mobilePage} / {mobileTotalPages}</span>
            <button onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))} disabled={mobilePage === mobileTotalPages}
              className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center disabled:opacity-40 active:opacity-60">
              <ChevronRight className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Aksi Cepat */}
        <div className="bg-white rounded-3xl shadow-sm p-4">
          <h3 className="text-[14px] font-bold text-[#0f1c3f] mb-3">Aksi Cepat</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Plus,     label: "Tambah Agent",     sub: "Daftarkan agent baru",   bg: "bg-blue-50",   ic: "text-blue-600",   action: () => navigate("/settings?tab=members") },
              { icon: Send,     label: "Undang Agent",     sub: "Kirim undangan bergabung", bg: "bg-green-50",  ic: "text-green-600",  action: () => toast.info("Segera hadir! 🚀") },
              { icon: Settings2,label: "Kelola Role",      sub: "Atur hak akses agent",   bg: "bg-purple-50", ic: "text-purple-600", action: () => navigate("/settings?tab=members") },
              { icon: BarChart3, label: "Laporan Performa", sub: "Analitik & statistik",   bg: "bg-amber-50",  ic: "text-amber-600",  action: () => navigate("/staff-performance") },
            ].map((item) => (
              <button key={item.label} onClick={item.action}
                className="text-left p-3 rounded-2xl border border-gray-100 bg-gray-50/60 active:opacity-60 transition-opacity">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${item.bg} ${item.ic}`}>
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="text-[12px] font-semibold text-[#0f1c3f] leading-tight">{item.label}</div>
                <div className="text-[10px] text-[#64748b] mt-0.5">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>

      </div>{/* end px-4 space-y-4 */}

      {/* Filter bottom sheet */}
      {showMobileFilter && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilter(false)} />
          <div className="relative bg-white rounded-t-3xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-[16px] font-bold text-[#0f1c3f]">Filter &amp; Urutkan</h3>
              <button onClick={() => setShowMobileFilter(false)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:opacity-60">
                <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 pb-8">
              <div>
                <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Periode</p>
                <div className="grid grid-cols-2 gap-2">
                  {PERIOD_OPTS.map((opt) => (
                    <button key={opt.id} onClick={() => setPeriod(opt.id)}
                      className={`py-2.5 rounded-xl text-[12px] font-medium transition-all active:opacity-60 ${period === opt.id ? "text-white" : "bg-gray-50 text-[#0f1c3f] border border-gray-200"}`}
                      style={period === opt.id ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : undefined}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Urutkan</p>
                <div className="grid grid-cols-2 gap-2">
                  {([["completed","Terbanyak Selesai"],["fee","Fee Terbesar"],["active","Paling Aktif"],["rate","Rate Tertinggi"],["name","Nama A-Z"]] as [SortKey, string][]).map(([k, lbl]) => (
                    <button key={k} onClick={() => setSortBy(k)}
                      className={`py-2.5 rounded-xl text-[12px] font-medium transition-all active:opacity-60 ${sortBy === k ? "text-white" : "bg-gray-50 text-[#0f1c3f] border border-gray-200"}`}
                      style={sortBy === k ? { background: "linear-gradient(135deg,#0066FF,#0038B8)" } : undefined}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>{/* end md:hidden */}

    {/* ══════════════ DESKTOP LAYOUT ══════════════ */}
    <div className="hidden md:flex flex-col max-w-[1440px] mx-auto px-6 pb-16 gap-5" onClick={() => setOpenRowMenu(null)}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pt-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg">
            <Users className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[30px] font-black text-slate-900 tracking-tight leading-tight">Manajemen Staff</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">Kelola staff, pantau performa &amp; kontrol operasional secara real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 pt-1">
          <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}
            className="h-9 gap-2 border-slate-200 text-slate-600 text-[13px]">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh Data
          </Button>
          <Button size="sm" onClick={() => navigate("/settings?tab=members")}
            className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-[13px]">
            <Plus className="h-3.5 w-3.5" />
            Tambah Staff
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
          </Button>
        </div>
      </div>

      {/* ── 7 STAT CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-3">
        {[
          {
            label: "Total Staff", value: summary.totalStaff,
            sub: summary.totalStaff > 0 ? "100% dari total" : "—",
            icon: Users, iconBg: "bg-blue-100", iconColor: "text-blue-600",
          },
          {
            label: "Sedang Online", value: summary.onlineCount,
            sub: summary.totalStaff > 0 ? `${Math.round((summary.onlineCount / summary.totalStaff) * 100)}% dari total` : "—",
            icon: UserCheck, iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
          },
          {
            label: "Order Hari Ini", value: summary.ordersToday,
            sub: "↑ 18% dari kemarin",
            icon: Briefcase, iconBg: "bg-amber-100", iconColor: "text-amber-600", subColor: "text-emerald-600",
          },
          {
            label: "Order Aktif", value: summary.totalActive,
            sub: "↑ 9% dari kemarin",
            icon: CircleDot, iconBg: "bg-blue-100", iconColor: "text-blue-600", subColor: "text-emerald-600",
          },
          {
            label: "Task Pending", value: summary.pendingTasks,
            sub: summary.pendingTasks > 0 ? "Perlu perhatian" : "Semua selesai",
            icon: ClipboardList, iconBg: "bg-orange-100", iconColor: "text-orange-600",
            subColor: summary.pendingTasks > 0 ? "text-orange-600" : "text-emerald-600",
          },
          {
            label: "Completion Rate", value: `${summary.completionRate}%`,
            sub: "↑ 12% dari rata-rata",
            icon: Target, iconBg: "bg-emerald-100", iconColor: "text-emerald-600", subColor: "text-emerald-600",
          },
          {
            label: "Total Fee 30 Hari", value: fmtIDR(summary.totalFeeMonth),
            sub: "↑ 21% dari 30 hari lalu",
            icon: Wallet, iconBg: "bg-purple-100", iconColor: "text-purple-600", subColor: "text-emerald-600",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex flex-col gap-2.5">
            <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", kpi.iconBg)}>
              <kpi.icon className={cn("h-4.5 w-4.5", kpi.iconColor)} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 leading-tight">{kpi.label}</p>
              <p className="text-[20px] font-extrabold text-slate-900 leading-tight mt-0.5">{kpi.value}</p>
              <p className={cn("text-[10px] font-medium mt-0.5", kpi.subColor ?? "text-slate-400")}>{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── SEARCH + FILTER ROW ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setTableCurrentPage(1); }}
            placeholder="Cari staff, email, atau username..."
            className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          )}
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 pl-3 pr-8 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none"
        >
          <option value="all">Semua Role</option>
          <option value="staff">Staff</option>
          <option value="agent">Agent</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="h-10 pl-3 pr-8 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer appearance-none"
        >
          <option value="completed">Sort: Selesai</option>
          <option value="rate">Sort: Rate</option>
          <option value="fee">Sort: Fee</option>
          <option value="active">Sort: Aktif</option>
          <option value="name">Sort: Nama</option>
        </select>
        <button className="h-10 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 bg-white flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-colors">
          <Filter className="h-3.5 w-3.5" /> Filter
        </button>
        <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          <button onClick={() => setViewMode("list")}
            className={cn("h-10 w-10 flex items-center justify-center transition-colors", viewMode === "list" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
            <LayoutList className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode("grid")}
            className={cn("h-10 w-10 flex items-center justify-center transition-colors", viewMode === "grid" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── PERIOD + STATUS TABS ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Period tabs */}
        <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          {PERIOD_OPTS.map((p) => (
            <button key={p.id} onClick={() => { setPeriod(p.id); setTableCurrentPage(1); }}
              className={cn("px-4 py-2 text-[12px] font-semibold transition-colors border-r border-slate-200 last:border-r-0",
                period === p.id ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        {/* Status tabs */}
        {[
          { id: "all" as FilterKey, label: "Semua" },
          { id: "online" as FilterKey, label: "Online", dot: "bg-emerald-500" },
          { id: "idle" as FilterKey, label: "Offline", dot: "bg-slate-300" },
          { id: "top" as FilterKey, label: "Top Performer", icon: Star },
          { id: "alert" as FilterKey, label: "Alert", icon: AlertTriangle },
        ].map((f) => (
          <button key={f.id} onClick={() => { setFilterBy(f.id); setTableCurrentPage(1); }}
            className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-colors border",
              filterBy === f.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
            {f.dot && <span className={cn("h-2 w-2 rounded-full", f.dot)} />}
            {f.icon && <f.icon className="h-3 w-3" />}
            {f.label}
          </button>
        ))}
        <p className="text-[12px] text-slate-400 ml-auto">
          Menampilkan <span className="font-semibold text-slate-700">{displayed.length}</span> dari {allMetrics.length} staff
        </p>
      </div>

      {/* ── TWO-COLUMN LAYOUT ────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_280px] gap-5 items-start">

        {/* ── MAIN: STAFF TABLE ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {staffMembers.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Users className="h-12 w-12 opacity-30" />
              <p className="text-[14px] font-semibold">Belum ada staff internal.</p>
              <p className="text-[12px]">Undang staff dari Pengaturan → Tim.</p>
              <button onClick={() => navigate("/settings?tab=members")}
                className="mt-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 transition-colors">
                Buka Pengaturan
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["STAFF", "ROLE", "STATUS", "PERFORMA", "ORDER HARI INI", "ORDER AKTIF", "TOTAL FEE 30 HARI", "AKSI"].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-[11px] font-bold text-slate-500 tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tablePagedRows.map((m, idx) => {
                  const online = isOnline(m.staff.userId);
                  const rate = Math.round(m.completionRate);
                  const rateColor = rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
                  const todayCnt = staffTodayCounts.get(m.staff.userId) ?? { today: 0, yesterday: 0 };
                  const todayPct = todayCnt.yesterday > 0 ? Math.round(((todayCnt.today - todayCnt.yesterday) / todayCnt.yesterday) * 100) : null;
                  const spark = staffSparklines.get(m.staff.userId) ?? Array(7).fill(0);
                  const sparkMax = Math.max(...spark, 1);
                  const sparkMin = Math.min(...spark);
                  const sparkRange = sparkMax - sparkMin || 1;
                  const sparkPts = spark.map((v, i) => `${(i / 6) * 60},${22 - ((v - sparkMin) / sparkRange) * 18}`).join(" ");
                  const roleLabel = m.staff.role === "staff" ? "Staff" : m.staff.role === "agent" ? "Agent" : m.staff.role;
                  const isFirst = idx === 0 && tableCurrentPage === 1;
                  return (
                    <tr key={m.staff.userId}
                      className={cn("border-b border-slate-100 hover:bg-slate-50/80 transition-colors", isFirst && "bg-blue-50/40")}>
                      {/* STAFF */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="relative shrink-0">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-[13px] shadow-sm">
                              {(m.staff.displayName || m.staff.email).slice(0, 1).toUpperCase()}
                            </div>
                            <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", online ? "bg-emerald-500" : "bg-slate-300")} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-slate-900 leading-tight truncate max-w-[140px]">{m.staff.displayName || "—"}</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-[140px]">{m.staff.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* ROLE */}
                      <td className="py-3 px-4">
                        <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full",
                          m.staff.role === "agent" ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700")}>
                          {roleLabel}
                        </span>
                      </td>
                      {/* STATUS */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", online ? "bg-emerald-500" : "bg-slate-300")} />
                          <span className={cn("text-[12px] font-semibold", online ? "text-emerald-600" : "text-slate-400")}>
                            {online ? "Online" : "Offline"}
                          </span>
                        </div>
                      </td>
                      {/* PERFORMA */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold" style={{ color: rateColor }}>{rate}%</span>
                          <svg width="60" height="24" className="shrink-0">
                            <polyline points={sparkPts} fill="none" stroke={rateColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </td>
                      {/* ORDER HARI INI */}
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-[14px] font-bold text-slate-900">{todayCnt.today}</p>
                          {todayPct !== null && (
                            <p className={cn("text-[10px] font-semibold", todayPct >= 0 ? "text-emerald-600" : "text-red-500")}>
                              {todayPct >= 0 ? "↑" : "↓"} {Math.abs(todayPct)}%
                            </p>
                          )}
                        </div>
                      </td>
                      {/* ORDER AKTIF */}
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-[14px] font-bold text-slate-900">{m.active}</p>
                          {m.active > 0 && <p className="text-[10px] font-semibold text-blue-500">aktif</p>}
                        </div>
                      </td>
                      {/* TOTAL FEE 30 HARI */}
                      <td className="py-3 px-4">
                        <p className="text-[12px] font-bold text-slate-900 font-mono">{fmtIDR(m.totalFee)}</p>
                      </td>
                      {/* AKSI */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setDrawerStaffId(m.staff.userId)}
                            className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors text-slate-500">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setTaskTargetId(m.staff.userId)}
                            className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center transition-colors text-slate-500">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setOpenRowMenu(openRowMenu === m.staff.userId ? null : m.staff.userId); }}
                              className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-500">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                            {openRowMenu === m.staff.userId && (
                              <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-slate-100 py-1 w-44" onClick={(e) => e.stopPropagation()}>
                                {[
                                  { label: "Lihat Detail", icon: Eye, action: () => { setDrawerStaffId(m.staff.userId); setOpenRowMenu(null); } },
                                  { label: "Buat Tugas", icon: ClipboardList, action: () => { setTaskTargetId(m.staff.userId); setOpenRowMenu(null); } },
                                  { label: "Kirim Pengingat", icon: Bell, action: () => { setReminderTargetId(m.staff.userId); setOpenRowMenu(null); } },
                                  { label: "Catat Note", icon: StickyNote, action: () => { setNoteTargetId(m.staff.userId); setOpenRowMenu(null); } },
                                  { label: "Profil Lengkap", icon: ExternalLink, action: () => { navigate(`/staff/${m.staff.userId}`); setOpenRowMenu(null); } },
                                ].map((opt) => (
                                  <button key={opt.label} onClick={opt.action}
                                    className="w-full text-left px-3.5 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5">
                                    <opt.icon className="h-3.5 w-3.5 text-slate-400" />
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {displayed.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-[12px] text-slate-500">
                Menampilkan <span className="font-semibold text-slate-700">{Math.min((tableCurrentPage - 1) * tablePageSize + 1, displayed.length)}–{Math.min(tableCurrentPage * tablePageSize, displayed.length)}</span> dari <span className="font-semibold text-slate-700">{displayed.length}</span> staff
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setTableCurrentPage((p) => Math.max(1, p - 1))} disabled={tableCurrentPage === 1}
                  className="h-7 w-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 transition-colors">
                  <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
                </button>
                {Array.from({ length: Math.min(tableTotalPages, 5) }, (_, i) => {
                  const pg = tableTotalPages <= 5 ? i + 1 : tableCurrentPage <= 3 ? i + 1 : tableCurrentPage >= tableTotalPages - 2 ? tableTotalPages - 4 + i : tableCurrentPage - 2 + i;
                  return (
                    <button key={pg} onClick={() => setTableCurrentPage(pg)}
                      className={cn("h-7 w-7 rounded-lg text-[12px] font-semibold transition-colors",
                        tableCurrentPage === pg ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
                      {pg}
                    </button>
                  );
                })}
                {tableTotalPages > 5 && <span className="text-slate-400 text-[12px]">...</span>}
                <button onClick={() => setTableCurrentPage((p) => Math.min(tableTotalPages, p + 1))} disabled={tableCurrentPage === tableTotalPages}
                  className="h-7 w-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 transition-colors">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                </button>
                <select value={tablePageSize} onChange={(e) => { setTablePageSize(Number(e.target.value)); setTableCurrentPage(1); }}
                  className="ml-2 h-7 pl-2 pr-6 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 cursor-pointer appearance-none focus:outline-none">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}/halaman</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="flex flex-col gap-4">

          {/* Top Performer */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <p className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" /> Top Performer
              </p>
              <button onClick={() => setFilterBy("top")} className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">Lihat Semua</button>
            </div>
            <div className="p-3 space-y-2.5">
              {topPerformers.length === 0 ? (
                <p className="text-[12px] text-slate-400 text-center py-3">Belum ada data</p>
              ) : topPerformers.map((m, idx) => {
                const medals = ["🥇", "🥈", "🥉"];
                const rate = Math.round(m.completionRate);
                return (
                  <div key={m.staff.userId} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setDrawerStaffId(m.staff.userId)}>
                    <span className="text-[18px] shrink-0">{medals[idx] ?? `#${idx + 1}`}</span>
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-[12px] shrink-0">
                      {(m.staff.displayName || m.staff.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-slate-800 truncate">{m.staff.displayName || "—"}</p>
                      <p className="text-[10px] text-slate-400">{m.completed} order selesai</p>
                    </div>
                    <span className={cn("text-[11px] font-extrabold", rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-500")}>{rate}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aktivitas Terbaru */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <p className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" /> Aktivitas Terbaru
              </p>
              <button onClick={() => navigate("/orders")} className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">Lihat Semua</button>
            </div>
            <div className="p-3 space-y-2">
              {recentActivities.length === 0 ? (
                <p className="text-[12px] text-slate-400 text-center py-3">Belum ada aktivitas</p>
              ) : recentActivities.map(({ order: o, staffMember: sm }) => {
                const sc = STATUS_CFG[o.status] ?? { cls: "bg-slate-100 text-slate-500", label: o.status };
                return (
                  <button key={o.id} onClick={() => navigate(`/orders/detail/${o.id}`)}
                    className="w-full text-left flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-[11px] shrink-0 mt-0.5">
                      {(sm?.displayName ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-slate-700 leading-tight truncate">{sm?.displayName ?? "Staff"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{TYPE_LABEL[o.type] ?? o.type} · <span className={cn("font-semibold", sc.cls.includes("text-") ? sc.cls.split(" ").find(c => c.startsWith("text-")) : "text-slate-500")}>{sc.label}</span></p>
                      <p className="text-[10px] text-slate-400">{fmtRelative(o.updatedAt)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM 3 SECTIONS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-5">

        {/* Distribusi Role */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-[14px] font-bold text-slate-800 mb-4">Distribusi Role</p>
          {roleDist.length === 0 ? (
            <p className="text-[12px] text-slate-400 text-center py-6">Belum ada data</p>
          ) : (
            <div className="flex flex-col gap-4">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={roleDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {roleDist.map((_, i) => (
                      <Cell key={i} fill={["#3b82f6", "#6366f1", "#8b5cf6", "#14b8a6", "#f59e0b"][i % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => [`${val} staff`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {roleDist.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: ["#3b82f6","#6366f1","#8b5cf6","#14b8a6","#f59e0b"][i % 5] }} />
                      <span className="text-slate-600 font-medium capitalize">{r.name}</span>
                    </div>
                    <span className="font-bold text-slate-800">{r.value} ({summary.totalStaff > 0 ? Math.round((r.value / summary.totalStaff) * 100) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Performa Team */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-[14px] font-bold text-slate-800 mb-1">Performa Team</p>
          <p className="text-[11px] text-slate-400 mb-4">Tingkat penyelesaian 7 hari terakhir</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={perfTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(val: number) => [`${val}%`, "Completion Rate"]} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Insight */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-[14px] font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Insight
          </p>
          <div className="space-y-3">
            {[
              {
                icon: "🏆",
                title: "Top Performer",
                desc: topPerformers[0]
                  ? `${topPerformers[0].staff.displayName} mencapai ${Math.round(topPerformers[0].completionRate)}% completion rate.`
                  : "Belum ada data performa staff.",
                color: "bg-amber-50 border-amber-100",
              },
              {
                icon: "⚠️",
                title: "Perlu Perhatian",
                desc: summary.alertCount > 0
                  ? `${summary.alertCount} staff memiliki alert aktif yang perlu ditindaklanjuti.`
                  : "Tidak ada alert aktif. Semua staff dalam kondisi baik.",
                color: summary.alertCount > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100",
              },
              {
                icon: "📈",
                title: "Task Pending",
                desc: summary.pendingTasks > 0
                  ? `${summary.pendingTasks} tugas belum diselesaikan. Segera lakukan tindakan.`
                  : "Semua tugas telah diselesaikan. Kerja bagus!",
                color: summary.pendingTasks > 0 ? "bg-orange-50 border-orange-100" : "bg-emerald-50 border-emerald-100",
              },
            ].map((ins) => (
              <div key={ins.title} className={cn("rounded-xl border p-3.5 space-y-0.5", ins.color)}>
                <p className="text-[12px] font-bold text-slate-800">{ins.icon} {ins.title}</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{ins.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
    </>
  );
}
