import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

type PromoCard = {
  title: string;
  subtitle: string;
  cta?: string;
  gradient: string;
  emoji?: string;
  onClick?: () => void;
};

type TravelPromoCarouselProps = {
  items: PromoCard[];
  className?: string;
};

export function TravelPromoCarousel({ items, className }: TravelPromoCarouselProps) {
  return (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4",
        className,
      )}
    >
      {items.map((card, i) => (
        <button
          key={i}
          onClick={card.onClick}
          className="shrink-0 relative rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-transform"
          style={{
            background: card.gradient,
            width: 200,
            minWidth: 200,
            padding: "14px 16px",
            boxShadow: "0 8px 24px rgba(10,31,68,0.12)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* Decorative blob */}
          <div
            className="absolute -top-6 -right-6 h-28 w-28 rounded-full pointer-events-none"
            style={{ background: "rgba(255,255,255,0.10)" }}
          />
          {card.emoji && (
            <span className="block text-[28px] leading-none mb-2">{card.emoji}</span>
          )}
          <p className="text-[13px] font-bold text-white leading-tight">{card.title}</p>
          <p className="text-[10.5px] text-white/75 mt-1 leading-snug line-clamp-2">{card.subtitle}</p>
          {card.cta && (
            <div className="flex items-center gap-1 mt-3">
              <span className="text-[11px] font-semibold text-white/90">{card.cta}</span>
              <ArrowRight className="h-3 w-3 text-white/90" strokeWidth={2.5} />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
