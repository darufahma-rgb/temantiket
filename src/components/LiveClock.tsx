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

  // ── Theme-aware: pakai class .live-clock-card + .live-clock-tile yg di-style
  //    di index.css. Inline gradient dipindah ke CSS supaya bisa di-override
  //    di dark mode (inline style menang dari CSS rule biasa, jadi inline =
  //    no go untuk dual-theme).
  return (
    <div className="live-clock-card relative overflow-hidden rounded-2xl border backdrop-blur-sm shadow-sm">
      {/* Subtle decorative accent — sky glow di pojok */}
      <div className="live-clock-glow absolute -top-8 -right-8 h-24 w-24 rounded-full pointer-events-none" />

      <div className={compact ? "relative px-2.5 py-1.5 md:px-4 md:py-3" : "relative px-3 py-2.5 md:px-4 md:py-3"}>
        <div className={compact ? "flex items-center gap-1.5 mb-1" : "flex items-center gap-1.5 mb-1.5"}>
          <Clock strokeWidth={2} className="h-3 w-3 md:h-3.5 md:w-3.5 text-sky-500" />
          <span className="live-clock-title text-[9.5px] md:text-[11px] font-bold uppercase tracking-wider">
            Waktu Dunia
          </span>
          <span className="ml-auto inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div
          className={
            compact
              ? "flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1"
              : "grid grid-cols-3 gap-1.5 md:gap-2"
          }
        >
          {ZONES.map((z) => (
            <div
              key={z.timeZone}
              className={compact
                ? "live-clock-tile rounded-lg border px-1.5 py-1 min-w-[84px] flex-shrink-0"
                : "live-clock-tile rounded-xl border px-2 py-1.5 md:px-2.5 md:py-2 min-w-[96px] flex-shrink-0"
              }
            >
              <div className="flex items-center gap-1">
                <span className={compact ? "text-[10px] leading-none" : "text-[11px] leading-none"}>{z.flag}</span>
                <span className="live-clock-short text-[8.5px] md:text-[10px] font-bold uppercase tracking-wider">
                  {z.short}
                </span>
              </div>
              <div className={compact
                ? "live-clock-time font-extrabold text-[13px] leading-tight tabular-nums mt-0.5"
                : "live-clock-time font-extrabold text-[15px] md:text-[16px] leading-tight tabular-nums mt-0.5"
              }
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(now, z.timeZone)}
              </div>
              <div className="live-clock-day text-[8.5px] md:text-[10px] leading-tight truncate">
                {formatDay(now, z.timeZone)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
