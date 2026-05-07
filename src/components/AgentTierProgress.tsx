import { useMemo } from "react";
import {
  CheckCircle2, Lock, ChevronRight, Zap, Star,
  TrendingUp, Award, ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getTierInfo, TIERS, type AgentTier } from "@/features/agentPoints/agentTiers";

/* ── Per-tier ring accent (for the tier avatar ring) ───────────────────────── */
const TIER_RING: Record<string, {
  ring: string;
  ringGlow: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}> = {
  bronze:   { ring: "ring-blue-400",    ringGlow: "shadow-blue-200",    pillBg: "bg-blue-50",    pillText: "text-blue-700",    pillBorder: "border-blue-200" },
  silver:   { ring: "ring-slate-400",   ringGlow: "shadow-slate-200",   pillBg: "bg-slate-50",   pillText: "text-slate-700",   pillBorder: "border-slate-200" },
  gold:     { ring: "ring-yellow-400",  ringGlow: "shadow-yellow-200",  pillBg: "bg-yellow-50",  pillText: "text-yellow-700",  pillBorder: "border-yellow-200" },
  platinum: { ring: "ring-violet-400",  ringGlow: "shadow-violet-200",  pillBg: "bg-violet-50",  pillText: "text-violet-700",  pillBorder: "border-violet-200" },
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
  const tr = TIER_RING[current.key];
  const level = TIER_LEVEL[current.key];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      {/* ── Blue top accent bar ───────────────────────────────────────── */}
      <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 to-blue-700" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-4">

          {/* Tier avatar circle (reference-style with ring) */}
          <div className="shrink-0 relative">
            <div className={cn(
              "h-[62px] w-[62px] rounded-full ring-[3px] flex items-center justify-center bg-slate-50 shadow-md",
              tr.ring, tr.ringGlow,
            )}>
              <span className="text-[30px] leading-none">{current.emoji}</span>
            </div>
            {/* Level number badge */}
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-sm">
              <span className="text-[9px] font-black text-white leading-none">{level}</span>
            </div>
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-blue-500 mb-0.5">
              Level Mitra
            </p>
            <h3 className="text-[20px] font-black text-slate-900 leading-none tracking-tight">
              {current.label}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
              {totalPoints.toLocaleString("id-ID")} poin lifetime
            </p>
          </div>

          {/* Rank badge (top right) */}
          {rank?.position && (
            <div className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center">
              <p className="text-[8.5px] font-bold uppercase tracking-wide text-blue-400 leading-none mb-0.5">Rank</p>
              <p className="text-[17px] font-black text-blue-700 leading-none">#{rank.position}</p>
              <p className="text-[8px] text-blue-400 mt-0.5">dari {rank.total}</p>
            </div>
          )}
        </div>

        {/* ── Stat pills row (inspired by Buzz/Streams reference) ──── */}
        <div className="flex gap-2.5 mt-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-100 bg-blue-50">
            <Star className="h-3 w-3 text-blue-500 stroke-[1.75]" />
            <span className="text-[10.5px] font-bold text-blue-700">
              {totalPoints.toLocaleString("id-ID")} pts
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
            <Zap className="h-3 w-3 text-slate-500 stroke-[1.75]" />
            <span className="text-[10.5px] font-bold text-slate-600">
              {completedOrders} selesai
            </span>
          </div>
          {next && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 ml-auto">
              <TrendingUp className="h-3 w-3 text-slate-400 stroke-[1.75]" />
              <span className="text-[10.5px] font-medium text-slate-500">
                {Math.round(progress * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* ── XP Progress bar ───────────────────────────────────────── */}
        {next ? (
          <div className="mt-4">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10.5px] font-semibold text-slate-500">
                Progress ke {next.label} {next.emoji}
              </span>
              <span className="text-[10.5px] font-bold text-blue-600">
                {(totalPoints - current.minPoints).toLocaleString("id-ID")} / {(next.minPoints - current.minPoints).toLocaleString("id-ID")} XP
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {pointsToNext.toLocaleString("id-ID")} poin lagi menuju{" "}
              <span className="font-semibold text-slate-500">{next.label}</span>
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600" />
            </div>
            <p className="text-[10px] font-bold text-blue-600 mt-1.5 flex items-center gap-1">
              <Award className="h-3 w-3 stroke-[1.75]" />
              Tier tertinggi — Platinum Master!
            </p>
          </div>
        )}
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="mx-5 border-t border-slate-100" />

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="p-5 md:p-6 pt-4 space-y-4">

        {/* Active perks */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 stroke-[1.75]" />
            Benefit Aktif
          </p>
          <ul className="space-y-2">
            {current.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-[11.5px] text-slate-600">
                <span className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-black text-blue-600">
                  ✓
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>

        {/* Next tier unlock */}
        {next && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-blue-500 mb-2 flex items-center gap-1.5">
              <Lock className="h-3 w-3 stroke-[2]" />
              Unlock di {next.label} {next.emoji}
            </p>
            <ul className="space-y-1.5">
              {next.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-[11px] text-blue-700">
                  <ArrowRight className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5 stroke-[1.75]" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tier roadmap */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2.5">
            Tier Roadmap
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIERS.map((t, idx) => {
              const isCurrent = t.key === current.key;
              const isPassed = totalPoints >= t.minPoints && !isCurrent;
              return (
                <div
                  key={t.key}
                  className={cn(
                    "rounded-xl p-2 text-center border transition-all",
                    isCurrent
                      ? "bg-blue-600 border-blue-600 scale-105 shadow-md shadow-blue-200"
                      : isPassed
                        ? "bg-blue-50 border-blue-200"
                        : "bg-slate-50 border-slate-100",
                  )}
                >
                  <div className="text-[14px] leading-none">{t.emoji}</div>
                  <div className={cn(
                    "text-[9px] font-bold mt-1 leading-tight",
                    isCurrent ? "text-white" : isPassed ? "text-blue-600" : "text-slate-400",
                  )}>
                    {t.label}
                  </div>
                  <div className={cn(
                    "text-[8px] font-mono mt-0.5",
                    isCurrent ? "text-blue-200" : "text-slate-300",
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

/** Mini tier badge — white/blue themed */
export function AgentTierBadge({ tier, size = "sm" }: { tier: AgentTier; size?: "xs" | "sm" }) {
  const meta = TIERS.find((t) => t.key === tier) ?? TIERS[0];
  const tr = TIER_RING[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold border",
        size === "xs" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]",
        tr.pillBg, tr.pillText, tr.pillBorder,
      )}
      title={`Tier ${meta.label}`}
    >
      <span className={size === "xs" ? "text-[10px]" : "text-[11px]"}>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
