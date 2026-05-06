import { useState, useRef, useCallback } from "react";
import {
  Wand2, Copy, CheckCheck, Loader2, RefreshCw, FileText,
  Plane, BookOpen, Megaphone, Moon, Sparkles, AlignLeft,
  ImagePlus, X, ScanText, PenLine, MessageCircle, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { generateCaptionFromDetail, generateCaptionFromPoster, type TokenUsage } from "@/lib/ai/openrouter";
import { AIModelToggle } from "@/components/AIModelToggle";

/* ─── Mode ──────────────────────────────────────────────── */
type Mode = "manual" | "poster";

/* ─── Kategori ─────────────────────────────────────────── */
const CATEGORIES = [
  { key: "umrah",   label: "Promo Umrah",   Icon: Moon,       prompt: "paket umrah hemat" },
  { key: "haji",    label: "Paket Haji",    Icon: Sparkles,   prompt: "paket haji plus / furoda" },
  { key: "flight",  label: "Tiket Pesawat", Icon: Plane,      prompt: "tiket pesawat murah" },
  { key: "visa",    label: "Layanan Visa",  Icon: BookOpen,   prompt: "layanan visa cepat" },
  { key: "general", label: "Promo Umum",    Icon: Megaphone,  prompt: "layanan travel umrah & haji" },
];

/* ─── Tone ──────────────────────────────────────────────── */
const TONES = [
  { key: "santai",   label: "Santai",       desc: "Friendly, casual, akrab"      },
  { key: "formal",   label: "Formal",       desc: "Profesional & terpercaya"     },
  { key: "hardsell", label: "Hard Selling", desc: "FOMO, urgent, ajak action"    },
  { key: "story",    label: "Storytelling", desc: "Emosional, cerita perjalanan" },
];

/* ─── Helpers ───────────────────────────────────────────── */
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
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Gagal memuat gambar")); };
    img.src = objectUrl;
  });
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
  const [mode, setMode]                     = useState<Mode>("manual");
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const [activeTone, setActiveTone]         = useState(TONES[0].key);
  const [packageDetail, setPackageDetail]   = useState("");
  const [waNumber, setWaNumber]             = useState("");
  const [posterFile, setPosterFile]         = useState<File | null>(null);
  const [posterPreview, setPosterPreview]   = useState<string | null>(null);
  const [isDragging, setIsDragging]         = useState(false);
  const [result, setResult]                 = useState<string>("");
  const [lastUsage, setLastUsage]           = useState<TokenUsage | null>(null);
  const [loading, setLoading]               = useState(false);
  const [copied, setCopied]                 = useState(false);
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  const cat = CATEGORIES.find((c) => c.key === activeCategory) ?? CATEGORIES[0];

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar (JPG, PNG, WebP, dll)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5 MB sebelum dikompresi");
      return;
    }
    setPosterFile(file);
    const url = URL.createObjectURL(file);
    setPosterPreview(url);
    setResult("");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const clearPoster = () => {
    setPosterFile(null);
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    setPosterPreview(null);
    setResult("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setResult("");
  };

  const handleGenerate = async () => {
    setLoading(true);
    setResult("");
    setLastUsage(null);
    try {
      if (mode === "poster") {
        if (!posterFile) { toast.error("Upload poster dulu ya!"); return; }
        const dataUrl = await compressImage(posterFile);
        const { caption, usage } = await generateCaptionFromPoster({
          imageBase64: dataUrl,
          tone: activeTone,
          waNumber,
        });
        setResult(caption);
        setLastUsage(usage);
      } else {
        const { caption, usage } = await generateCaptionFromDetail({
          categoryPrompt: cat.prompt,
          tone: activeTone,
          packageDetail,
          waNumber,
        });
        setResult(caption);
        setLastUsage(usage);
      }
    } catch (err) {
      toast.error(`Gagal generate: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Caption disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = mode === "poster" ? !!posterFile && !loading : !loading;

  const charLen = result.length;
  const charInRange = charLen >= 600 && charLen <= 1000;
  const charTooShort = charLen > 0 && charLen < 600;
  const charColor = charInRange
    ? "text-emerald-600"
    : charTooShort
    ? "text-amber-500"
    : charLen > 1000
    ? "text-rose-500"
    : "text-muted-foreground";

  return (
    <div className="space-y-3 pb-10">

      {/* ── Mode Toggle ── */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-xl border border-border/60">
        <button
          onClick={() => switchMode("manual")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all",
            mode === "manual"
              ? "bg-white shadow-sm text-foreground border border-border/60"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <PenLine className="h-3.5 w-3.5" strokeWidth={1.5} />
          Input Manual
        </button>
        <button
          onClick={() => switchMode("poster")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all",
            mode === "poster"
              ? "bg-white shadow-sm text-foreground border border-border/60"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ScanText className="h-3.5 w-3.5" strokeWidth={1.5} />
          Scan Poster
        </button>
      </div>

      <AnimatePresence mode="wait">

        {/* ══ MANUAL MODE ══════════════════════════════════════ */}
        {mode === "manual" && (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* Kategori */}
            <Section label="Kategori" icon={Wand2}>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {CATEGORIES.map(({ key, label, Icon }) => {
                  const isActive = key === activeCategory;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(key)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border py-3.5 px-2 transition-all text-center",
                        isActive
                          ? "border-[#1a44d4] bg-[#1a44d4] text-white shadow-sm"
                          : "border-border/70 bg-white text-foreground hover:border-[#1a44d4]/40 hover:bg-blue-50/40",
                      )}
                    >
                      <Icon className={cn("h-5 w-5", isActive ? "text-white" : "text-muted-foreground")} strokeWidth={1.5} />
                      <span className={cn("text-[11px] font-medium leading-tight", isActive ? "text-white" : "text-foreground")}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Detail Paket */}
            <Section label="Detail Paket (opsional)" icon={AlignLeft}>
              <textarea
                value={packageDetail}
                onChange={(e) => setPackageDetail(e.target.value)}
                placeholder={
                  "Contoh:\nPaket Umrah 12 hari, berangkat 15 Maret 2025\n" +
                  "Hotel bintang 4, Makkah & Madinah walking distance\n" +
                  "Harga mulai Rp 28 juta/orang, kuota terbatas 40 seat"
                }
                rows={4}
                className="w-full rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-3 text-[13px] text-foreground placeholder-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a44d4]/40 focus:border-[#1a44d4]/50 transition-all"
              />
              <p className="text-[10.5px] text-muted-foreground mt-1.5">
                Semakin detail info paket, semakin relevan caption yang dihasilkan AI.
              </p>
            </Section>
          </motion.div>
        )}

        {/* ══ POSTER MODE ══════════════════════════════════════ */}
        {mode === "poster" && (
          <motion.div
            key="poster"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Section label="Upload Poster Paket" icon={ImagePlus}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
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
                    isDragging
                      ? "border-[#1a44d4] bg-blue-50/60"
                      : "border-border/60 bg-gray-50/50 hover:border-[#1a44d4]/50 hover:bg-blue-50/30",
                  )}
                >
                  <div className="h-11 w-11 rounded-xl border border-border/60 bg-white flex items-center justify-center shadow-sm">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-foreground">
                      {isDragging ? "Lepaskan gambar di sini" : "Upload poster paket"}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">
                      Drag & drop atau klik untuk pilih — JPG, PNG, WebP (maks. 5 MB)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-border/60 bg-gray-50">
                  <img
                    src={posterPreview}
                    alt="Poster preview"
                    className="w-full max-h-72 object-contain"
                  />
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

              <p className="text-[10.5px] text-muted-foreground mt-2">
                AI akan membaca teks & info dari poster lalu langsung bikin caption siap pakai.
              </p>
            </Section>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Tone (shared) ── */}
      <Section label="Gaya Penulisan" icon={FileText}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TONES.map(({ key, label, desc }) => {
            const isActive = key === activeTone;
            return (
              <button
                key={key}
                onClick={() => setActiveTone(key)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "border-[#1a44d4] bg-[#1a44d4] text-white"
                    : "border-border/70 bg-white hover:border-[#1a44d4]/40 hover:bg-blue-50/40",
                )}
              >
                <div className={cn("text-[12.5px] font-semibold", isActive ? "text-white" : "text-foreground")}>
                  {label}
                </div>
                <div className={cn("text-[10.5px] mt-0.5 leading-snug", isActive ? "text-white/75" : "text-muted-foreground")}>
                  {desc}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Nomor WhatsApp ── */}
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
            className="flex-1 rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-2.5 text-[13px] text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#1a44d4]/40 focus:border-[#1a44d4]/50 transition-all"
          />
        </div>
        {waNumber.trim() ? (
          <p className="text-[10.5px] text-[#1a44d4] mt-1.5">
            Akan ditambahkan: 📲 Hubungi kami via WA: wa.me/{waNumber.trim()}
          </p>
        ) : (
          <p className="text-[10.5px] text-muted-foreground mt-1.5">
            Opsional — jika diisi, link WA otomatis ditambahkan di akhir caption.
          </p>
        )}
      </Section>

      {/* ── AI Model Toggle (manual mode only) ── */}
      {mode === "manual" && (
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] text-muted-foreground">Model AI untuk generate caption</span>
          <AIModelToggle feature="caption" />
        </div>
      )}

      {/* ── Poster scan model info ── */}
      {mode === "poster" && (
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] text-muted-foreground">Model AI untuk scan poster</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Gemini 2.5 Flash
            <span className="rounded bg-emerald-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide leading-none text-emerald-700">
              OCR Hemat
            </span>
          </span>
        </div>
      )}

      {/* ── Generate Button ── */}
      <Button
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="w-full h-11 text-[13.5px] font-semibold bg-[#1a44d4] text-white hover:bg-[#1535b0] transition-all rounded-xl disabled:opacity-50"
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.span key="loading" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "poster" ? "AI sedang baca poster…" : "AI sedang nulis caption…"}
            </motion.span>
          ) : result ? (
            <motion.span key="regen" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              Generate Ulang
            </motion.span>
          ) : (
            <motion.span key="idle" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {mode === "poster"
                ? <><ScanText className="h-4 w-4" strokeWidth={1.5} /> Scan & Generate Caption</>
                : <><Wand2 className="h-4 w-4" strokeWidth={1.5} /> Generate Caption</>
              }
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* ── Result ── */}
      <AnimatePresence>
        {loading && (
          <motion.div key="skeleton"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl border border-border/70 bg-white p-4 animate-pulse space-y-2.5"
          >
            <div className="h-2.5 bg-muted rounded w-1/4" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-5/6" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-4/6" />
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-3/5" />
          </motion.div>
        )}

        {!loading && result && (
          <motion.div key="result"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 py-1 mb-2">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] text-muted-foreground tracking-wide">
                Temantiket Brand Voice
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

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
                      ? "border-[#1a44d4]/30 bg-[#1a44d4] text-white"
                      : "border-border/70 text-muted-foreground hover:border-[#1a44d4]/40 hover:text-[#1a44d4]",
                  )}
                >
                  {copied
                    ? <><CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Disalin</>
                    : <><Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Salin Caption</>
                  }
                </button>
              </div>
              <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                {result}
              </p>
            </div>

            {/* ── Token usage indicator ── */}
            {lastUsage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/50 bg-slate-50/80 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 font-medium">
                  <Zap className="h-3 w-3 text-amber-400 shrink-0" strokeWidth={2.5} />
                  <span className="text-slate-700 font-semibold">
                    {lastUsage.totalTokens.toLocaleString("id-ID")}
                  </span>
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
                    ${lastUsage.estimatedCostUsd < 0.000001
                      ? "<$0.000001"
                      : lastUsage.estimatedCostUsd.toFixed(6)}
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
