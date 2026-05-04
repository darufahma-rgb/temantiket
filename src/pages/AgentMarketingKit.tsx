import { useNavigate } from "react-router-dom";
import { ChevronLeft, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptionGenerator } from "@/components/MarketingKitGenerator";

export default function AgentMarketingKit() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50/60">
      {/* Minimal header */}
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
              <Wand2 className="h-4.5 w-4.5 text-foreground" strokeWidth={1.5} />
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

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5">
        <CaptionGenerator />
      </div>
    </div>
  );
}
