import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Image as ImageIcon, Sparkles, MessageCircle, User, Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/authStore";

interface PromoTemplate {
  key: string;
  label: string;
  category: "umrah" | "flight" | "visa";
  emoji: string;
  src: string;
  accent: string;
  accentFrom: string;
  accentTo: string;
  badge: string;
  badgeColor: string;
}

const TEMPLATES: PromoTemplate[] = [
  {
    key: "umrah-hemat",
    label: "Promo Umrah Hemat",
    category: "umrah",
    emoji: "🕋",
    src: "/templates/promo/umrah-hemat.svg",
    accent: "from-sky-500 via-blue-500 to-cyan-400",
    accentFrom: "#0ea5e9",
    accentTo: "#22d3ee",
    badge: "Umrah",
    badgeColor: "bg-sky-400/30 text-sky-100",
  },
  {
    key: "tiket-pesawat",
    label: "Tiket Pesawat Termurah",
    category: "flight",
    emoji: "✈️",
    src: "/templates/promo/tiket-pesawat.svg",
    accent: "from-orange-500 via-amber-500 to-yellow-400",
    accentFrom: "#f97316",
    accentTo: "#facc15",
    badge: "Penerbangan",
    badgeColor: "bg-orange-400/30 text-orange-100",
  },
  {
    key: "visa-cepat",
    label: "Layanan Visa Cepat",
    category: "visa",
    emoji: "📔",
    src: "/templates/promo/visa-cepat.svg",
    accent: "from-emerald-600 via-teal-500 to-green-400",
    accentFrom: "#059669",
    accentTo: "#4ade80",
    badge: "Visa",
    badgeColor: "bg-emerald-400/30 text-emerald-100",
  },
];

const PNG_SIZE = 1080;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function personalize(svg: string, name: string, wa: string): string {
  const safeName = escapeXml(name.trim() || "Nama Mitra");
  const safeWa = escapeXml(wa.trim() || "08xx-xxxx-xxxx");
  return svg
    .replace(/\{\{AGENT_NAME\}\}/g, safeName)
    .replace(/\{\{AGENT_WA\}\}/g, safeWa);
}

