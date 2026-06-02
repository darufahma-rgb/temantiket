import { useState, useRef, useCallback } from "react";
import {
  Wand2, Copy, CheckCheck, Loader2, RefreshCw, FileText,
  Sparkles, AlignLeft, ImagePlus, X, ScanText, PenLine,
  MessageCircle, ArrowRight, ChevronDown, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  generateCaptionFromContext,
  generateCaptionFromPoster,
  generateCaptionVariant,
  type TokenUsage,
  type VariantType,
} from "@/lib/ai/openrouter";
import { AIModelToggle } from "@/components/AIModelToggle";

/* ─── Types ─────────────────────────────────────────────── */
type Mode = "manual" | "poster";

/* ─── Constants ─────────────────────────────────────────── */
const TONES = [
  { key: "santai",    label: "Santai",       desc: "Friendly, casual, akrab"              },
  { key: "formal",    label: "Formal",       desc: "Profesional & terpercaya"             },
  { key: "hardsell",  label: "Hard Selling", desc: "FOMO, urgent, ajak action"            },
  { key: "story",     label: "Storytelling", desc: "Emosional, cerita perjalanan"         },
  { key: "penasaran", label: "Penasaran",    desc: "Teaser, cliffhanger, bikin penasaran" },
];

const PLATFORMS = [
  { key: "wa",       label: "WhatsApp"  },
  { key: "ig",       label: "Instagram" },
  { key: "telegram", label: "Telegram"  },
];

const LENGTHS = [
  { key: "short",  label: "Pendek",  sub: "~300 kar"  },
  { key: "normal", label: "Normal",  sub: "~700 kar"  },
  { key: "long",   label: "Panjang", sub: "~1200 kar" },
];

const AUDIENCES = [
  "Jamaah Umrah & Haji",
  "Mahasiswa Masisir",
  "Wisatawan ke Mesir",
  "Agen / Reseller",
  "WNI di Luar Negeri",
];

const VARIANT_ACTIONS: { key: VariantType; icon: string; label: string }[] = [
  { key: "softer",      icon: "💬", label: "Lebih Soft"            },
  { key: "harder",      icon: "🔥", label: "Lebih Hard Selling"    },
  { key: "shorter",     icon: "✂️", label: "Pendekkan"             },
  { key: "story_wa",    icon: "📱", label: "Versi Story WA"        },
  { key: "broadcast",   icon: "📢", label: "Versi Broadcast Admin" },
  { key: "testimonial", icon: "⭐", label: "Versi Testimoni"       },
];

const PLACEHOLDER = `Contoh:

Mahasiswa Mesir mau pulang dan bisa bantu aktifin IMEI orang lain di bandara. Fee 500rb per HP. Boleh titip HP dan aman.

Atau:

Promo tiket Cairo–Jakarta bulan Juni transit Bahrain. Harga mulai 9 juta, bagasi 30kg, seat terbatas 12 orang.

Atau:

Broadcast follow up jamaah yang belum pelunasan paket Umrah Ramadan. Keberangkatan 3 bulan lagi.`;

/* ─── History helper ────────────────────────────────────── */
const HISTORY_KEY = "temantiket.caption.history.v1";
function saveToHistory(caption: string) {
  try {
    const existing: unknown[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    const entry = { id: Date.now().toString(), caption, createdAt: new Date().toISOString() };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...existing].slice(0, 50)));
  } catch { /* silent */ }
}

/* ─── Image helpers ─────────────────────────────────────── */
function compressImage(file: File, maxWidth = 900, quality = 0.80): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Gagal memuat gambar")); };
    img.src = objectUrl;
  });
}

/* ─── WA Markdown Renderer ──────────────────────────────── */
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
    const num    = line.match(/^(\d+)\.\s(.*)$/);
    const bullet = line.match(/^[-•]\s(.*)$/);
    if (num) {
      nodes.push(
        <div key={key++} className="flex gap-2 leading-relaxed">
          <span className="font-bold text-muted-foreground shrink-0 tabular-nums text-[13px]">{num[1]}.</span>
          <span className="text-[13px]">{parseInline(num[2])}</span>
        </div>
      );
    } else if (bullet) {
      nodes.push(
        <div key={key++} className="flex gap-2 leading-relaxed">
          <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
          <span className="text-[13px]">{parseInline(bullet[1])}</span>
        </div>
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-2" />);
    } else {
      nodes.push(<div key={key++} className="text-[13px] leading-relaxed">{parseInline(line)}</div>);
    }
  }
  return <div className="text-foreground space-y-0.5">{nodes}</div>;
}

