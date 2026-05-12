import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type TravelActionCardProps = {
  icon?: React.ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  rightLabel?: string;
  rightTone?: "blue" | "green" | "yellow" | "red" | "gray";
  onClick?: () => void;
  className?: string;
};

const RIGHT_TONE: Record<string, string> = {
  blue:   "text-blue-600 bg-blue-50",
  green:  "text-emerald-600 bg-emerald-50",
  yellow: "text-amber-600 bg-amber-50",
  red:    "text-red-600 bg-red-50",
  gray:   "text-gray-500 bg-gray-50",
};

export function TravelActionCard({
  icon,
  iconBg = "bg-[#F0F4FF]",
  title,
  subtitle,
  meta,
  rightLabel,
  rightTone = "gray",
  onClick,
  className,
}: TravelActionCardProps) {
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
      {icon && (
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[#071133] truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-[#667085] leading-tight truncate mt-0.5">{subtitle}</p>}
        {meta && <p className="text-[10px] text-[#667085]/70 leading-tight mt-0.5 truncate">{meta}</p>}
      </div>
      {rightLabel ? (
        <span className={cn("text-[11px] font-bold px-2 py-1 rounded-xl shrink-0 whitespace-nowrap", RIGHT_TONE[rightTone])}>
          {rightLabel}
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 text-[#667085] shrink-0" strokeWidth={1.5} />
      )}
    </button>
  );
}
