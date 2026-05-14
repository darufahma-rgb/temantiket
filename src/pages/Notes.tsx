import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAIContextStore } from "@/store/aiContextStore";
import { useAuthStore } from "@/store/authStore";
import {
  Plus, Trash2, Edit3, Check, X, Sparkles, StickyNote, Copy, ClipboardCheck,
  Pin, PinOff, Search, Hash, AlignLeft,
  Briefcase, MessageCircle, Megaphone, Zap, ClipboardList, Feather, Send,
  List, CheckSquare, HelpCircle, LayoutGrid, Bell, AlignJustify, Plane,
  FileText, Eye, Code, RotateCcw,
  ArrowLeft, SlidersHorizontal, ChevronRight,
  Users, Lightbulb, MoreVertical, History,
  Star, Archive, ChevronDown, LayoutList, User,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useT } from "@/lib/regional";
import { isSupabaseConfigured } from "@/lib/supabase";
import { pullNotes, upsertNote, deleteNoteCloud, syncNotesFull, type NoteCloud } from "@/lib/cloudSync";
import { cleanAndStructureNote, isWAMode } from "@/lib/ai/openrouter";
import { AIModelToggle } from "@/components/AIModelToggle";
import { MarkdownContent } from "@/components/MarkdownContent";

const STORAGE_KEY = "travelhub.notes.v2";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  color: string;
  pinned?: boolean;
  tags?: string[];
  category?: string;
}

type SortMode = "newest" | "oldest" | "az";
type ViewMode = "grid" | "list";

// ── Note categories ────────────────────────────────────────────────────────────
const NOTE_CATEGORIES = [
  {
    key: "penting",
    label: "Penting",
    icon: Star,
    iconBg: "#fef3c7",
    iconColor: "#d97706",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    tabEmoji: "⭐",
  },
  {
    key: "ide",
    label: "Ide",
    icon: Lightbulb,
    iconBg: "#fefce8",
    iconColor: "#ca8a04",
    badgeBg: "bg-yellow-100",
    badgeText: "text-yellow-700",
    tabEmoji: "💡",
  },
  {
    key: "meeting",
    label: "Meeting",
    icon: Users,
    iconBg: "#d1fae5",
    iconColor: "#059669",
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
    tabEmoji: "👥",
  },
  {
    key: "follow-up",
    label: "Follow Up",
    icon: ClipboardList,
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    tabEmoji: "📋",
  },
  {
    key: "dokumentasi",
    label: "Dokumentasi",
    icon: FileText,
    iconBg: "#ffedd5",
    iconColor: "#ea580c",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    tabEmoji: "📄",
  },
  {
    key: "arsip",
    label: "Arsip",
    icon: Archive,
    iconBg: "#f1f5f9",
    iconColor: "#64748b",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-500",
    tabEmoji: "🗃️",
  },
] as const;

function getCatConfig(key?: string) {
  return (
    NOTE_CATEGORIES.find((c) => c.key === key) ?? {
      key: "general",
      label: "Umum",
      icon: StickyNote,
      iconBg: "#f1f5f9",
      iconColor: "#94a3b8",
      badgeBg: "bg-slate-100",
      badgeText: "text-slate-500",
      tabEmoji: "📝",
    }
  );
}

const NOTE_COLORS = [
  { label: "Putih", value: "bg-white border-slate-200", dot: "bg-slate-300" },
  { label: "Biru", value: "bg-sky-50 border-sky-200", dot: "bg-sky-400" },
  { label: "Biru Tua", value: "bg-blue-50 border-blue-200", dot: "bg-blue-400" },
  { label: "Hijau", value: "bg-green-50 border-green-200", dot: "bg-green-400" },
  { label: "Ungu", value: "bg-purple-50 border-purple-200", dot: "bg-purple-400" },
  { label: "Kuning", value: "bg-yellow-50 border-yellow-200", dot: "bg-yellow-400" },
];

interface RapihkanOption { id: string; label: string; icon: LucideIcon; desc: string }

const TONES: RapihkanOption[] = [
  { id: "profesional", label: "Profesional Formal",    icon: Briefcase,    desc: "Formal & resmi" },
  { id: "friendly",    label: "Friendly WhatsApp",     icon: MessageCircle,desc: "Santai & akrab" },
  { id: "persuasif",   label: "Persuasif Marketing",   icon: Megaphone,    desc: "CTA & benefit" },
  { id: "padat",       label: "Singkat & Padat",       icon: Zap,          desc: "Esensial saja" },
  { id: "admin",       label: "Admin Operasional",     icon: ClipboardList,desc: "Actionable & clear" },
  { id: "elegant",     label: "Elegant Clean Notes",   icon: Feather,      desc: "Minimalis Notion-style" },
  { id: "broadcast",   label: "Broadcast Telegram/WA", icon: Send,         desc: "Header + CTA" },
];

const FORMATS: RapihkanOption[] = [
  { id: "bullet",       label: "Bullet List",          icon: List,         desc: "Daftar poin" },
  { id: "checklist",    label: "Checklist",            icon: CheckSquare,  desc: "- [ ] item" },
  { id: "numbered",     label: "Numbered Steps",       icon: Hash,         desc: "1. 2. 3." },
  { id: "faq",          label: "FAQ Format",           icon: HelpCircle,   desc: "Q & A" },
  { id: "card",         label: "Card Sections",        icon: LayoutGrid,   desc: "Section + ---" },
  { id: "announcement", label: "Announcement Style",   icon: Bell,         desc: "📢 Header + body" },
  { id: "paragraph",    label: "Simple Paragraph",     icon: AlignLeft,    desc: "Narasi mengalir" },
  { id: "compact",      label: "Compact Notes",        icon: AlignJustify, desc: "label: nilai" },
  { id: "travel",       label: "Travel/Visa Template", icon: Plane,        desc: "Syarat, biaya, kirim" },
  { id: "client",       label: "Client Instruction",   icon: FileText,     desc: "Panduan klien" },
];

