import { useState, useRef, useCallback } from "react";
import {
  Wand2, Copy, CheckCheck, Loader2, RefreshCw, FileText,
  Plane, BookOpen, Megaphone, Moon, Sparkles, AlignLeft,
  ImagePlus, X, ScanText, PenLine, MessageCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getAIHeaders } from "@/lib/aiFetch";

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

/* ─── Temantiket Brand System Prompt (Manual) ──────────── */
const BRAND_SYSTEM_PROMPT = `Kamu adalah Senior Copywriter & Brand Guardian resmi Temantiket.

Temantiket adalah brand travel Umrah & Haji yang ramah, hangat, kekeluargaan, santai tapi terpercaya.
Brand name yang benar: "Temantiket" (bukan TemanTiket, bukan Teman Tiket).

ALUR WAJIB SETIAP CAPTION (ikuti urutan ini persis — semua dalam satu blok teks mengalir, BUKAN poin terpisah):
1. HOOK (kalimat pembuka): Emoji + pertanyaan atau pernyataan yang langsung bikin penasaran atau relate.
2. BENEFIT UTAMA: 1 kalimat yang menjelaskan nilai utama yang ditawarkan.
3. DETAIL KEUNTUNGAN: Gunakan ✅ untuk 2–3 keuntungan spesifik (masing-masing singkat, di baris baru).
4. CTA: "📲 Hubungi sekarang:" + nomor WA (jika ada), atau ajakan action yang jelas.
5. CLOSING BRAND: "Temantiket — mudah, cepat, amanah" + 1 emoji relevan.

ATURAN KETAT:
1. Buat tepat 3 variasi caption yang berbeda karakter dan sudut pandang.
2. Target panjang 230–270 karakter per caption (termasuk emoji & spasi) — hitung dengan cermat.
3. Gaya: mengalir natural, santai, meyakinkan — bukan daftar poin kaku atau terlalu salesy.
4. Setiap variasi WAJIB berbeda fokusnya:
   - Variasi 1 (Keuntungan Tersembunyi): ungkap benefit yang jarang orang sadari.
   - Variasi 2 (Kesempatan Langka): tone FOMO yang ramah — ajak sebelum kehabisan/lewat.
   - Variasi 3 (Cerita & Pengalaman): bangun imajinasi — bayangkan rasanya, ceritakan perjalanannya.
5. Nama "Temantiket" WAJIB ada di setiap variasi.
6. Emoji: 3–4 per caption saja, pilih yang memperkuat emosi teks.
7. Hindari klaim berlebihan: "paling murah", "gratis", "terbatas!" secara hard-sell.
8. Setiap caption harus terasa lengkap dan enak dibaca sekali baca.

OUTPUT FORMAT (WAJIB IKUTI PERSIS — tidak ada teks lain di luar format ini):
VARIASI 1
[caption]

VARIASI 2
[caption]

VARIASI 3
[caption]`;

/* ─── Vision System Prompt (Scan Poster) ───────────────── */
const VISION_SYSTEM_PROMPT = `Kamu adalah Senior Copywriter & Brand Guardian resmi Temantiket.

Brand name yang benar: "Temantiket" (bukan TemanTiket, bukan Teman Tiket). Wajib ada di setiap caption.

Tugas: Baca isi poster yang dikirim, ekstrak informasi utama (nama paket, harga, keunggulan, dsb), lalu buat 3 variasi caption WhatsApp/Instagram sesuai aturan berikut.

ALUR WAJIB SETIAP CAPTION (dalam satu blok teks mengalir, BUKAN poin terpisah):
1. HOOK: Emoji + kalimat pembuka yang menarik atau pertanyaan yang bikin penasaran.
2. BENEFIT UTAMA: 1 kalimat yang merangkum nilai utama dari poster.
3. DETAIL: Gunakan ✅ untuk 2–3 keunggulan spesifik dari poster (masing-masing singkat, di baris baru).
4. CTA: "📲 Hubungi sekarang:" + nomor WA (jika diberikan), atau ajakan action yang jelas.
5. CLOSING: "Temantiket — mudah, cepat, amanah" + 1 emoji relevan.

ATURAN KETAT:
1. Buat tepat 3 variasi caption, masing-masing berbeda karakter dan sudut pandang.
2. Target panjang 230–270 karakter per caption (termasuk emoji & spasi) — hitung dengan cermat.
3. Gaya: mengalir natural, santai, meyakinkan — bukan daftar kaku atau terlalu salesy.
4. Setiap variasi WAJIB berbeda fokusnya:
   - Variasi 1 (Keuntungan Tersembunyi): ungkap benefit yang jarang orang sadari dari poster ini.
   - Variasi 2 (Kesempatan Langka): tone FOMO ramah — ajak bertindak sebelum kehabisan/lewat.
   - Variasi 3 (Cerita & Pengalaman): bangun imajinasi — bayangkan rasanya ikut paket ini.
5. Nama "Temantiket" WAJIB muncul di setiap variasi.
6. Emoji: 3–4 per caption saja.
7. Jangan tulis penjelasan lain — hanya output 3 variasi persis sesuai format.

OUTPUT FORMAT (WAJIB IKUTI PERSIS):
VARIASI 1
[caption]

VARIASI 2
[caption]

VARIASI 3
[caption]`;

