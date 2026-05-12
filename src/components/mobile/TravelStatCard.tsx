import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "yellow" | "red" | "navy";

const TONE_STYLES: Record<Tone, { bg: string; text: string; icon: string }> = {
  blue:   { bg: "bg-blue-50 border-blue-100",    text: "text-blue-700",    icon: "bg-blue-100 text-blue-600"   },
  green:  { bg: "bg-emerald-50 border-emerald-100", text: "text-emerald-700", icon: "bg-emerald-100 text-emerald-600" },
  yellow: { bg: "bg-amber-50 border-amber-100",  text: "text-amber-700",   icon: "bg-amber-100 text-amber-600"   },
  red:    { bg: "bg-red-50 border-red-100",      text: "text-red-700",     icon: "bg-red-100 text-red-600"     },
  navy:   { bg: "bg-[#F0F4FF] border-[#D6E0FF]", text: "text-[#0A1F44]",  icon: "bg-[#D6E0FF] text-[#0066FF]"  },
};

type TravelStatCardProps = {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
};

export function TravelStatCard({
  label,
  value,
  subtitle,
  icon,
  tone = "navy",
  onClick,
  className,
}: TravelStatCardProps) {
  const s = TONE_STYLES[tone];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-3.5 text-left w-full",
        "active:scale-[0.97] transition-transform",
        s.bg,
        className,
      )}
      style={{ boxShadow: "0 4px 14px rgba(10,31,68,0.06)", WebkitTapHighlightColor: "transparent" }}
    >
      {icon && (
        <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0", s.icon)}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[20px] font-black tabular-nums leading-none text-[#071133] truncate">{value}</p>
        <p className="text-[11px] font-semibold text-[#667085] mt-1 leading-tight truncate">{label}</p>
        {subtitle && (
          <p className="text-[10px] text-[#667085]/70 mt-0.5 leading-tight truncate">{subtitle}</p>
        )}
      </div>
    </button>
  );
}
