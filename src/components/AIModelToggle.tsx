/**
 * AIModelToggle — compact inline toggle untuk memilih AI model tier.
 *
 * Tampilkan di dekat tombol AI di tiap fitur. Click → toggle FAST ↔ PRO.
 * State disimpan per-feature di aiOverrideStore (persisted).
 */
import { Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAIOverrideStore,
  AI_TIERS,
  AI_TIER_LABELS,
  type AIFeatureKey,
} from "@/store/aiOverrideStore";

interface AIModelToggleProps {
  feature: AIFeatureKey;
  /** Default tier saat belum ada override. Default: FAST. */
  defaultTier?: (typeof AI_TIERS)[keyof typeof AI_TIERS];
  className?: string;
}

export function AIModelToggle({
  feature,
  defaultTier = AI_TIERS.FAST,
  className,
}: AIModelToggleProps) {
  const { overrides, toggleOverride, setOverride } = useAIOverrideStore();
  const rawActive = overrides[feature] ?? defaultTier;
  // Self-heal: stale cached model ID that no longer exists in AI_TIER_LABELS
  const active: (typeof AI_TIERS)[keyof typeof AI_TIERS] =
    rawActive in AI_TIER_LABELS
      ? (rawActive as (typeof AI_TIERS)[keyof typeof AI_TIERS])
      : defaultTier;
  if (rawActive !== active) {
    // Silently reset the stale override to the default tier
    setOverride(feature, defaultTier);
  }
  const isPro = active === AI_TIERS.PRO;
  const label = AI_TIER_LABELS[active];

  return (
    <button
      type="button"
      onClick={() => toggleOverride(feature, defaultTier)}
      title={`Model aktif: ${label.long}\nKlik untuk ${isPro ? "ganti ke Gemini Flash (cepat)" : "ganti ke Claude Sonnet 4 (kualitas tinggi)"}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all select-none",
        isPro
          ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-300"
          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700",
        className,
      )}
    >
      {isPro ? (
        <Sparkles className="h-3 w-3 text-violet-500 shrink-0" strokeWidth={2} />
      ) : (
        <Zap className="h-3 w-3 text-slate-400 shrink-0" strokeWidth={2} />
      )}
      <span>{label.short}</span>
      <span
        className={cn(
          "rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide leading-none",
          isPro
            ? "bg-violet-200 text-violet-700"
            : "bg-slate-200 text-slate-500",
        )}
      >
        {label.badge}
      </span>
    </button>
  );
}
