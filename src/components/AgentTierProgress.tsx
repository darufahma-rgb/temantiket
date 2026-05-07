import { useMemo } from "react";
import { Star, CheckCircle2, Lock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getTierInfo, TIERS, type AgentTier } from "@/features/agentPoints/agentTiers";

/* ── Blue palette overrides for all tiers ─────────────────────────────────── */
const TIER_BLUE: Record<string, { banner: string; badge: string; badgeText: string; border: string; dot: string }> = {
  bronze:   { banner: "from-blue-500 to-blue-700",   badge: "bg-blue-50 text-blue-700 border-blue-200",  badgeText: "text-blue-700",  border: "border-blue-300", dot: "bg-blue-500" },
  silver:   { banner: "from-blue-600 to-blue-800",   badge: "bg-blue-50 text-blue-700 border-blue-200",  badgeText: "text-blue-700",  border: "border-blue-300", dot: "bg-blue-600" },
  gold:     { banner: "from-blue-700 to-blue-900",   badge: "bg-blue-50 text-blue-800 border-blue-200",  badgeText: "text-blue-800",  border: "border-blue-400", dot: "bg-blue-700" },
  platinum: { banner: "from-slate-700 to-blue-900",  badge: "bg-blue-50 text-blue-900 border-blue-300",  badgeText: "text-blue-900",  border: "border-blue-400", dot: "bg-blue-800" },
};

export function AgentTierProgress({ totalPoints }: { totalPoints: number }) {
  const info = useMemo(() => getTierInfo(totalPoints), [totalPoints]);
  const { current, next, pointsToNext, progress } = info;
  const blue = TIER_BLUE[current.key];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm"
    >
      {/* ── Tier banner ───────────────────────────────────────────────── */}
      <div className={cn("bg-gradient-to-br p-5 md:p-6", blue.banner)}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-white min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100 mb-2">
              Level Mitra
            </p>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-3xl md:text-4xl leading-none">{current.emoji}</span>
              <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight">{current.label}</h3>
            </div>
            <p className="text-[12px] text-blue-100 leading-snug">
              <span className="font-bold text-white">{totalPoints}</span> poin lifetime
              {next && pointsToNext > 0 && (
                <>
                  {" · "}
                  <span className="font-bold text-white">{pointsToNext} poin lagi</span>
                  {" menuju "}{next.label}
                </>
              )}
              {!next && <> · <span className="font-semibold text-white">🎉 Tier tertinggi!</span></>}
            </p>
          </div>

          {/* Points badge */}
          <div className="shrink-0 bg-white/15 border border-white/25 backdrop-blur rounded-2xl px-3 py-2.5 text-center min-w-[56px]">
            <Star className="h-4 w-4 text-white mx-auto mb-1 stroke-[1.5]" />
            <p className="text-[13px] font-extrabold text-white leading-none">{totalPoints}</p>
            <p className="text-[9px] text-blue-100 mt-0.5 font-medium">pts</p>
          </div>
        </div>

        {/* Progress bar */}
        {next && (
          <div className="mt-5">
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full shadow"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-blue-100 mt-1.5 font-semibold">
              <span>{current.minPoints} pts</span>
              <span className="text-white font-bold">{Math.round(progress * 100)}%</span>
              <span>{next.minPoints} pts</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="p-4 md:p-5 space-y-4">

        {/* Current perks */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 stroke-[1.75]" />
            Benefit Lo Sekarang
          </p>
          <ul className="space-y-2">
            {current.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-[12px] text-slate-600">
                <span className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-600 text-[9px] font-extrabold">✓</span>
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>

        {/* Next tier preview */}
        {next && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-2 flex items-center gap-1.5">
              <Lock className="h-3 w-3 stroke-[1.75]" />
              Unlock di {next.label} {next.emoji}
            </p>
            <ul className="space-y-1.5">
              {next.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-[11.5px] text-blue-700">
                  <ChevronRight className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5 stroke-[2]" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tier roadmap */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">
            Roadmap Tier
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIERS.map((t) => {
              const isCurrent = t.key === current.key;
              const isPassed  = totalPoints >= t.minPoints;
              return (
                <div
                  key={t.key}
                  className={cn(
                    "rounded-xl p-2 text-center border-2 transition-all",
                    isCurrent
                      ? "bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500 text-white scale-105 shadow-md shadow-blue-200"
                      : isPassed
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-slate-50 border-slate-100 text-slate-300",
                  )}
                >
                  <div className="text-[15px] leading-none">{t.emoji}</div>
                  <div className={cn("text-[10px] font-bold mt-1", isCurrent ? "text-white" : "")}>
                    {t.label}
                  </div>
                  <div className={cn("text-[9px] font-mono mt-0.5", isCurrent ? "text-blue-100" : "opacity-60")}>
                    {t.minPoints}+
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Mini tier badge — blue themed */
export function AgentTierBadge({ tier, size = "sm" }: { tier: AgentTier; size?: "xs" | "sm" }) {
  const meta = TIERS.find((t) => t.key === tier) ?? TIERS[0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold border",
        size === "xs" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]",
        "bg-blue-50 text-blue-700 border-blue-200",
      )}
      title={`Tier ${meta.label}`}
    >
      <span className={size === "xs" ? "text-[10px]" : "text-[11px]"}>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
