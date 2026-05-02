import { useState } from "react";
import {
  Sparkles, Copy, CheckCheck, Loader2, RefreshCw,
  User, MessageCircle, DollarSign, Calendar, FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/authStore";

/* ─── Kategori ─────────────────────────────────────────── */
const CATEGORIES = [
  { key: "umrah",   label: "Promo Umrah",       emoji: "🕋", accent: "from-sky-500 to-cyan-400",      prompt: "paket umrah hemat" },
  { key: "haji",    label: "Paket Haji",         emoji: "🌙", accent: "from-emerald-600 to-teal-400",  prompt: "paket haji plus / furoda" },
  { key: "flight",  label: "Tiket Pesawat",      emoji: "✈️", accent: "from-orange-500 to-amber-400",  prompt: "tiket pesawat murah" },
  { key: "visa",    label: "Layanan Visa",        emoji: "📔", accent: "from-violet-500 to-purple-400", prompt: "layanan visa cepat" },
  { key: "general", label: "Promo Umum",          emoji: "📣", accent: "from-rose-500 to-pink-400",    prompt: "layanan travel umrah & haji" },
];

/* ─── Tone ──────────────────────────────────────────────── */
const TONES = [
  { key: "santai",      label: "Santai",        desc: "Friendly, casual, akrab"     },
  { key: "formal",      label: "Formal",        desc: "Profesional & terpercaya"    },
  { key: "hardsell",    label: "Hard Selling",  desc: "FOMO, urgent, ajak action"   },
  { key: "story",       label: "Storytelling",  desc: "Emosional, cerita perjalanan"},
];

/* ─── Helpers ───────────────────────────────────────────── */
async function generateCaptions(params: {
  category: string;
  categoryPrompt: string;
  tone: string;
  agentName: string;
  agentWa: string;
  price: string;
  departureDate: string;
  extraNotes: string;
}): Promise<string[]> {
  const { category, categoryPrompt, tone, agentName, agentWa, price, departureDate, extraNotes } = params;

  const toneMap: Record<string, string> = {
    santai:   "casual, akrab, pakai bahasa sehari-hari, sedikit emoji, tidak lebay",
    formal:   "formal, profesional, terpercaya, bahasa Indonesia baku, minim emoji",
    hardsell: "high-energy, ada urgensi/FOMO, CTA kuat, pakai emoji banyak, persuasif",
    story:    "storytelling singkat, emosional, membayangkan pengalaman ibadah, warm, satu atau dua emoji saja",
  };

  const details = [
    agentName     && `Nama agen: ${agentName}`,
    agentWa       && `Nomor WA agen: ${agentWa}`,
    price         && `Harga/kisaran: ${price}`,
    departureDate && `Tanggal keberangkatan: ${departureDate}`,
    extraNotes    && `Info tambahan: ${extraNotes}`,
  ].filter(Boolean).join("\n");

  const systemPrompt = `Kamu adalah copywriter digital marketing ahli untuk travel umrah & haji di Indonesia.
Tugas: buat 3 variasi caption promo untuk ${categoryPrompt} dengan tone ${toneMap[tone] || tone}.
Format output: JSON array berisi tepat 3 string. Masing-masing caption max 300 kata, siap paste ke WhatsApp/Instagram.
Jangan tambahkan penjelasan di luar JSON. Contoh format: ["Caption 1...", "Caption 2...", "Caption 3..."]`;

  const userPrompt = details
    ? `Buat 3 caption promo ${categoryPrompt}.\n\nDetail:\n${details}`
    : `Buat 3 caption promo ${categoryPrompt}.`;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 1800,
    }),
  });

  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";

  // Parse JSON dari response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Format respons AI tidak valid");
  const parsed: unknown = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Bukan array");
  return parsed.slice(0, 3).map(String);
}

