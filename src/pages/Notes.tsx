import { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, Trash2, Edit3, Check, X, Sparkles, StickyNote, Copy,
  Pin, PinOff, Search, Maximize2, Hash, AlignLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useT } from "@/lib/regional";
import { isSupabaseConfigured } from "@/lib/supabase";
import { pullNotes, syncNotesFull, type NoteCloud } from "@/lib/cloudSync";

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
}

type SortMode = "newest" | "oldest" | "az";

const NOTE_COLORS = [
  { label: "Putih", value: "bg-white border-slate-200", dot: "bg-slate-300" },
  { label: "Orange", value: "bg-orange-50 border-orange-200", dot: "bg-orange-400" },
  { label: "Biru", value: "bg-blue-50 border-blue-200", dot: "bg-blue-400" },
  { label: "Hijau", value: "bg-green-50 border-green-200", dot: "bg-green-400" },
  { label: "Ungu", value: "bg-purple-50 border-purple-200", dot: "bg-purple-400" },
  { label: "Kuning", value: "bg-yellow-50 border-yellow-200", dot: "bg-yellow-400" },
];

function smartFormat(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let prevWasBlank = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();
    if (line.trim() === "") {
      if (!prevWasBlank) result.push("");
      prevWasBlank = true;
      continue;
    }
    prevWasBlank = false;
    line = line.replace(/^\s*[-*•·]\s+/, "• ");
    line = line.replace(/^\s*(\d+)[.)]\s+/, "$1. ");
    line = line.replace(/^(•\s*|[0-9]+\.\s*)?([a-z])/, (_m, prefix, ch) =>
      (prefix ?? "") + ch.toUpperCase()
    );
    if (
      !/^•/.test(line) &&
      !/^[0-9]/.test(line) &&
      !/[.!?:,;]$/.test(line.trim()) &&
      line.trim().split(/\s+/).length > 3
    ) {
      line = line.trimEnd() + ".";
    }
    result.push(line);
  }
  while (result.length > 0 && result[result.length - 1].trim() === "") result.pop();
  return result.join("\n");
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

