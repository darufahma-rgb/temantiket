import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface ZoneDef {
  label: string;
  short: string;
  flag: string;
  timeZone: string;
}

const ZONES: ZoneDef[] = [
  { label: "Mekkah / Madinah", short: "KSA", flag: "🇸🇦", timeZone: "Asia/Riyadh" },
  { label: "Kairo", short: "CAI", flag: "🇪🇬", timeZone: "Africa/Cairo" },
  { label: "Jakarta (WIB)", short: "WIB", flag: "🇮🇩", timeZone: "Asia/Jakarta" },
];

function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-orange-100/80 bg-white/80 backdrop-blur-sm shadow-sm"
      style={{
        background:
          "linear-gradient(135deg, #fffbf5 0%, #fff7ed 60%, #ffedd5 100%)",
      }}
    >
      {/* Subtle decorative accent */}
      <div
        className="absolute -top-8 -right-8 h-24 w-24 rounded-full pointer-events-none opacity-40"
        style={{ background: "radial-gradient(circle, #fb923c33, transparent 70%)" }}
      />

      <div className="relative px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Clock strokeWidth={2} className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-[10.5px] md:text-[11px] font-bold uppercase tracking-wider text-orange-700/80">
            Waktu Dunia
          </span>
          <span className="ml-auto inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div
          className={
            compact
              ? "flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1"
              : "grid grid-cols-3 gap-1.5 md:gap-2"
          }
        >
          {ZONES.map((z) => (
            <div
              key={z.timeZone}
              className={
                "rounded-xl bg-white/90 border border-orange-100 px-2 py-1.5 md:px-2.5 md:py-2 min-w-[96px] flex-shrink-0 shadow-[0_1px_2px_rgba(249,115,22,0.06)]"
              }
            >
              <div className="flex items-center gap-1">
                <span className="text-[11px] leading-none">{z.flag}</span>
                <span className="text-[9.5px] md:text-[10px] font-bold uppercase tracking-wider text-orange-600">
                  {z.short}
                </span>
              </div>
              <div className="font-mono font-extrabold text-[15px] md:text-[16px] text-orange-950 leading-tight tabular-nums mt-0.5">
                {formatTime(now, z.timeZone)}
              </div>
              <div className="text-[9.5px] md:text-[10px] text-orange-700/70 leading-tight truncate">
                {formatDay(now, z.timeZone)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
