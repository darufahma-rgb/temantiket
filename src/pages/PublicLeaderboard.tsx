/**
 * PublicLeaderboard — /leaderboard
 * Redesigned: clean white premium travel aesthetic, consistent with Temantiket brand.
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
    "from-blue-500 to-blue-700",
    "from-sky-500 to-cyan-700",
    "from-emerald-500 to-teal-700",
    "from-violet-500 to-purple-700",
    "from-rose-500 to-pink-700",
    "from-indigo-500 to-indigo-700",
    "from-teal-500 to-cyan-700",
    "from-orange-500 to-red-600",
    "from-amber-500 to-yellow-600",
    "from-fuchsia-500 to-purple-700",
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

// Gold/Silver/Bronze config — light mode
const MEDAL_CFG: Record<number, {
  emoji: string;
  cardBg: string;
  border: string;
  stampColor: string;
  rankColor: string;
  ribbonBg: string;
  ribbonText: string;
}> = {
  1: {
    emoji: "🥇",
    cardBg: "bg-gradient-to-b from-amber-50 to-white",
    border: "border-amber-200",
    stampColor: "text-amber-600",
    rankColor: "text-amber-500",
    ribbonBg: "bg-amber-500",
    ribbonText: "text-white",
  },
  2: {
    emoji: "🥈",
    cardBg: "bg-gradient-to-b from-slate-50 to-white",
    border: "border-slate-200",
    stampColor: "text-slate-600",
    rankColor: "text-slate-500",
    ribbonBg: "bg-slate-400",
    ribbonText: "text-white",
  },
  3: {
    emoji: "🥉",
    cardBg: "bg-gradient-to-b from-orange-50 to-white",
    border: "border-orange-200",
    stampColor: "text-orange-600",
    rankColor: "text-orange-500",
    ribbonBg: "bg-orange-400",
    ribbonText: "text-white",
  },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StampProgress({ count, max = STAMP_MAX, tier }: { count: number; max?: number; tier: StampTier }) {
  const remainder = count % max;
  const pct = Math.min(100, Math.round((remainder / max) * 100));
  const completed = Math.floor(count / max);
  return (
    <div className="w-full space-y-0.5">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={`h-full bg-gradient-to-r ${tier.barFrom} ${tier.barTo} rounded-full`}
          />
        </div>
        <span className="text-[10px] font-mono font-semibold text-slate-400 shrink-0 tabular-nums">
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
    ? "text-[9px] px-1.5 py-0.5 gap-0.5"
    : "text-[10.5px] px-2 py-0.5 gap-1";
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
      font-extrabold text-white ring-2 ring-white shadow-sm shrink-0
    `}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// Podium card for Top 3 — clean light card
function PodiumCard({ entry, rank, delay = 0 }: { entry: LeaderboardEntry | null; rank: 1 | 2 | 3; delay?: number }) {
  const cfg = MEDAL_CFG[rank];
  const isFirst = rank === 1;

  if (!entry) {
    return (
      <div className={`rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 ${isFirst ? "min-h-[260px]" : "min-h-[220px]"}`}>
        <Trophy className="h-7 w-7 mb-2 opacity-30" />
        <span className="text-sm font-bold">#{rank}</span>
      </div>
    );
  }

  const tier = getStampTier(entry.totalStamps);
  const memberId = getMemberId(entry.memberIndex);
  const pct = Math.min(100, Math.round(((entry.totalStamps % STAMP_MAX) / STAMP_MAX) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: isFirst ? -12 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      className={`
        rounded-2xl border shadow-sm flex flex-col overflow-hidden cursor-default
        ${cfg.cardBg} ${cfg.border}
        ${isFirst ? "ring-1 ring-amber-300/50 shadow-amber-100/60 shadow-md" : ""}
      `}
    >
      {/* Rank ribbon */}
      <div className={`flex items-center justify-between px-4 pt-3.5 pb-2`}>
        <span className="text-xl">{cfg.emoji}</span>
        <span className={`text-[10px] font-black uppercase tracking-widest ${cfg.rankColor}`}>
          #{rank}
        </span>
      </div>

      {/* Avatar + Name */}
      <div className="flex flex-col items-center px-4 pb-3 gap-2 text-center">
        <Avatar name={entry.firstName} size={isFirst ? "lg" : "md"} />
        <div>
          <p className="font-extrabold text-slate-800 text-[14px] leading-tight">{entry.firstName}</p>
          <p className="text-[9.5px] font-mono text-slate-400 mt-0.5">{memberId}</p>
        </div>
        <TierBadge tier={tier} />
      </div>

      {/* Stamp count */}
      <div className="mx-3 rounded-xl bg-white border border-slate-100 px-3 py-2.5 text-center mb-3 shadow-sm">
        <div className={`text-3xl font-black ${cfg.stampColor} tabular-nums`}>{entry.totalStamps}</div>
        <div className="text-[10px] text-slate-400 font-medium -mt-0.5">total stamp</div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-2">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, delay: delay + 0.2, ease: "easeOut" }}
            className={`h-full bg-gradient-to-r ${tier.barFrom} ${tier.barTo} rounded-full`}
          />
        </div>
        <div className="flex justify-between mt-0.5 text-[9px] text-slate-400 font-mono">
          <span>{entry.totalStamps % STAMP_MAX}/{STAMP_MAX}</span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center divide-x divide-slate-100 border-t border-slate-100 mt-auto">
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

