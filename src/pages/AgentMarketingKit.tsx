import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, Wand2, History, X, Clock, Copy, Trash2,
  Zap, TrendingUp, BookOpen, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptionGenerator } from "@/components/MarketingKitGenerator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "temantiket.caption.history.v1";

interface CaptionHistory {
  id: string;
  caption: string;
  createdAt: string;
}

function getHistory(): CaptionHistory[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as CaptionHistory[];
  } catch {
    return [];
  }
}

const INSPIRASI = [
  { icon: "⭐", title: "Promo Spesial", subtitle: "Penawaran terbatas waktu" },
  { icon: "🕌", title: "Testimoni Jamaah", subtitle: "Cerita pengalaman nyata" },
  { icon: "✈️", title: "Fasilitas Paket", subtitle: "Highlight keunggulan paket" },
  { icon: "📅", title: "Reminder Keberangkatan", subtitle: "Notifikasi jadwal perjalanan" },
];

export default function AgentMarketingKit() {
  const navigate = useNavigate();
  const [showRiwayat, setShowRiwayat] = useState(false);
  const [history, setHistory] = useState<CaptionHistory[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, [showRiwayat]);

  const handleCopyHistory = async (caption: string, id: string) => {
    await navigator.clipboard.writeText(caption);
    setCopiedId(id);
    toast.success("Caption disalin!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteHistory = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setHistory(next);
    toast.success("Caption dihapus dari riwayat");
  };

  const stats = [
    { label: "Caption Dibuat", value: history.length, icon: Wand2,     bg: "bg-blue-50",   ic: "text-blue-600"   },
    { label: "Disimpan",       value: history.length, icon: Star,       bg: "bg-amber-50",  ic: "text-amber-600"  },
    { label: "Digunakan",      value: 0,              icon: Zap,        bg: "bg-green-50",  ic: "text-green-600"  },
    { label: "Dilihat",        value: 0,              icon: TrendingUp, bg: "bg-purple-50", ic: "text-purple-600" },
  ];

  return (
    <>
      {/* ══════════════ MOBILE LAYOUT ══════════════ */}
      <div
        className="md:hidden min-h-screen bg-[#F0F4FB] pb-28"
        style={{ WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
      >
        {/* Header */}
        <div className="px-4 pt-12 pb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => navigate("/agent")}
              className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
            >
              <ChevronLeft className="h-5 w-5 text-[#0f1c3f]" strokeWidth={2.5} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#0f1c3f] leading-tight">Caption Generator</h1>
              <p className="text-[11px] text-[#64748b] mt-0.5 leading-snug">
                Buat caption promo dengan AI — cepat &amp; siap pakai
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRiwayat(true)}
            className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 active:opacity-60 transition-opacity"
          >
            <History className="h-5 w-5 text-[#0f1c3f]" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-4 space-y-4">
          {/* Hero Card */}
          <div
            className="rounded-3xl overflow-hidden shadow-sm"
            style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}
          >
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 className="h-4 w-4 text-white/70" strokeWidth={1.5} />
                <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide">
                  AI Marketing Assistant
                </span>
              </div>
              <h2 className="text-[18px] font-bold text-white leading-snug">
                Caption Menarik,<br />Penjualan Meningkat ✨
              </h2>
              <p className="text-[12px] text-white/75 mt-2 leading-relaxed">
                AI kami membantu Anda membuat caption promosi yang persuasif, relevan, dan siap posting dalam hitungan detik.
              </p>
              <button
                onClick={() =>
                  document
                    .getElementById("caption-form-mobile")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="mt-4 bg-white text-[#0038B8] text-[13px] font-bold px-5 py-2.5 rounded-2xl active:opacity-60 transition-opacity shadow-sm"
              >
                Buat Caption Baru
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-2", s.bg, s.ic)}>
                  <s.icon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="text-2xl font-bold text-[#0f1c3f]">{s.value}</div>
                <div className="text-[11px] text-[#64748b] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Caption Generator Form */}
          <div id="caption-form-mobile" className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-[#0066FF]" strokeWidth={1.5} />
                <h3 className="text-[14px] font-bold text-[#0f1c3f]">Buat Caption Baru</h3>
              </div>
              <p className="text-[11px] text-[#64748b] mt-0.5">Isi konteks lalu generate dengan AI</p>
            </div>
            <div className="p-4">
              <CaptionGenerator />
            </div>
          </div>

          {/* Inspirasi Cepat */}
          <div className="bg-white rounded-3xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-[#0066FF]" strokeWidth={1.5} />
              <h3 className="text-[14px] font-bold text-[#0f1c3f]">Inspirasi Cepat</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INSPIRASI.map((item) => (
                <button
                  key={item.title}
                  onClick={() => toast.info("Segera hadir! 🚀")}
                  className="text-left p-3 rounded-2xl border border-gray-100 bg-gray-50/60 active:opacity-60 transition-opacity"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <div className="text-[12px] font-semibold text-[#0f1c3f] mt-1.5 leading-tight">{item.title}</div>
                  <div className="text-[10px] text-[#64748b] mt-0.5 leading-snug">{item.subtitle}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Riwayat Bottom Sheet */}
        {showRiwayat && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowRiwayat(false)}
            />
            <div className="relative bg-white rounded-t-3xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
                <div>
                  <h3 className="text-[16px] font-bold text-[#0f1c3f]">Riwayat Caption</h3>
                  <p className="text-[11px] text-[#64748b] mt-0.5">{history.length} caption tersimpan</p>
                </div>
                <button
                  onClick={() => setShowRiwayat(false)}
                  className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:opacity-60"
                >
                  <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-[13px] font-semibold text-[#0f1c3f]">Belum ada riwayat</p>
                    <p className="text-[11px] text-[#64748b] mt-1">
                      Caption yang digenerate akan tersimpan di sini
                    </p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-[12px] text-[#0f1c3f] line-clamp-3 leading-relaxed">
                        {item.caption}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[10px] text-[#64748b]">
                          {new Date(item.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="flex gap-3">
                          <button
                            onClick={() => void handleCopyHistory(item.caption, item.id)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0066FF] active:opacity-60"
                          >
                            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                            {copiedId === item.id ? "Disalin!" : "Salin"}
                          </button>
                          <button
                            onClick={() => handleDeleteHistory(item.id)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500 active:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ DESKTOP LAYOUT ══════════════ */}
      <div className="hidden md:block min-h-screen bg-gray-50/60">
        <div className="bg-white border-b border-border/60 px-4 py-4 md:px-8 md:py-5">
          <div className="max-w-3xl mx-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/agent")}
              className="h-7 px-2 text-muted-foreground hover:text-foreground -ml-1.5 mb-3 text-[12.5px]"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
              Kembali
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl border border-border flex items-center justify-center shrink-0 bg-white">
                <Wand2 className="h-4 w-4 text-foreground" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-[18px] md:text-[20px] font-bold text-foreground leading-tight tracking-tight">
                  Caption Generator
                </h1>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Generate caption promo WA / IG / FB pakai AI — cepat, hemat, siap pakai.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-5">
          <CaptionGenerator />
        </div>
      </div>
    </>
  );
}
