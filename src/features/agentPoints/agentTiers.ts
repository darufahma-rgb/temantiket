/**
 * Agent Tier system — Bronze / Silver / Gold / Platinum.
 * Threshold dihitung berdasarkan total `points` lifetime di tabel agent_points.
 *
 * Default award: 10 poin per Completed order. Jadi:
 *   - Bronze : 0   – 99 pts  (0 – 9 order)
 *   - Silver : 100 – 499 pts (10 – 49 order)
 *   - Gold   : 500 – 1499 pts (50 – 149 order)
 *   - Platinum: 1500+ pts    (150+ order)
 *
 * Threshold ini disengaja agresif di awal (Silver cepet diraih biar
 * mitra ngerasa "gw bisa naik level") tapi makin nyari makin lambat
 * (gamification: easy first wins, then long tail).
 */

export type AgentTier = "bronze" | "silver" | "gold" | "platinum";

export interface TierMeta {
  key: AgentTier;
  label: string;
  emoji: string;
  /** min poin utk masuk tier ini */
  minPoints: number;
  /** Tailwind gradient class (utk badge / progress bar) */
  gradient: string;
  /** Tailwind text color (kontras di atas gradient) */
  textColor: string;
  /** border accent class */
  borderColor: string;
  /** soft bg untuk card/badge */
  softBg: string;
  softText: string;
  /** hex utk SVG/canvas */
  hex: string;
  /** perks deskriptif (ditampilin di Progress widget) */
  perks: string[];
}

export const TIERS: TierMeta[] = [
  {
    key: "bronze",
    label: "Bronze",
    emoji: "🥉",
    minPoints: 0,
    gradient: "from-orange-400 to-amber-600",
    textColor: "text-white",
    borderColor: "border-amber-300",
    softBg: "bg-amber-50",
    softText: "text-amber-800",
    hex: "#b45309",
    perks: [
      "Komisi standar per order",
      "Akses Marketing Kit dasar",
      "Leaderboard bulanan",
    ],
  },
  {
    key: "silver",
    label: "Silver",
    emoji: "🥈",
    minPoints: 100,
    gradient: "from-slate-300 to-slate-500",
    textColor: "text-white",
    borderColor: "border-slate-300",
    softBg: "bg-slate-50",
    softText: "text-slate-800",
    hex: "#64748b",
    perks: [
      "Bonus komisi +1% setiap order",
      "Prioritas balas pesan dari admin",
      "Eligible reward bulanan tier Silver",
    ],
  },
  {
    key: "gold",
    label: "Gold",
    emoji: "🥇",
    minPoints: 500,
    gradient: "from-yellow-400 to-amber-600",
    textColor: "text-white",
    borderColor: "border-yellow-400",
    softBg: "bg-yellow-50",
    softText: "text-yellow-800",
    hex: "#ca8a04",
    perks: [
      "Bonus komisi +2% setiap order",
      "Akses template promo eksklusif",
      "Undangan event tahunan mitra",
    ],
  },
  {
    key: "platinum",
    label: "Platinum",
    emoji: "💎",
    minPoints: 1500,
    gradient: "from-indigo-500 via-purple-500 to-pink-500",
    textColor: "text-white",
    borderColor: "border-purple-400",
    softBg: "bg-purple-50",
    softText: "text-purple-800",
    hex: "#7c3aed",
    perks: [
      "Bonus komisi +3% setiap order",
      "Booking trip umrah gratis tahunan",
      "Profil tampil di hero halaman publik",
    ],
  },
];

export interface TierInfo {
  current: TierMeta;
  next: TierMeta | null;
  /** Poin yg masih dibutuhin utk naik tier (0 kalo udah di tier tertinggi) */
  pointsToNext: number;
  /** 0..1 — progress di dalam tier saat ini menuju tier berikutnya */
  progress: number;
}

export function getTierInfo(points: number): TierInfo {
  const safe = Math.max(0, Math.floor(points));
  // Cari tier tertinggi yg syaratnya udah dipenuhi.
  let current = TIERS[0];
  for (const t of TIERS) {
    if (safe >= t.minPoints) current = t;
  }
  const idx = TIERS.findIndex((t) => t.key === current.key);
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  if (!next) {
    return { current, next: null, pointsToNext: 0, progress: 1 };
  }
  const span = next.minPoints - current.minPoints;
  const inTier = safe - current.minPoints;
  const progress = span > 0 ? Math.min(1, Math.max(0, inTier / span)) : 1;
  return {
    current,
    next,
    pointsToNext: Math.max(0, next.minPoints - safe),
    progress,
  };
}

/** Helper: dapatkan TierMeta berdasarkan key (utk UI badge). */
export function getTierByKey(key: AgentTier): TierMeta {
  return TIERS.find((t) => t.key === key) ?? TIERS[0];
}
