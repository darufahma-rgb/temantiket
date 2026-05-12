import { cn } from "@/lib/utils";
import type { ElementType } from "react";

type ServiceItem = {
  icon: ElementType;
  label: string;
  path: string;
  badge?: string;
  color?: string;
  bg?: string;
};

type TravelServiceGridProps = {
  items: ServiceItem[];
  onNavigate: (path: string) => void;
  cols?: 4 | 3 | 2;
  className?: string;
};

const COL_CLASS = { 4: "grid-cols-4", 3: "grid-cols-3", 2: "grid-cols-2" };

export function TravelServiceGrid({
  items,
  onNavigate,
  cols = 4,
  className,
}: TravelServiceGridProps) {
  return (
    <div className={cn("grid gap-3", COL_CLASS[cols], className)}>
      {items.map((item) => (
        <button
          key={item.path + item.label}
          onClick={() => onNavigate(item.path)}
          className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <div
            className="relative h-[52px] w-[52px] rounded-[16px] flex items-center justify-center"
            style={{
              background: item.bg ?? "rgba(0, 102, 255, 0.08)",
              border: `1.5px solid ${item.color ? item.color + "33" : "rgba(0,102,255,0.18)"}`,
            }}
          >
            <item.icon
              strokeWidth={1.8}
              className="h-[22px] w-[22px]"
              style={{ color: item.color ?? "#0066FF" }}
            />
            {item.badge && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-[#F04438] text-white text-[8px] font-bold flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold text-[#071133] text-center leading-tight max-w-[52px] line-clamp-2">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}