// ── Helper functions ───────────────────────────────────────────────────────────
function markdownToPlainText(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      line = line.replace(/^#{1,6}\s+/, "");
      line = line.replace(/^>\s?/, "");
      if (/^[-*_]{3,}\s*$/.test(line)) return "";
      line = line.replace(/^(\s*)[-*+]\s+/, "$1• ");
      line = line.replace(/\*{3}(.+?)\*{3}/g, "$1");
      line = line.replace(/\*{2}(.+?)\*{2}/g, "$1");
      line = line.replace(/\*(.+?)\*/g, "$1");
      line = line.replace(/_{2}(.+?)_{2}/g, "$1");
      line = line.replace(/_(.+?)_/g, "$1");
      line = line.replace(/~~(.+?)~~/g, "$1");
      line = line.replace(/`(.+?)`/g, "$1");
      line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const oldRaw = localStorage.getItem("travelhub.notes.v1");
    if (oldRaw) {
      const old = JSON.parse(oldRaw) as Note[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
      return old;
    }
    return [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function genId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

// ── Desktop Note Card (grid) ──────────────────────────────────────────────────
interface NoteCardProps {
  note: Note;
  viewMode: ViewMode;
  authorName: string;
  onView: (n: Note) => void;
  onEdit: (n: Note) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onCopy: (n: Note) => void;
  onCopyPlain: (n: Note) => void;
  onRapihkan: (id: string, content: string) => void;
  formatting: string | null;
}

function NoteCard({ note, viewMode, authorName, onView, onEdit, onDelete, onPin, onCopy, onCopyPlain, onRapihkan, formatting }: NoteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cat = getCatConfig(note.category);
  const CatIcon = cat.icon;
  const preview = markdownToPlainText(note.content);

  const formatDateShort = (ts: number) =>
    new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(ts));

  const Menu = () => (
    menuOpen ? (
      <>
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
        <div className="absolute right-0 top-9 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[165px]">
          <button onClick={() => { onEdit(note); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50"><Edit3 className="h-4 w-4 text-sky-500" /> Edit</button>
          <button onClick={() => { onCopy(note); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50"><Copy className="h-4 w-4 text-slate-400" /> Salin</button>
          <button onClick={() => { onCopyPlain(note); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50"><ClipboardCheck className="h-4 w-4 text-green-500" /> Salin Teks Biasa</button>
          {note.content.trim() && (
            <button onClick={() => { onRapihkan(note.id, note.content); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50">
              <Sparkles className={cn("h-4 w-4 text-sky-400", formatting === note.id && "animate-pulse")} /> Rapihkan AI
            </button>
          )}
          <button onClick={() => { onPin(note.id); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50">
            {note.pinned ? <PinOff className="h-4 w-4 text-amber-400" /> : <Pin className="h-4 w-4 text-amber-400" />}
            {note.pinned ? "Lepas Pin" : "Pin"}
          </button>
          <div className="mx-3 border-t border-slate-100 my-1" />
          <button onClick={() => { onDelete(note.id); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Hapus</button>
        </div>
      </>
    ) : null
  );

  if (viewMode === "list") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all flex items-center gap-4 cursor-pointer"
        onClick={() => onView(note)}
      >
        <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cat.iconBg }}>
          <CatIcon className="h-5 w-5" style={{ color: cat.iconColor }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[14px] font-bold text-slate-900 truncate">{note.title}</h3>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", cat.badgeBg, cat.badgeText)}>{cat.label}</span>
            {note.pinned && <Pin className="h-3 w-3 text-amber-400 fill-amber-400 rotate-45 shrink-0" />}
          </div>
          {preview && <p className="text-[12px] text-slate-500 truncate">{preview}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[11px] text-slate-400">{formatDateShort(note.updatedAt)}</p>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <User className="h-3 w-3 text-slate-400" strokeWidth={1.8} />
              <span className="text-[11px] text-slate-500">{authorName}</span>
            </div>
          </div>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMenuOpen((s) => !s)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <MoreVertical className="h-4 w-4" />
            </button>
            <Menu />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group relative flex flex-col"
      onClick={() => onView(note)}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cat.iconBg }}>
            <CatIcon style={{ color: cat.iconColor, width: 18, height: 18 }} strokeWidth={1.8} />
          </div>
          <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full", cat.badgeBg, cat.badgeText)}>
            {cat.label}
          </span>
          {note.pinned && <Pin className="h-3.5 w-3.5 text-amber-400 fill-amber-400 rotate-45" />}
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((s) => !s)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          <Menu />
        </div>
      </div>
      {/* Title */}
      <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-2 line-clamp-2">{note.title}</h3>
      {/* Preview */}
      {preview && <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-3 mb-3 flex-1">{preview}</p>}
      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
        <span className="text-[11px] text-slate-400">{formatDateShort(note.updatedAt)}</span>
        <div className="flex items-center gap-1">
          <User className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />
          <span className="text-[11px] text-slate-500 font-medium">{authorName}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Notes() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const authorName = (user as unknown as { name?: string })?.name ?? user?.email?.split("@")[0] ?? "Anda";

  // ── Core state ──
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // ── Filter state ──
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null); // mobile tags

  // ── Form (Add / Edit) state ──
  const [formOpen, setFormOpen] = useState(false);
  const [formNote, setFormNote] = useState<Note | null>(null); // null = add, Note = edit
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState<string>("general");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formTagInput, setFormTagInput] = useState("");

  // ── Expand / view state ──
  const [expandedNote, setExpandedNote] = useState<Note | null>(null);

  // ── AI Rapihkan state ──
  const [formatting, setFormatting] = useState<string | null>(null);
  const [rapihkanConfig, setRapihkanConfig] = useState<{ id: string; content: string } | null>(null);
  const [rapihkanTone, setRapihkanTone]   = useState<string>(() => localStorage.getItem("rapihkan.tone")   ?? "profesional");
  const [rapihkanFormat, setRapihkanFormat] = useState<string>(() => localStorage.getItem("rapihkan.format") ?? "bullet");
  const [rapihkanPreview, setRapihkanPreview] = useState<{ id: string; original: string; formatted: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<"rendered" | "raw">("rendered");

  // ── Mobile-only state ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mobileMoreMenu, setMobileMoreMenu] = useState<string | null>(null);
  const [mobileNewTitle, setMobileNewTitle] = useState("");
  const [mobileNewContent, setMobileNewContent] = useState("");
  const [mobileNewTags, setMobileNewTags] = useState<string[]>([]);
  const [mobileTagInput, setMobileTagInput] = useState("");
  const [mobileNewCategory, setMobileNewCategory] = useState("general");

  const formTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pulledRef = useRef(!isSupabaseConfigured());

  // ── AITEM context ──
  const { setPageContext, setActiveItem, setOnApplyEdit, setPageData, clearContext } = useAIContextStore();

  useEffect(() => {
    setPageContext({ pageId: "notes", pageTitle: "Catatan Operasional" });
    return () => clearContext();
  }, [setPageContext, clearContext]);

  useEffect(() => {
    if (expandedNote) {
      setActiveItem({ id: expandedNote.id, title: expandedNote.title, content: expandedNote.content, type: "note" });
      setOnApplyEdit((newContent: string) => {
        const updatedAt = Date.now();
        const updated: Note = { ...expandedNote, content: newContent, updatedAt };
        setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
        setExpandedNote(updated);
        void upsertNote(updated as NoteCloud).catch(() => undefined);
        toast.success("Catatan diperbarui oleh AITEM ✅");
      });
    } else {
      setActiveItem(null);
      setOnApplyEdit(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedNote?.id, expandedNote?.content]);

  const updateAIPageData = useCallback(() => {
    const all = notes.slice(0, 15).map((n) => ({
      id: n.id, title: n.title, tags: n.tags ?? [],
      preview: n.content.slice(0, 80), pinned: n.pinned ?? false,
    }));
    setPageData({ totalNotes: notes.length, notes: all });
  }, [notes, setPageData]);

  useEffect(() => { updateAIPageData(); }, [updateAIPageData]);

  useEffect(() => { saveNotes(notes); }, [notes]);

  // ── Cloud sync ──
  useEffect(() => {
    if (!isSupabaseConfigured()) { pulledRef.current = true; return; }
    let cancelled = false;
    void pullNotes().then((cloud) => {
      if (cancelled) return;
      pulledRef.current = true;
      if (!cloud || cloud.length === 0) {
        const localNotes = loadNotes();
        if (localNotes.length > 0) void syncNotesFull(localNotes as NoteCloud[]).catch(() => undefined);
        return;
      }
      setNotes((localNotes) => {
        const localById = new Map(localNotes.map((n) => [n.id, n]));
        const cloudById = new Map((cloud as Note[]).map((n) => [n.id, n]));
        const allIds = new Set([...localById.keys(), ...cloudById.keys()]);
        const merged: Note[] = [];
        for (const id of allIds) {
          const local = localById.get(id);
          const remote = cloudById.get(id);
          if (!local) { merged.push(remote!); continue; }
          if (!remote) { merged.push(local); continue; }
          merged.push(remote.updatedAt > local.updatedAt ? remote : local);
        }
        saveNotes(merged);
        return merged;
      });
    }).catch(() => { pulledRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  // ── Computed ──
  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => (n.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  const countByCategory = useMemo(() => {
    const c: Record<string, number> = {};
    notes.forEach((n) => {
      const key = n.category ?? "general";
      c[key] = (c[key] ?? 0) + 1;
    });
    return c;
  }, [notes]);

  const filtered = useMemo(() => {
    let result = notes.filter((n) => {
      const matchSearch =
        search === "" ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        (n.tags ?? []).some((tg) => tg.toLowerCase().includes(search.toLowerCase()));
      const matchCat = filterCategory === null || (n.category ?? "general") === filterCategory;
      return matchSearch && matchCat;
    });
    result = [...result].sort((a, b) => {
      if (sortMode === "newest") return b.updatedAt - a.updatedAt;
      if (sortMode === "oldest") return a.updatedAt - b.updatedAt;
      return a.title.localeCompare(b.title, "id");
    });
    return [...result.filter((n) => n.pinned), ...result.filter((n) => !n.pinned)];
  }, [notes, search, sortMode, filterCategory]);

  const mobileFiltered = useMemo(() => {
    let result = notes.filter((n) => {
      const matchSearch =
        search === "" ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase());
      const matchTag = filterTag === null || (n.tags ?? []).includes(filterTag);
      return matchSearch && matchTag;
    });
    result = [...result].sort((a, b) => {
      if (sortMode === "newest") return b.updatedAt - a.updatedAt;
      if (sortMode === "oldest") return a.updatedAt - b.updatedAt;
      return a.title.localeCompare(b.title, "id");
    });
    return [...result.filter((n) => n.pinned), ...result.filter((n) => !n.pinned)];
  }, [notes, search, sortMode, filterTag]);

  // ── Business logic ──
  const openAdd = () => {
    setFormNote(null);
    setFormTitle("");
    setFormContent("");
    setFormCategory("general");
    setFormTags([]);
    setFormTagInput("");
    setFormOpen(true);
  };

  const openEdit = (note: Note) => {
    setFormNote(note);
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormCategory(note.category ?? "general");
    setFormTags(note.tags ?? []);
    setFormTagInput("");
    setFormOpen(true);
  };

  const handleSaveForm = () => {
    if (!formTitle.trim() && !formContent.trim()) {
      toast.error("Tulis judul atau isi catatan dulu.");
      return;
    }
    const now = Date.now();
    if (formNote) {
      // Edit
      let updated: Note | undefined;
      setNotes((prev) => prev.map((n) => {
        if (n.id !== formNote.id) return n;
        updated = { ...n, title: formTitle.trim() || "Catatan", content: formContent, category: formCategory, tags: formTags, updatedAt: now };
        return updated;
      }));
      setFormOpen(false);
      toast.success("Catatan disimpan.");
      setTimeout(() => {
        if (updated) void upsertNote(updated as NoteCloud).catch((e: unknown) => toast.error(`Gagal sync: ${e instanceof Error ? e.message : String(e)}`));
      }, 0);
    } else {
      // Add
      const note: Note = {
        id: genId(), title: formTitle.trim() || "Catatan Baru", content: formContent.trim(),
        createdAt: now, updatedAt: now, color: NOTE_COLORS[0].value,
        pinned: false, tags: formTags, category: formCategory,
      };
      setNotes((prev) => [note, ...prev]);
      setFormOpen(false);
      toast.success("Catatan ditambahkan.");
      void upsertNote(note as NoteCloud).catch((e: unknown) => toast.error(`Catatan tersimpan lokal, tapi gagal sync: ${e instanceof Error ? e.message : String(e)}`));
    }
  };

  const addMobileNote = () => {
    if (!mobileNewTitle.trim() && !mobileNewContent.trim()) { toast.error("Tulis judul atau isi catatan dulu."); return; }
    const note: Note = {
      id: genId(), title: mobileNewTitle.trim() || "Catatan Baru", content: mobileNewContent.trim(),
      createdAt: Date.now(), updatedAt: Date.now(), color: NOTE_COLORS[0].value,
      pinned: false, tags: mobileNewTags, category: mobileNewCategory,
    };
    setNotes((prev) => [note, ...prev]);
    setMobileNewTitle(""); setMobileNewContent(""); setMobileNewTags([]); setMobileTagInput(""); setMobileNewCategory("general");
    setShowAddForm(false);
    toast.success("Catatan ditambahkan.");
    void upsertNote(note as NoteCloud).catch(() => undefined);
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (expandedNote?.id === id) setExpandedNote(null);
    if (formNote?.id === id) setFormOpen(false);
    toast.success("Catatan dihapus.");
    void deleteNoteCloud(id).catch((e: unknown) => toast.error(`Dihapus lokal, gagal hapus cloud: ${e instanceof Error ? e.message : String(e)}`));
  };

  const togglePin = (id: string) => {
    let toggled: Note | undefined;
    setNotes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      toggled = { ...n, pinned: !n.pinned, updatedAt: Date.now() };
      return toggled;
    }));
    setTimeout(() => { if (toggled) void upsertNote(toggled as NoteCloud).catch(() => undefined); }, 0);
  };

  const copyNote = (note: Note) => { navigator.clipboard.writeText(`${note.title}\n\n${note.content}`); toast.success("Catatan disalin."); };
  const copyNotePlain = (note: Note) => {
    const plain = markdownToPlainText(`${note.title}\n\n${note.content}`);
    navigator.clipboard.writeText(plain); toast.success("Disalin sebagai teks biasa.");
  };

  const openRapihkanPicker = (id: string, content: string) => setRapihkanConfig({ id, content });

  const generateRapihkan = async () => {
    if (!rapihkanConfig) return;
    const { id, content } = rapihkanConfig;
    setRapihkanConfig(null);
    localStorage.setItem("rapihkan.tone", rapihkanTone);
    localStorage.setItem("rapihkan.format", rapihkanFormat);
    setFormatting(id);
    const toastId = toast.loading("Sedang memproses catatan dengan AI…");
    try {
      const aiResult = await cleanAndStructureNote(content, rapihkanTone, rapihkanFormat);
      if (!aiResult || !aiResult.trim()) throw new Error("AI tidak mengembalikan hasil — coba lagi.");
      toast.dismiss(toastId);
      setPreviewMode(isWAMode(rapihkanTone, rapihkanFormat) ? "raw" : "rendered");
      setRapihkanPreview({ id, original: content, formatted: aiResult.trim() });
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`Rapihkan gagal: ${err instanceof Error ? err.message : String(err)}`, { duration: 6000 });
    } finally {
      setFormatting(null);
    }
  };

  const applyRapihkan = () => {
    if (!rapihkanPreview) return;
    const { id, formatted } = rapihkanPreview;
    const updatedAt = Date.now();
    if (id === "form") {
      setFormContent(formatted);
    } else {
      const currentNote = notes.find((n) => n.id === id);
      if (!currentNote) { toast.error("Catatan tidak ditemukan."); setRapihkanPreview(null); return; }
      const rapihNote: Note = { ...currentNote, content: formatted, updatedAt };
      setNotes((prev) => prev.map((n) => n.id !== id ? n : rapihNote));
      if (expandedNote?.id === id) setExpandedNote((prev) => prev ? { ...prev, content: formatted, updatedAt } : prev);
      void upsertNote(rapihNote as NoteCloud).catch((e: unknown) => toast.error(`Gagal sync: ${e instanceof Error ? e.message : String(e)}`));
    }
    toast.success("Catatan dirapihkan!");
    setRapihkanPreview(null);
  };

  const restoreOriginal = () => {
    if (!rapihkanPreview) return;
    setRapihkanPreview({ ...rapihkanPreview, formatted: rapihkanPreview.original });
    toast.info("Dikembalikan ke teks asli.");
  };

  const copyFormattedMarkdown = () => {
    if (!rapihkanPreview) return;
    navigator.clipboard.writeText(rapihkanPreview.formatted);
    toast.success("Raw Markdown disalin!");
  };

  const addFormTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t) return;
    if (!formTags.includes(t)) setFormTags((prev) => [...prev, t]);
    setFormTagInput("");
  };

  const addMobileTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t) return;
    if (!mobileNewTags.includes(t)) setMobileNewTags((prev) => [...prev, t]);
    setMobileTagInput("");
  };

  const formatDate = (ts: number) =>
    new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

  const formatDateShort = (ts: number) =>
    new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(ts));

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <>
    {/* ══════════════════════════════════════════════════════════
        MOBILE LAYOUT — md:hidden
    ══════════════════════════════════════════════════════════ */}
    <div className="md:hidden min-h-screen bg-[#F0F4FB] pb-28">
      {/* ── TOP HEADER ── */}
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()}
              className="h-9 w-9 rounded-2xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity shrink-0"
              style={{ WebkitTapHighlightColor: "transparent" }}>
              <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
            <div>
              <h1 className="text-[22px] font-extrabold text-[#0f1c3f] leading-tight">Catatan</h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 max-w-[200px]">Simpan catatan penting, ide, info paket, dan hal yang perlu diingat.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button onClick={() => setShowHistory(true)}
              className="h-9 px-3 rounded-2xl bg-[#F0F4FB] flex items-center gap-1.5 text-[11px] font-bold text-[#0f1c3f] active:opacity-60"
              style={{ WebkitTapHighlightColor: "transparent" }}>
              <History className="h-3.5 w-3.5" strokeWidth={2} />Riwayat
            </button>
            <button onClick={() => setShowAddForm(true)}
              className="h-9 w-9 rounded-2xl flex items-center justify-center text-white shadow-sm active:opacity-80"
              style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari catatan…"
              className="w-full h-11 pl-10 pr-10 rounded-2xl text-[13px] outline-none bg-[#F0F4FB] border border-transparent text-[#0f1c3f] placeholder-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-slate-300/40 flex items-center justify-center">
                <X className="h-3 w-3 text-slate-500" />
              </button>
            )}
          </div>
          <button onClick={() => setShowMobileFilter((s) => !s)}
            className={cn("h-11 px-3 rounded-2xl flex items-center gap-1.5 text-[11px] font-bold transition-all active:opacity-60 shrink-0", showMobileFilter || filterTag !== null ? "bg-[#0066FF] text-white" : "bg-[#F0F4FB] text-[#0f1c3f]")}
            style={{ WebkitTapHighlightColor: "transparent" }}>
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />Filter
          </button>
        </div>
        {/* Filter panel */}
        <AnimatePresence>
          {showMobileFilter && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFilterTag(null)} className={cn("h-8 px-3 rounded-full text-[11px] font-bold border transition-all", filterTag === null ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200")} style={{ WebkitTapHighlightColor: "transparent" }}>Semua</button>
                  {allTags.map((tag) => (
                    <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                      className={cn("h-8 px-3 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1", filterTag === tag ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200")}
                      style={{ WebkitTapHighlightColor: "transparent" }}>
                      <Hash className="h-3 w-3" strokeWidth={2} />{tag}
                    </button>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex gap-2 flex-wrap">
                    {([{ value: "newest", label: "Terbaru" }, { value: "oldest", label: "Terlama" }, { value: "az", label: "A–Z" }] as { value: SortMode; label: string }[]).map((s) => (
                      <button key={s.value} onClick={() => setSortMode(s.value)}
                        className={cn("h-8 px-3 rounded-full text-[11px] font-bold border transition-all", sortMode === s.value ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200")}
                        style={{ WebkitTapHighlightColor: "transparent" }}>{s.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── CONTENT ── */}
      <div className="px-4 pt-5 space-y-3">
        {mobileFiltered.length === 0 && (
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm">
            <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-20 text-slate-400" />
            <p className="text-[13px] font-semibold text-slate-400">{search || filterTag ? "Catatan tidak ditemukan" : "Belum ada catatan"}</p>
            {!search && !filterTag && (
              <button onClick={() => setShowAddForm(true)} className="mt-3 text-[12px] text-[#0066FF] font-bold" style={{ WebkitTapHighlightColor: "transparent" }}>+ Tambah catatan pertama</button>
            )}
          </div>
        )}
        {mobileFiltered.map((note) => {
          const cat = getCatConfig(note.category);
          const CatIcon = cat.icon;
          const relTime = (() => {
            const diff = Date.now() - note.updatedAt;
            const mins = Math.floor(diff / 60000);
            const hrs  = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            if (mins < 1) return "Baru saja";
            if (hrs  < 1) return `${mins} mnt lalu`;
            if (days < 1) return `${hrs} jam lalu`;
            if (days === 1) return "Kemarin";
            if (days < 7)  return `${days} hari lalu`;
            return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(note.updatedAt));
          })();
          return (
            <div key={note.id} className="bg-white rounded-3xl p-4 shadow-sm relative">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: cat.iconBg }}>
                  <CatIcon className="h-5 w-5" style={{ color: cat.iconColor }} strokeWidth={1.6} />
                </div>
                <div className="flex-1 min-w-0" onClick={() => setExpandedNote(note)}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {note.pinned && <Pin className="h-3 w-3 text-amber-400 fill-amber-400 rotate-45 shrink-0" />}
                        <h3 className="text-[14px] font-extrabold text-[#0f1c3f] leading-tight truncate">{note.title}</h3>
                      </div>
                      <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", cat.badgeBg, cat.badgeText)}>{cat.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">{relTime}</span>
                  </div>
                  {note.content && (
                    <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-2 mt-1">{markdownToPlainText(note.content)}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                <span className="text-[10px] text-slate-400">{formatDateShort(note.updatedAt)}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
                    className={cn("h-7 w-7 rounded-xl flex items-center justify-center transition-all", note.pinned ? "bg-amber-50 text-amber-400" : "text-slate-300")}
                    style={{ WebkitTapHighlightColor: "transparent" }}>
                    <Pin className={cn("h-3.5 w-3.5", note.pinned && "fill-amber-400 rotate-45")} strokeWidth={2} />
                  </button>
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setMobileMoreMenu(mobileMoreMenu === note.id ? null : note.id); }}
                      className="h-7 w-7 rounded-xl flex items-center justify-center text-slate-300" style={{ WebkitTapHighlightColor: "transparent" }}>
                      <MoreVertical className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    {mobileMoreMenu === note.id && (
                      <div className="absolute right-0 bottom-8 z-20 bg-white rounded-2xl shadow-xl border border-slate-100 py-1 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { openEdit(note); setMobileMoreMenu(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-[#F0F4FB]">
                          <Edit3 className="h-3.5 w-3.5 text-sky-500" /> Edit
                        </button>
                        <button onClick={() => { copyNote(note); setMobileMoreMenu(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-[#F0F4FB]">
                          <Copy className="h-3.5 w-3.5 text-slate-400" /> Salin
                        </button>
                        {note.content.trim() && (
                          <button onClick={() => { openRapihkanPicker(note.id, note.content); setMobileMoreMenu(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-[#F0F4FB]">
                            <Sparkles className="h-3.5 w-3.5 text-sky-400" /> Rapihkan AI
                          </button>
                        )}
                        <div className="mx-3 border-t border-slate-100 my-1" />
                        <button onClick={() => { deleteNote(note.id); setMobileMoreMenu(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-red-500 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" /> Hapus
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ADD NOTE BOTTOM SHEET ── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowAddForm(false)} />
            <motion.div className="relative w-full bg-white rounded-t-3xl shadow-2xl" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}>
              <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-slate-300" /></div>
              <div className="px-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h2 className="text-[16px] font-extrabold text-[#0f1c3f]">Catatan Baru</h2>
                <div className="flex items-center gap-2">
                  <AIModelToggle feature="notes" />
                  <button onClick={() => setShowAddForm(false)} className="h-8 w-8 rounded-xl bg-[#F0F4FB] flex items-center justify-center"><X className="h-4 w-4 text-slate-500" /></button>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
                <Input placeholder="Judul catatan" value={mobileNewTitle} onChange={(e) => setMobileNewTitle(e.target.value)}
                  className="h-11 text-[14px] font-semibold rounded-xl bg-[#F0F4FB] border-transparent" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") textareaRef.current?.focus(); }} />
                {/* Category picker */}
                <div className="flex flex-wrap gap-1.5">
                  {[{ key: "general", label: "Umum", emoji: "📝" }, ...NOTE_CATEGORIES.map((c) => ({ key: c.key, label: c.label, emoji: c.tabEmoji }))].map((cat) => (
                    <button key={cat.key} onClick={() => setMobileNewCategory(cat.key)}
                      className={cn("h-7 px-2.5 rounded-full text-[11px] font-bold border transition-all", mobileNewCategory === cat.key ? "bg-blue-600 text-white border-transparent" : "bg-[#F0F4FB] text-slate-600 border-slate-200")}
                      style={{ WebkitTapHighlightColor: "transparent" }}>
                      {cat.emoji} {cat.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Textarea ref={textareaRef} placeholder="Tulis catatan di sini…" value={mobileNewContent} onChange={(e) => setMobileNewContent(e.target.value)}
                    rows={5} className="text-[13px] rounded-xl bg-[#F0F4FB] border-transparent resize-none pr-10"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addMobileNote(); }} />
                  {mobileNewContent.trim() && (
                    <button type="button" onClick={() => openRapihkanPicker("form", mobileNewContent)} disabled={formatting === "form"}
                      className="absolute right-2 top-2 p-1.5 rounded-lg text-sky-400 hover:text-sky-600 hover:bg-sky-100">
                      <Sparkles className={cn("h-4 w-4", formatting === "form" && "animate-pulse")} />
                    </button>
                  )}
                </div>
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {mobileNewTags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 bg-sky-100 text-sky-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                      #{tag}<button onClick={() => setMobileNewTags((p) => p.filter((t) => t !== tag))}><X className="h-3 w-3 text-sky-400" /></button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1 bg-[#F0F4FB] px-2.5 py-1 rounded-full">
                    <Hash className="h-3 w-3 text-sky-400" />
                    <input type="text" value={mobileTagInput} onChange={(e) => setMobileTagInput(e.target.value)}
                      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && mobileTagInput.trim()) { e.preventDefault(); addMobileTag(mobileTagInput); } }}
                      placeholder="Tag" className="h-5 w-20 text-[11px] border-0 bg-transparent shadow-none p-0 focus:outline-none text-slate-700 placeholder:text-slate-400" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1 pb-2">
                  <button onClick={() => setShowAddForm(false)} className="flex-1 h-11 rounded-2xl bg-[#F0F4FB] text-[13px] font-bold text-slate-600" style={{ WebkitTapHighlightColor: "transparent" }}>Batal</button>
                  <button onClick={addMobileNote} className="flex-1 h-11 rounded-2xl text-[13px] font-bold text-white shadow-sm flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}>
                    <Plus className="h-4 w-4" strokeWidth={2.5} />Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RIWAYAT BOTTOM SHEET ── */}
      <AnimatePresence>
        {showHistory && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowHistory(false)} />
            <motion.div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}>
              <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-slate-300" /></div>
              <div className="px-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h2 className="text-[16px] font-extrabold text-[#0f1c3f]">Riwayat Catatan</h2>
                <button onClick={() => setShowHistory(false)} className="h-8 w-8 rounded-xl bg-[#F0F4FB] flex items-center justify-center"><X className="h-4 w-4 text-slate-500" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {[...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10).map((note) => (
                  <button key={note.id} onClick={() => { setExpandedNote(note); setShowHistory(false); }}
                    className="w-full flex items-center gap-3 bg-[#F0F4FB] rounded-2xl px-4 py-3 text-left" style={{ WebkitTapHighlightColor: "transparent" }}>
                    <StickyNote className="h-4 w-4 text-[#0066FF] shrink-0" strokeWidth={1.8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[#0f1c3f] truncate">{note.title}</p>
                      <p className="text-[11px] text-slate-400">{formatDate(note.updatedAt)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" strokeWidth={2} />
                  </button>
                ))}
                {notes.length === 0 && <div className="text-center py-8 text-slate-400 text-[13px]">Belum ada catatan</div>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {mobileMoreMenu && <div className="fixed inset-0 z-[9]" onClick={() => setMobileMoreMenu(null)} />}
    </div>{/* end md:hidden */}

    {/* ══════════════════════════════════════════════════════════
        DESKTOP LAYOUT — hidden md:block
    ══════════════════════════════════════════════════════════ */}
    <div className="hidden md:block min-h-screen bg-slate-50">
      <div className="max-w-[1300px] mx-auto px-6 py-6 space-y-0">

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <FileText className="h-7 w-7 text-blue-600" strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-[28px] font-extrabold text-slate-900 leading-tight">Catatan</h1>
              <p className="text-slate-500 text-[13px] mt-0.5">Simpan ide, catatan penting, dan informasi bisnis Anda dengan rapi.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AIModelToggle feature="notes" />
            <Button
              onClick={openAdd}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-5 text-[14px] font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Tambah Catatan
            </Button>
          </div>
        </div>

        {/* ── TAB BAR ────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-t-2xl">
          <div className="flex items-center overflow-x-auto scrollbar-none px-1">
            {/* Semua tab */}
            <button
              onClick={() => setFilterCategory(null)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-4 text-[13px] font-semibold whitespace-nowrap transition-colors border-b-2 shrink-0",
                filterCategory === null
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <StickyNote className="h-3.5 w-3.5" strokeWidth={2} />
              Semua
              <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-0.5", filterCategory === null ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                {notes.length}
              </span>
            </button>
            {NOTE_CATEGORIES.map((cat) => {
              const CatIcon = cat.icon;
              const count = countByCategory[cat.key] ?? 0;
              const active = filterCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setFilterCategory(active ? null : cat.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-4 text-[13px] font-semibold whitespace-nowrap transition-colors border-b-2 shrink-0",
                    active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  <CatIcon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: active ? "#2563eb" : undefined }} />
                  {cat.label}
                  <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-0.5", active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── FILTER ROW ─────────────────────────────────────────────────────── */}
        <div className="bg-white border-x border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari catatan..."
              className="w-full h-10 pl-9 pr-9 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* Category filter */}
          <div className="relative">
            <select
              value={filterCategory ?? ""}
              onChange={(e) => setFilterCategory(e.target.value || null)}
              className="h-10 pl-3 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none cursor-pointer"
            >
              <option value="">Semua Kategori</option>
              {NOTE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
          {/* Sort */}
          <div className="relative">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-10 pl-3 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none cursor-pointer"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="az">A–Z</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
          {/* View toggle */}
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("h-10 w-10 flex items-center justify-center transition-colors", viewMode === "grid" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-600")}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("h-10 w-10 flex items-center justify-center transition-colors", viewMode === "list" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-600")}
            >
              <LayoutList className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* ── CARDS AREA ─────────────────────────────────────────────────────── */}
        <div className="bg-white border-x border-b border-slate-200 rounded-b-2xl p-4">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-[14px] font-semibold">{search || filterCategory ? "Catatan tidak ditemukan" : "Belum ada catatan"}</p>
              {!search && !filterCategory && (
                <button onClick={openAdd} className="mt-2 text-[13px] text-blue-500 font-medium hover:text-blue-600">+ Tambah catatan pertama</button>
              )}
            </div>
          )}

          <div className={cn(
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              : "flex flex-col gap-3"
          )}>
            <AnimatePresence>
              {filtered.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  viewMode={viewMode}
                  authorName={authorName}
                  onView={setExpandedNote}
                  onEdit={openEdit}
                  onDelete={deleteNote}
                  onPin={togglePin}
                  onCopy={copyNote}
                  onCopyPlain={copyNotePlain}
                  onRapihkan={openRapihkanPicker}
                  formatting={formatting}
                />
              ))}
            </AnimatePresence>

            {/* ── Add note card ── */}
            <motion.button
              layout
              onClick={openAdd}
              className={cn(
                "border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all group",
                viewMode === "grid" ? "p-8 min-h-[180px]" : "p-4 flex-row gap-4 min-h-[68px]"
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Plus className="h-5 w-5 text-blue-600" strokeWidth={2.5} />
              </div>
              {viewMode === "grid" ? (
                <div>
                  <p className="text-[14px] font-bold text-slate-600 group-hover:text-blue-700 transition-colors">Tambah Catatan Baru</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Buat catatan atau ide baru di sini.</p>
                </div>
              ) : (
                <p className="text-[13px] font-semibold text-slate-500 group-hover:text-blue-600 transition-colors">Tambah Catatan Baru</p>
              )}
            </motion.button>
          </div>
        </div>

      </div>
    </div>{/* end desktop */}

    {/* ══════════════════════════════════════════════════════════
        SHARED DIALOGS (both mobile + desktop)
    ══════════════════════════════════════════════════════════ */}

    {/* ── Add / Edit Form Dialog ─────────────────────────────────────────── */}
    <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden rounded-2xl gap-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-slate-100">
          <DialogTitle className="text-[16px] font-extrabold text-slate-900">
            {formNote ? "Edit Catatan" : "Catatan Baru"}
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <Input
            placeholder="Judul catatan..."
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="h-11 text-[14px] font-semibold bg-slate-50 border-slate-200 rounded-xl"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") formTextareaRef.current?.focus(); }}
          />
          {/* Category picker */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Kategori</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "general", label: "Umum", icon: StickyNote, iconBg: "#f1f5f9", iconColor: "#94a3b8", badgeBg: "bg-slate-100", badgeText: "text-slate-600" },
                ...NOTE_CATEGORIES,
              ].map((cat) => {
                const CatIcon = cat.icon;
                const active = formCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setFormCategory(cat.key)}
                    className={cn(
                      "flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold border transition-all",
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <CatIcon className="h-3.5 w-3.5" style={{ color: active ? "#2563eb" : cat.iconColor }} strokeWidth={1.8} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Content */}
          <div className="relative">
            <Textarea
              ref={formTextareaRef}
              placeholder="Tulis catatan di sini…"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={6}
              className="text-[13px] bg-slate-50 border-slate-200 rounded-xl resize-none pr-10"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSaveForm(); }}
            />
            {formContent.trim() && (
              <button
                type="button"
                onClick={() => openRapihkanPicker("form", formContent)}
                disabled={formatting === "form"}
                className="absolute right-2 top-2 p-1.5 rounded-lg text-sky-400 hover:text-sky-600 hover:bg-sky-100 transition-colors"
                title="Rapihkan dengan AI"
              >
                <Sparkles className={cn("h-4 w-4", formatting === "form" && "animate-pulse")} />
              </button>
            )}
          </div>
          {formContent && (
            <p className="text-[11px] text-slate-400">{wordCount(formContent)} kata · {formContent.length} karakter</p>
          )}
          {/* Tags */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Tag (opsional)</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {formTags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 bg-sky-100 text-sky-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                  #{tag}
                  <button onClick={() => setFormTags((p) => p.filter((t) => t !== tag))} className="text-sky-400 hover:text-sky-700"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-full">
                <Hash className="h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  value={formTagInput}
                  onChange={(e) => setFormTagInput(e.target.value)}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && formTagInput.trim()) { e.preventDefault(); addFormTag(formTagInput); } }}
                  placeholder="Tambah tag"
                  className="h-5 w-24 text-[11px] border-0 bg-transparent shadow-none p-0 focus:outline-none text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="px-5 py-4 border-t border-slate-100 gap-2">
          <Button variant="outline" onClick={() => setFormOpen(false)} className="rounded-xl h-11">Batal</Button>
          <Button onClick={handleSaveForm} className="bg-blue-600 hover:bg-blue-700 rounded-xl h-11 flex-1">
            <Check className="h-4 w-4 mr-1.5" />
            {formNote ? "Simpan Perubahan" : "Simpan Catatan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Expand / View Modal ────────────────────────────────────────────── */}
    <AnimatePresence>
      {expandedNote && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setExpandedNote(null)} />
          <motion.div
            className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[80vh]"
            initial={{ y: 40, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-slate-300" /></div>
            {/* Header */}
            <div className="flex items-start justify-between p-4 pb-2 shrink-0">
              <div className="flex-1 min-w-0 pr-2">
                {(() => {
                  const cat = getCatConfig(expandedNote.category);
                  const CatIcon = cat.icon;
                  return (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.iconBg }}>
                        <CatIcon className="h-4 w-4" style={{ color: cat.iconColor }} strokeWidth={1.8} />
                      </div>
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", cat.badgeBg, cat.badgeText)}>{cat.label}</span>
                    </div>
                  );
                })()}
                <h2 className="text-[16px] font-bold text-slate-900 leading-snug">{expandedNote.title}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(expandedNote.updatedAt)}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => { openEdit(expandedNote); setExpandedNote(null); }} className="p-1.5 rounded-lg hover:bg-sky-100 text-slate-400 hover:text-sky-600 transition-colors" title="Edit">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button onClick={() => copyNote(expandedNote)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Salin">
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={() => copyNotePlain(expandedNote)} className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors" title="Salin teks biasa">
                  <ClipboardCheck className="h-4 w-4" />
                </button>
                <button onClick={() => setExpandedNote(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mx-4 border-t border-slate-200/60 shrink-0" />
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {expandedNote.content
                ? <MarkdownContent content={expandedNote.content} />
                : <p className="text-[13px] text-slate-400 italic">Tidak ada isi catatan.</p>
              }
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/60 shrink-0">
              <span className="text-[11px] text-slate-400">
                {expandedNote.content ? `${wordCount(expandedNote.content)} kata · ${expandedNote.content.length} karakter` : "Catatan kosong"}
              </span>
              <div className="flex items-center gap-2">
                {expandedNote.content.trim() && (
                  <button onClick={() => openRapihkanPicker(expandedNote.id, expandedNote.content)} disabled={formatting === expandedNote.id}
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-600 font-medium transition-colors">
                    <Sparkles className={cn("h-3.5 w-3.5", formatting === expandedNote.id && "animate-pulse")} />Rapihkan AI
                  </button>
                )}
                <button onClick={() => { deleteNote(expandedNote.id); setExpandedNote(null); }}
                  className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />Hapus
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Rapihkan Picker (Step 1) ───────────────────────────────────────── */}
    <Dialog open={!!rapihkanConfig} onOpenChange={(open) => { if (!open) setRapihkanConfig(null); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Sparkles className="h-4 w-4 text-sky-500 shrink-0" />Rapihkan dengan AI
          </DialogTitle>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {isWAMode(rapihkanTone, rapihkanFormat) ? "Output siap copy-paste ke WA/Telegram." : "AI akan memformat ulang catatan menjadi Markdown profesional."}
          </p>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[65vh]">
          <div className="px-5 pt-4 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5"><MessageCircle className="h-3 w-3" />Tone Penulisan</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TONES.map((tone) => {
                const active = rapihkanTone === tone.id;
                return (
                  <button key={tone.id} onClick={() => setRapihkanTone(tone.id)}
                    className={cn("flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all", active ? "border-sky-400 bg-sky-50 shadow-sm" : "border-slate-200 hover:border-sky-200 hover:bg-sky-50/40")}>
                    <tone.icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", active ? "text-sky-500" : "text-slate-400")} />
                    <span className="flex flex-col gap-0 min-w-0">
                      <span className={cn("text-[12px] font-medium leading-tight", active ? "text-sky-700" : "text-slate-700")}>{tone.label}</span>
                      <span className="text-[10px] text-slate-400 leading-tight mt-0.5">{tone.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="px-5 pt-3 pb-4 border-t border-slate-100">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5"><LayoutGrid className="h-3 w-3" />Format Layout</p>
            <div className="grid grid-cols-2 gap-1.5">
              {FORMATS.map((fmt) => {
                const active = rapihkanFormat === fmt.id;
                return (
                  <button key={fmt.id} onClick={() => setRapihkanFormat(fmt.id)}
                    className={cn("flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all", active ? "border-purple-400 bg-purple-50 shadow-sm" : "border-slate-200 hover:border-purple-200 hover:bg-purple-50/40")}>
                    <fmt.icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", active ? "text-purple-500" : "text-slate-400")} />
                    <span className="flex flex-col gap-0 min-w-0">
                      <span className={cn("text-[12px] font-medium leading-tight", active ? "text-purple-700" : "text-slate-700")}>{fmt.label}</span>
                      <span className="text-[10px] text-slate-400 leading-tight mt-0.5">{fmt.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="px-5 py-3 border-t border-slate-100 flex flex-row justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setRapihkanConfig(null)}><X className="h-3.5 w-3.5 mr-1.5" />Batal</Button>
          <Button size="sm" className="bg-sky-500 hover:bg-sky-600 text-white" onClick={() => void generateRapihkan()}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />Rapihkan Sekarang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Rapihkan Preview (Step 2) ──────────────────────────────────────── */}
    <Dialog open={!!rapihkanPreview} onOpenChange={(open) => { if (!open) setRapihkanPreview(null); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-500 shrink-0" />
            <DialogTitle className="text-[15px] flex-1">Pratinjau Rapihkan</DialogTitle>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {(() => { const tone = TONES.find((t) => t.id === rapihkanTone); return tone ? (<span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full font-semibold"><tone.icon className="h-2.5 w-2.5" />{tone.label}</span>) : null; })()}
            {(() => { const fmt = FORMATS.find((f) => f.id === rapihkanFormat); return fmt ? (<span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold"><fmt.icon className="h-2.5 w-2.5" />{fmt.label}</span>) : null; })()}
            <span className="text-[10px] text-slate-400 ml-auto">Terapkan atau batalkan perubahan.</span>
          </div>
        </DialogHeader>
        {rapihkanPreview && (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100" style={{ maxHeight: "56vh" }}>
            <div className="flex flex-col min-h-0">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 shrink-0"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Teks Asli</span></div>
              <div className="overflow-y-auto p-4 text-[12px] leading-relaxed text-slate-500 whitespace-pre-wrap font-mono bg-slate-50/60 flex-1">{rapihkanPreview.original}</div>
            </div>
            <div className="flex flex-col min-h-0">
              <div className="px-3 py-2 bg-sky-50/60 border-b border-sky-100 shrink-0 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-sky-400 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-500 flex-1">Hasil AI</span>
                <div className="flex items-center bg-white border border-sky-200 rounded-lg overflow-hidden shrink-0">
                  <button onClick={() => setPreviewMode("rendered")} className={cn("flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors", previewMode === "rendered" ? "bg-sky-100 text-sky-700" : "text-slate-400 hover:bg-slate-50")}><Eye className="h-2.5 w-2.5" />Preview</button>
                  <button onClick={() => setPreviewMode("raw")} className={cn("flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors", previewMode === "raw" ? "bg-sky-100 text-sky-700" : "text-slate-400 hover:bg-slate-50")}><Code className="h-2.5 w-2.5" />Raw</button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 bg-white">
                {previewMode === "rendered"
                  ? <div className="p-5 pb-8"><MarkdownContent content={rapihkanPreview.formatted} size="md" prose={true} /></div>
                  : <pre className="p-4 text-[11.5px] leading-relaxed text-slate-700 whitespace-pre-wrap font-mono bg-slate-50/80 min-h-full">{rapihkanPreview.formatted}</pre>
                }
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="px-5 py-3 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 w-full flex-wrap">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={restoreOriginal} className="text-slate-500 hover:text-slate-700 text-[12px]"><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Balik Asli</Button>
              <Button variant="outline" size="sm" onClick={copyFormattedMarkdown} className="text-[12px]"><Copy className="h-3.5 w-3.5 mr-1.5" />Salin MD</Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setRapihkanPreview(null)} className="text-[12px]"><X className="h-3.5 w-3.5 mr-1.5" />Batalkan</Button>
              <Button size="sm" className="bg-sky-500 hover:bg-sky-600 text-white text-[12px]" onClick={applyRapihkan}><Check className="h-3.5 w-3.5 mr-1.5" />Terapkan</Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </>
  );
}
