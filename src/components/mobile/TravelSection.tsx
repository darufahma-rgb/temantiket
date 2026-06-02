import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type TravelSectionProps = {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  children: React.ReactNode;
  className?: string;
};

export function TravelSection({
  title,
  onSeeAll,
  seeAllLabel = "Lihat Semua",
  children,
  className,
}: TravelSectionProps) {
  return (
    <section className={cn("", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-[#071133]">{title}</h3>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-[#0866FF] active:opacity-60 transition-opacity"
          >
            {seeAllLabel}
            <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
