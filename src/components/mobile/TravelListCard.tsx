import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type TravelListCardProps = {
  avatar?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  badgeTone?: "blue" | "green" | "yellow" | "red" | "gray" | "purple";
  onClick?: () => void;
  className?: string;
};

const BADGE_TONE: Record<string, string> = {
  blue:   "text-blue-700 bg-blue-100",
  green:  "text-emerald-700 bg-emerald-100",
  yellow: "text-amber-700 bg-amber-100",
  red:    "text-red-700 bg-red-100",
  gray:   "text-gray-600 bg-gray-100",
  purple: "text-purple-700 bg-purple-100",
};

export function TravelListCard({
  avatar,
  title,
  subtitle,
  meta,
  badge,
  badgeTone = "gray",
  onClick,
  className,
}: TravelListCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 bg-white rounded-2xl border border-[#E5EAF3] px-3.5 py-3",
        "active:scale-[0.98] transition-transform text-left",
        className,
      )}
      style={{ boxShadow: "0 4px 14px rgba(10,31,68,0.06)", WebkitTapHighlightColor: "transparent" }}
    >
      {avatar && <div className="shrink-0">{avatar}</div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[13px] font-bold text-[#071133] truncate flex-1">{title}</p>
          {badge && (
            <span className={cn("text-[9.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap", BADGE_TONE[badgeTone])}>
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-[11px] text-[#667085] leading-tight truncate mt-0.5">{subtitle}</p>}
        {meta && <p className="text-[10px] text-[#667085]/70 leading-tight mt-0.5 truncate">{meta}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-[#667085] shrink-0" strokeWidth={1.5} />
    </button>
  );
}