/* ─── Tone instructions ─────────────────────────────────── */
const TONE_LABEL: Record<string, string> = {
  santai:   "Friendly, casual, akrab → bahasa santai kayak ngobrol sama temen",
  formal:   "Profesional & terpercaya → lebih meyakinkan, tenang, penuh jaminan",
  hardsell: "FOMO, urgent, ajak action → ada sedikit urgensi tapi tetap ramah",
  story:    "Emosional, cerita perjalanan → lebih ke perasaan, impian, dan pengalaman",
};

/* ─── Helpers ───────────────────────────────────────────── */
function parseVariasiFormat(raw: string): string[] {
  const blocks = raw.split(/VARIASI\s+\d+/i).map((s) => s.trim()).filter(Boolean);
  const results = blocks.map((b) => b.replace(/^[\n\r:]+/, "").trim()).filter(Boolean);
  if (results.length >= 1) return results.slice(0, 3);
  return raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─── Image compression (resize + JPEG encode) ──────────── */
function compressImage(file: File, maxWidth = 1400, quality = 0.85): Promise<string> {
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

/* ─── API: Manual mode ──────────────────────────────────── */
async function generateFromDetail(params: {
  categoryPrompt: string;
  tone: string;
  packageDetail?: string;
  waNumber?: string;
}): Promise<string[]> {
  const { categoryPrompt, tone, packageDetail, waNumber } = params;
  const toneInstruction = TONE_LABEL[tone] ?? tone;
  const detailSection = packageDetail?.trim() ? `\n\nDetail paket:\n${packageDetail.trim()}` : "";
  const waSection = waNumber?.trim() ? `\n\nNomor WA untuk CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}` : "";
  const userPrompt = `Buat 3 caption marketing untuk ${categoryPrompt}.\nTone yang diminta: ${toneInstruction}.${detailSection}${waSection}`;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: await getAIHeaders(),
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: BRAND_SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "";
  const captions = parseVariasiFormat(raw);
  if (captions.length < 1) throw new Error("Format respons AI tidak valid");
  return captions;
}

/* ─── Variant labels ────────────────────────────────────── */
const POSTER_VARIANT_LABELS = [
  "Keuntungan Tersembunyi",
  "Kesempatan Langka",
  "Cerita & Pengalaman",
];

/* ─── API: Poster scan mode ─────────────────────────────── */
async function generateFromPoster(params: {
  imageDataUrl: string;
  tone: string;
  waNumber?: string;
}): Promise<string[]> {
  const { imageDataUrl, tone, waNumber } = params;
  const toneInstruction = TONE_LABEL[tone] ?? tone;
  const waSection = waNumber?.trim() ? `\nNomor WA untuk baris CTA: wa.me/${waNumber.trim().replace(/\D/g, "")}` : "";
  const userPrompt = `Scan poster ini dan buat 3 variasi caption sesuai struktur dan aturan di instruksi sistem.\nTone: ${toneInstruction}.${waSection}\nPanjang setiap caption: 220–280 karakter. Masing-masing variasi harus berbeda fokus sesuai petunjuk (Keuntungan Tersembunyi / Kesempatan Langka / Cerita & Pengalaman).`;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: await getAIHeaders(),
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
      temperature: 0.8,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    if (res.status === 413) throw new Error("Gambar masih terlalu besar setelah kompresi. Coba gunakan gambar yang lebih kecil atau resolusi lebih rendah.");
    throw new Error(`AI error ${res.status}`);
  }
  const data = await res.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "";
  const captions = parseVariasiFormat(raw);
  if (captions.length < 1) throw new Error("Format respons AI tidak valid");
  return captions;
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
  const [results, setResults]               = useState<string[]>([]);
  const [loading, setLoading]               = useState(false);
  const [copiedIdx, setCopiedIdx]           = useState<number | null>(null);
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
    setResults([]);
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
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setResults([]);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setResults([]);
    try {
      if (mode === "poster") {
        if (!posterFile) { toast.error("Upload poster dulu ya!"); return; }
        const dataUrl = await compressImage(posterFile);
        const captions = await generateFromPoster({ imageDataUrl: dataUrl, tone: activeTone, waNumber });
        setResults(captions);
      } else {
        const captions = await generateFromDetail({
          categoryPrompt: cat.prompt,
          tone: activeTone,
          packageDetail,
          waNumber,
        });
        setResults(captions);
      }
    } catch (err) {
      toast.error(`Gagal generate: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Caption disalin!");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const canGenerate = mode === "poster" ? !!posterFile && !loading : !loading;

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
                AI akan membaca teks & info dari poster lalu langsung bikin 3 variasi caption.
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
            Opsional — jika diisi, link WA otomatis ditambahkan di akhir setiap caption.
          </p>
        )}
      </Section>

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
          ) : results.length > 0 ? (
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
                : <><Wand2 className="h-4 w-4" strokeWidth={1.5} /> Generate 3 Caption</>
              }
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* ── Results ── */}
      <AnimatePresence>
        {loading && (
          <motion.div key="skeleton"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-border/70 bg-white p-4 animate-pulse space-y-2.5">
                <div className="h-2.5 bg-muted rounded w-1/5" />
                <div className="h-2.5 bg-muted rounded w-full" />
                <div className="h-2.5 bg-muted rounded w-5/6" />
                <div className="h-2.5 bg-muted rounded w-4/6" />
              </div>
            ))}
          </motion.div>
        )}

        {!loading && results.length > 0 && (
          <motion.div key="results"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] text-muted-foreground tracking-wide">
                3 variasi • Temantiket Brand Voice
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {results.map((caption, idx) => {
              const len = caption.length;
              const inRange = len >= 230 && len <= 270;
              const tooShort = len < 230;
              const charColor = inRange
                ? "text-emerald-600"
                : tooShort
                ? "text-amber-500"
                : "text-rose-500";
              const variantLabel = POSTER_VARIANT_LABELS[idx] ?? null;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07 }}
                  className="rounded-xl border border-border/70 bg-white p-4 md:p-5 hover:border-foreground/25 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest shrink-0">
                        Variasi {idx + 1}
                      </span>
                      {variantLabel && (
                        <span className="text-[10px] font-medium text-[#1a44d4]/70 bg-[#1a44d4]/8 px-1.5 py-0.5 rounded-md truncate">
                          {variantLabel}
                        </span>
                      )}
                      <span className={cn("text-[10px] font-medium shrink-0", charColor)}>
                        {len} kar
                      </span>
                    </div>
                    <button
                      onClick={() => void handleCopy(caption, idx)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all border shrink-0",
                        copiedIdx === idx
                          ? "border-[#1a44d4]/30 bg-[#1a44d4] text-white"
                          : "border-border/70 text-muted-foreground hover:border-[#1a44d4]/40 hover:text-[#1a44d4]",
                      )}
                    >
                      {copiedIdx === idx
                        ? <><CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Disalin</>
                        : <><Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Salin</>
                      }
                    </button>
                  </div>
                  <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                    {caption}
                  </p>
                  {!inRange && (
                    <p className={cn("text-[10px] mt-2", charColor)}>
                      {tooShort
                        ? `Caption terlalu pendek (ideal 230–270 karakter)`
                        : `Caption terlalu panjang (ideal 230–270 karakter)`}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export { CaptionGenerator as MarketingKitGenerator };
