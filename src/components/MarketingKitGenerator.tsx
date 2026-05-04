import { useState } from "react";
import {
  Wand2, Copy, CheckCheck, Loader2, RefreshCw, FileText,
  Plane, BookOpen, Megaphone, Moon, Sparkles, AlignLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

/* ─── TemanTiket Brand System Prompt ───────────────────── */
const BRAND_SYSTEM_PROMPT = `Kamu adalah Senior Copywriter & Brand Guardian resmi TemanTiket.

TemanTiket adalah brand travel Umrah & Haji yang:
- Sangat ramah, hangat, dan kekeluargaan (seperti teman dekat yang lagi ngasih saran terbaik)
- Santai tapi tetap terpercaya dan profesional
- Selalu menekankan bahwa umrah bisa hemat TANPA mengorbankan kenyamanan, kualitas, dan ketenangan
- Bahasa sehari-hari yang enak dibaca: "kamu", "kita", "yuk", "ayo", "nggak harus mahal", "kesempatan emas", "berangkat bareng"
- Emoji yang pas, tidak berlebihan, dan mendukung emosi (✈️ 🕋 ⭐ 🙏 ❤️ 🌟 🔥)
- Selalu membangun trust dan semangat positif

ATURAN KETAT YANG HARUS DIIKUTI:
1. Selalu buat tepat 3 variasi caption yang berbeda karakter.
2. Setiap caption maksimal 280 karakter (termasuk emoji & spasi).
3. Tone harus 100% khas TemanTiket: ramah, tidak kaku, tidak terlalu salesy, tidak norak.
4. Setiap caption WAJIB punya Call-to-Action yang kuat dan natural (DM sekarang, daftar sekarang, hubungi kami, yuk berangkat bareng, dll).
5. Emoji hanya dipakai kalau benar-benar mendukung, maksimal 3-4 per caption.
6. Hindari kata-kata: "paling murah", "gratis", "limited time offer" berlebihan, atau bahasa terlalu marketing.
7. Buat variasi yang berbeda:
   - Variasi 1: Lebih ke manfaat + kenyamanan
   - Variasi 2: Lebih ke kesempatan / value
   - Variasi 3: Lebih emosional atau ajakan kuat

OUTPUT FORMAT (WAJIB IKUTI PERSIS):
VARIASI 1
[isi caption di sini]

VARIASI 2
[isi caption di sini]

VARIASI 3
[isi caption di sini]

Jangan tambahkan penjelasan lain di luar 3 variasi tersebut.`;

/* ─── Tone instructions ─────────────────────────────────── */
const TONE_LABEL: Record<string, string> = {
  santai:   "Friendly, casual, akrab → bahasa santai kayak ngobrol sama temen",
  formal:   "Profesional & terpercaya → lebih meyakinkan, tenang, penuh jaminan",
  hardsell: "FOMO, urgent, ajak action → ada sedikit urgensi tapi tetap ramah",
  story:    "Emosional, cerita perjalanan → lebih ke perasaan, impian, dan pengalaman",
};

/* ─── API ───────────────────────────────────────────────── */
async function generateCaptions(params: {
  categoryPrompt: string;
  tone: string;
  packageDetail?: string;
}): Promise<string[]> {
  const { categoryPrompt, tone, packageDetail } = params;

  const toneInstruction = TONE_LABEL[tone] ?? tone;
  const detailSection = packageDetail?.trim()
    ? `\n\nDetail paket:\n${packageDetail.trim()}`
    : "";

  const userPrompt =
    `Buat 3 caption marketing untuk ${categoryPrompt}.\n` +
    `Tone yang diminta: ${toneInstruction}.` +
    detailSection;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

/**
 * Parse VARIASI 1 / VARIASI 2 / VARIASI 3 output format.
 * Falls back to double-newline splitting if markers are absent.
 */
function parseVariasiFormat(raw: string): string[] {
  const results: string[] = [];
  const blocks = raw.split(/VARIASI\s+\d+/i).map((s) => s.trim()).filter(Boolean);
  for (const block of blocks) {
    const text = block.replace(/^[\n\r:]+/, "").trim();
    if (text) results.push(text);
  }
  if (results.length >= 1) return results.slice(0, 3);

  // Fallback: split by double newline
  const lines = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return lines.slice(0, 3);
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
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const [activeTone, setActiveTone]         = useState(TONES[0].key);
  const [packageDetail, setPackageDetail]   = useState("");
  const [results, setResults]               = useState<string[]>([]);
  const [loading, setLoading]               = useState(false);
  const [copiedIdx, setCopiedIdx]           = useState<number | null>(null);

  const cat = CATEGORIES.find((c) => c.key === activeCategory) ?? CATEGORIES[0];

  const handleGenerate = async () => {
    setLoading(true);
    setResults([]);
    try {
      const captions = await generateCaptions({
        categoryPrompt: cat.prompt,
        tone: activeTone,
        packageDetail,
      });
      setResults(captions);
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

  return (
    <div className="space-y-3 pb-10">

      {/* ── Kategori ── */}
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
                <Icon
                  className={cn("h-5 w-5", isActive ? "text-white" : "text-muted-foreground")}
                  strokeWidth={1.5}
                />
                <span className={cn("text-[11px] font-medium leading-tight", isActive ? "text-white" : "text-foreground")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Tone ── */}
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

      {/* ── Detail Paket (optional) ── */}
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

      {/* ── Generate Button ── */}
      <Button
        onClick={() => void handleGenerate()}
        disabled={loading}
        className="w-full h-11 text-[13.5px] font-semibold bg-[#1a44d4] text-white hover:bg-[#1535b0] transition-all rounded-xl"
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.span key="loading" className="flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI sedang nulis caption…
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
              <Wand2 className="h-4 w-4" strokeWidth={1.5} />
              Generate 3 Caption
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
              <span className="text-[11px] text-muted-foreground tracking-wide">3 variasi • TemanTiket Brand Voice</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {results.map((caption, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                className="rounded-xl border border-border/70 bg-white p-4 md:p-5 hover:border-foreground/25 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Variasi {idx + 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground/55">
                      {caption.length} karakter
                    </span>
                  </div>
                  <button
                    onClick={() => void handleCopy(caption, idx)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all border",
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
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export { CaptionGenerator as MarketingKitGenerator };