/* ─── Section wrapper ───────────────────────────────────── */
function Section({ label, icon: Icon, children }: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-white p-4 md:p-5 shadow-none">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-[13.5px] font-semibold text-foreground">{label}</h3>
      </div>
      {children}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────── */
export function CaptionGenerator() {
  const [mode, setMode]                   = useState<Mode>("manual");
  const [userContext, setUserContext]     = useState("");
  const [activeTone, setActiveTone]       = useState(TONES[0].key);
  const [platform, setPlatform]           = useState("wa");
  const [captionLength, setCaptionLength] = useState("normal");
  const [useEmoji, setUseEmoji]           = useState(true);
  const [audience, setAudience]           = useState("");
  const [waNumber, setWaNumber]           = useState("");
  const [posterFile, setPosterFile]       = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [result, setResult]               = useState<string>("");
  const [lastUsage, setLastUsage]         = useState<TokenUsage | null>(null);
  const [loading, setLoading]             = useState(false);
  const [variantLoading, setVariantLoading] = useState<VariantType | null>(null);
  const [posterStatus, setPosterStatus]   = useState<string | null>(null);
  const [copied, setCopied]               = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  /* ── File handling ── */
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("File harus berupa gambar (JPG, PNG, WebP)"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Gambar maks 5 MB sebelum kompresi"); return; }
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
    setResult("");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const clearPoster = () => {
    setPosterFile(null);
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    setPosterPreview(null); setResult("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchMode = (m: Mode) => { setMode(m); setResult(""); };

  /* ── Generate ── */
  const handleGenerate = async () => {
    setLoading(true); setResult(""); setLastUsage(null); setPosterStatus(null);
    try {
      if (mode === "poster") {
        if (!posterFile) { toast.error("Upload poster dulu ya!"); return; }
        const dataUrl = await compressImage(posterFile);
        const { caption, usage } = await generateCaptionFromPoster({
          imageBase64: dataUrl, tone: activeTone, waNumber, onStatus: setPosterStatus,
        });
        setResult(caption); setLastUsage(usage); saveToHistory(caption);
      } else {
        const { caption, usage } = await generateCaptionFromContext({
          userContext, tone: activeTone, platform, captionLength, useEmoji, audience, waNumber,
        });
        setResult(caption); setLastUsage(usage); saveToHistory(caption);
      }
    } catch (err) {
      toast.error(`Gagal generate: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false); setPosterStatus(null);
    }
  };

  /* ── Variant ── */
  const handleVariant = async (variantType: VariantType) => {
    setVariantLoading(variantType);
    try {
      const { caption, usage } = await generateCaptionVariant({
        originalContext: userContext,
        currentCaption: result,
        variantType,
        tone: activeTone,
        waNumber,
      });
      setResult(caption); setLastUsage(usage);
    } catch (err) {
      toast.error(`Gagal buat varian: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVariantLoading(null);
    }
  };

  /* ── Copy ── */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true); toast.success("Caption disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = mode === "poster" ? !!posterFile && !loading : !loading;
  const isBusy = loading || variantLoading !== null;

  const charLen = result.length;
  const charInRange = charLen >= 600 && charLen <= 1000;
  const charTooShort = charLen > 0 && charLen < 600;
  const charColor = charInRange ? "text-emerald-600" : charTooShort ? "text-amber-500" : charLen > 1000 ? "text-rose-500" : "text-muted-foreground";

  return (
    <div className="space-y-3 pb-10">

      {/* ── Mode Toggle ── */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-xl border border-border/60">
        {(["manual", "poster"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all",
              mode === m
                ? "bg-white shadow-sm text-foreground border border-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "manual"
              ? <><PenLine className="h-3.5 w-3.5" strokeWidth={1.5} /> Input Konteks</>
              : <><ScanText className="h-3.5 w-3.5" strokeWidth={1.5} /> Scan Poster</>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ══ MANUAL MODE ══ */}
        {mode === "manual" && (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* Context textarea */}
            <Section label="Ceritakan konteks promosi / kebutuhan caption" icon={AlignLeft}>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                placeholder={PLACEHOLDER}
                rows={7}
                className="w-full rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-3 text-[13px] text-foreground placeholder-muted-foreground/50 resize-y focus:outline-none focus:ring-2 focus:ring-[#0866FF]/40 focus:border-[#0866FF]/50 transition-all leading-relaxed"
              />
              <p className="text-[10.5px] text-muted-foreground mt-1.5">
                Ceritakan bebas — produk, target, tujuan, harga, promo, apapun. AI memahami konteksmu dan menyesuaikan caption secara otomatis.
              </p>
            </Section>

            {/* Caption settings */}
            <div className="rounded-xl border border-border/70 bg-white p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <h3 className="text-[13.5px] font-semibold text-foreground">Pengaturan Caption</h3>
              </div>

              {/* Platform */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Platform</p>
                <div className="flex gap-2">
                  {PLATFORMS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setPlatform(key)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-[12.5px] font-medium transition-all",
                        platform === key
                          ? "border-[#0866FF] bg-[#0866FF] text-white"
                          : "border-border/70 bg-white text-foreground hover:border-[#0866FF]/40 hover:bg-blue-50/30",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Length */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Panjang Caption</p>
                <div className="flex gap-2">
                  {LENGTHS.map(({ key, label, sub }) => (
                    <button
                      key={key}
                      onClick={() => setCaptionLength(key)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-left transition-all",
                        captionLength === key
                          ? "border-[#0866FF] bg-[#0866FF] text-white"
                          : "border-border/70 bg-white hover:border-[#0866FF]/40 hover:bg-blue-50/30",
                      )}
                    >
                      <div className={cn("text-[12.5px] font-semibold", captionLength === key ? "text-white" : "text-foreground")}>{label}</div>
                      <div className={cn("text-[10px] mt-0.5", captionLength === key ? "text-white/70" : "text-muted-foreground")}>{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji + Audience */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Emoji</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUseEmoji(true)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-[12px] font-medium transition-all",
                        useEmoji ? "border-[#0866FF] bg-[#0866FF] text-white" : "border-border/70 bg-white text-foreground hover:border-[#0866FF]/40",
                      )}
                    >
                      Pakai 😊
                    </button>
                    <button
                      onClick={() => setUseEmoji(false)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-[12px] font-medium transition-all",
                        !useEmoji ? "border-[#0866FF] bg-[#0866FF] text-white" : "border-border/70 bg-white text-foreground hover:border-[#0866FF]/40",
                      )}
                    >
                      Tanpa
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Target Audiens</p>
                  <div className="relative">
                    <select
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-border/70 bg-white px-3 py-[9px] text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-[#0866FF]/40 pr-8 cursor-pointer"
                    >
                      <option value="">Auto-detect dari konteks</option>
                      {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ POSTER MODE ══ */}
        {mode === "poster" && (
          <motion.div
            key="poster"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Section label="Upload Poster Paket" icon={ImagePlus}>
              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {!posterPreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-all select-none",
                    isDragging ? "border-[#0866FF] bg-blue-50/60" : "border-border/60 bg-gray-50/50 hover:border-[#0866FF]/50 hover:bg-blue-50/30",
                  )}
                >
                  <div className="h-11 w-11 rounded-xl border border-border/60 bg-white flex items-center justify-center shadow-sm">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-foreground">
                      {isDragging ? "Lepaskan gambar di sini" : "Upload poster paket"}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">Drag & drop atau klik untuk pilih — JPG, PNG, WebP (maks. 5 MB)</p>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-border/60 bg-gray-50">
                  <img src={posterPreview} alt="Poster preview" className="w-full max-h-72 object-contain" />
                  <button
                    onClick={clearPoster}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <div className="px-3 py-2 border-t border-border/50 bg-white">
                    <p className="text-[11.5px] text-muted-foreground truncate">
                      {posterFile?.name} · {posterFile ? (posterFile.size / 1024).toFixed(0) : 0} KB
                    </p>
                  </div>
                </div>
              )}
              <p className="text-[10.5px] text-muted-foreground mt-2">AI membaca teks & info dari poster lalu langsung bikin caption siap pakai.</p>
            </Section>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Tone (shared) ── */}
      <Section label="Gaya Penulisan" icon={FileText}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {TONES.map(({ key, label, desc }) => {
            const isActive = key === activeTone;
            return (
              <button
                key={key}
                onClick={() => setActiveTone(key)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-all",
                  isActive ? "border-[#0866FF] bg-[#0866FF] text-white" : "border-border/70 bg-white hover:border-[#0866FF]/40 hover:bg-blue-50/40",
                )}
              >
                <div className={cn("text-[12.5px] font-semibold", isActive ? "text-white" : "text-foreground")}>{label}</div>
                <div className={cn("text-[10.5px] mt-0.5 leading-snug", isActive ? "text-white/75" : "text-muted-foreground")}>{desc}</div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── WA Number (shared) ── */}
      <Section label="Nomor WhatsApp Temantiket" icon={MessageCircle}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-lg border border-border/70 bg-gray-50 px-3 py-2.5 text-[13px] text-muted-foreground font-medium select-none">
            wa.me/
          </span>
          <input
            type="tel"
            value={waNumber}
            onChange={(e) => setWaNumber(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="628xxxxxxxxxx"
            className="flex-1 rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-2.5 text-[13px] text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#0866FF]/40 focus:border-[#0866FF]/50 transition-all"
          />
        </div>
        {waNumber.trim() ? (
          <p className="text-[10.5px] text-[#0866FF] mt-1.5">Akan ditambahkan: 📲 Hubungi kami via WA: wa.me/{waNumber.trim()}</p>
        ) : (
          <p className="text-[10.5px] text-muted-foreground mt-1.5">Opsional — jika diisi, link WA otomatis ditambahkan di akhir caption.</p>
        )}
      </Section>

      {/* ── AI Model Toggle ── */}
      {mode === "manual" && (
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] text-muted-foreground">Model AI untuk generate caption</span>
          <AIModelToggle feature="caption" />
        </div>
      )}
      {mode === "poster" && (
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] text-muted-foreground">Model AI untuk scan poster</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Flash OCR → Caption AI
            <span className="rounded bg-emerald-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide leading-none">2-STEP</span>
          </span>
        </div>
      )}

      {/* ── Generate Button ── */}
      <Button
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="w-full h-11 text-[13.5px] font-semibold bg-[#0866FF] text-white hover:bg-[#1535b0] transition-all rounded-xl disabled:opacity-50"
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.span key="loading" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AnimatePresence mode="wait">
                <motion.span
                  key={posterStatus ?? (mode === "poster" ? "poster-init" : "manual")}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
                >
                  {mode === "poster" ? (posterStatus ?? "Memproses...") : "AI sedang nulis caption…"}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          ) : result ? (
            <motion.span key="regen" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Generate Ulang
            </motion.span>
          ) : (
            <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {mode === "poster"
                ? <><ScanText className="h-4 w-4" strokeWidth={1.5} /> Scan & Generate Caption</>
                : <><Wand2 className="h-4 w-4" strokeWidth={1.5} /> Generate Caption</>}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* ── 2-step poster progress ── */}
      <AnimatePresence>
        {mode === "poster" && loading && (
          <motion.div
            key="poster-steps"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
            className="flex items-center justify-center gap-2 px-2 py-0.5"
          >
            <div className={cn("flex items-center gap-1.5 text-[11.5px] font-medium transition-colors duration-300", posterStatus === "Menyusun caption..." ? "text-emerald-600" : "text-[#0866FF]")}>
              {posterStatus === "Menyusun caption..."
                ? <CheckCheck className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                : <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
              Membaca poster
            </div>
            <ArrowRight className={cn("h-3 w-3 shrink-0 transition-colors duration-300", posterStatus === "Menyusun caption..." ? "text-emerald-500" : "text-muted-foreground/30")} strokeWidth={2} />
            <div className={cn("flex items-center gap-1.5 text-[11.5px] font-medium transition-colors duration-300", posterStatus === "Menyusun caption..." ? "text-[#0866FF]" : "text-muted-foreground/40")}>
              {posterStatus === "Menyusun caption..."
                ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                : <span className="h-3 w-3 shrink-0 rounded-full border-2 border-current inline-flex" />}
              Menyusun caption
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading skeleton ── */}
      <AnimatePresence>
        {loading && (
          <motion.div key="skeleton" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl border border-border/70 bg-white p-4 animate-pulse space-y-2.5"
          >
            <div className="h-2.5 bg-muted rounded w-1/3" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-5/6" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-4/6" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-3/5" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result ── */}
      <AnimatePresence>
        {!loading && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

            <div className="flex items-center gap-2 py-1 mb-2">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] text-muted-foreground tracking-wide">Temantiket Brand Voice</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* Caption display */}
            <div className="rounded-xl border border-border/70 bg-white p-4 md:p-5 hover:border-foreground/25 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className={cn("text-[10.5px] font-medium", charColor)}>
                  {charLen} karakter
                  {charInRange && " · panjang ideal ✓"}
                  {charTooShort && " · idealnya 600+ kar"}
                  {charLen > 1000 && " · idealnya ≤1000 kar"}
                </span>
                <button
                  onClick={() => void handleCopy()}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all border shrink-0",
                    copied
                      ? "border-[#0866FF]/30 bg-[#0866FF] text-white"
                      : "border-border/70 text-muted-foreground hover:border-[#0866FF]/40 hover:text-[#0866FF]",
                  )}
                >
                  {copied
                    ? <><CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Disalin</>
                    : <><Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Salin Caption</>}
                </button>
              </div>
              <WAMarkdown text={result} />
            </div>

            {/* ── Quick variant actions ── */}
            <div className="mt-3 rounded-xl border border-border/70 bg-white p-3.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                Buat Versi Lain
              </p>
              <div className="flex flex-wrap gap-2">
                {VARIANT_ACTIONS.map(({ key, icon, label }) => (
                  <button
                    key={key}
                    onClick={() => void handleVariant(key)}
                    disabled={isBusy}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all",
                      variantLoading === key
                        ? "border-[#0866FF] bg-[#0866FF] text-white"
                        : "border-border/70 bg-white text-foreground hover:border-[#0866FF]/40 hover:bg-blue-50/40 disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                  >
                    {variantLoading === key
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <span className="text-[13px] leading-none select-none">{icon}</span>}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Token usage ── */}
            {lastUsage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/50 bg-slate-50/80 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 font-medium">
                  <Zap className="h-3 w-3 text-amber-400 shrink-0" strokeWidth={2.5} />
                  <span className="text-slate-700 font-semibold">{lastUsage.totalTokens.toLocaleString("id-ID")}</span>
                  token
                </div>
                <div className="h-3 w-px bg-slate-200 shrink-0" />
                <div className="flex items-center gap-1 text-[10.5px] text-slate-400">
                  <span className="text-slate-500">{lastUsage.promptTokens.toLocaleString("id-ID")}</span>
                  <span>in</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{lastUsage.completionTokens.toLocaleString("id-ID")}</span>
                  <span>out</span>
                </div>
                <div className="h-3 w-px bg-slate-200 shrink-0" />
                <div className="flex items-center gap-1 text-[10.5px]">
                  <span className="text-slate-400">est.</span>
                  <span className="font-semibold text-emerald-600">
                    ${lastUsage.estimatedCostUsd < 0.000001 ? "<$0.000001" : lastUsage.estimatedCostUsd.toFixed(6)}
                  </span>
                </div>
                <div className="h-3 w-px bg-slate-200 shrink-0 hidden sm:block" />
                <div className="hidden sm:block text-[10px] text-slate-400 font-mono truncate max-w-[160px]" title={lastUsage.resolvedModel}>
                  {lastUsage.resolvedModel.split("/").pop()}
                </div>
              </motion.div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export { CaptionGenerator as MarketingKitGenerator };