export default function Notes() {
  const t = useT();
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState(NOTE_COLORS[0].value);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [formatting, setFormatting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<Note | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Gate: jangan push ke cloud sampai initial pull selesai. Tanpa ini,
  // first effect run akan kirim local empty + delete semua note di cloud.
  const pulledRef = useRef(!isSupabaseConfigured());

  useEffect(() => {
    saveNotes(notes);
    if (!pulledRef.current) return;
    if (isSupabaseConfigured()) {
      void syncNotesFull(notes as NoteCloud[]).catch(() => undefined);
    }
  }, [notes]);

  // Pull from cloud on mount
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      pulledRef.current = true;
      return;
    }
    let cancelled = false;
    void pullNotes().then((cloud) => {
      if (cancelled) return;
      if (cloud && cloud.length > 0) {
        setNotes(cloud as Note[]);
        saveNotes(cloud as Note[]);
      }
      // Open the gate AFTER pull completes (whether cloud was empty or not).
      // If cloud was empty but local has notes, the next mutation will push them.
      // If both empty, nothing to push. Either way we no longer wipe the cloud.
      pulledRef.current = true;
      // If local has notes that cloud doesn't yet, push them once now.
      const localNotes = loadNotes();
      if (localNotes.length > 0 && (!cloud || cloud.length === 0)) {
        void syncNotesFull(localNotes as NoteCloud[]).catch(() => undefined);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => (n.tags ?? []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  const filtered = useMemo(() => {
    let result = notes.filter((n) => {
      const matchSearch =
        search === "" ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        (n.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
      const matchTag = filterTag === null || (n.tags ?? []).includes(filterTag);
      return matchSearch && matchTag;
    });

    result = [...result].sort((a, b) => {
      if (sortMode === "newest") return b.updatedAt - a.updatedAt;
      if (sortMode === "oldest") return a.updatedAt - b.updatedAt;
      return a.title.localeCompare(b.title, "id");
    });

    return [
      ...result.filter((n) => n.pinned),
      ...result.filter((n) => !n.pinned),
    ];
  }, [notes, search, sortMode, filterTag]);

  const addNote = () => {
    if (!newTitle.trim() && !newContent.trim()) {
      toast.error("Tulis judul atau isi catatan dulu.");
      return;
    }
    const note: Note = {
      id: genId(),
      title: newTitle.trim() || "Catatan Baru",
      content: newContent.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      color: NOTE_COLORS[0].value,
      pinned: false,
      tags: newTags,
    };
    setNotes((prev) => [note, ...prev]);
    setNewTitle("");
    setNewContent("");
    setNewTags([]);
    setTagInput("");
    setShowAddForm(false);
    toast.success("Catatan ditambahkan.");
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditColor(note.color);
    setEditTags(note.tags ?? []);
    setEditTagInput("");
  };

  const saveEdit = () => {
    if (!editingId) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === editingId
          ? {
              ...n,
              title: editTitle.trim() || "Catatan",
              content: editContent,
              color: editColor,
              tags: editTags,
              updatedAt: Date.now(),
            }
          : n
      )
    );
    setEditingId(null);
    toast.success("Catatan disimpan.");
  };

  const cancelEdit = () => setEditingId(null);

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (expandedNote?.id === id) setExpandedNote(null);
    toast.success("Catatan dihapus.");
  };

  const togglePin = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  };

  const handleRapihkan = async (id: string, content: string) => {
    setFormatting(id);
    try {
      let formatted = content;
      if (typeof window !== "undefined" && (window as any).ai?.generateText) {
        try {
          const result = await (window as any).ai.generateText({
            prompt: `Rapihkan teks berikut: perbaiki tanda baca, kapitalisasi, format bullet jika ada. Kembalikan hanya teks yang sudah dirapihkan tanpa tambahan apapun.\n\n${content}`,
          });
          formatted = typeof result === "string" ? result : result?.text ?? content;
        } catch {
          formatted = smartFormat(content);
        }
      } else {
        formatted = smartFormat(content);
      }
      if (id === "new") {
        setNewContent(formatted);
      } else if (id === editingId) {
        setEditContent(formatted);
      } else {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, content: formatted, updatedAt: Date.now() } : n
          )
        );
        if (expandedNote?.id === id)
          setExpandedNote((prev) => (prev ? { ...prev, content: formatted } : prev));
      }
      toast.success("Catatan dirapihkan!");
    } finally {
      setFormatting(null);
    }
  };

  const copyNote = (note: Note) => {
    navigator.clipboard.writeText(`${note.title}\n\n${note.content}`);
    toast.success("Catatan disalin.");
  };

  const addTag = (tag: string, isNew: boolean) => {
    const trimmed = tag
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (!trimmed) return;
    if (isNew) {
      if (!newTags.includes(trimmed)) setNewTags((prev) => [...prev, trimmed]);
      setTagInput("");
    } else {
      if (!editTags.includes(trimmed)) setEditTags((prev) => [...prev, trimmed]);
      setEditTagInput("");
    }
  };

  const removeTag = (tag: string, isNew: boolean) => {
    if (isNew) setNewTags((prev) => prev.filter((t) => t !== tag));
    else setEditTags((prev) => prev.filter((t) => t !== tag));
  };

  const formatDate = (ts: number) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-5 px-1 pb-10">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <StickyNote className="h-5 w-5 text-orange-500" strokeWidth={1.5} />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--foreground))]">
              {t.notes_title}
            </h1>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {notes.length} {t.notes_saved_count}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          size="sm"
          className="gap-1.5 rounded-xl gradient-primary text-white"
        >
          {showAddForm ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {showAddForm ? t.notes_close_btn : t.notes_new_btn}
        </Button>
      </div>

      {/* ── Add new note form ── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
              <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider">
                {t.notes_label_new}
              </p>
              <Input
                placeholder={t.notes_placeholder_title}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="h-9 text-[13px] bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") textareaRef.current?.focus();
                }}
              />
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  placeholder={t.notes_placeholder_content}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  className="text-[13px] bg-white resize-none pr-10"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
                  }}
                />
                {newContent.trim() && (
                  <button
                    type="button"
                    title="Rapihkan dengan AI"
                    onClick={() => handleRapihkan("new", newContent)}
                    disabled={formatting === "new"}
                    className="absolute right-2 top-2 p-1 rounded-lg text-orange-400 hover:text-orange-600 hover:bg-orange-100 transition-colors"
                  >
                    <Sparkles
                      className={cn(
                        "h-4 w-4",
                        formatting === "new" && "animate-pulse"
                      )}
                    />
                  </button>
                )}
              </div>
              {newContent && (
                <p className="text-[10px] text-muted-foreground">
                  {wordCount(newContent)} {t.notes_words} · {newContent.length} {t.notes_chars}
                </p>
              )}
              {/* Tags input */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1 items-center">
                  {newTags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 bg-orange-100 text-orange-700 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    >
                      #{tag}
                      <button
                        onClick={() => removeTag(tag, true)}
                        className="text-orange-400 hover:text-orange-700"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1">
                    <Hash className="h-3 w-3 text-orange-400" />
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          (e.key === "Enter" || e.key === ",") &&
                          tagInput.trim()
                        ) {
                          e.preventDefault();
                          addTag(tagInput, true);
                        }
                      }}
                      placeholder={t.notes_add_tag}
                      className="h-5 w-32 text-[11px] border-0 bg-transparent shadow-none p-0 focus:outline-none text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center gap-2">
                <p className="text-[10px] text-muted-foreground">
                  {t.notes_ctrl_enter}
                </p>
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                    className="h-8"
                  >
                    {t.notes_cancel}
                  </Button>
                  <Button
                    size="sm"
                    onClick={addNote}
                    className="gap-1.5 rounded-xl gradient-primary text-white h-8"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t.notes_new_btn}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search, Sort, Tags ── */}
      {notes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t.notes_search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-[13px] pl-8"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden bg-white shrink-0">
              {(
                [
                  { value: "newest", label: t.notes_sort_newest },
                  { value: "oldest", label: t.notes_sort_oldest },
                  { value: "az", label: t.notes_sort_az },
                ] as { value: SortMode; label: string }[]
              ).map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSortMode(s.value)}
                  className={cn(
                    "h-8 px-2.5 text-[10px] font-semibold transition-colors border-r border-slate-200 last:border-r-0",
                    sortMode === s.value
                      ? "bg-orange-500 text-white"
                      : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterTag(null)}
                className={cn(
                  "text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors",
                  filterTag === null
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {t.notes_filter_all}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setFilterTag(tag === filterTag ? null : tag)
                  }
                  className={cn(
                    "flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors",
                    filterTag === tag
                      ? "bg-orange-500 text-white"
                      : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                  )}
                >
                  <Hash className="h-2.5 w-2.5" />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-[hsl(var(--muted-foreground))]">
          <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {search || filterTag
              ? t.notes_not_found
              : t.notes_empty}
          </p>
          {!showAddForm && !search && !filterTag && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-2 text-[12px] text-orange-500 font-medium hover:text-orange-600 transition-colors"
            >
              {t.notes_first_note}
            </button>
          )}
        </div>
      )}

      {/* ── Notes grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AnimatePresence>
          {filtered.map((note) => (
            <motion.div
              key={note.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "rounded-2xl border p-4 space-y-2.5 relative group transition-shadow hover:shadow-md",
                note.color
              )}
            >
              {note.pinned && (
                <div className="absolute top-2.5 right-2.5 pointer-events-none">
                  <Pin className="h-3 w-3 text-orange-500 fill-orange-500 rotate-45" />
                </div>
              )}

              {editingId === note.id ? (
                /* ── Edit mode ── */
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-8 text-[13px] font-semibold bg-white"
                    placeholder="Judul"
                    autoFocus
                  />
                  {/* Color picker */}
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span className="text-[10px] text-muted-foreground">{t.notes_color}</span>
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setEditColor(c.value)}
                        title={c.label}
                        className={cn(
                          "h-5 w-5 rounded-full transition-all border-2",
                          c.dot,
                          editColor === c.value
                            ? "border-orange-500 scale-110"
                            : "border-white/60"
                        )}
                      />
                    ))}
                  </div>
                  <div className="relative">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={5}
                      className="text-[13px] bg-white resize-none pr-10"
                    />
                    {editContent.trim() && (
                      <button
                        type="button"
                        title="Rapihkan"
                        onClick={() =>
                          handleRapihkan(note.id, editContent)
                        }
                        disabled={formatting === note.id}
                        className="absolute right-2 top-2 p-1 rounded-lg text-orange-400 hover:text-orange-600 hover:bg-orange-100 transition-colors"
                      >
                        <Sparkles
                          className={cn(
                            "h-4 w-4",
                            formatting === note.id && "animate-pulse"
                          )}
                        />
                      </button>
                    )}
                  </div>
                  {editContent && (
                    <p className="text-[10px] text-muted-foreground">
                      {wordCount(editContent)} {t.notes_words} · {editContent.length}{" "}
                      {t.notes_chars}
                    </p>
                  )}
                  {/* Tags edit */}
                  <div className="flex flex-wrap gap-1 items-center">
                    {editTags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 bg-orange-100 text-orange-700 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      >
                        #{tag}
                        <button
                          onClick={() => removeTag(tag, false)}
                          className="text-orange-400 hover:text-orange-700"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-orange-400" />
                      <input
                        type="text"
                        value={editTagInput}
                        onChange={(e) => setEditTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            (e.key === "Enter" || e.key === ",") &&
                            editTagInput.trim()
                          ) {
                            e.preventDefault();
                            addTag(editTagInput, false);
                          }
                        }}
                        placeholder={t.notes_new_tag}
                        className="h-5 w-24 text-[11px] border-0 bg-transparent shadow-none p-0 focus:outline-none text-slate-700 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cancelEdit}
                      className="h-7 gap-1 text-[12px]"
                    >
                      <X className="h-3 w-3" /> {t.notes_cancel}
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      className="h-7 gap-1 text-[12px] rounded-xl"
                    >
                      <Check className="h-3 w-3" /> {t.notes_save}
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className="text-[13px] font-bold text-[hsl(var(--foreground))] leading-snug line-clamp-1 flex-1 cursor-pointer hover:text-orange-600 transition-colors"
                      onClick={() => setExpandedNote(note)}
                    >
                      {note.title}
                    </h3>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePin(note.id)}
                        className={cn(
                          "p-1 rounded-lg transition-colors",
                          note.pinned
                            ? "text-orange-500 hover:bg-orange-100"
                            : "text-slate-400 hover:bg-orange-50 hover:text-orange-500"
                        )}
                        title={note.pinned ? t.notes_unpin : t.notes_pin}
                      >
                        {note.pinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedNote(note)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title={t.notes_expand}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyNote(note)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title={t.notes_copy}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="p-1 rounded-lg hover:bg-orange-100 text-slate-400 hover:text-orange-600 transition-colors"
                        title={t.btn_edit}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteNote(note.id)}
                        className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        title={t.btn_delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  {(note.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(note.tags ?? []).map((tag) => (
                        <button
                          key={tag}
                          onClick={() =>
                            setFilterTag(filterTag === tag ? null : tag)
                          }
                          className="flex items-center gap-0.5 text-[9.5px] font-semibold text-orange-600 bg-orange-100 hover:bg-orange-200 px-1.5 py-0.5 rounded-full transition-colors"
                        >
                          <Hash className="h-2.5 w-2.5" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {note.content && (
                    <p
                      className="text-[12px] text-[hsl(var(--muted-foreground))] whitespace-pre-wrap line-clamp-5 leading-relaxed cursor-pointer"
                      onClick={() => setExpandedNote(note)}
                    >
                      {note.content}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-70">
                      {formatDate(note.updatedAt)}
                    </p>
                    <div className="flex items-center gap-2">
                      {note.content && (
                        <span className="text-[10px] text-slate-400">
                          <AlignLeft className="h-2.5 w-2.5 inline mr-0.5" />
                          {wordCount(note.content)} {t.notes_words}
                        </span>
                      )}
                      {note.content.trim() && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRapihkan(note.id, note.content)
                          }
                          disabled={formatting === note.id}
                          title={t.notes_clean}
                          className="flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-600 font-medium transition-colors"
                        >
                          <Sparkles
                            className={cn(
                              "h-3 w-3",
                              formatting === note.id && "animate-pulse"
                            )}
                          />
                          {t.notes_clean}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Expand Modal ── */}
      <AnimatePresence>
        {expandedNote && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setExpandedNote(null)}
            />
            <motion.div
              className={cn(
                "relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[80vh]",
                expandedNote.color
              )}
              initial={{ y: 40, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 40, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              {/* Drag handle for mobile */}
              <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-300" />
              </div>

              {/* Modal header */}
              <div className="flex items-start justify-between p-4 pb-2 shrink-0">
                <div className="flex-1 min-w-0 pr-2">
                  <h2 className="text-[16px] font-bold text-[hsl(var(--foreground))] leading-snug">
                    {expandedNote.title}
                  </h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDate(expandedNote.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => {
                      const n = notes.find((x) => x.id === expandedNote.id);
                      if (n) {
                        startEdit(n);
                        setExpandedNote(null);
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-orange-100 text-slate-400 hover:text-orange-600 transition-colors"
                    title={t.btn_edit}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => copyNote(expandedNote)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title={t.notes_copy}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setExpandedNote(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Tags */}
              {(expandedNote.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 px-4 pb-2 shrink-0">
                  {(expandedNote.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full"
                    >
                      <Hash className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mx-4 border-t border-slate-200/60 shrink-0" />

              {/* Content scroll */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {expandedNote.content ? (
                  <p className="text-[13px] text-[hsl(var(--foreground))] whitespace-pre-wrap leading-relaxed">
                    {expandedNote.content}
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground italic">
                    {t.notes_no_content}
                  </p>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/60 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {expandedNote.content
                    ? `${wordCount(expandedNote.content)} ${t.notes_words} · ${expandedNote.content.length} ${t.notes_chars}`
                    : t.notes_empty_label}
                </span>
                <div className="flex items-center gap-2">
                  {expandedNote.content.trim() && (
                    <button
                      onClick={() =>
                        handleRapihkan(expandedNote.id, expandedNote.content)
                      }
                      disabled={formatting === expandedNote.id}
                      className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-600 font-medium transition-colors"
                    >
                      <Sparkles
                        className={cn(
                          "h-3.5 w-3.5",
                          formatting === expandedNote.id && "animate-pulse"
                        )}
                      />
                      {t.notes_clean}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      deleteNote(expandedNote.id);
                      setExpandedNote(null);
                    }}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.btn_delete}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