/* ─── Main Component ────────────────────────────────────── */
export function CaptionGenerator() {
  const me = useAuthStore((s) => s.user);

  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const [activeTone, setActiveTone]         = useState(TONES[0].key);
  const [agentName, setAgentName]           = useState(me?.displayName ?? "");
  const [agentWa, setAgentWa]               = useState(me?.email ?? "");
  const [price, setPrice]                   = useState("");
  const [departureDate, setDepartureDate]   = useState("");
  const [extraNotes, setExtraNotes]         = useState("");
  const [results, setResults]               = useState<string[]>([]);
  const [loading, setLoading]               = useState(false);
  const [copiedIdx, setCopiedIdx]           = useState<number | null>(null);

  const cat = CATEGORIES.find((c) => c.key === activeCategory) ?? CATEGORIES[0];

  const handleGenerate = async () => {
    setLoading(true);
    setResults([]);
    try {
      const captions = await generateCaptions({
        category: activeCategory,
        categoryPrompt: cat.prompt,
        tone: activeTone,
        agentName,
        agentWa,
        price,
        departureDate,
        extraNotes,
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
    toast.success("Caption disalin ke clipboard!");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-4 pb-10">

      {/* ── Kategori ── */}
      <div className="rounded-2xl border border-border/60 bg-white p-4 md:p-5 shadow-sm">
        <h3 className="text-[13px] font-bold mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
            <Sparkles className="h-3 w-3 text-white" />
          </span>
          Pilih Kategori
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {CATEGORIES.map((c) => {
            const isActive = c.key === activeCategory;
            return (
              <motion.button
                key={c.key}
                onClick={() => setActiveCategory(c.key)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "relative rounded-xl overflow-hidden text-left p-3 transition-all",
                  "bg-gradient-to-br",
                  c.accent,
                  isActive
                    ? "ring-2 ring-offset-2 ring-fuchsia-500 shadow-lg"
                    : "opacity-75 hover:opacity-95 shadow-sm",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeCatGlow"
                    className="absolute inset-0 bg-white/20 rounded-xl"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className="relative">
                  <div className="text-2xl mb-1.5 drop-shadow">{c.emoji}</div>
                  <div className="text-[11px] font-bold text-white leading-tight">{c.label}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Tone ── */}
      <div className="rounded-2xl border border-border/60 bg-white p-4 md:p-5 shadow-sm">
        <h3 className="text-[13px] font-bold mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="h-3 w-3 text-white" />
          </span>
          Gaya Penulisan
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TONES.map((t) => {
            const isActive = t.key === activeTone;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTone(t.key)}
                className={cn(
                  "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "border-fuchsia-500 bg-fuchsia-50 shadow-sm"
                    : "border-border/60 hover:border-fuchsia-300 hover:bg-fuchsia-50/40",
                )}
              >
                <div className={cn("text-[12.5px] font-bold", isActive ? "text-fuchsia-700" : "text-foreground")}>
                  {t.label}
                </div>
                <div className="text-[10.5px] text-muted-foreground mt-0.5">{t.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail Opsional ── */}
      <div className="relative rounded-2xl overflow-hidden border border-border/60 bg-white shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500" />
        <div className="p-4 md:p-5">
          <h3 className="text-[13px] font-bold mb-0.5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
              <User className="h-3 w-3 text-white" />
            </span>
            Detail Agen <span className="text-[11px] font-normal text-muted-foreground ml-1">(opsional tapi makin bagus)</span>
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4 ml-8">Semakin lengkap, caption makin personal & siap pakai.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <User className="h-3 w-3" /> Nama lo
              </Label>
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)}
                placeholder="Contoh: Andi Saputra" className="h-9 text-[13px]" maxLength={48} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" /> Nomor WhatsApp
              </Label>
              <Input value={agentWa} onChange={(e) => setAgentWa(e.target.value)}
                placeholder="0812-3456-7890" className="h-9 text-[13px]" maxLength={32} type="tel" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" /> Kisaran Harga
              </Label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="Contoh: mulai 25 juta" className="h-9 text-[13px]" maxLength={64} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Tanggal Keberangkatan
              </Label>
              <Input value={departureDate} onChange={(e) => setDepartureDate(e.target.value)}
                placeholder="Contoh: Desember 2025" className="h-9 text-[13px]" maxLength={64} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Info Tambahan
              </Label>
              <Textarea value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)}
                placeholder="Contoh: include visa, hotel bintang 5, makan 3x, free airport transfer..."
                className="text-[13px] resize-none min-h-[72px]" maxLength={300} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Generate Button ── */}
      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          onClick={() => void handleGenerate()}
          disabled={loading}
          className="w-full h-12 text-[14px] font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-pink-700 shadow-lg shadow-fuchsia-500/25 transition-all"
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.span key="loading" className="flex items-center gap-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI sedang nulis caption lo…
              </motion.span>
            ) : results.length > 0 ? (
              <motion.span key="regen" className="flex items-center gap-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RefreshCw className="h-4 w-4" />
                Generate Ulang
              </motion.span>
            ) : (
              <motion.span key="idle" className="flex items-center gap-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Sparkles className="h-4 w-4" />
                Generate 3 Caption Sekarang
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </motion.div>

      {/* ── Results ── */}
      <AnimatePresence>
        {loading && (
          <motion.div key="skeleton"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm animate-pulse space-y-2">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-5/6" />
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </motion.div>
        )}

        {!loading && results.length > 0 && (
          <motion.div key="results"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                3 Variasi Caption
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            {results.map((caption, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="relative rounded-2xl border border-border/60 bg-white p-4 md:p-5 shadow-sm hover:shadow-md hover:border-fuchsia-200 transition-all group"
              >
                {/* Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-widest text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded-full">
                    <Sparkles className="h-2.5 w-2.5" />
                    Variasi {idx + 1}
                  </span>
                  <button
                    onClick={() => void handleCopy(caption, idx)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all",
                      copiedIdx === idx
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted hover:bg-fuchsia-50 hover:text-fuchsia-700 text-muted-foreground",
                    )}
                  >
                    {copiedIdx === idx ? (
                      <><CheckCheck className="h-3.5 w-3.5" /> Disalin!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Salin</>
                    )}
                  </button>
                </div>

                {/* Caption text */}
                <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                  {caption}
                </p>

                {/* Click-anywhere-to-copy hint */}
                <button
                  onClick={() => void handleCopy(caption, idx)}
                  className="absolute inset-0 rounded-2xl opacity-0"
                  aria-label={`Salin variasi ${idx + 1}`}
                />
              </motion.div>
            ))}

            <p className="text-center text-[11px] text-muted-foreground pb-2">
              Klik <span className="font-semibold">Salin</span> di tiap kartu, atau klik area kartu untuk copy langsung ✨
            </p>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

/** Keep legacy export for backwards compat */
export { CaptionGenerator as MarketingKitGenerator };
