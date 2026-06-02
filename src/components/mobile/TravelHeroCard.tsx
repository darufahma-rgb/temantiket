import { cn } from "@/lib/utils";

type TravelHeroCardProps = {
  greeting?: string;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function TravelHeroCard({
  greeting,
  title,
  subtitle,
  rightSlot,
  children,
  className,
}: TravelHeroCardProps) {
  return (
    <div
      className={cn("relative rounded-3xl overflow-hidden px-5 pt-5 pb-4", className)}
      style={{
        background: "linear-gradient(145deg, #0654D6 0%, #0866FF 48%, #33A6FF 100%)",
        boxShadow: "0 12px 30px rgba(0, 102, 255, 0.22)",
      }}
    >
      {/* Decorative background circles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-12 -right-12 h-48 w-48 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 65%)" }}
        />
        <div
          className="absolute -bottom-10 -left-6 h-40 w-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(51,166,255,0.20) 0%, transparent 65%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "18px 18px",
          }}
        />
      </div>

      {/* Header row */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {greeting && (
            <p className="text-[10px] font-semibold text-sky-200/80 uppercase tracking-wider mb-0.5">
              {greeting}
            </p>
          )}
          <h1 className="text-[20px] font-extrabold text-white leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-[12px] text-sky-200/80 mt-1 leading-snug">{subtitle}</p>
          )}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      {/* Optional children (e.g. search, stats) */}
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}
