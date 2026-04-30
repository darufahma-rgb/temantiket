import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Image as ImageIcon, Sparkles, MessageCircle, User } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/authStore";

/**
 * MarketingKitGenerator — Mitra ambil template promo, di-overlay nama+WA
 * mereka, lalu download PNG (1080×1080, IG-ready).
 *
 * Cara kerja:
 *   1. Load file SVG dari /public/templates/promo/<key>.svg
 *   2. Replace placeholder {{AGENT_NAME}} dan {{AGENT_WA}} dgn input mitra
 *   3. Render hasil ke <canvas> via Image+drawImage
 *   4. Export canvas → PNG → trigger download
 *
 * Template baru tinggal taro file SVG di /public/templates/promo/ dan
 * tambahin entry-nya ke TEMPLATES di bawah.
 */

interface PromoTemplate {
  key: string;
  label: string;
  category: "umrah" | "flight" | "visa";
  emoji: string;
  /** path relatif dari public/ (auto-prefix /) */
  src: string;
  /** thumbnail accent untuk grid */
  accent: string;
}

const TEMPLATES: PromoTemplate[] = [
  {
    key: "umrah-hemat",
    label: "Promo Umrah Hemat",
    category: "umrah",
    emoji: "🕋",
    src: "/templates/promo/umrah-hemat.svg",
    accent: "from-sky-500 to-cyan-400",
  },
  {
    key: "tiket-pesawat",
    label: "Tiket Pesawat Termurah",
    category: "flight",
    emoji: "✈️",
    src: "/templates/promo/tiket-pesawat.svg",
    accent: "from-orange-500 to-amber-400",
  },
  {
    key: "visa-cepat",
    label: "Layanan Visa Cepat",
    category: "visa",
    emoji: "📔",
    src: "/templates/promo/visa-cepat.svg",
    accent: "from-emerald-600 to-green-400",
  },
];

const PNG_SIZE = 1080; // IG square

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Replace placeholder {{AGENT_NAME}} & {{AGENT_WA}} di SVG text. */
function personalize(svg: string, name: string, wa: string): string {
  const safeName = escapeXml(name.trim() || "Nama Mitra");
  const safeWa = escapeXml(wa.trim() || "08xx-xxxx-xxxx");
  return svg
    .replace(/\{\{AGENT_NAME\}\}/g, safeName)
    .replace(/\{\{AGENT_WA\}\}/g, safeWa);
}

/** Fetch SVG file as text. Cached per session via in-memory map. */
const svgCache = new Map<string, string>();
async function loadSvgText(src: string): Promise<string> {
  if (svgCache.has(src)) return svgCache.get(src)!;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Gagal load template (${res.status})`);
  const text = await res.text();
  svgCache.set(src, text);
  return text;
}

/** Render SVG string ke <img> (data URL) — utk preview & nanti dipake canvas. */
function svgToDataUrl(svg: string): string {
  // Use encodeURIComponent agar aman utk karakter Unicode (emoji, dll).
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** Convert SVG string → PNG blob (canvas). */
async function svgToPngBlob(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PNG_SIZE;
      canvas.height = PNG_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context tidak tersedia"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
      ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("Gagal export PNG"));
          else resolve(blob);
        },
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => TEMPLATES.find((t) => t.key === activeKey) ?? TEMPLATES[0],
    [activeKey],
  );

  // Re-render preview kapanpun template / nama / WA berubah.
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
    return () => {
      alive = false;
    };
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
    <div ref={containerRef} className="space-y-4">
      {/* Form: nama + WA */}
      <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-600" />
          <h3 className="text-[14px] font-bold">Identitas Mitra</h3>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Nama & WA lo akan ditempel otomatis di setiap template promo. Lo bisa edit kapan aja.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> Nama lo
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Andi Saputra"
              className="h-9 text-[13px]"
              maxLength={48}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> Nomor WhatsApp
            </Label>
            <Input
              value={wa}
              onChange={(e) => setWa(e.target.value)}
              placeholder="Contoh: 0812-3456-7890"
              className="h-9 text-[13px]"
              maxLength={32}
              type="tel"
            />
          </div>
        </div>
      </div>

      {/* Template chooser */}
      <div className="rounded-2xl border bg-white p-3 md:p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-fuchsia-600" /> Pilih Template
          </h3>
          <span className="text-[10.5px] text-muted-foreground">
            {TEMPLATES.length} template tersedia
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((t) => {
            const isActive = t.key === active.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={cn(
                  "rounded-xl border-2 p-2.5 text-left transition-all bg-gradient-to-br",
                  t.accent,
                  isActive
                    ? "ring-2 ring-fuchsia-500 ring-offset-2 scale-[1.02] shadow-md"
                    : "border-transparent hover:scale-[1.01] opacity-90 hover:opacity-100",
                )}
              >
                <div className="text-2xl text-white">{t.emoji}</div>
                <div className="text-[11px] font-bold text-white mt-1 leading-tight">
                  {t.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview + download */}
      <motion.div
        layout
        className="rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-amber-300">
              Live Preview
            </p>
            <h3 className="text-[14px] font-bold text-white mt-0.5">
              {active.label}
            </h3>
          </div>
          <Button
            onClick={() => void handleDownload()}
            disabled={downloading || loadingPreview}
            className="bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700"
          >
            <Download className="h-4 w-4 mr-1.5" />
            {downloading ? "Menyiapkan…" : "Download PNG"}
          </Button>
        </div>

        <div className="relative mx-auto max-w-md aspect-square rounded-xl overflow-hidden bg-white shadow-2xl">
          {loadingPreview && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-sm">
              <div className="text-[11px] text-muted-foreground italic">Merender preview…</div>
            </div>
          )}
          {previewSrc && (
            <img
              src={previewSrc}
              alt={`Preview ${active.label}`}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px] text-slate-300">
          <div className="bg-slate-800/60 rounded-lg p-2">
            <p className="font-semibold text-slate-200">Format</p>
            <p>1080 × 1080 px PNG · IG/FB siap pakai</p>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-2">
            <p className="font-semibold text-slate-200">Tips</p>
            <p>Upload ke Status WhatsApp utk reach maksimal</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
