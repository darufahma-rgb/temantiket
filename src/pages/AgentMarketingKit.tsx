import { useNavigate } from "react-router-dom";
import { ChevronLeft, Sparkles, Zap, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptionGenerator } from "@/components/MarketingKitGenerator";
import { motion } from "framer-motion";

export default function AgentMarketingKit() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 px-4 pt-5 pb-10 md:px-8 md:pt-8 md:pb-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-fuchsia-300/20 blur-2xl" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/agent")}
            className="h-8 px-2 text-white/80 hover:text-white hover:bg-white/15 -ml-1 mb-4"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Kembali
          </Button>
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-black/10">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                Caption Generator
              </h1>
              <p className="text-[12.5px] text-white/70 mt-1 leading-relaxed max-w-md">
                Generate caption promo WA / IG / FB dalam hitungan detik pakai AI — tinggal copy-paste, klien langsung masuk.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-white/90">
              <Zap className="h-3 w-3" /> AI-powered GPT-4o
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold text-white/90">
              <Copy className="h-3 w-3" /> 3 variasi sekaligus
            </span>
          </div>
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-4 md:px-8 -mt-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <CaptionGenerator />
        </motion.div>
      </div>
    </div>
  );
}
