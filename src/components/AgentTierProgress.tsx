import { useMemo } from "react";
import { Sparkles, Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getTierInfo, TIERS, type AgentTier } from "@/features/agentPoints/agentTiers";

/**
 * AgentTierProgress — widget di Mitra Dashboard yang ngasih tau:
 *   - Tier saat ini (badge gede)
 *   - Progress bar menuju tier berikutnya
 *   - Sisa poin yg dibutuhin
 *   - Perks tier saat ini & next tier (preview reward)
 *   - Roadmap semua tier (mini-stepper)
 */
export function AgentTierProgress({ totalPoints }: { totalPoints: number }) {
  const info = useMemo(() => getTierInfo(totalPoints), [totalPoints]);
  const { current, next, pointsToNext, progress } = info;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border bg-white overflow-hidden shadow-sm"
    >
      {/* Top: tier banner */}
      <div className={cn("p-4 md:p-5 bg-gradient-to-br", current.gradient)}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-white">
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-90">
              Level Mitra
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl md:text-4xl">{current.emoji}</span>
              <h3 className="text-2xl md:text-3xl font-extrabold">{current.label}</h3>
            </div>
            <p className="text-[12px] mt-1.5 opacity-95">
              {totalPoints} poin lifetime
              {next && pointsToNext > 0 && (
                <> · <span className="font-bold">{pointsToNext} poin lagi</span> menuju {next.label} {next.emoji}</>
              )}
              {!next && <> · 🎉 Lo udah di tier tertinggi!</>}
            </p>
          </div>
          <div className="hidden md:block bg-white/20 backdrop-blur rounded-2xl p-3 border border-white/30">
            <Star className="h-5 w-5 text-white mb-1" />
            <p className="text-[11px] text-white font-bold">⭐ {totalPoints}</p>
          </div>
        </div>

        {/* Progress bar */}
        {next && (
          <div className="mt-4">
            <div className="h-3 rounded-full bg-white/25 overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full shadow-sm"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="flex justify-between text-[10.5px] text-white/85 mt-1.5 font-semibold">
              <span>{current.minPoints} pts</span>
              <span className="text-white">
                {Math.round(progress * 100)}%
              </span>
              <span>{next.minPoints} pts</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: tier perks + roadmap */}
      <div className="p-4 md:p-5 space-y-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Benefit Lo Sekarang ({current.label})
          </p>
          <ul className="space-y-1.5">
            {current.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-[12px] text-foreground">
                <span className="text-emerald-600 font-bold mt-0.5">✓</span>
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        </div>

        {next && (
          <div className={cn("rounded-xl border p-3", next.softBg, "border-dashed")}>
            <p className={cn("text-[10.5px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5", next.softText)}>
              <span className="text-base">{next.emoji}</span>
              Unlock di {next.label}
            </p>
            <ul className="space-y-1">
              {next.perks.map((perk) => (
                <li key={perk} className={cn("flex items-start gap-1.5 text-[11.5px]", next.softText)}>
                  <span className="opacity-60 mt-0.5">→</span>
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Roadmap stepper — semua tier dgn current highlighted */}
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Roadmap Tier
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIERS.map((t) => {
              const isCurrent = t.key === current.key;
              const isPassed = totalPoints >= t.minPoints;
              return (
                <div
                  key={t.key}
                  className={cn(
                    "rounded-lg p-2 text-center border-2 transition-all",
                    isCurrent
                      ? cn("bg-gradient-to-br shadow-sm scale-105", t.gradient, t.borderColor, "text-white")
                      : isPassed
                        ? cn(t.softBg, t.borderColor, t.softText)
                        : "bg-muted/30 border-transparent text-muted-foreground opacity-60",
                  )}
                >
                  <div className="text-base leading-none">{t.emoji}</div>
                  <div className={cn("text-[10px] font-bold mt-0.5", isCurrent ? "text-white" : "")}>
                    {t.label}
                  </div>
                  <div className={cn("text-[9.5px] font-mono mt-0.5", isCurrent ? "text-white/85" : "opacity-70")}>
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

/** Mini badge utk dipake di tabel leaderboard / list. */
export function AgentTierBadge({ tier, size = "sm" }: { tier: AgentTier; size?: "xs" | "sm" }) {
  const meta = TIERS.find((t) => t.key === tier) ?? TIERS[0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold",
        size === "xs" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]",
        meta.softBg,
        meta.softText,
        "border",
        meta.borderColor,
      )}
      title={`Tier ${meta.label}`}
    >
      <span className={size === "xs" ? "text-[10px]" : "text-[11px]"}>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
