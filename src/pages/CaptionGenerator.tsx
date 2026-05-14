import { useState, useRef, useCallback } from "react";
import {
  Sparkles, Copy, Check, RefreshCw, Wand2, AlignLeft, ScanText,
  ChevronDown, X, Share2, Loader2, Trash2, Clock, ArrowRight,
  CheckCheck, FileText, ImagePlus, MessageCircle, Megaphone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  generateCaptionFromContext,
  generateCaptionFromPoster,
} from "@/lib/ai/openrouter";

/* ──────────────────────────── Constants ────────────────────────────────── */

type Mode = "manual" | "poster";

const TONES = [
  { key: "santai",    label: "Santai",       emoji: "😊", desc: "Friendly, casual, akrab" },
  { key: "formal",    label: "Formal",       emoji: "👔", desc: "Profesional & terpercaya" },
  { key: "hardsell",  label: "Hard Selling", emoji: "🔥", desc: "FOMO, urgent, ajak action" },
  { key: "story",     label: "Storytelling", emoji: "📖", desc: "Emosional, cerita perjalanan" },
  { key: "penasaran", label: "Penawaran",    emoji: "💡", desc: "Teaser & penawaran menarik" },
];

const THREE_TONES = ["santai", "formal", "hardsell"] as const;
const TONE_LABELS: Record<string, string> = {
  santai: "Santai", formal: "Formal", hardsell: "Hard Selling",
};

const PLATFORMS = [
  { key: "wa",       label: "WhatsApp",  color: "#25D366", bg: "#dcfce7" },
  { key: "ig",       label: "Instagram", color: "#E1306C", bg: "#fce7f3" },
  { key: "telegram", label: "Telegram",  color: "#0088cc", bg: "#e0f2fe" },
];

const LENGTHS = [
  { key: "short",  label: "Pendek",  sub: "~300 karakter" },
  { key: "normal", label: "Normal",  sub: "~700 karakter" },
  { key: "long",   label: "Panjang", sub: "~1200 karakter" },
];

const AUDIENCES = [
  "Jamaah Umrah & Haji",
  "Mahasiswa Masisir",
  "Wisatawan ke Mesir",
  "Agen / Reseller",
  "WNI di Luar Negeri",
];

const QUICK_EXAMPLES = [
  { label: "Promo Tiket",      text: "Promo tiket Cairo–Jakarta bulan Juni transit Bahrain. Harga mulai 9 juta, bagasi 30kg, seat terbatas 12 orang." },
  { label: "Umrah Ramadan",    text: "Broadcast follow up jamaah yang belum pelunasan paket Umrah Ramadan. Keberangkatan 3 bulan lagi." },
  { label: "Visa Pelajar",     text: "Info persyaratan visa pelajar Mesir untuk mahasiswa baru Universitas Al-Azhar. Proses 2 minggu." },
  { label: "Paket Wisata",     text: "Paket wisata Cairo 7 hari 6 malam termasuk hotel bintang 4, guide, dan city tour lengkap." },
  { label: "Follow Up Jamaah", text: "Follow up jamaah Umrah yang masih belum konfirmasi keberangkatan bulan depan." },
  { label: "Flash Sale",       text: "Flash sale tiket Jeddah–Jakarta 24 jam saja. Harga spesial terbatas 5 kursi." },
];

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  wa: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  ),
  ig: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="url(#ig-grad)">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFDC80" />
          <stop offset="25%" stopColor="#F77737" />
          <stop offset="50%" stopColor="#C13584" />
          <stop offset="100%" stopColor="#833AB4" />
        </linearGradient>
      </defs>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#0088cc">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  ),
};

/* ──────────────────────────── Types ────────────────────────────────────── */

interface CaptionResult {
  tone: string;
  text: string;
  copied: boolean;
}

interface HistoryItem {
  id: string;
  snippet: string;
  fullText: string;
  platform: string;
  tone: string;
  createdAt: string;
}

/* ──────────────────────────── Helpers ──────────────────────────────────── */

const HISTORY_KEY = "temantiket.caption.history.v2";

function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); }
  catch { return []; }
}

function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 60))); }
  catch { /* silent */ }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

