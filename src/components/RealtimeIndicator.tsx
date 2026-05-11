/**
 * RealtimeIndicator — D. Realtime Stability
 *
 * Shows connection status: Live / Reconnecting / Offline
 * Subscribes to realtimeManager status changes.
 * Tiny component — safe to put anywhere in the layout.
 */

import { useEffect, useState } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { getRealtimeStatus, onRealtimeStatusChange, type RealtimeStatus } from "@/lib/realtimeManager";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Show label text next to indicator dot. Default: true */
  showLabel?: boolean;
  /** Compact mode: just a colored dot, no icon or label */
  compact?: boolean;
}

const STATUS_CFG: Record<RealtimeStatus, {
  label:    string;
  dotClass: string;
  textClass: string;
  Icon:     React.ElementType | null;
  animate:  boolean;
}> = {
  live: {
    label:     "Live",
    dotClass:  "bg-emerald-500",
    textClass: "text-emerald-700",
    Icon:      Wifi,
    animate:   false,
  },
  reconnecting: {
    label:     "Reconnecting…",
    dotClass:  "bg-amber-400",
    textClass: "text-amber-700",
    Icon:      Loader2,
    animate:   true,
  },
  offline: {
    label:     "Offline",
    dotClass:  "bg-red-400",
    textClass: "text-red-600",
    Icon:      WifiOff,
    animate:   false,
  },
};

export function RealtimeIndicator({ className, showLabel = true, compact = false }: Props) {
  const [status, setStatus] = useState<RealtimeStatus>(getRealtimeStatus());

  useEffect(() => {
    const unsub = onRealtimeStatusChange(setStatus);
    return unsub;
  }, []);

  const cfg = STATUS_CFG[status];

  if (compact) {
    return (
      <span
        className={cn("inline-block h-2 w-2 rounded-full shrink-0", cfg.dotClass, className)}
        title={`Realtime: ${cfg.label}`}
      />
    );
  }

  const Icon = cfg.Icon;

  return (
    <div className={cn("flex items-center gap-1.5 select-none", className)}>
      <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", cfg.dotClass, status === "live" && "animate-pulse")} />
      {Icon && (
        <Icon
          className={cn("h-3 w-3 shrink-0", cfg.textClass, cfg.animate && "animate-spin")}
          strokeWidth={2}
        />
      )}
      {showLabel && (
        <span className={cn("text-[10px] font-semibold leading-none", cfg.textClass)}>
          {cfg.label}
        </span>
      )}
    </div>
  );
}