const svgCache = new Map<string, string>();
async function loadSvgText(src: string): Promise<string> {
  if (svgCache.has(src)) return svgCache.get(src)!;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Gagal load template (${res.status})`);
  const text = await res.text();
  svgCache.set(src, text);
  return text;
}

function svgToDataUrl(svg: string): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PNG_SIZE;
      canvas.height = PNG_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context tidak tersedia")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
      ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
      canvas.toBlob(
        (blob) => { if (!blob) reject(new Error("Gagal export PNG")); else resolve(blob); },
        "image/png",
        0.95,
      );
    };
    img.onerror = () => reject(new Error("Gagal render SVG ke gambar"));
    img.src = svgToDataUrl(svg);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function MarketingKitGenerator() {
  const me = useAuthStore((s) => s.user);
  const [name, setName] = useState(me?.displayName ?? "");
  const [wa, setWa] = useState(me?.email ?? "");
  const [activeKey, setActiveKey] = useState<string>(TEMPLATES[0].key);
  const [previewSrc, setPreviewSrc] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => TEMPLATES.find((t) => t.key === activeKey) ?? TEMPLATES[0],
    [activeKey],
  );

  useEffect(() => {
    let alive = true;
    setLoadingPreview(true);
    void (async () => {
      try {
        const raw = await loadSvgText(active.src);
        if (!alive) return;
        const personalized = personalize(raw, name, wa);
        setPreviewSrc(svgToDataUrl(personalized));
      } catch (err) {
        console.warn("[MarketingKit] preview gagal:", err);
        toast.error(`Gagal load template: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (alive) setLoadingPreview(false);
      }
    })();
    return () => { alive = false; };
  }, [active.src, name, wa]);

  const handleDownload = async () => {
    if (!name.trim() || !wa.trim()) {
      toast.error("Isi dulu nama lo & nomor WA sebelum download.");
      return;
    }
    setDownloading(true);
    try {
      const raw = await loadSvgText(active.src);
      const personalized = personalize(raw, name, wa);
      const blob = await svgToPngBlob(personalized);
      const safeName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "mitra";
      downloadBlob(blob, `promo-${active.key}-${safeName}.png`);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
      toast.success("Promo lo udah ke-download!", {
        description: "Cek folder Download — siap upload ke status WA / IG / FB.",
      });
    } catch (err) {
      toast.error(`Download gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-4 pb-8">

      {/* ── Identitas Mitra ── */}
      <div className="relative rounded-2xl overflow-hidden border border-border/60 bg-white shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500" />
        <div className="p-4 md:p-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <h3 className="text-[14px] font-bold text-foreground">Identitas Mitra</h3>
          </div>
          <p className="text-[11.5px] text-muted-foreground mb-4 ml-9 leading-relaxed">
            Nama & WA lo akan ditempel otomatis di setiap template promo.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <User className="h-3 w-3" /> Nama lo
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Andi Saputra"
                className="h-9 text-[13px] border-border/70 focus:border-fuchsia-400 focus:ring-fuchsia-400/20"
                maxLength={48}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" /> Nomor WhatsApp
              </Label>
              <Input
                value={wa}
                onChange={(e) => setWa(e.target.value)}
                placeholder="Contoh: 0812-3456-7890"
                className="h-9 text-[13px] border-border/70 focus:border-fuchsia-400 focus:ring-fuchsia-400/20"
                maxLength={32}
                type="tel"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Template Chooser ── */}
      <div className="rounded-2xl border border-border/60 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <ImageIcon className="h-3.5 w-3.5 text-white" />
            </div>
            <h3 className="text-[14px] font-bold">Pilih Template</h3>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
            {TEMPLATES.length} tersedia
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map((t) => {
            const isActive = t.key === active.key;
            return (
              <motion.button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "relative rounded-xl overflow-hidden text-left transition-all",
                  "bg-gradient-to-br",
                  t.accent,
                  isActive
                    ? "ring-2 ring-offset-2 ring-fuchsia-500 shadow-lg"
                    : "opacity-85 hover:opacity-100 shadow-sm hover:shadow-md",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTemplateGlow"
                    className="absolute inset-0 bg-white/20 rounded-xl"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className="relative p-3 pb-2.5">
                  <div className="text-2xl mb-2 drop-shadow">{t.emoji}</div>
                  <span className={cn("inline-block text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full mb-1.5", t.badgeColor)}>
                    {t.badge}
                  </span>
                  <div className="text-[11px] font-bold text-white leading-tight drop-shadow-sm">
                    {t.label}
                  </div>
                </div>
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle2 className="h-4 w-4 text-white drop-shadow" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Preview + Download ── */}
      <motion.div
        layout
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0f0c29, #1a1040, #24243e)",
        }}
      >
        {/* Subtle glow blob behind preview */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(ellipse at 60% 30%, ${active.accentFrom}55 0%, transparent 60%)`,
            transition: "background 0.6s ease",
          }}
        />

        <div className="relative p-4 md:p-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400/90 mb-0.5">
                ◉ Live Preview
              </p>
              <h3 className="text-[15px] font-bold text-white">{active.label}</h3>
            </div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                onClick={() => void handleDownload()}
                disabled={downloading || loadingPreview}
                className={cn(
                  "font-semibold text-[12.5px] shadow-lg transition-all",
                  downloaded
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 shadow-fuchsia-500/30",
                )}
              >
                <AnimatePresence mode="wait">
                  {downloading ? (
                    <motion.span key="dl" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyiapkan…
                    </motion.span>
                  ) : downloaded ? (
                    <motion.span key="ok" className="flex items-center gap-1.5" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Berhasil!
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Download className="h-3.5 w-3.5" /> Download PNG
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
          </div>

          {/* Preview canvas */}
          <div
            className="relative mx-auto max-w-sm aspect-square rounded-xl overflow-hidden shadow-2xl"
            style={{
              boxShadow: `0 0 0 1px ${active.accentFrom}40, 0 25px 60px -12px ${active.accentFrom}30`,
              transition: "box-shadow 0.5s ease",
            }}
          >
            <AnimatePresence>
              {loadingPreview && (
                <motion.div
                  key="loader"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm gap-2"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" />
                  <p className="text-[11px] text-slate-400">Merender preview…</p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="w-full h-full bg-slate-900">
              {previewSrc && (
                <motion.img
                  key={previewSrc}
                  src={previewSrc}
                  alt={`Preview ${active.label}`}
                  className="w-full h-full object-contain"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  loading="lazy"
                />
              )}
            </div>
          </div>

          {/* Info row */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Format</p>
              <p className="text-[11.5px] text-slate-300 leading-snug">1080 × 1080 px PNG<br/>IG / FB / WA siap pakai</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tips</p>
              <p className="text-[11.5px] text-slate-300 leading-snug">Upload ke Status WA<br/>untuk reach maksimal</p>
            </div>
          </div>
        </div>
      </motion.div>

    </div>
  );
}
