import { useState } from "react";
import {
  Wand2, Copy, CheckCheck, Loader2, RefreshCw,
  User, MessageCircle, DollarSign, Calendar, FileText,
  Plane, BookOpen, Megaphone, Moon, Sparkles,
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

/* ─── API ───────────────────────────────────────────────── */
async function generateCaptions(params: {
  categoryPrompt: string;
  tone: string;
  agentName: string;
  agentWa: string;
  price: string;
  departureDate: string;
  extraNotes: string;
}): Promise<string[]> {
  const { categoryPrompt, tone, agentName, agentWa, price, departureDate, extraNotes } = params;

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
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Format respons AI tidak valid");
  const parsed: unknown = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Bukan array");
  return parsed.slice(0, 3).map(String);
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
        categoryPrompt: cat.prompt,
        tone: activeTone,
        agentName, agentWa, price, departureDate, extraNotes,
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

      {/* ── Detail Opsional ── */}
      <Section label="Detail Agen" icon={User}>
        <p className="text-[11.5px] text-muted-foreground -mt-2 mb-4">
          Opsional — semakin lengkap, caption makin personal & siap pakai.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <User className="h-3 w-3" strokeWidth={1.5} /> Nama lo
            </Label>
            <Input value={agentName} onChange={(e) => setAgentName(e.target.value)}
              placeholder="Contoh: Andi Saputra" className="h-9 text-[13px]" maxLength={48} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <MessageCircle className="h-3 w-3" strokeWidth={1.5} /> Nomor WhatsApp
            </Label>
            <Input value={agentWa} onChange={(e) => setAgentWa(e.target.value)}
              placeholder="0812-3456-7890" className="h-9 text-[13px]" maxLength={32} type="tel" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" strokeWidth={1.5} /> Kisaran Harga
            </Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="Contoh: mulai 25 juta" className="h-9 text-[13px]" maxLength={64} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" strokeWidth={1.5} /> Tanggal Keberangkatan
            </Label>
            <Input value={departureDate} onChange={(e) => setDepartureDate(e.target.value)}
              placeholder="Contoh: Desember 2025" className="h-9 text-[13px]" maxLength={64} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" strokeWidth={1.5} /> Info Tambahan
            </Label>
            <Textarea value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="Contoh: include visa, hotel bintang 5, makan 3x, free airport transfer..."
              className="text-[13px] resize-none min-h-[72px]" maxLength={300} />
          </div>
        </div>
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
              <span className="text-[11px] text-muted-foreground tracking-wide">3 variasi caption</span>
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
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Variasi {idx + 1}
                  </span>
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