/* ──────────────────────────── WA Markdown ──────────────────────────────── */

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  let last = 0; let match; let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith("*") && raw.endsWith("*"))
      parts.push(<strong key={key++} className="font-bold">{raw.slice(1, -1)}</strong>);
    else if (raw.startsWith("_") && raw.endsWith("_"))
      parts.push(<em key={key++} className="italic">{raw.slice(1, -1)}</em>);
    else if (raw.startsWith("~") && raw.endsWith("~"))
      parts.push(<s key={key++} className="line-through opacity-60">{raw.slice(1, -1)}</s>);
    else if (raw.startsWith("`") && raw.endsWith("`"))
      parts.push(<code key={key++} className="bg-slate-100 text-blue-700 px-1 rounded text-[12px] font-mono">{raw.slice(1, -1)}</code>);
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function WAMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;
  for (const line of lines) {
    const bullet = line.match(/^[-•✅✔️🔸🔹➡️→►]\s(.*)$/);
    const numbered = line.match(/^(\d+)[.)]\s(.*)$/);
    if (numbered) {
      nodes.push(
        <div key={key++} className="flex gap-2">
          <span className="text-[12px] font-bold text-slate-500 shrink-0 tabular-nums">{numbered[1]}.</span>
          <span className="text-[12px] leading-relaxed">{parseInline(numbered[2])}</span>
        </div>
      );
    } else if (bullet) {
      nodes.push(
        <div key={key++} className="flex gap-2">
          <span className="text-slate-400 shrink-0 mt-0.5 text-[11px]">•</span>
          <span className="text-[12px] leading-relaxed">{parseInline(bullet[1])}</span>
        </div>
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-1.5" />);
    } else {
      nodes.push(<div key={key++} className="text-[12px] leading-relaxed">{parseInline(line)}</div>);
    }
  }
  return <div className="text-slate-700 space-y-0.5">{nodes}</div>;
}

/* ──────────────────────────── Image helpers ─────────────────────────────── */

function compressImage(file: File, maxWidth = 900, quality = 0.80): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal memuat gambar")); };
    img.src = url;
  });
}

/* ──────────────────────────── Tone badge ───────────────────────────────── */

const TONE_BADGE_COLORS: Record<string, string> = {
  santai:   "bg-sky-50 text-sky-700 border-sky-200",
  formal:   "bg-violet-50 text-violet-700 border-violet-200",
  hardsell: "bg-orange-50 text-orange-700 border-orange-200",
};

/* ══════════════════════════ Main Component ══════════════════════════════════ */