// Skeleton loader row
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 md:px-5 py-3.5 animate-pulse">
      <div className="h-8 w-8 rounded-xl bg-slate-100 shrink-0" />
      <div className="h-8 w-8 rounded-full bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-28 rounded bg-slate-100" />
        <div className="h-2 w-16 rounded bg-slate-100" />
      </div>
      <div className="h-5 w-10 rounded bg-slate-100 hidden md:block" />
      <div className="h-2 w-20 rounded bg-slate-100 hidden md:block" />
      <div className="h-5 w-16 rounded bg-slate-100 hidden md:block" />
    </div>
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
  const [scrolled, setScrolled]     = useState(false);
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

  // Scroll detection for navbar shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  // Period sort
  const entries = useMemo(() => {
    if (period === "bulan_ini") {
      return [...filtered].sort((a, b) => {
        if (b.orderStamps !== a.orderStamps) return b.orderStamps - a.orderStamps;
        return b.totalStamps - a.totalStamps;
      });
    }
    return filtered;
  }, [filtered, period]);

  const top3   = entries.slice(0, 3);
  const rest   = entries.slice(3);
  // Podium order: left=2nd, center=1st, right=3rd
  const podium = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null] as const;

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());

  const waBookingLink  = `${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya mau pesan perjalanan dan kumpulkan stamp loyalty. Bisa bantu saya? 🙏✈️")}`;
  const waReferralLink = `${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya ingin ajak teman untuk dapat bonus stamp referral. Bagaimana caranya? 🎁")}`;

  void rest; // used via entries.map below

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Sticky Navbar ──────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-30 bg-white/90 backdrop-blur-md transition-shadow duration-200 ${scrolled ? "shadow-md" : "border-b border-slate-100"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img
              src="/temantiket-icon.svg"
              alt="Temantiket"
              className="h-7 w-7 object-contain"
            />
            <img
              src="/temantiket-logo-blue.png"
              alt="Temantiket"
              className="h-5 object-contain hidden sm:block"
            />
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1.5">
            <Link
              to="/harga-tiket"
              className="text-[12px] font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Harga Tiket
            </Link>
            <a
              href={waBase}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors shadow-sm"
            >
              Hubungi Kami
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero Section ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="text-center space-y-4"
          >
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-semibold px-4 py-1.5 rounded-full">
              <Sparkles className="h-3 w-3" />
              <span>{monthLabel}</span>
              <span className="opacity-40">·</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            {/* Title */}
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                <Trophy className="inline h-7 w-7 md:h-9 md:w-9 text-amber-500 mb-1 mr-2" />
                Leaderboard{" "}
                <span className="text-blue-600">Travel Enthusiast</span>
              </h1>
              <p className="text-slate-500 text-sm md:text-base mt-2 max-w-xl mx-auto leading-relaxed">
                Member Temantiket paling aktif — diukur dari total stamp perjalanan, bonus referral, dan order yang diselesaikan.
              </p>
            </div>

            {/* Stats strip */}
            {!loading && allEntries.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-center gap-6 flex-wrap pt-1"
              >
                <div className="flex items-center gap-1.5 text-slate-500 text-[12px]">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  <span><strong className="text-slate-800">{allEntries.length}</strong> member aktif</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 text-[12px]">
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                  <span>Total <strong className="text-slate-800">{allEntries.reduce((s, e) => s + e.totalStamps, 0)}</strong> stamp</span>
                </div>
                {lastUpdated && (
                  <div className="flex items-center gap-1.5 text-slate-400 text-[12px]">
                    <RefreshCw className="h-3 w-3" />
                    <span>Update {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div className="sticky top-[57px] z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">

          {/* Segmented period control */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setPeriod(k)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  period === k
                    ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {PERIOD_LABEL[k]}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama member atau ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-[12.5px] rounded-xl pl-8 pr-8 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="shrink-0 p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all disabled:opacity-40"
            title="Refresh leaderboard"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Count */}
          <span className="shrink-0 text-[11.5px] text-slate-400 font-medium">
            {entries.length} member
          </span>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8">

        {/* Loading skeleton */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Podium skeleton */}
            <div className="grid grid-cols-3 gap-3 md:gap-5">
              {[220, 260, 220].map((h, i) => (
                <div key={i} className="rounded-2xl bg-white border border-slate-100 shadow-sm animate-pulse" style={{ minHeight: h }} />
              ))}
            </div>
            {/* List skeleton */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          </motion.div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-700 font-semibold text-sm mb-1">Gagal memuat leaderboard</p>
            <p className="text-red-500/80 text-xs mb-4">{error}</p>
            <button
              onClick={() => void load(false)}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Empty search */}
        {!loading && !error && entries.length === 0 && allEntries.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
            <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold text-sm">Tidak ada member yang cocok</p>
            <button onClick={() => setSearch("")} className="mt-3 text-blue-600 text-xs hover:underline">
              Hapus pencarian
            </button>
          </div>
        )}

        {/* Empty leaderboard */}
        {!loading && !error && allEntries.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-slate-200" />
            <p className="text-slate-500 font-semibold">Leaderboard masih kosong.</p>
            <p className="text-slate-400 text-sm mt-1">Jadilah yang pertama mengisi stamp card!</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-8"
            >

              {/* ── Top 3 Podium ──────────────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" /> Top 3 Champions
                  </h2>
                  <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full font-semibold">
                    {PERIOD_LABEL[period]}
                  </span>
                </div>

                {/* Podium: 2nd | 1st | 3rd — center is tallest */}
                <div className="grid grid-cols-3 gap-3 md:gap-5 items-end">
                  {([2, 1, 3] as const).map((rank, idx) => (
                    <PodiumCard
                      key={rank}
                      entry={podium[idx]}
                      rank={rank}
                      delay={rank === 1 ? 0 : rank === 2 ? 0.08 : 0.16}
                    />
                  ))}
                </div>
              </section>

              {/* ── Full Rankings ──────────────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" /> Ranking Lengkap
                  </h2>
                  <span className="text-[11.5px] text-slate-400">{entries.length} member</span>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                  {/* Table header — desktop only */}
                  <div className="hidden md:grid grid-cols-[52px_1fr_80px_110px_120px_90px_80px] gap-3 items-center px-5 py-3 border-b border-slate-50 bg-slate-50/60">
                    {["#", "Member", "Stamp", "Progress", "Tier", "Order", "Referral"].map((h) => (
                      <span key={h} className={`text-[10px] font-bold uppercase tracking-wider text-slate-400 ${h === "#" || h === "Stamp" || h === "Order" || h === "Referral" ? "text-center" : ""}`}>{h}</span>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-slate-50">
                    {entries.map((entry, i) => {
                      const rank   = i + 1;
                      const tier   = getStampTier(entry.totalStamps);
                      const membId = getMemberId(entry.memberIndex);
                      const isTop3 = rank <= 3;
                      const medals = ["🥇", "🥈", "🥉"];

                      const rowHighlight = isTop3
                        ? rank === 1 ? "bg-amber-50/50 hover:bg-amber-50"
                        : rank === 2 ? "bg-slate-50/60 hover:bg-slate-50"
                        : "bg-orange-50/40 hover:bg-orange-50"
                        : "hover:bg-slate-50/70";

                      return (
                        <motion.div
                          key={`${entry.memberIndex}-${period}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.18, delay: Math.min(i * 0.025, 0.45) }}
                          className={`
                            flex flex-col md:grid md:grid-cols-[52px_1fr_80px_110px_120px_90px_80px] md:gap-3
                            items-start md:items-center px-4 md:px-5 py-3.5 transition-colors
                            ${rowHighlight}
                          `}
                        >
                          {/* Mobile + desktop shared: rank + avatar + name */}
                          <div className="flex items-center gap-3 w-full md:contents">

                            {/* Rank badge */}
                            <div className={`
                              shrink-0 h-8 w-8 rounded-xl flex items-center justify-center font-extrabold text-sm
                              ${isTop3
                                ? rank === 1 ? "bg-amber-100 text-amber-600 border border-amber-200"
                                : rank === 2 ? "bg-slate-100 text-slate-500 border border-slate-200"
                                : "bg-orange-100 text-orange-600 border border-orange-200"
                                : "bg-white text-slate-400 text-[11px] font-mono border border-slate-200"
                              }
                            `}>
                              {isTop3 ? medals[rank - 1] : rank}
                            </div>

                            {/* Member info */}
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                              <Avatar name={entry.firstName} size="sm" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px] font-bold text-slate-800 truncate">{entry.firstName}</span>
                                  <span className="text-[9.5px] font-mono text-slate-400 shrink-0">{membId}</span>
                                </div>
                                {/* Mobile: tier + stamp count inline */}
                                <div className="flex items-center gap-2 mt-0.5 md:hidden">
                                  <TierBadge tier={tier} size="xs" />
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    {entry.totalStamps % STAMP_MAX}/{STAMP_MAX} stamp
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Mobile: stamp count (right) */}
                            <div className="shrink-0 text-right md:hidden">
                              <div className={`text-xl font-black tabular-nums ${
                                isTop3
                                  ? rank === 1 ? "text-amber-600" : rank === 2 ? "text-slate-500" : "text-orange-600"
                                  : "text-slate-700"
                              }`}>{entry.totalStamps}</div>
                              <div className="text-[9px] text-slate-400">stamp</div>
                            </div>
                          </div>

                          {/* Mobile: progress + stats */}
                          <div className="w-full mt-2 md:hidden pl-[calc(32px+12px+32px+12px)]">
                            <StampProgress count={entry.totalStamps} tier={tier} />
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <CheckCircle className="h-2.5 w-2.5 text-blue-400" />
                                {entry.orderStamps} order
                              </span>
                              {entry.referralStamps > 0 && (
                                <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                                  <Gift className="h-2.5 w-2.5" />
                                  +{entry.referralStamps} referral
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Desktop cells */}
                          {/* Stamp */}
                          <div className="hidden md:flex items-center justify-center">
                            <span className={`text-xl font-black tabular-nums ${
                              isTop3
                                ? rank === 1 ? "text-amber-600" : rank === 2 ? "text-slate-500" : "text-orange-600"
                                : "text-slate-700"
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
                            <CheckCircle className="h-3 w-3 text-blue-400" />
                            <span className="text-[12px] font-semibold text-slate-600">{entry.orderStamps}</span>
                          </div>

                          {/* Referral stamps */}
                          <div className="hidden md:flex items-center justify-center gap-1">
                            {entry.referralStamps > 0 ? (
                              <>
                                <Gift className="h-3 w-3 text-emerald-500" />
                                <span className="text-[12px] font-semibold text-emerald-600">+{entry.referralStamps}</span>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  {entries.length >= 50 && (
                    <div className="px-5 py-4 border-t border-slate-50 text-center text-[11px] text-slate-400 bg-slate-50/40">
                      Menampilkan 50 member teratas · Diperbarui otomatis setiap 60 detik
                    </div>
                  )}
                </div>
              </section>

              {/* ── Cara Naik Ranking ─────────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="px-6 md:px-8 py-5 border-b border-slate-50 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <Zap className="h-4.5 w-4.5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-extrabold text-slate-800">Cara Naik Ranking</h2>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">Setiap perjalanan = stamp. Stamp naik tier. Tier naik hadiah.</p>
                  </div>
                </div>

                <div className="p-6 md:p-8 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        icon: "✈️",
                        title: "Beli tiket pesawat",
                        desc: "Setiap tiket yang dibeli melalui Temantiket = +1 stamp otomatis.",
                        badge: "+1 stamp",
                        badgeCls: "bg-sky-50 text-sky-600 border-sky-100",
                      },
                      {
                        icon: "🕋",
                        title: "Ikut paket Umrah / Haji",
                        desc: "Daftar paket Umrah atau Haji melalui Temantiket — perjalanan ibadah berkah.",
                        badge: "+1 stamp",
                        badgeCls: "bg-emerald-50 text-emerald-600 border-emerald-100",
                      },
                      {
                        icon: "🔺",
                        title: "Proses Visa",
                        desc: "Ajukan Visa on Arrival, Visa Pelajar, atau layanan visa lainnya lewat kami.",
                        badge: "+1 stamp",
                        badgeCls: "bg-violet-50 text-violet-600 border-violet-100",
                      },
                      {
                        icon: "🎁",
                        title: "Ajak teman via Referral",
                        desc: "Referensikan teman ke Temantiket dan dapatkan bonus stamp referral eksklusif.",
                        badge: "+1 bonus stamp",
                        badgeCls: "bg-amber-50 text-amber-600 border-amber-100",
                      },
                    ].map((step) => (
                      <div
                        key={step.title}
                        className="flex items-start gap-3.5 bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-blue-100 hover:bg-blue-50/30 transition-colors"
                      >
                        <div className="shrink-0 h-9 w-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-lg shadow-sm">
                          {step.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[13px] font-bold text-slate-800">{step.title}</span>
                            <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${step.badgeCls}`}>
                              {step.badge}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-slate-500 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tier progression */}
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-3">Tier Member</p>
                    <div className="flex flex-wrap gap-2">
                      {STAMP_TIERS.map((t) => (
                        <div key={t.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${t.bg} ${t.border}`}>
                          <span className="text-xs">{t.emoji}</span>
                          <span className={`text-[10.5px] font-bold ${t.text}`}>{t.label}</span>
                          <span className={`text-[9px] ${t.text} opacity-60`}>≥{t.minStamps} stamp</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CTA inside section */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <a
                      href={waBookingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13px] px-5 py-2.5 rounded-xl shadow-sm transition-all hover:shadow-md"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Mulai Kumpulkan Stamp
                    </a>
                    <a
                      href={waReferralLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-[13px] px-5 py-2.5 rounded-xl shadow-sm transition-all"
                    >
                      <Share2 className="h-4 w-4" />
                      Pesan Layanan Sekarang
                    </a>
                  </div>
                </div>
              </section>

              {/* ── CTA Banner ────────────────────────────────────────────── */}
              <section className="rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 p-7 md:p-10 text-white">
                  <div className="max-w-xl mx-auto text-center space-y-3">
                    <div className="inline-flex items-center gap-1.5 bg-white/15 text-white text-[11px] font-semibold px-3 py-1 rounded-full border border-white/20">
                      <Trophy className="h-3 w-3 text-amber-300" /> Bergabung &amp; Raih Peringkat
                    </div>
                    <h2 className="text-xl md:text-2xl font-extrabold leading-tight">
                      Kumpulkan Stamp, Naik Tier,<br className="hidden md:block" /> Jadi yang Terdepan!
                    </h2>
                    <p className="text-white/75 text-sm leading-relaxed">
                      Setiap perjalanan bersama Temantiket = stamp loyalty. Ajak teman untuk bonus stamp referral eksklusif.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <a
                        href={waBookingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold text-[13px] px-6 py-3 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-50 transition-all"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Pesan Perjalanan &amp; Kumpulkan Stamp
                      </a>
                      <a
                        href={waReferralLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/15 border border-white/25 text-white font-bold text-[13px] px-6 py-3 rounded-xl hover:bg-white/25 transition-all"
                      >
                        <Share2 className="h-4 w-4" />
                        Ajak Teman via Referral
                      </a>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Gabung Jadi Agen ──────────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white border-b border-slate-100 px-6 md:px-8 py-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-lg">🤝</span>
                  </div>
                  <div>
                    <h2 className="text-[15px] font-extrabold text-slate-800">Gabung Jadi Agen Temantiket</h2>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">Bantu orang bepergian, kamu yang untung — komisi & level agen menanti</p>
                  </div>
                </div>

                <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8">
                  {/* Left: Benefits + Syarat */}
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-3">Keuntungan Agen</p>
                      <div className="space-y-2">
                        {[
                          { icon: "💰", text: "Komisi tetap per order — langsung dihitung sistem" },
                          { icon: "🏆", text: "Sistem tier Bronze → Silver → Gold → Platinum" },
                          { icon: "📱", text: "Marketing Kit & template promo eksklusif" },
                          { icon: "🎯", text: "Bonus poin dari misi khusus & challenge bulanan" },
                          { icon: "📊", text: "Dashboard agen: pantau komisi, klien, & performa" },
                        ].map((b) => (
                          <div key={b.text} className="flex items-start gap-2.5 text-slate-600">
                            <span className="shrink-0 text-base mt-0.5">{b.icon}</span>
                            <span className="text-[12.5px] leading-snug">{b.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-3">Syarat Dasar</p>
                      <div className="space-y-1.5">
                        {[
                          "Memiliki akun Temantiket yang terverifikasi",
                          "Aktif WhatsApp & responsif terhadap pesan",
                          "Menjaga profesionalisme dengan customer",
                          "Mengikuti ketentuan & kebijakan Temantiket",
                        ].map((s) => (
                          <div key={s} className="flex items-start gap-2 text-slate-500">
                            <span className="text-emerald-500 shrink-0 text-xs mt-0.5">✓</span>
                            <span className="text-[12px] leading-snug">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Tier + CTA */}
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-3">Sistem Level Agen</p>
                      <div className="space-y-2">
                        {[
                          { emoji: "🥉", tier: "C — Bronze",   pts: "0 poin",     desc: "Komisi standar, akses marketing kit dasar",       bg: "bg-sky-50 border-sky-100",    text: "text-sky-700" },
                          { emoji: "🥈", tier: "B — Silver",   pts: "100 poin",   desc: "Bonus komisi +1%, prioritas respons admin",        bg: "bg-slate-50 border-slate-100",text: "text-slate-600" },
                          { emoji: "🥇", tier: "A — Gold",     pts: "500 poin",   desc: "Bonus komisi +2%, template promo eksklusif",       bg: "bg-amber-50 border-amber-100",text: "text-amber-700" },
                          { emoji: "💎", tier: "S — Platinum", pts: "1.500 poin", desc: "Bonus komisi +3%, undangan event tahunan",         bg: "bg-violet-50 border-violet-100",text: "text-violet-700" },
                        ].map((t) => (
                          <div key={t.tier} className={`flex items-center gap-3 rounded-xl border ${t.bg} px-3 py-2.5`}>
                            <span className="text-lg shrink-0">{t.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[12.5px] font-bold ${t.text}`}>{t.tier}</span>
                                <span className="text-[9.5px] font-mono text-slate-400">≥ {t.pts}</span>
                              </div>
                              <p className="text-[10.5px] text-slate-500 leading-snug mt-0.5">{t.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-2">⚠️ Tier di-reset setiap 6 bulan jika poin tidak aktif</p>
                    </div>

                    <div className="space-y-2.5">
                      <a
                        href={`${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya tertarik untuk mendaftar sebagai agen. Bagaimana cara bergabungnya? 🤝")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13px] px-5 py-3 rounded-xl shadow-sm transition-all hover:shadow-md"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Daftar Jadi Agen — Chat Admin
                      </a>
                      <a
                        href={`${waBase}?text=${encodeURIComponent("Halo Temantiket! Saya ingin tahu lebih lanjut tentang program agen dan ketentuan fee-nya. 📋")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-[13px] px-5 py-3 rounded-xl shadow-sm transition-all"
                      >
                        <Share2 className="h-4 w-4" />
                        Tanya Ketentuan &amp; Fee
                      </a>
                    </div>
                  </div>
                </div>
              </section>

            </motion.div>
          </AnimatePresence>
        )}

      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white px-4 py-6 text-center space-y-1.5">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img src="/temantiket-icon.svg" alt="Temantiket" className="h-5 w-5 object-contain opacity-60" />
          <span className="text-[12px] font-semibold text-slate-400">Temantiket</span>
        </div>
        <p className="text-[10.5px] text-slate-400">
          © Temantiket — Leaderboard Klien Publik · Hanya menampilkan nama depan &amp; jumlah stamp untuk privasi member.
        </p>
        <p className="text-[10.5px] text-slate-400">
          Data diperbarui otomatis setiap 60 detik · Stamp lifetime (semua periode)
        </p>
      </footer>
    </div>
  );
}
