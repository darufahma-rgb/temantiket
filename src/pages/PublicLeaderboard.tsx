/**
 * PublicLeaderboard — /leaderboard
 * Redesigned: full-width hero, podium Top 3, scrollable rank list,
 * period filter, search, tier badges, dual CTA, "Cara Naik Ranking".
 * Data: get_top_members RPC (anon-safe, SECURITY DEFINER, lifetime total stamps).
 * Auto-refresh every 60 s.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Loader2, AlertCircle, Sparkles, Star, Gift,
  Search, RefreshCw, TrendingUp, Users, CheckCircle,
  MessageCircle, Share2, Crown, Zap, X,
} from "lucide-react";
import { fetchTopMembers, type LeaderboardEntry } from "@/features/portal/leaderboardRepo";
import { loadIghAdminSettings, whatsappDigits } from "@/lib/ighSettings";

// ─── Client Loyalty Tier (stamp-based) ────────────────────────────────────────

interface StampTier {
  key: string;
  label: string;
  emoji: string;
  minStamps: number;
  bg: string;
  text: string;
  border: string;
  ring: string;
  barFrom: string;
  barTo: string;
}

const STAMP_TIERS: StampTier[] = [
  {
    key: "pemula",
    label: "Pemula",
    emoji: "🌱",
    minStamps: 0,
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    ring: "ring-sky-300",
    barFrom: "from-sky-400",
    barTo: "to-cyan-500",
  },
  {
    key: "traveler",
    label: "Traveler",
    emoji: "✈️",
    minStamps: 3,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    ring: "ring-emerald-300",
    barFrom: "from-emerald-400",
    barTo: "to-teal-500",
  },
  {
    key: "explorer",
    label: "Explorer",
    emoji: "🗺️",
    minStamps: 6,
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    ring: "ring-amber-300",
    barFrom: "from-amber-400",
    barTo: "to-orange-400",
  },
  {
    key: "voyager",
    label: "Voyager",
    emoji: "🏆",
    minStamps: 10,
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    ring: "ring-orange-300",
    barFrom: "from-orange-400",
    barTo: "to-red-500",
  },
  {
    key: "legend",
    label: "Legend",
    emoji: "💎",
    minStamps: 16,
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-300",
    ring: "ring-violet-400",
    barFrom: "from-violet-500",
    barTo: "to-purple-600",
  },
];

function getStampTier(stamps: number): StampTier {
  let tier = STAMP_TIERS[0];
  for (const t of STAMP_TIERS) {
    if (stamps >= t.minStamps) tier = t;
  }
  return tier;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAMP_MAX = 16;

function getMemberId(memberIndex: number): string {
  return `TMNTKT${String(memberIndex).padStart(4, "0")}`;
}

function avatarGradient(name: string): string {
  const pairs = [
    "from-violet-500 to-purple-700",
    "from-sky-500 to-blue-700",
    "from-emerald-500 to-green-700",
    "from-rose-500 to-pink-700",
    "from-fuchsia-500 to-purple-700",
    "from-teal-500 to-cyan-700",
    "from-indigo-500 to-indigo-700",
    "from-orange-500 to-red-700",
    "from-amber-500 to-yellow-600",
    "from-cyan-500 to-sky-700",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return pairs[Math.abs(h) % pairs.length];
}

type PeriodKey = "bulan_ini" | "lifetime";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  bulan_ini: "Bulan Ini",
  lifetime: "Lifetime",
};

const MEDAL_CFG: Record<number, {
  emoji: string;
  cardBg: string;
  border: string;
  shadow: string;
  stamp: string;
  rankText: string;
  crown: string;
}> = {
  1: {
    emoji: "🥇",
    cardBg: "bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/70",
    border: "border-amber-300/70",
    shadow: "shadow-amber-200/50",
    stamp: "text-amber-700",
    rankText: "text-amber-500",
    crown: "text-amber-400",
  },
  2: {
    emoji: "🥈",
    cardBg: "bg-gradient-to-br from-slate-50 via-sky-50/40 to-slate-100/70",
    border: "border-slate-300/70",
    shadow: "shadow-slate-200/40",
    stamp: "text-slate-700",
    rankText: "text-slate-500",
    crown: "text-slate-400",
  },
  3: {
    emoji: "🥉",
    cardBg: "bg-gradient-to-br from-orange-50 via-amber-50/40 to-orange-100/70",
    border: "border-orange-300/70",
    shadow: "shadow-orange-200/40",
    stamp: "text-orange-700",
    rankText: "text-orange-500",
    crown: "text-orange-400",
  },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StampProgress({ count, max = STAMP_MAX, tier }: { count: number; max?: number; tier: StampTier }) {
  const completed = Math.floor(count / max);
  const remainder = count % max;
  const pct = Math.min(100, Math.round((remainder / max) * 100));
  return (
    <div className="w-full space-y-0.5">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={`h-full bg-gradient-to-r ${tier.barFrom} ${tier.barTo} rounded-full`}
          />
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0 tabular-nums">
          {remainder}/{max}
        </span>
      </div>
      {completed > 0 && (
        <p className="text-[9.5px] text-violet-600 font-semibold">
          ✨ {completed}x kartu penuh
        </p>
      )}
    </div>
  );
}

function TierBadge({ tier, size = "sm" }: { tier: StampTier; size?: "xs" | "sm" }) {
  const cls = size === "xs"
    ? `text-[9px] px-1.5 py-0.5 gap-0.5`
    : `text-[10.5px] px-2 py-0.5 gap-1`;
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${tier.bg} ${tier.text} ${tier.border} ${cls}`}>
      <span>{tier.emoji}</span>
      {tier.label}
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeMap = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-[13px]",
    lg: "h-14 w-14 text-[18px]",
  };
  return (
    <div className={`
      ${sizeMap[size]}
      rounded-full bg-gradient-to-br ${avatarGradient(name)}
      flex items-center justify-center
      font-extrabold text-white ring-2 ring-white shadow-md shrink-0
    `}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// Podium card for Top 3 — prominent, info-rich
function PodiumCard({ entry, rank, delay = 0 }: { entry: LeaderboardEntry | null; rank: 1 | 2 | 3; delay?: number }) {
  const cfg = MEDAL_CFG[rank];
  const isFirst = rank === 1;

  if (!entry) {
    return (
      <div className={`rounded-3xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/25 ${isFirst ? "min-h-[300px] md:min-h-[340px]" : "min-h-[240px] md:min-h-[280px]"}`}>
        <Trophy className="h-8 w-8 mb-2 opacity-40" />
        <span className="text-sm font-bold">#{rank}</span>
      </div>
    );
  }

  const tier = getStampTier(entry.totalStamps);
  const memberId = getMemberId(entry.memberIndex);
  const pct = Math.min(100, Math.round(((entry.totalStamps % STAMP_MAX) / STAMP_MAX) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: isFirst ? -16 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={`
        rounded-3xl border backdrop-blur-sm shadow-xl flex flex-col overflow-hidden
        ${cfg.cardBg} ${cfg.border} shadow-${cfg.shadow}
        ${isFirst ? "md:scale-[1.04] z-10 ring-1 ring-amber-300/40" : ""}
      `}
    >
      {/* Crown + Rank */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-2xl">{cfg.emoji}</span>
        <div className="flex items-center gap-1">
          <Crown className={`h-3.5 w-3.5 ${cfg.crown}`} />
          <span className={`text-xs font-extrabold uppercase tracking-widest ${cfg.rankText}`}>
            #{rank}
          </span>
        </div>
      </div>

      {/* Avatar + Name */}
      <div className="flex flex-col items-center px-4 pb-3 gap-2 text-center">
        <Avatar name={entry.firstName} size={isFirst ? "lg" : "md"} />
        <div>
          <p className="font-extrabold text-slate-800 text-[15px] leading-tight">{entry.firstName}</p>
          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{memberId}</p>
        </div>
        <TierBadge tier={tier} />
      </div>

      {/* Stamp count */}
      <div className="mx-4 rounded-2xl bg-white/60 px-3 py-2.5 text-center mb-3">
        <div className={`text-3xl font-black ${cfg.stamp} tabular-nums`}>{entry.totalStamps}</div>
        <div className="text-[10px] text-slate-500 font-medium -mt-0.5">total stamp</div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-2">
        <div className="h-1.5 bg-white/40 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, delay: delay + 0.2, ease: "easeOut" }}
            className={`h-full bg-gradient-to-r ${tier.barFrom} ${tier.barTo} rounded-full`}
          />
        </div>
        <div className="flex justify-between mt-0.5 text-[9px] text-slate-400 font-mono">
          <span>{entry.totalStamps % STAMP_MAX}/{STAMP_MAX}</span>
          <span>{Math.min(100, pct)}%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center divide-x divide-white/30 border-t border-white/30 mt-auto">
        <div className="flex-1 py-2.5 text-center">
          <p className="text-[11px] font-bold text-slate-700">{entry.orderStamps}</p>
          <p className="text-[9px] text-slate-400">order</p>
        </div>
        <div className="flex-1 py-2.5 text-center">
          <p className="text-[11px] font-bold text-emerald-600 flex items-center justify-center gap-0.5">
            <Gift className="h-2.5 w-2.5" />{entry.referralStamps}
          </p>
          <p className="text-[9px] text-slate-400">referral</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PublicLeaderboard() {
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [period, setPeriod]         = useState<PeriodKey>("lifetime");
  const [search, setSearch]         = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const adminSettings = useMemo(() => loadIghAdminSettings(), []);
  const waDigits      = whatsappDigits(adminSettings.adminWhatsapp);
  const waBase        = waDigits ? `https://wa.me/${waDigits}` : "https://wa.me/";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const result = await fetchTopMembers(50);
    if (result.ok) {
      setAllEntries(result.entries);
      setLastUpdated(new Date());
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(false);
    timerRef.current = setInterval(() => { void load(true); }, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  // Filter entries by search
  const filtered = useMemo(() => {
    if (!search.trim()) return allEntries;
    const q = search.toLowerCase();
    return allEntries.filter(
      (e) =>
        e.firstName.toLowerCase().includes(q) ||
        getMemberId(e.memberIndex).toLowerCase().includes(q),
    );
  }, [allEntries, search]);

  // For "Bulan Ini": highlight members with recent order activity (orderStamps > 0)
  // Note: RPC only returns lifetime totals — period display is informational.
  const entries = useMemo(() => {
    if (period === "bulan_ini") {
      // Show members with order stamps first (more likely to be recently active)
      return [...filtered].sort((a, b) => {
        if (b.orderStamps !== a.orderStamps) return b.orderStamps - a.orderStamps;
        return b.totalStamps - a.totalStamps;
      });
    }
    return filtered; // lifetime: already sorted by totalStamps desc by RPC
  }, [filtered, period]);

  const top3   = entries.slice(0, 3);
  const rest   = entries.slice(3);
  // Podium order: left=2nd, center=1st, right=3rd
  const podium = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null] as const;

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());

  const waBookingLink  = `${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya mau pesan perjalanan dan kumpulkan stamp loyalty. Bisa bantu saya? 🙏✈️")}`;
  const waReferralLink = `${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya ingin ajak teman untuk dapat bonus stamp referral. Bagaimana caranya? 🎁")}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 flex flex-col">

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img
              src="/temantiket-icon.svg"
              alt="Temantiket"
              className="h-7 w-7 object-contain"
            />
            <span className="text-sm font-bold text-white">Temantiket</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/harga-tiket"
              className="text-[11px] font-medium text-white/60 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              Harga Tiket
            </Link>
            <a
              href={waBase}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-sky-300 hover:text-white bg-sky-900/60 hover:bg-sky-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              Hubungi Kami
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Ambient blobs */}
        <div className="absolute inset-0 pointer-events-none select-none">
          <div className="absolute top-[-60px] left-[10%] w-96 h-96 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="absolute top-[20px] right-[5%] w-80 h-80 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-[40%] w-72 h-72 rounded-full bg-sky-400/8 blur-3xl" />
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <span className="text-[12rem] md:text-[18rem] font-black text-white/[0.025] leading-none tracking-tighter whitespace-nowrap select-none">
              LEADERS
            </span>
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-12 pb-10 text-center space-y-4">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-amber-400/20 border border-amber-400/30 text-amber-300 text-[11px] font-semibold px-4 py-1.5 rounded-full"
          >
            <Sparkles className="h-3 w-3" />
            <span>{monthLabel}</span>
            <span className="opacity-60">·</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">
              <Trophy className="inline h-8 w-8 md:h-11 md:w-11 text-amber-400 mb-1 mr-2" />
              Leaderboard
              <br className="md:hidden" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400"> Travel Enthusiast</span>
            </h1>
            <p className="text-white/60 text-sm md:text-base mt-2 max-w-xl mx-auto">
              Member Temantiket paling aktif — diukur dari total stamp perjalanan, bonus referral, dan order yang diselesaikan.
            </p>
          </motion.div>

          {/* Stats strip */}
          {!loading && allEntries.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="flex items-center justify-center gap-6 flex-wrap"
            >
              <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                <Users className="h-3.5 w-3.5" />
                <span><strong className="text-white">{allEntries.length}</strong> member aktif</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                <span>Total <strong className="text-white">{allEntries.reduce((s, e) => s + e.totalStamps, 0)}</strong> stamp terkumpul</span>
              </div>
              {lastUpdated && (
                <div className="flex items-center gap-1.5 text-white/40 text-[11px]">
                  <RefreshCw className="h-3 w-3" />
                  <span>Update {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="sticky top-[53px] z-20 border-b border-white/10 bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* Period pills */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 shrink-0">
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setPeriod(k)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  period === k
                    ? "bg-amber-400 text-slate-900 shadow"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {PERIOD_LABEL[k]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[160px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
            <input
              type="text"
              placeholder="Cari nama / Member ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 text-[12px] rounded-xl pl-8 pr-8 py-2 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="shrink-0 p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
            title="Refresh leaderboard"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Count */}
          <span className="shrink-0 text-[11px] text-white/40">
            {entries.length} member
          </span>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 space-y-8">

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
            <p className="text-white/50 text-sm">Memuat leaderboard…</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-3xl border border-red-400/30 bg-red-950/40 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-semibold text-sm mb-1">Gagal memuat leaderboard</p>
            <p className="text-red-400/70 text-xs mb-4">{error}</p>
            <button
              onClick={() => void load(false)}
              className="bg-red-500 hover:bg-red-400 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && allEntries.length > 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <Search className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/60 font-semibold text-sm">Tidak ada member yang cocok dengan pencarian</p>
            <button onClick={() => setSearch("")} className="mt-3 text-amber-400 text-xs hover:underline">
              Hapus pencarian
            </button>
          </div>
        )}

        {!loading && !error && allEntries.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/15 p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-white/20" />
            <p className="text-white/50 font-semibold">Leaderboard masih kosong.</p>
            <p className="text-white/30 text-sm mt-1">Jadilah yang pertama mengisi stamp card!</p>
          </div>
        )}

        {/* ── Top 3 Podium ─────────────────────────────────────────────────── */}
        {!loading && !error && entries.length > 0 && (
          <AnimatePresence mode="wait">
            <motion.section
              key={period}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white/70 uppercase tracking-widest flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-400" /> Top 3 Champions
                </h2>
                <span className="text-[11px] text-white/40 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full text-amber-300">
                  {PERIOD_LABEL[period]}
                </span>
              </div>

              {/* Podium: 2nd | 1st | 3rd */}
              <div className="grid grid-cols-3 gap-3 md:gap-5 items-end">
                {([2, 1, 3] as const).map((rank, idx) => (
                  <PodiumCard
                    key={rank}
                    entry={podium[idx]}
                    rank={rank}
                    delay={rank === 1 ? 0 : rank === 2 ? 0.1 : 0.18}
                  />
                ))}
              </div>
            </motion.section>
          </AnimatePresence>
        )}

        {/* ── Full Rankings ──────────────────────────────────────────────────── */}
        {!loading && !error && entries.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white/70 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-sky-400" /> Ranking Lengkap
              </h2>
              <span className="text-[11px] text-white/40">{entries.length} member</span>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
              {/* Table header (desktop) */}
              <div className="hidden md:grid grid-cols-[52px_1fr_80px_100px_110px_90px_80px] gap-3 items-center px-5 py-3 border-b border-white/10 bg-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 text-center">#</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Member</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 text-center">Stamp</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Progress</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Tier</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 text-center">Order</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 text-center">Referral</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-white/5">
                {entries.map((entry, i) => {
                  const rank   = i + 1;
                  const tier   = getStampTier(entry.totalStamps);
                  const membId = getMemberId(entry.memberIndex);
                  const isTop3 = rank <= 3;
                  const medals = ["🥇", "🥈", "🥉"];

                  return (
                    <motion.div
                      key={`${entry.memberIndex}-${period}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.5) }}
                      className={`
                        flex flex-col md:grid md:grid-cols-[52px_1fr_80px_100px_110px_90px_80px] md:gap-3
                        items-start md:items-center px-4 md:px-5 py-4 transition-colors
                        ${isTop3
                          ? rank === 1 ? "bg-amber-400/5 hover:bg-amber-400/10"
                          : rank === 2 ? "bg-slate-400/5 hover:bg-slate-400/10"
                          : "bg-orange-400/5 hover:bg-orange-400/10"
                          : "hover:bg-white/5"
                        }
                      `}
                    >
                      {/* Mobile layout — stacked */}
                      <div className="flex items-center gap-3 w-full md:contents">

                        {/* Rank badge */}
                        <div className={`
                          shrink-0 h-9 w-9 md:h-8 md:w-8 rounded-xl flex items-center justify-center font-extrabold text-sm
                          ${isTop3
                            ? rank === 1 ? "bg-amber-100 text-amber-600 border border-amber-300"
                            : rank === 2 ? "bg-slate-100 text-slate-600 border border-slate-300"
                            : "bg-orange-100 text-orange-600 border border-orange-300"
                            : "bg-white/10 text-white/50 text-[11px] font-mono border border-white/10"
                          }
                        `}>
                          {isTop3 ? medals[rank - 1] : rank}
                        </div>

                        {/* Member info */}
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <Avatar name={entry.firstName} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-white truncate">{entry.firstName}</span>
                              <span className="text-[9.5px] font-mono text-white/35 shrink-0">{membId}</span>
                            </div>
                            {/* Mobile: show tier + progress inline */}
                            <div className="flex items-center gap-2 mt-0.5 md:hidden">
                              <TierBadge tier={tier} size="xs" />
                              <span className="text-[9px] text-white/40 font-mono">
                                {entry.totalStamps % STAMP_MAX}/{STAMP_MAX} stamp
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mobile: stamp count */}
                        <div className="shrink-0 text-right md:hidden">
                          <div className="text-xl font-black text-amber-300 tabular-nums">{entry.totalStamps}</div>
                          <div className="text-[9px] text-white/35">stamp</div>
                        </div>

                      </div>

                      {/* Mobile: progress bar + bottom stats */}
                      <div className="w-full mt-2 md:hidden pl-[calc(36px+12px+32px+12px)]">
                        <StampProgress count={entry.totalStamps} tier={tier} />
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-white/40 flex items-center gap-1">
                            <CheckCircle className="h-2.5 w-2.5 text-sky-400" />
                            {entry.orderStamps} order
                          </span>
                          {entry.referralStamps > 0 && (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <Gift className="h-2.5 w-2.5" />
                              +{entry.referralStamps} referral
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Desktop: individual cells */}
                      {/* Stamp count */}
                      <div className="hidden md:flex items-center justify-center">
                        <span className={`text-xl font-black tabular-nums ${
                          isTop3
                            ? rank === 1 ? "text-amber-300" : rank === 2 ? "text-slate-300" : "text-orange-300"
                            : "text-white/80"
                        }`}>{entry.totalStamps}</span>
                      </div>

                      {/* Progress bar */}
                      <div className="hidden md:block">
                        <StampProgress count={entry.totalStamps} tier={tier} />
                      </div>

                      {/* Tier */}
                      <div className="hidden md:flex items-center">
                        <TierBadge tier={tier} size="xs" />
                      </div>

                      {/* Order stamps */}
                      <div className="hidden md:flex items-center justify-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-sky-400" />
                        <span className="text-[12px] font-bold text-white/70">{entry.orderStamps}</span>
                      </div>

                      {/* Referral stamps */}
                      <div className="hidden md:flex items-center justify-center gap-1">
                        {entry.referralStamps > 0 ? (
                          <>
                            <Gift className="h-3 w-3 text-emerald-400" />
                            <span className="text-[12px] font-bold text-emerald-400">+{entry.referralStamps}</span>
                          </>
                        ) : (
                          <span className="text-[11px] text-white/20">—</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Footer */}
              {entries.length >= 50 && (
                <div className="px-5 py-4 border-t border-white/10 text-center text-[11px] text-white/30">
                  Menampilkan 50 member teratas · Data diperbarui otomatis setiap 60 detik
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Cara Naik Ranking ─────────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2 mb-5">
            <Zap className="h-5 w-5 text-amber-400" />
            Cara Naik Ranking
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                icon: "✈️",
                title: "Beli tiket pesawat",
                desc: "Setiap tiket pesawat yang dibeli melalui Temantiket = +1 stamp otomatis.",
                badge: "+1 stamp",
                badgeColor: "bg-sky-400/20 text-sky-300 border-sky-400/30",
              },
              {
                icon: "🕋",
                title: "Ikut paket Umrah / Haji",
                desc: "Daftar paket Umrah atau Haji melalui Temantiket — perjalanan ibadah yang berkah.",
                badge: "+1 stamp",
                badgeColor: "bg-emerald-400/20 text-emerald-300 border-emerald-400/30",
              },
              {
                icon: "🔺",
                title: "Proses Visa",
                desc: "Ajukan Visa on Arrival, Visa Pelajar, atau layanan visa lainnya lewat kami.",
                badge: "+1 stamp",
                badgeColor: "bg-violet-400/20 text-violet-300 border-violet-400/30",
              },
              {
                icon: "🎁",
                title: "Ajak teman via Referral",
                desc: "Referensikan teman ke Temantiket dan dapatkan bonus stamp referral eksklusif.",
                badge: "+1 bonus stamp",
                badgeColor: "bg-amber-400/20 text-amber-300 border-amber-400/30",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="flex items-start gap-4 bg-white/5 rounded-2xl p-4 border border-white/8"
              >
                <div className="shrink-0 h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[13px] font-bold text-white">{step.title}</span>
                    <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${step.badgeColor}`}>
                      {step.badge}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-white/50 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tier progression */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-3">Tier Member</p>
            <div className="flex flex-wrap gap-2">
              {STAMP_TIERS.map((t) => (
                <div key={t.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${t.bg} ${t.border}`}>
                  <span className="text-xs">{t.emoji}</span>
                  <span className={`text-[10.5px] font-bold ${t.text}`}>{t.label}</span>
                  <span className={`text-[9px] ${t.text} opacity-70`}>≥{t.minStamps} stamp</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────────── */}
        <section className="rounded-3xl overflow-hidden">
          <div className="bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700 p-7 md:p-10 text-white">
            <div className="max-w-xl mx-auto text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 bg-white/20 text-white text-[11px] font-semibold px-3 py-1 rounded-full border border-white/20">
                <Trophy className="h-3 w-3 text-amber-300" /> Bergabung &amp; Raih Peringkat
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold leading-tight">
                Kumpulkan Stamp, Naik Tier,<br className="hidden md:block" /> Jadi yang Terdepan!
              </h2>
              <p className="text-white/75 text-sm">
                Setiap perjalanan bersama Temantiket = stamp loyalty. Ajak teman untuk bonus stamp referral eksklusif.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <a
                  href={waBookingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold text-[13px] px-6 py-3 rounded-2xl shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                >
                  <MessageCircle className="h-4 w-4" />
                  Pesan Perjalanan &amp; Kumpulkan Stamp
                </a>
                <a
                  href={waReferralLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/15 border border-white/30 text-white font-bold text-[13px] px-6 py-3 rounded-2xl hover:bg-white/25 transition-all"
                >
                  <Share2 className="h-4 w-4" />
                  Ajak Teman via Referral
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Gabung Jadi Agen ────────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
        {/* Header strip */}
        <div className="bg-gradient-to-r from-violet-600/30 via-purple-600/20 to-indigo-600/30 border-b border-white/10 px-6 md:px-8 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center shrink-0">
            <span className="text-lg">🤝</span>
          </div>
          <div>
            <h2 className="text-[15px] font-extrabold text-white">Gabung Jadi Agen Temantiket</h2>
            <p className="text-[11px] text-white/50 mt-0.5">Bantu orang bepergian, kamu yang untung — dapatkan komisi & naik level agen</p>
          </div>
        </div>

        <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8">
          {/* Left: Benefit + Syarat */}
          <div className="space-y-5">
            {/* Keuntungan */}
            <div>
              <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-3">Keuntungan Agen</p>
              <div className="space-y-2">
                {[
                  { icon: "💰", text: "Komisi tetap per order — langsung dihitung sistem" },
                  { icon: "🏆", text: "Sistem tier Bronze → Silver → Gold → Platinum berdasarkan poin aktif" },
                  { icon: "📱", text: "Marketing Kit & template promo eksklusif dari Temantiket" },
                  { icon: "🎯", text: "Bonus poin dari misi khusus & challenge bulanan" },
                  { icon: "📊", text: "Dashboard agen: pantau komisi, klien, & performa order" },
                ].map((b) => (
                  <div key={b.text} className="flex items-start gap-2.5 text-white/70">
                    <span className="shrink-0 text-base mt-0.5">{b.icon}</span>
                    <span className="text-[12.5px] leading-snug">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Syarat dasar */}
            <div>
              <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-3">Syarat Dasar</p>
              <div className="space-y-1.5">
                {[
                  "Memiliki akun Temantiket yang terverifikasi",
                  "Aktif WhatsApp & responsif terhadap pesan",
                  "Menjaga profesionalisme dengan customer",
                  "Mengikuti ketentuan & kebijakan Temantiket",
                ].map((s) => (
                  <div key={s} className="flex items-start gap-2 text-white/60">
                    <span className="text-emerald-400 shrink-0 text-xs mt-0.5">✓</span>
                    <span className="text-[12px] leading-snug">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Tier strip + CTA */}
          <div className="space-y-5">
            {/* Tier progression */}
            <div>
              <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-3">Sistem Level Agen</p>
              <div className="space-y-2">
                {[
                  { emoji: "🥉", tier: "C — Bronze",   pts: "0 poin",    desc: "Komisi standar, akses marketing kit dasar",      bg: "from-sky-500/15 to-sky-600/5 border-sky-500/20",   text: "text-sky-300" },
                  { emoji: "🥈", tier: "B — Silver",   pts: "100 poin",  desc: "Bonus komisi +1%, prioritas respons admin",       bg: "from-slate-400/15 to-slate-500/5 border-slate-400/20", text: "text-slate-300" },
                  { emoji: "🥇", tier: "A — Gold",     pts: "500 poin",  desc: "Bonus komisi +2%, template promo eksklusif",      bg: "from-amber-400/15 to-yellow-500/5 border-amber-400/20", text: "text-amber-300" },
                  { emoji: "💎", tier: "S — Platinum", pts: "1.500 poin",desc: "Bonus komisi +3%, undangan event tahunan",        bg: "from-violet-500/15 to-purple-600/5 border-violet-500/20", text: "text-violet-300" },
                ].map((t) => (
                  <div key={t.tier} className={`flex items-center gap-3 rounded-xl border bg-gradient-to-r ${t.bg} px-3 py-2.5`}>
                    <span className="text-lg shrink-0">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[12.5px] font-bold ${t.text}`}>{t.tier}</span>
                        <span className="text-[9.5px] font-mono text-white/30">≥ {t.pts}</span>
                      </div>
                      <p className="text-[10.5px] text-white/40 leading-snug mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-white/30 mt-2 flex items-center gap-1">
                <span>⚠️</span> Tier di-reset setiap 6 bulan jika poin tidak aktif
              </p>
            </div>

            {/* CTA buttons */}
            <div className="space-y-2.5 pt-1">
              <a
                href={`${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya tertarik untuk mendaftar sebagai agen. Bagaimana cara bergabungnya? 🤝")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-[13px] px-5 py-3 rounded-2xl shadow-lg transition-all"
              >
                <MessageCircle className="h-4 w-4" />
                Daftar Jadi Agen — Chat Admin
              </a>
              <a
                href={`${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya ingin tahu lebih lanjut tentang program agen dan ketentuan fee-nya. 📋")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-white/10 border border-white/20 hover:bg-white/15 text-white/80 font-semibold text-[13px] px-5 py-3 rounded-2xl transition-all"
              >
                <Share2 className="h-4 w-4" />
                Tanya Ketentuan & Fee
              </a>
            </div>
          </div>
        </div>
      </section>

      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-4 py-5 text-center space-y-1">
        <p className="text-[10px] text-white/25">
          © Temantiket — Public Leaderboard · Hanya menampilkan nama depan &amp; jumlah stamp untuk privasi member.
        </p>
        <p className="text-[10px] text-white/20">
          Data diperbarui otomatis · Stamp lifetime (semua periode)
        </p>
      </footer>
    </div>
  );
}