export default function CaptionGenerator() {
  // ── Mode ──
  const [mode, setMode] = useState<Mode>("manual");

  // ── Input state ──
  const [userContext, setUserContext] = useState("");
  const [platform, setPlatform]       = useState("wa");
  const [captionLength, setLength]    = useState("normal");
  const [activeTone, setActiveTone]   = useState("santai");
  const [useEmoji, setUseEmoji]       = useState(true);
  const [audience, setAudience]       = useState("");
  const [waNumber, setWaNumber]       = useState("");

  // ── Poster mode ──
  const [posterFile, setPosterFile]         = useState<File | null>(null);
  const [posterPreview, setPosterPreview]   = useState<string | null>(null);
  const [isDragging, setIsDragging]         = useState(false);
  const [posterStatus, setPosterStatus]     = useState<string | null>(null);
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  // ── Results ──
  const [results, setResults]         = useState<CaptionResult[]>([]);
  const [loading, setLoading]         = useState(false);

  // ── History ──
  const [history, setHistory]         = useState<HistoryItem[]>(loadHistory);

  // ── File handling ──
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("File harus berupa gambar (JPG, PNG, WebP)"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Gambar maks 5 MB"); return; }
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
    setResults([]);
  }, []);

  const clearPoster = () => {
    setPosterFile(null);
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    setPosterPreview(null);
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Copy caption ──
  const handleCopy = async (idx: number) => {
    const item = results[idx];
    if (!item) return;
    await navigator.clipboard.writeText(item.text);
    setResults((prev) => prev.map((r, i) => ({ ...r, copied: i === idx ? true : r.copied })));
    toast.success("Caption disalin!");
    setTimeout(() => setResults((prev) => prev.map((r, i) => ({ ...r, copied: i === idx ? false : r.copied }))), 2000);
  };

  // ── Use caption (copy + show toast) ──
  const handleUse = async (idx: number) => {
    await handleCopy(idx);
    toast.success("Caption siap dipakai! Tempel ke WhatsApp / Instagram kamu.");
  };

  // ── Append to history ──
  const appendHistory = (texts: CaptionResult[], plt: string) => {
    const newItems: HistoryItem[] = texts.map((r) => ({
      id: `${Date.now()}-${r.tone}`,
      snippet: r.text.replace(/[*_~`]/g, "").slice(0, 80) + "…",
      fullText: r.text,
      platform: plt,
      tone: r.tone,
      createdAt: new Date().toISOString(),
    }));
    const updated = [...newItems, ...history].slice(0, 60);
    setHistory(updated);
    saveHistory(updated);
  };

  // ── Generate ──
  const handleGenerate = async () => {
    if (mode === "poster" && !posterFile) { toast.error("Upload poster dulu ya!"); return; }
    if (mode === "manual" && !userContext.trim()) { toast.error("Isi konteks promo dulu ya!"); return; }

    setLoading(true);
    setResults([]);
    setPosterStatus(null);

    try {
      if (mode === "poster") {
        const dataUrl = await compressImage(posterFile!);
        const { caption } = await generateCaptionFromPoster({
          imageBase64: dataUrl, tone: activeTone, waNumber, onStatus: setPosterStatus,
        });
        const r: CaptionResult[] = [{ tone: activeTone, text: caption, copied: false }];
        setResults(r);
        appendHistory(r, platform);
      } else {
        // Generate 3 variants in parallel (santai, formal, hardsell)
        const [r1, r2, r3] = await Promise.all(
          THREE_TONES.map((tone) =>
            generateCaptionFromContext({ userContext, tone, platform, captionLength, useEmoji, audience, waNumber })
              .then(({ caption }) => ({ tone, text: caption, copied: false } as CaptionResult))
              .catch(() => ({ tone, text: `Gagal generate caption gaya ${TONE_LABELS[tone]}.`, copied: false } as CaptionResult))
          )
        );
        const r = [r1, r2, r3];
        setResults(r);
        appendHistory(r, platform);
        toast.success("3 variasi caption berhasil dibuat!");
      }
    } catch (err) {
      toast.error(`Gagal generate: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
      setPosterStatus(null);
    }
  };

  // ── Clear history ──
  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    toast.success("Riwayat caption dihapus");
  };

  const canGenerate = mode === "poster" ? !!posterFile && !loading : !loading;

  /* ── JSX ── */
  return (
    <div className="hidden md:block min-h-screen bg-[#f1f5f9]">

      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#6366f1,#2563eb)" }}>
              <Megaphone className="h-6 w-6 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-[26px] font-black text-slate-900 leading-tight tracking-tight">Caption Generator</h1>
              <p className="text-[13px] text-slate-500">Buat caption promosi yang menarik dengan bantuan AI ✨</p>
            </div>
          </div>
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white border border-slate-200 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Tips membuat caption
          </button>
        </div>
      </div>

      {/* ── 4-column body ── */}
      <div className="px-6 pb-8 flex gap-4 items-start">

        {/* ── COL 1: Input context ── */}
        <div className="w-[272px] shrink-0 flex flex-col gap-0 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {/* Mode tabs */}
          <div className="flex border-b border-slate-100">
            {(["manual", "poster"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResults([]); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-3 text-[12.5px] font-semibold transition-colors",
                  mode === m
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/40"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
                )}
              >
                {m === "manual" ? <><AlignLeft className="h-3.5 w-3.5" /> Input Konten</> : <><ScanText className="h-3.5 w-3.5" /> Scan Poster</>}
              </button>
            ))}
          </div>

          {/* Content area */}
          <AnimatePresence mode="wait">
            {mode === "manual" ? (
              <motion.div key="manual"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-4 flex-1"
              >
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Ceritakan konteks promosi / kebutuhan caption
                </p>
                {/* Context display — show bullet points from the text */}
                <div className="min-h-[160px] rounded-xl border border-slate-200 bg-slate-50/60 p-3 mb-2 relative">
                  {userContext ? (
                    <div className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {userContext.split("\n").filter(l => l.trim()).map((line, i) => (
                        <div key={i} className="flex gap-2 mb-1">
                          <span className="text-blue-400 shrink-0">•</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11.5px] text-slate-300 leading-relaxed">
                      <div className="flex gap-2 mb-1"><span className="text-slate-200">•</span><span>Promo tiket Cairo–Jakarta bulan Juni transit Bahrain.</span></div>
                      <div className="flex gap-2 mb-1"><span className="text-slate-200">•</span><span>Harga mulai 9 juta, bagasi 30kg, seat terbatas 12 orang.</span></div>
                      <div className="flex gap-2 mb-1"><span className="text-slate-200 mt-2 block">•</span><span className="block mt-2">Broadcast follow up jamaah yang belum pelunasan paket Umrah Ramadan. Keberangkatan 3 bulan lagi.</span></div>
                    </div>
                  )}
                </div>
                <textarea
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  maxLength={1000}
                  placeholder="Ceritakan konteks promosi / produk / tujuan broadcast..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] text-slate-700 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10.5px] text-slate-400">{userContext.length} / 1000</span>
                  {userContext && (
                    <button onClick={() => setUserContext("")} className="text-[10.5px] text-red-400 hover:text-red-500 transition-colors">Hapus</button>
                  )}
                </div>

                {/* Quick examples */}
                <div className="mt-3">
                  <p className="text-[10.5px] text-slate-400 mb-2">Contoh cepat:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => setUserContext(ex.text)}
                        className="text-[10.5px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition-colors"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="poster"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-4"
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {!posterPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-all select-none",
                      isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30",
                    )}
                  >
                    <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                      <ImagePlus className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-semibold text-slate-600">{isDragging ? "Lepas di sini" : "Upload poster paket"}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">JPG, PNG, WebP maks 5 MB</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200">
                    <img src={posterPreview} alt="Poster" className="w-full max-h-60 object-contain bg-slate-50" />
                    <button onClick={clearPoster} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-2.5">AI membaca teks dari poster lalu buat caption siap pakai.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── COL 2: Settings ── */}
        <div className="w-[268px] shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-blue-500" strokeWidth={1.8} />
              Pengaturan Caption
            </h3>
          </div>

          <div className="p-4 space-y-4">
            {/* Platform */}
            <div>
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Platform</p>
              <div className="flex gap-2">
                {PLATFORMS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPlatform(key)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-semibold transition-all",
                      platform === key
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-slate-50",
                    )}
                  >
                    {PLATFORM_ICONS[key]}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Length */}
            <div>
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Panjang Caption</p>
              <div className="flex gap-1.5">
                {LENGTHS.map(({ key, label, sub }) => (
                  <button
                    key={key}
                    onClick={() => setLength(key)}
                    className={cn(
                      "flex-1 flex flex-col items-start px-2.5 py-2 rounded-xl border transition-all text-left",
                      captionLength === key
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-slate-200 bg-white hover:border-blue-200",
                    )}
                  >
                    <span className={cn("text-[12px] font-semibold", captionLength === key ? "text-white" : "text-slate-700")}>{label}</span>
                    <span className={cn("text-[9.5px]", captionLength === key ? "text-white/70" : "text-slate-400")}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Gaya penulisan */}
            <div>
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Gaya Penulisan</p>
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                {TONES.slice(0, 3).map(({ key, label, emoji, desc }) => {
                  const active = activeTone === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveTone(key)}
                      className={cn(
                        "flex flex-col items-start px-2.5 py-2 rounded-xl border text-left transition-all",
                        active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white hover:border-blue-200",
                      )}
                    >
                      <span className="text-[14px] mb-0.5">{emoji}</span>
                      <span className={cn("text-[11px] font-semibold leading-none", active ? "text-white" : "text-slate-700")}>{label}</span>
                      <span className={cn("text-[9px] mt-0.5 leading-snug", active ? "text-white/70" : "text-slate-400")}>{desc}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {TONES.slice(3).map(({ key, label, emoji, desc }) => {
                  const active = activeTone === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveTone(key)}
                      className={cn(
                        "flex flex-col items-start px-2.5 py-2 rounded-xl border text-left transition-all",
                        active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white hover:border-blue-200",
                      )}
                    >
                      <span className="text-[14px] mb-0.5">{emoji}</span>
                      <span className={cn("text-[11px] font-semibold leading-none", active ? "text-white" : "text-slate-700")}>{label}</span>
                      <span className={cn("text-[9px] mt-0.5 leading-snug", active ? "text-white/70" : "text-slate-400")}>{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Emoji */}
            <div>
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Emoji</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUseEmoji(true)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[12px] font-semibold transition-all",
                    useEmoji ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200",
                  )}
                >
                  Pakai Emoji 😊
                </button>
                <button
                  onClick={() => setUseEmoji(false)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[12px] font-semibold transition-all",
                    !useEmoji ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200",
                  )}
                >
                  Tanpa Emoji
                </button>
              </div>
            </div>

            {/* Target Audiens */}
            <div>
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Target Audiens</p>
              <div className="relative">
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 cursor-pointer"
                >
                  <option value="">Auto-detect dari konteks</option>
                  {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {/* WA Number */}
            <div>
              <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Nomor WhatsApp Temantiket <span className="normal-case font-normal text-slate-400">(Opsional)</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-[11.5px] text-slate-500 font-medium select-none">
                  wa.me/
                </span>
                <input
                  type="tel"
                  value={waNumber}
                  onChange={(e) => setWaNumber(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="628xxxxxxxxxx"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[12px] text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Jika diisi, link WA otomatis ditambahkan di akhir caption.
              </p>
            </div>

            {/* Generate Button */}
            <button
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className={cn(
                "w-full flex items-center justify-center gap-2 h-11 rounded-xl text-white text-[13px] font-bold transition-all shadow-md hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
              )}
              style={{ background: "linear-gradient(135deg,#4f46e5,#2563eb)" }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "poster" ? (posterStatus ?? "Memproses...") : "AI sedang nulis caption…"}
                </>
              ) : results.length > 0 ? (
                <><RefreshCw className="h-4 w-4" /> Regenerate Caption</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate Caption</>
              )}
            </button>

            {/* Poster 2-step status */}
            <AnimatePresence>
              {mode === "poster" && loading && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2"
                >
                  <div className={cn("flex items-center gap-1 text-[11px] font-medium", posterStatus === "Menyusun caption..." ? "text-emerald-600" : "text-blue-600")}>
                    {posterStatus === "Menyusun caption..." ? <CheckCheck className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                    Membaca poster
                  </div>
                  <ArrowRight className="h-3 w-3 text-slate-300" />
                  <div className={cn("flex items-center gap-1 text-[11px] font-medium", posterStatus === "Menyusun caption..." ? "text-blue-600" : "text-slate-300")}>
                    {posterStatus === "Menyusun caption..." && <Loader2 className="h-3 w-3 animate-spin" />}
                    Menyusun caption
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-center text-[10.5px] text-slate-400">
              AI akan membuat beberapa variasi caption untuk Anda pilih
            </p>
          </div>
        </div>

        {/* ── COL 3: Results ── */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Results header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-extrabold text-slate-800">Hasil Caption</h3>
              {results.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                  {results.length} variasi dihasilkan
                </span>
              )}
            </div>
            {results.length > 0 && (
              <button
                onClick={() => void handleGenerate()}
                disabled={loading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Regenerate
              </button>
            )}
          </div>

          {/* Results body */}
          <div className="p-4 space-y-3 min-h-[400px]">
            {loading ? (
              // Loading skeletons — 3 cards
              [1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4 animate-pulse">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-5 w-5 bg-slate-200 rounded-full" />
                    <div className="h-4 w-16 bg-slate-200 rounded" />
                  </div>
                  {[70, 100, 90, 80, 60].map((w, j) => (
                    <div key={j} className="h-2.5 bg-slate-200 rounded mb-1.5" style={{ width: `${w}%` }} />
                  ))}
                  <div className="flex gap-2 mt-4">
                    <div className="h-8 w-8 bg-slate-200 rounded-lg" />
                    <div className="h-8 w-8 bg-slate-200 rounded-lg" />
                    <div className="flex-1 h-8 bg-slate-200 rounded-lg" />
                  </div>
                </div>
              ))
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4 bg-slate-50 border border-slate-200">
                  <Sparkles className="h-7 w-7 text-slate-300" strokeWidth={1.5} />
                </div>
                <p className="text-[14px] font-semibold text-slate-500">Caption akan muncul di sini</p>
                <p className="text-[12px] text-slate-400 mt-1 max-w-[280px]">
                  Isi konteks di panel kiri, atur preferensi, lalu klik Generate Caption.
                </p>
              </div>
            ) : (
              results.map((item, idx) => (
                <motion.div
                  key={`${item.tone}-${idx}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-blue-200 hover:shadow-sm transition-all"
                >
                  {/* Card header */}
                  <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-slate-100">
                    <span className="h-5 w-5 flex items-center justify-center rounded-full bg-slate-800 text-white text-[10px] font-black">
                      {idx + 1}
                    </span>
                    <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded-full border", TONE_BADGE_COLORS[item.tone] ?? "bg-slate-50 text-slate-600 border-slate-200")}>
                      {TONE_LABELS[item.tone] ?? item.tone}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => void handleCopy(idx)}
                      className={cn(
                        "h-7 w-7 flex items-center justify-center rounded-lg border transition-colors",
                        item.copied
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600",
                      )}
                    >
                      {item.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => toast.info("Fitur share segera hadir")}
                      className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Caption text */}
                  <div className="px-4 py-3">
                    <WAMarkdown text={item.text} />
                  </div>

                  {/* Card footer */}
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => void handleUse(idx)}
                      className="w-full h-9 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-[12.5px] font-bold hover:bg-blue-100 transition-colors"
                    >
                      Gunakan Caption
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* ── COL 4: History ── */}
        <div className="w-[220px] shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <h3 className="text-[13px] font-extrabold text-slate-800">Riwayat</h3>
            <button className="text-[11px] text-blue-600 font-semibold hover:text-blue-700">Lihat semua</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Clock className="h-8 w-8 text-slate-200 mb-2" strokeWidth={1.5} />
                <p className="text-[11.5px] text-slate-400">Belum ada riwayat caption</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map((item) => {
                  const plt = PLATFORMS.find((p) => p.key === item.platform);
                  return (
                    <div
                      key={item.id}
                      className="px-3 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => {
                        void navigator.clipboard.writeText(item.fullText);
                        toast.success("Caption dari riwayat disalin!");
                      }}
                      title="Klik untuk salin caption"
                    >
                      <div className="flex items-start gap-2">
                        {/* Platform icon */}
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: plt?.bg ?? "#f1f5f9" }}>
                          {PLATFORM_ICONS[item.platform] ?? <MessageCircle className="h-4 w-4 text-slate-400" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11.5px] font-bold text-slate-700 truncate">
                            {item.platform === "wa" ? "WhatsApp" : item.platform === "ig" ? "Instagram" : "Telegram"}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9.5px] font-semibold text-slate-400">
                              {plt?.label ?? item.platform}
                            </span>
                            <span className="text-slate-200">·</span>
                            <span className="text-[9.5px] font-medium text-slate-400">
                              {TONE_LABELS[item.tone] ?? item.tone}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {item.snippet}
                          </p>
                          <p className="text-[9px] text-slate-300 mt-1">{fmtDate(item.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div className="shrink-0 px-3 py-3 border-t border-slate-100">
              <button
                onClick={clearHistory}
                className="w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border border-red-200 text-[11.5px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Semua Riwayat
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Mobile fallback ── */}
      <div className="md:hidden flex flex-col items-center justify-center min-h-screen p-8 text-center bg-[#f1f5f9]">
        <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg,#6366f1,#2563eb)" }}>
          <Megaphone className="h-7 w-7 text-white" strokeWidth={1.8} />
        </div>
        <h2 className="text-[18px] font-black text-slate-800 mb-2">Caption Generator</h2>
        <p className="text-[13px] text-slate-500 max-w-[260px]">
          Fitur ini dioptimalkan untuk layar desktop. Gunakan perangkat dengan layar lebih lebar untuk pengalaman terbaik.
        </p>
      </div>
    </div>
  );
}
