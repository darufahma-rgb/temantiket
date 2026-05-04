/**
 * CloudSyncBadge — tiny dot that shows per-feature cloud sync status.
 *
 *   green  (ok)       — tersinkron ke Supabase
 *   amber  (syncing)  — sedang menyinkronkan…
 *   gray   (offline)  — hanya di device ini (Supabase offline/belum dikonfigurasi)
 *   red    (error)    — gagal sync ke cloud
 *   idle              — tidak tampil
 */
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureSyncStore, type FeatureSyncStatus } from "@/store/featureSyncStore";
import { Cloud, CloudOff, Loader2, CloudAlert } from "lucide-react";

interface BadgeConfig {
  color:   string;
  glow:    string;
  label:   string;
  ping:    boolean;
  icon:    React.ReactNode;
}

const CONFIG: Record<Exclude<FeatureSyncStatus, "idle">, BadgeConfig> = {
  ok: {
    color: "#10b981",
    glow:  "0 0 6px #10b981aa",
    label: "Tersinkron ke Supabase",
    ping:  false,
    icon:  <Cloud className="h-3 w-3" />,
  },
  syncing: {
    color: "#f59e0b",
    glow:  "0 0 6px #f59e0baa",
    label: "Menyinkronkan ke Supabase…",
    ping:  true,
    icon:  <Loader2 className="h-3 w-3 animate-spin" />,
  },
  offline: {
    color: "#9ca3af",
    glow:  "none",
    label: "Hanya tersimpan di device ini (cloud offline)",
    ping:  false,
    icon:  <CloudOff className="h-3 w-3" />,
  },
  error: {
    color: "#ef4444",
    glow:  "0 0 6px #ef4444aa",
    label: "Gagal sync ke Supabase",
    ping:  false,
    icon:  <CloudAlert className="h-3 w-3" />,
  },
};

interface Props {
  /** The settingsSync key, e.g. "admin_settings", "product_commissions". */
  featureKey: string;
  className?: string;
}

export function CloudSyncBadge({ featureKey, className }: Props) {
  const status = useFeatureSyncStore((s) => s.statuses[featureKey] ?? "idle");
  const error  = useFeatureSyncStore((s) => s.errors[featureKey]);
  const lastOk = useFeatureSyncStore((s) => s.lastOk[featureKey]);

  if (status === "idle") return null;

  const cfg = CONFIG[status];

  const tooltipText = status === "error" && error
    ? `Gagal sync: ${error}`
    : status === "ok" && lastOk
      ? `${cfg.label} · ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastOk))}`
      : cfg.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("relative inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-0.5 rounded-full border select-none cursor-default", className)}
          style={{
            color:           cfg.color,
            borderColor:     cfg.color + "44",
            backgroundColor: cfg.color + "11",
          }}
        >
          {/* Ping ring for syncing */}
          {cfg.ping && (
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ backgroundColor: cfg.color }}
            />
          )}
          <span className="relative flex items-center gap-1">
            {cfg.icon}
            <span className="hidden sm:inline leading-none">{
              status === "ok"      ? "Tersimpan" :
              status === "syncing" ? "Menyimpan…" :
              status === "offline" ? "Offline" :
              "Gagal sync"
            }</span>
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px] max-w-[220px] text-center">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
