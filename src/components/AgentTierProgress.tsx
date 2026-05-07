import { useMemo } from "react";
import { Shield, CheckCircle2, Lock, ChevronRight, Zap, Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getTierInfo, TIERS, type AgentTier } from "@/features/agentPoints/agentTiers";

/* ── Per-tier dark game-card visual tokens ──────────────────────────────────── */
const TIER_STYLE: Record<string, {
  bg: string;
  cardBorder: string;
  accent: string;
  accentText: string;
  accentBorder: string;
  accentSoft: string;
  accentSoftText: string;
  xpBar: string;
  rankBadge: string;
}> = {
  bronze: {
    bg: "bg-[#1c1410]",
    cardBorder: "border-amber-900/40",
    accent: "from-amber-500 to-orange-600",
    accentText: "text-amber-400",
    accentBorder: "border-amber-500/25",
    accentSoft: "bg-amber-500/10",
    accentSoftText: "text-amber-300",
    xpBar: "from-amber-400 to-orange-500",
    rankBadge: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  },
  silver: {
    bg: "bg-[#111418]",
    cardBorder: "border-slate-600/30",
    accent: "from-slate-300 to-slate-500",
    accentText: "text-slate-300",
    accentBorder: "border-slate-400/25",
    accentSoft: "bg-slate-400/10",
    accentSoftText: "text-slate-300",
    xpBar: "from-slate-300 to-slate-500",
    rankBadge: "bg-slate-400/15 text-slate-300 border-slate-400/25",
  },
  gold: {
    bg: "bg-[#1a1500]",
    cardBorder: "border-yellow-800/40",
    accent: "from-yellow-400 to-amber-500",
    accentText: "text-yellow-400",
    accentBorder: "border-yellow-500/25",
    accentSoft: "bg-yellow-500/10",
    accentSoftText: "text-yellow-300",
    xpBar: "from-yellow-300 to-amber-500",
    rankBadge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/25",
  },
  platinum: {
    bg: "bg-[#0f0b1a]",
    cardBorder: "border-violet-700/40",
    accent: "from-violet-400 to-purple-600",
    accentText: "text-violet-400",
    accentBorder: "border-violet-500/25",
    accentSoft: "bg-violet-500/10",
    accentSoftText: "text-violet-300",
    xpBar: "from-violet-400 to-purple-500",
    rankBadge: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  },
};

const TIER_LEVEL: Record<string, number> = {
  bronze: 1, silver: 2, gold: 3, platinum: 4,
};

