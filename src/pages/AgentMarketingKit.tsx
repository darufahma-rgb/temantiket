import { useNavigate } from "react-router-dom";
import { ChevronLeft, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingKitGenerator } from "@/components/MarketingKitGenerator";

/**
 * AgentMarketingKit — page wrapper untuk Marketing Kit Generator.
 * Mitra-only route.
 */
export default function AgentMarketingKit() {
  const navigate = useNavigate();
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/agent")}
          className="h-8 w-8 p-0 shrink-0 mt-0.5"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-fuchsia-500" />
            Marketing Kit
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
            Buat poster promo dengan nama & WhatsApp lo otomatis ditempel.
            Download → upload ke status WA / IG / FB → klien langsung WA lo.
          </p>
        </div>
      </div>
      <MarketingKitGenerator />
    </div>
  );
}