export function AgentTierProgress({
  totalPoints,
  rank,
  completedOrders = 0,
}: {
  totalPoints: number;
  rank?: { position: number | null; total: number };
  completedOrders?: number;
}) {
  const info = useMemo(() => getTierInfo(totalPoints), [totalPoints]);
  const { current, next, pointsToNext, progress } = info;
  const s = TIER_STYLE[current.key];
  const level = TIER_LEVEL[current.key];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-2xl overflow-hidden shadow-2xl border",
        s.bg, s.cardBorder,
      )}
    >
      {/* ── Top accent line ───────────────────────────────────────────── */}
      <div className={cn("h-[3px] w-full bg-gradient-to-r", s.accent)} />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">

          {/* Level badge + name */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn(
              "h-[52px] w-[52px] rounded-2xl flex flex-col items-center justify-center shrink-0 border bg-gradient-to-br",
              s.accent, s.accentBorder,
            )}>
              <span className="text-[8px] font-bold uppercase tracking-widest text-white/50 leading-none mb-0.5">LVL</span>
              <span className="text-[24px] font-black text-white leading-none">{level}</span>
            </div>

            <div className="min-w-0">
              <p className={cn("text-[9.5px] font-bold uppercase tracking-[0.2em] mb-0.5", s.accentText)}>
                Level Mitra
              </p>
              <h3 className="text-[22px] font-black text-white leading-none tracking-tight">
                {current.emoji} {current.label}
              </h3>
              <p className="text-[11px] text-white/35 mt-1 font-medium">
                {totalPoints.toLocaleString("id-ID")} poin lifetime
              </p>
            </div>
          </div>

          {/* Rank badge */}
          {rank?.position && (
            <div className={cn(
              "shrink-0 rounded-xl px-3 py-2 text-center border",
              s.rankBadge,
            )}>
              <p className="text-[8px] font-bold uppercase tracking-wider opacity-60 leading-none mb-0.5">Rank</p>
              <p className="text-[18px] font-black leading-none">#{rank.position}</p>
              <p className="text-[8px] opacity-40 mt-0.5">dari {rank.total}</p>
            </div>
          )}
        </div>

        {/* XP bar */}
        {next ? (
          <div className="mt-5">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-[10px] text-white/30 font-medium">
                {(totalPoints - current.minPoints).toLocaleString("id-ID")} / {(next.minPoints - current.minPoints).toLocaleString("id-ID")} XP
              </span>
              <span className={cn("text-[10px] font-bold", s.accentText)}>
                {Math.round(progress * 100)}% → {next.label}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full bg-gradient-to-r", s.xpBar)}
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              />
            </div>
            <p className="text-[10px] text-white/25 mt-1.5">
              {pointsToNext} poin lagi menuju{" "}
              <span className="text-white/40 font-semibold">{next.label} {next.emoji}</span>
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <div className="h-2 rounded-full overflow-hidden">
              <div className={cn("h-full w-full rounded-full bg-gradient-to-r", s.xpBar)} />
            </div>
            <p className={cn("text-[10px] font-bold mt-1.5", s.accentText)}>🎉 Tier tertinggi!</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: "Total Poin", value: totalPoints.toLocaleString("id-ID"), icon: Star },
            { label: "Order Selesai", value: completedOrders.toString(), icon: Zap },
            { label: "Status", value: next ? "Naik Level →" : "Max Tier ✦", icon: Shield },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className={cn("rounded-xl p-2.5 border", s.accentSoft, s.accentBorder)}
            >
              <Icon className={cn("h-3 w-3 mb-1.5 stroke-[1.75]", s.accentText)} />
              <p className="text-white text-[12.5px] font-extrabold leading-none truncate">{value}</p>
              <p className="text-white/30 text-[9px] mt-1 font-medium leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="mx-5 border-t border-white/5" />

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="p-5 md:p-6 pt-4 space-y-4">

        {/* Active perks */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/25 mb-2.5 flex items-center gap-1.5">
            <CheckCircle2 className={cn("h-3.5 w-3.5 stroke-[1.75]", s.accentText)} />
            Benefit Aktif
          </p>
          <ul className="space-y-1.5">
            {current.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-[11.5px] text-white/55">
                <span className={cn(
                  "h-3.5 w-3.5 rounded flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-black",
                  s.accentSoft, s.accentText,
                )}>
                  ✓
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>

        {/* Next tier unlock */}
        {next && (
          <div className={cn("rounded-xl border p-3.5", s.accentBorder, s.accentSoft)}>
            <p className={cn("text-[9px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5", s.accentText)}>
              <Lock className="h-3 w-3 stroke-[2]" />
              Unlock di {next.label} {next.emoji}
            </p>
            <ul className="space-y-1.5">
              {next.perks.map((perk) => (
                <li key={perk} className={cn("flex items-start gap-2 text-[11px]", s.accentSoftText)}>
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 mt-0.5 stroke-[2] opacity-60", s.accentText)} />
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tier roadmap */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/25 mb-2.5">
            Tier Roadmap
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIERS.map((t, idx) => {
              const isCurrent = t.key === current.key;
              const isPassed = totalPoints >= t.minPoints && !isCurrent;
              const ts = TIER_STYLE[t.key];
              return (
                <div
                  key={t.key}
                  className={cn(
                    "rounded-xl p-2 text-center border transition-all",
                    isCurrent
                      ? cn("border scale-105 shadow-lg", ts.accentBorder, ts.accentSoft)
                      : isPassed
                        ? "border-white/10 bg-white/5"
                        : "border-white/5 bg-white/[0.02]",
                  )}
                >
                  <div className="text-[14px] leading-none">{t.emoji}</div>
                  <div className={cn(
                    "text-[9px] font-bold mt-1",
                    isCurrent ? ts.accentText : isPassed ? "text-white/45" : "text-white/18",
                  )}>
                    {t.label}
                  </div>
                  <div className={cn(
                    "text-[8px] font-mono mt-0.5",
                    isCurrent ? "text-white/40" : "text-white/15",
                  )}>
                    Lv.{idx + 1}
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

/** Mini tier badge */
export function AgentTierBadge({ tier, size = "sm" }: { tier: AgentTier; size?: "xs" | "sm" }) {
  const meta = TIERS.find((t) => t.key === tier) ?? TIERS[0];
  const s = TIER_STYLE[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold border",
        size === "xs" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]",
        s.rankBadge,
      )}
      title={`Tier ${meta.label}`}
    >
      <span className={size === "xs" ? "text-[10px]" : "text-[11px]"}>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
