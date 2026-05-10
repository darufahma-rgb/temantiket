import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, AlertCircle, MessageCircle, History,
  Share2, Users, Trophy, Gift, Crown, Copy, Check,
  ChevronLeft, ChevronRight, ChevronDown, Sparkles, ExternalLink,
  Star, Calendar, Hash, TrendingUp, Briefcase, Zap, BadgeCheck, DollarSign,
  Ticket, Shirt, Banknote, Plane, type LucideIcon,
} from "lucide-react";
import MemberCard from "@/components/MemberCard";
import { BrandLogo } from "@/components/BrandLogo";
import { OrderProgressTracker, ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { lookupMemberCard, type PublicMemberCard, type PublicMemberStamp, type ReferralDetail } from "@/features/portal/memberCardRepo";
import { fetchPublicPromoPosters, type PromoPost } from "@/lib/promoPostersSettings";
import { buildPublicMemberUrl, buildReferralUrl, normalizePhoneForWa } from "@/lib/memberSlug";
import { loadIghAdminSettings } from "@/lib/ighSettings";

const AGENT_THRESHOLD = 8;
const AGENT_RECRUIT_WA = "6281311506025";

function ensureExternalUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

const REWARD_MILESTONES = [
  { row: 1, stamps: 4,  emoji: "🎫", label: "Voucher Diskon Rp100.000",        desc: "Potongan harga Rp100.000 untuk order berikutnya — umrah, tiket, atau visa.", color: "blue"   },
  { row: 2, stamps: 8,  emoji: "🎁", label: "Merchandise Resmi Temantiket",     desc: "Paket merchandise eksklusif branded Temantiket dikirim ke alamat Anda.",     color: "violet" },
  { row: 3, stamps: 12, emoji: "💸", label: "Voucher Diskon Rp300.000",         desc: "Voucher diskon besar untuk 1 paket pilihan — umrah, tiket, atau visa.",      color: "emerald"},
  { row: 4, stamps: 16, emoji: "✈️", label: "VIP Grand Reward — Transit Qatar", desc: "Akses lounge premium & city tour eksklusif saat transit di Qatar. Syarat & ketentuan berlaku.", color: "amber" },
] as const;

const REWARD_ROW_ICON: Record<number, LucideIcon> = {
  1: Ticket,
  2: Shirt,
  3: Banknote,
  4: Plane,
};

const TYPE_LABEL: Record<string, string> = {
  umrah:        "Umrah Transit Saudi",
  flight:       "Tiket Pesawat",
  visa_voa:     "Visa on Arrival",
  visa_student: "Visa Pelajar / Entry",
};
const TYPE_EMOJI: Record<string, string> = {
  umrah: "🕋", flight: "✈️", visa_voa: "🔺", visa_student: "📘",
};

function stampLabel(stamp: PublicMemberStamp): string {
  if (stamp.transitType === "dubai") return "Visa Transit Dubai";
  if (stamp.transitType === "saudi") return "Visa Transit Saudi";
  return TYPE_LABEL[stamp.type] ?? stamp.type;
}
function stampEmoji(stamp: PublicMemberStamp): string {
  if (stamp.transitType === "dubai") return "🏙️";
  return TYPE_EMOJI[stamp.type] ?? "•";
}
function fmtDateLong(iso: string): string {
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtDateShort(iso: string): string {
  try { return new Date(iso).toLocaleDateString("id-ID", { month: "short", year: "numeric" }); }
  catch { return iso; }
}

// ── Poster Carousel ──────────────────────────────────────────────────────────
function PromoCarousel({ posters }: { posters: PromoPost[] }) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, posters.length - 1));
    setActive(clamped);
    const el = scrollRef.current?.children[clamped] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  useEffect(() => {
    if (posters.length <= 1) return;
    autoRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % posters.length;
        const el = scrollRef.current?.children[next] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        return next;
      });
    }, 5000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [posters.length]);

  if (posters.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Label + dots */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Info Terbaru</span>
        </div>
        <div className="flex items-center gap-1.5">
          {posters.map((_, i) => (
            <button key={i} onClick={() => scrollTo(i)}
              className={`rounded-full transition-all duration-300 ${i === active ? "w-5 h-2 bg-blue-500" : "w-2 h-2 bg-blue-200"}`}
            />
          ))}
        </div>
      </div>

      {/* Cards — horizontal scroll, 2 visible */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: "touch" }}
        onScroll={(e) => {
          const el   = e.currentTarget;
          const card = el.children[0] as HTMLElement | undefined;
          const w    = card ? card.offsetWidth + 12 : el.offsetWidth;
          setActive(Math.min(Math.round(el.scrollLeft / w), posters.length - 1));
        }}
      >
        {posters.map((post) => (
          <div key={post.id} className="flex-none w-[48%] min-w-[140px] snap-start">
            {post.imageUrl ? (
              <div className="flex flex-col rounded-2xl overflow-hidden shadow border border-gray-100 bg-white">
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
                  <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                {(post.title || post.ctaUrl) && (
                  <div className="px-3 py-2.5 space-y-1">
                    {post.title && <p className="text-gray-900 font-bold text-xs leading-snug line-clamp-2">{post.title}</p>}
                    {post.ctaUrl && (
                      <a href={ensureExternalUrl(post.ctaUrl)} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 text-[11px] font-semibold">
                        {post.ctaLabel || "Selengkapnya"} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 shadow overflow-hidden"
                style={{ aspectRatio: "4 / 5" }}>
                <div className="flex-1 flex flex-col justify-center px-3.5 py-3.5 space-y-2">
                  {post.title && <p className="text-gray-900 font-extrabold text-sm leading-snug line-clamp-3">{post.title}</p>}
                  {post.caption && <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{post.caption}</p>}
                  {post.ctaUrl && (
                    <a href={ensureExternalUrl(post.ctaUrl)} target="_blank" rel="noopener noreferrer"
                      className="self-start inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                      {post.ctaLabel || "Lihat"} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {posters.length > 2 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => scrollTo(active - 1)} disabled={active === 0}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm flex items-center justify-center disabled:opacity-30 transition-all">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-xs text-gray-400 font-mono tabular-nums">{active + 1} / {posters.length}</span>
          <button onClick={() => scrollTo(active + 1)} disabled={active === posters.length - 1}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm flex items-center justify-center disabled:opacity-30 transition-all">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PublicMemberCardPage() {
  const { slug }       = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const refSlug        = searchParams.get("ref");
  const isReferralView = !!refSlug && refSlug !== slug;

  const [data,           setData]           = useState<PublicMemberCard | null>(null);
  const [refData,        setRefData]        = useState<PublicMemberCard | null>(null);
  const [posters,        setPosters]        = useState<PromoPost[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [err,            setErr]            = useState<"not_found" | "invalid_slug" | "network" | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showRewards,    setShowRewards]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) { setErr("invalid_slug"); setLoading(false); return; }
      setLoading(true); setErr(null); setData(null); setRefData(null); setPosters([]);
      const [res, refRes, posterData] = await Promise.all([
        lookupMemberCard(slug),
        isReferralView && refSlug ? lookupMemberCard(refSlug) : Promise.resolve(null),
        fetchPublicPromoPosters(slug),
      ]);
      if (cancelled) return;
      if (res.ok) setData(res.data); else setErr(res.error);
      if (refRes && refRes.ok) setRefData(refRes.data);
      setPosters(posterData);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, refSlug, isReferralView]);

  useEffect(() => {
    const prev = document.title;
    if (data?.client.name) document.title = `${data.client.name} — Temantiket Member Card`;
    return () => { document.title = prev; };
  }, [data?.client.name]);

  const adminWa    = useMemo(() => normalizePhoneForWa(loadIghAdminSettings().adminWhatsapp), []);
  const publicUrl  = useMemo(() => buildPublicMemberUrl(slug ?? ""), [slug]);
  const referralUrl= useMemo(() => buildReferralUrl(slug ?? ""), [slug]);

  const totalStamps = useMemo(() => {
    if (!data) return 0;
    return data.orders.length + (data.client.referralStamps ?? 0);
  }, [data]);

  const isGoldMember = totalStamps >= AGENT_THRESHOLD;

  const memberIdStr = useMemo(
    () => `TMNTKT${String(data?.client.memberIndex ?? 0).padStart(4, "0")}`,
    [data],
  );

  const ctaText = useMemo(() => {
    if (isReferralView && refData) {
      const refName = refData.client.name?.trim().split(/\s+/).slice(0, 2).join(" ") || "teman";
      const refId   = `TMNTKT${String(refData.client.memberIndex ?? 0).padStart(4, "0")}`;
      return `Halo Admin Temantiket! 👋\n\nSaya tertarik order tiket/visa nih. Dapat info dari *${refName}* (${refId}).\n\nBisa bantu cek opsi yang tersedia? Terima kasih! ✈️`;
    }
    const name = data?.client.name?.trim().split(/\s+/)[0] || "Sahabat";
    return `Halo Admin Temantiket, saya ${name} (${memberIdStr}). Mau pesan tiket/visa lagi nih, bisa bantu cek opsinya? ✈️`;
  }, [data, refData, isReferralView, memberIdStr]);

  const ctaUrl = useMemo(() => {
    const encoded = encodeURIComponent(ctaText);
    return adminWa ? `https://wa.me/${adminWa}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [adminWa, ctaText]);

  const referralText = useMemo(() => {
    const name = data?.client.name?.trim().split(/\s+/)[0] || "Aku";
    return `✈️ ${name} ngajak kamu gabung Temantiket!\n\nTemantiket — travel agency terpercaya buat tiket umrah, pesawat & visa.\n\nCek kartu member & daftar via link ini:\n${referralUrl}\n\nKalau kamu order lewat Temantiket, sebut nama gue ke admin ya — kita sama-sama dapet reward! 🎁`;
  }, [data, referralUrl]);

  const referralWaUrl = useMemo(() => `https://wa.me/?text=${encodeURIComponent(referralText)}`, [referralText]);

  const agentText = useMemo(() => {
    const name = data?.client.name?.trim() || "Saya";
    return `Halo Admin Temantiket! 👋\n\nSaya ${name} (Member ${memberIdStr}) tertarik untuk bergabung sebagai Agen Temantiket.\n\nSudah ${totalStamps} transaksi & kepercayaan penuh. Bisa share info syarat & benefit jadi agen? Terima kasih! ✈️`;
  }, [data, totalStamps, memberIdStr]);

  const agentWaUrl = useMemo(() => {
    const encoded = encodeURIComponent(agentText);
    return adminWa ? `https://wa.me/${adminWa}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [adminWa, agentText]);

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2500);
    } catch { /* silently fail */ }
  };

  const history = useMemo(() => {
    if (!data) return [];
    return [...data.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  const totalHistoryItems = history.length + (data?.client.referralStamps ?? 0);
  const unlockedRewardCount = REWARD_MILESTONES.filter(m => totalStamps >= m.stamps).length;
  const currentReward = REWARD_MILESTONES.find(m =>
    totalStamps >= (m.row === 1 ? 0 : REWARD_MILESTONES[m.row - 2].stamps) && totalStamps < m.stamps
  );

  return (
    <div className="min-h-screen overflow-x-hidden w-full" style={{ background: "linear-gradient(165deg, #eef4ff 0%, #f5f8ff 40%, #ffffff 100%)" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-white/80 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/leaderboard" className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold transition-colors">
              <Trophy className="h-4 w-4" /> Leaderboard
            </Link>
            <span className="text-gray-200 text-sm">|</span>
            <span className="text-sm text-gray-400 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Member
            </span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 pb-16 overflow-x-hidden">

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-40 text-blue-500">
              <div className="relative">
                <div className="h-14 w-14 rounded-full border-2 border-blue-100 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                </div>
                <div className="absolute inset-0 rounded-full border border-blue-200 animate-ping opacity-50" />
              </div>
              <p className="text-sm text-gray-400 mt-4 tracking-wide">Memuat kartu member…</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {!loading && err && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-sm mx-auto mt-16 rounded-3xl border border-red-100 bg-white px-6 py-10 text-center shadow-md">
            <div className="h-14 w-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="text-base font-bold text-red-700">
              {err === "not_found" && "Kartu Member Tidak Ditemukan"}
              {err === "invalid_slug" && "Format Link Tidak Valid"}
              {err === "network" && "Gagal Terhubung"}
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {err === "not_found" && "Link mungkin sudah berubah. Minta link terbaru ke admin Temantiket."}
              {err === "invalid_slug" && "Format: /m/nama-0000, contoh /m/danang-0010."}
              {err === "network" && "Server sibuk. Coba refresh beberapa saat lagi."}
            </p>
          </motion.div>
        )}

        {/* ── Content ── */}
        {!loading && !err && data && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="space-y-5">

            {/* Referral Banner */}
            {isReferralView && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-xl">🤝</div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-emerald-800 leading-tight">
                    {refData ? `Kamu dibawa oleh ${refData.client.name.trim().split(/\s+/).slice(0, 2).join(" ")}!` : "Kamu dibuka dari link referral!"}
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">Order lewat Temantiket & sebut nama referrer — dapat bonus stamp 🎁</p>
                </div>
              </motion.div>
            )}

            {/* ── Page Identity Header ── */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 bg-blue-600/10 border border-blue-200 text-blue-600 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-2">
                  <Sparkles className="h-3 w-3" /> Temantiket Member
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight leading-tight truncate">{data.client.name}</h1>
                <p className="text-sm text-gray-400 mt-1">{memberIdStr} · Bergabung {fmtDateShort(data.client.createdAt)}</p>
              </div>
              <a href={ctaUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1eb858] text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors shadow-md shadow-green-200 shrink-0">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{isReferralView ? "Hubungi Admin" : "Pesan Sekarang"}</span>
              </a>
            </div>

            {/* ── 2-Column Desktop Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr] gap-5 lg:gap-6 items-start">

              {/* ═══════════════════════════════════════
                  LEFT COLUMN — Desktop sidebar
                  (Poster + MemberCard + Gold CTA)
              ═══════════════════════════════════════ */}
              <div className="hidden lg:flex flex-col gap-5">

                {/* Promo Poster carousel — desktop */}
                {posters.length > 0 && (
                  <div className="rounded-2xl border border-blue-100 bg-white shadow-sm p-4">
                    <PromoCarousel posters={posters} />
                  </div>
                )}

                {/* Member Card — desktop */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                  <MemberCard
                    client={{ name: data.client.name, createdAt: data.client.createdAt }}
                    memberIndex={data.client.memberIndex}
                    orders={data.orders.map((o) => ({ type: o.type, status: o.status, createdAt: o.createdAt, transitType: o.transitType }))}
                    readOnly
                  />
                  {/* Member badges */}
                  <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                    {(data.client.referralStamps ?? 0) > 0 && (
                      <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Gift className="h-3 w-3" /> +{data.client.referralStamps} referral
                      </div>
                    )}
                    {totalStamps >= 16 && (
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Crown className="h-3 w-3" /> Full Card! 🎉
                      </div>
                    )}
                    {isGoldMember && totalStamps < 16 && (
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Crown className="h-3 w-3" /> Gold Member
                      </div>
                    )}
                  </div>
                </div>

                {/* Gold Member / Agent CTA — desktop sidebar */}
                {isGoldMember && (
                  <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                        <Crown className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-900">Gold Member 🏅</p>
                        <p className="text-xs text-amber-600">{totalStamps} transaksi — pelanggan terbaik</p>
                      </div>
                    </div>
                    <p className="text-sm text-amber-800 leading-relaxed">Naik level jadi <strong>Agen Resmi Temantiket</strong> — komisi & akses eksklusif!</p>
                    <a href={agentWaUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-3 rounded-xl transition-colors">
                      <Crown className="h-4 w-4" /> Daftar Jadi Agen
                    </a>
                  </div>
                )}
              </div>

              {/* ═══════════════════════════════════════
                  RIGHT COLUMN — Main content
                  (Stats + Progress + Rewards + Referral + History)
                  On mobile = full-width single column
              ═══════════════════════════════════════ */}
              <div className="flex flex-col gap-5">

                {/* ① Member Card — mobile only */}
                <div className="lg:hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                  <MemberCard
                    client={{ name: data.client.name, createdAt: data.client.createdAt }}
                    memberIndex={data.client.memberIndex}
                    orders={data.orders.map((o) => ({ type: o.type, status: o.status, createdAt: o.createdAt, transitType: o.transitType }))}
                    readOnly
                  />
                  <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                    {(data.client.referralStamps ?? 0) > 0 && (
                      <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Gift className="h-3 w-3" /> +{data.client.referralStamps} referral
                      </div>
                    )}
                    {totalStamps >= 16 && (
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Crown className="h-3 w-3" /> Full Card! 🎉
                      </div>
                    )}
                    {isGoldMember && totalStamps < 16 && (
                      <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Crown className="h-3 w-3" /> Gold Member
                      </div>
                    )}
                  </div>
                </div>

                {/* ② Promo Poster — mobile only */}
                {posters.length > 0 && (
                  <div className="lg:hidden rounded-2xl border border-blue-100 bg-white shadow-sm p-4">
                    <PromoCarousel posters={posters} />
                  </div>
                )}

                {/* ③ Stat chips — 3-col */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Hash,     label: "Member ID",   value: memberIdStr,                         accent: "bg-blue-50 border-blue-100",    iconColor: "text-blue-600",   iconBg: "bg-blue-100"   },
                    { icon: Star,     label: "Total Stamp", value: `${totalStamps}/16`,                 accent: "bg-amber-50 border-amber-100",  iconColor: "text-amber-600",  iconBg: "bg-amber-100"  },
                    { icon: Calendar, label: "Bergabung",   value: fmtDateShort(data.client.createdAt), accent: "bg-violet-50 border-violet-100", iconColor: "text-violet-600", iconBg: "bg-violet-100" },
                  ].map(({ icon: Icon, label, value, accent, iconColor, iconBg }) => (
                    <div key={label} className={`rounded-2xl border p-3.5 sm:p-4 bg-white ${accent} min-w-0`}>
                      <div className={`h-9 w-9 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
                        <Icon className={`h-4 w-4 ${iconColor}`} />
                      </div>
                      <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight truncate">{value}</p>
                      <p className="text-xs text-gray-400 mt-1 font-medium">{label}</p>
                    </div>
                  ))}
                </div>

                {/* ④ Progress Stamp */}
                <div className="rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-4.5 w-4.5 text-blue-600" />
                      </div>
                      <span className="text-base font-bold text-gray-900">Progress Stamp</span>
                    </div>
                    <span className="text-base font-bold text-blue-600">{totalStamps} / 16</span>
                  </div>

                  {/* 4 progress bars */}
                  <div className="flex gap-2">
                    {REWARD_MILESTONES.map((m) => {
                      const rowDone = totalStamps >= m.stamps;
                      const rowPrev = m.row === 1 ? 0 : REWARD_MILESTONES[m.row - 2].stamps;
                      const rowStampsIn = Math.max(0, Math.min(4, totalStamps - rowPrev));
                      const rowPct = rowDone ? 100 : (rowStampsIn / 4) * 100;
                      const isVip = m.row === 4;
                      return (
                        <div key={m.row} className="flex-1 flex flex-col gap-1.5 items-center min-w-0">
                          <div className={`w-full h-3 rounded-full overflow-hidden ${isVip ? "bg-amber-100" : "bg-blue-100"}`}>
                            <div className={`h-full rounded-full transition-all duration-700 ${
                              rowDone ? (isVip ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-blue-500")
                                      : (isVip ? "bg-amber-200" : "bg-blue-300")
                            }`} style={{ width: `${rowPct}%` }} />
                          </div>
                          <span className="text-sm">{m.emoji}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-sm text-blue-500 font-semibold text-right">
                    {totalStamps >= 16 ? "🎉 Full card! Klaim reward VIP Qatar" : `${16 - totalStamps} stamp lagi menuju Qatar ✈️`}
                  </p>
                </div>

                {/* ⑤ Hadiah Member Point — collapsible */}
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRewards(v => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                        <Gift className="h-4 w-4 text-blue-500" />
                      </div>
                      Hadiah Member Point
                    </h2>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                        {unlockedRewardCount > 0 ? `${unlockedRewardCount} diraih` : `${Math.min(4, Math.floor(totalStamps / 4))}/4 baris`}
                      </span>
                      {currentReward && !showRewards && (
                        <span className="hidden sm:inline text-xs text-blue-600 font-semibold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                          Berikut: {currentReward.emoji} {currentReward.stamps} stamp
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showRewards ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {showRewards && (
                      <motion.div
                        key="rewards-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-gray-100">
                          <ul className="divide-y divide-gray-50">
                            {REWARD_MILESTONES.map((m) => {
                              const unlocked = totalStamps >= m.stamps;
                              const current  = totalStamps >= (m.row === 1 ? 0 : REWARD_MILESTONES[m.row - 2].stamps) && !unlocked;
                              const isVip    = m.row === 4;

                              if (isVip) {
                                return (
                                  <li key={m.row} className="overflow-hidden">
                                    <div className={`relative px-5 py-4 transition-all ${
                                      unlocked ? "bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500"
                                        : current ? "bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50"
                                        : "bg-gray-50"
                                    }`}>
                                      {unlocked && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />}
                                      <div className="flex items-center gap-3">
                                        <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${
                                          unlocked ? "bg-white/30 border-white/50" : current ? "bg-blue-100 border-blue-300" : "bg-blue-50 border-blue-200"
                                        }`}>
                                          <Plane className={`h-5 w-5 stroke-[1.5] ${unlocked ? "text-white" : "text-blue-500"}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 mb-1">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                              unlocked ? "bg-white/40 text-amber-900" : "bg-amber-400 text-white"
                                            }`}>👑 VIP</span>
                                          </div>
                                          <p className={`text-sm font-black leading-tight ${
                                            unlocked ? "text-amber-950" : current ? "text-amber-900" : "text-gray-500"
                                          }`}>{m.label}</p>
                                          {(current || unlocked) && (
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                              {["🛫 Lounge", "🌆 City Tour", "🏨 Transit"].map((tag) => (
                                                <span key={tag} className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                                  unlocked ? "bg-white/30 border-white/40 text-amber-950" : "bg-amber-50 border-amber-200 text-amber-800"
                                                }`}>{tag}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                                          unlocked ? "bg-white/40 text-amber-950 border-white/50"
                                            : current ? "bg-amber-100 text-amber-700 border-amber-300"
                                            : "bg-gray-100 text-gray-400 border-gray-200"
                                        }`}>{unlocked ? "✓ Diraih!" : current ? "Hampir!" : "16 ✦"}</span>
                                      </div>
                                    </div>
                                  </li>
                                );
                              }

                              return (
                                <li key={m.row} className={`flex items-center gap-3 px-5 py-4 transition-colors ${
                                  unlocked ? "bg-emerald-50/50" : current ? "bg-blue-50/40" : ""
                                }`}>
                                  {(() => {
                                    const RowIcon = REWARD_ROW_ICON[m.row];
                                    return (
                                      <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${
                                        unlocked ? "bg-blue-100 border-blue-200"
                                          : current ? "bg-blue-100 border-blue-200"
                                          : "bg-blue-50 border-blue-200"
                                      }`}>
                                        <RowIcon className={`h-5 w-5 stroke-[1.5] ${unlocked ? "text-blue-600" : current ? "text-blue-500" : "text-blue-400"}`} />
                                      </div>
                                    );
                                  })()}
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-bold leading-tight truncate ${
                                      unlocked ? "text-emerald-800" : current ? "text-blue-800" : "text-gray-500"
                                    }`}>{m.label}</p>
                                    {(unlocked || current) && (
                                      <p className={`text-xs mt-0.5 leading-snug line-clamp-1 ${unlocked ? "text-emerald-600" : "text-gray-400"}`}>{m.desc}</p>
                                    )}
                                  </div>
                                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 whitespace-nowrap ${
                                    unlocked ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                      : current ? "bg-blue-100 text-blue-600 border-blue-200"
                                      : "bg-gray-100 text-gray-400 border-gray-200"
                                  }`}>{unlocked ? "✓ Diraih" : current ? "Proses" : `${m.stamps} ✦`}</span>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="px-5 py-3.5 bg-amber-50 border-t border-amber-100">
                            <p className="text-xs text-amber-700 leading-relaxed">
                              💡 Setiap 4 stamp = 1 baris. Klaim via WhatsApp ke admin. Grand Reward Qatar di baris ke-4!
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ⑥ Gold Member CTA — mobile only */}
                {isGoldMember && (
                  <div className="lg:hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 px-5 py-4 flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                      <Crown className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-900 leading-tight">Gold Member 🏅 — {totalStamps} transaksi</p>
                      <p className="text-xs text-amber-700 mt-0.5">Upgrade jadi Agen Resmi & dapat komisi!</p>
                    </div>
                    <a href={agentWaUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shrink-0 whitespace-nowrap">
                      <Crown className="h-3.5 w-3.5" /> Daftar
                    </a>
                  </div>
                )}

                {/* ⑦ Referral + Agent CTA */}
                {!isReferralView && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* Ajak Teman */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-sm font-bold text-gray-900 leading-tight">Ajak Teman, Dapat Reward!</h2>
                          <p className="text-xs text-gray-400 mt-0.5">Referral → teman order → kamu +1 stamp</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={referralWaUrl} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1eb858] text-white text-sm font-bold py-3 rounded-xl transition-colors">
                          <Share2 className="h-4 w-4 shrink-0" /> Ajak via WA
                        </a>
                        <button type="button" onClick={handleCopyReferral}
                          className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-sm font-semibold py-3 px-4 rounded-xl transition-colors shrink-0">
                          {referralCopied ? <><Check className="h-4 w-4 text-emerald-500" /> Tersalin</> : <><Copy className="h-4 w-4" /> Salin</>}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 font-mono break-all bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 leading-relaxed select-all">
                        {referralUrl}
                      </p>
                    </div>

                    {/* Gabung Jadi Agen */}
                    <div className="rounded-2xl overflow-hidden shadow-sm"
                      style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 55%, #312e81 100%)" }}>
                      <div className="h-1 w-full bg-gradient-to-r from-blue-300 via-indigo-300 to-violet-400 opacity-60" />
                      <div className="p-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20">
                            <Briefcase className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-black text-sm leading-tight">Jadi Agen Temantiket</p>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full whitespace-nowrap">Partner Resmi</span>
                            </div>
                            <p className="text-blue-200 text-xs mt-0.5 leading-snug">
                              {totalStamps > 0 ? `${totalStamps} transaksi — saatnya hasilkan komisi!` : "Hasilkan penghasilan jadi partner travel."}
                            </p>
                          </div>
                        </div>
                        {/* Benefit pills — 2×2 */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { icon: DollarSign, label: "Komisi per Order" },
                            { icon: Users,      label: "Bonus Referral"   },
                            { icon: Zap,        label: "Poin & Misi"      },
                            { icon: TrendingUp, label: "Dashboard Agent"  },
                          ].map(({ icon: Icon, label }) => (
                            <div key={label} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                              <Icon className="h-3.5 w-3.5 text-blue-300 shrink-0" />
                              <p className="text-white text-xs font-semibold leading-tight">{label}</p>
                            </div>
                          ))}
                        </div>
                        {/* Trust pills */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {["Tanpa modal", "Leaderboard", "Support penuh"].map((t) => (
                            <div key={t} className="flex items-center gap-1">
                              <BadgeCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span className="text-xs text-blue-200">{t}</span>
                            </div>
                          ))}
                        </div>
                        <a href={`https://wa.me/${AGENT_RECRUIT_WA}?text=${encodeURIComponent(
                            `Halo Admin Temantiket! 👋\n\nSaya ${data.client.name.trim()} (Member ${memberIdStr}) tertarik bergabung sebagai Agen Temantiket.\n\nSudah ${totalStamps} transaksi. Bisa share info syarat & benefit jadi agen? Terima kasih! ✈️`
                          )}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full bg-white hover:bg-blue-50 text-blue-900 text-sm font-black py-3 rounded-xl transition-colors shadow-md shadow-blue-900/20">
                          <Briefcase className="h-4 w-4 shrink-0" />
                          Mulai Jadi Partner
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* ⑧ Riwayat Transaksi */}
                <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                  <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <History className="h-4 w-4 text-blue-600" />
                      </div>
                      Riwayat Transaksi
                    </h2>
                    <div className="flex items-center gap-2 shrink-0">
                      {(data.client.referralStamps ?? 0) > 0 && (
                        <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                          +{data.client.referralStamps} ref
                        </span>
                      )}
                      <span className="text-sm text-gray-400 font-mono tabular-nums">{data.orders.length}/16</span>
                    </div>
                  </header>

                  {history.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <span className="text-4xl">✈️</span>
                      <p className="text-sm font-semibold text-gray-600 mt-3">Belum ada stamp.</p>
                      <p className="text-xs text-gray-400 mt-1">Pesan paket pertama untuk mulai koleksi!</p>
                    </div>
                  ) : (
                    <>
                      <ul className="divide-y divide-gray-50">
                        {(showAllHistory ? history : history.slice(0, 3)).map((stamp, i) => {
                          const steps       = ORDER_PROCESS_STEPS[stamp.type];
                          const processStep = stamp.processStep ?? 0;
                          const hasProgress = steps && (processStep > 0 || stamp.status === "Completed");
                          return (
                            <li key={i} className="px-5 py-4 space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 text-xl flex items-center justify-center shrink-0">
                                  {stampEmoji(stamp)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{stampLabel(stamp)}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{fmtDateLong(stamp.createdAt)}</p>
                                </div>
                                <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg shrink-0 border whitespace-nowrap ${
                                  stamp.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : stamp.status === "Paid" ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}>{stamp.status}</span>
                              </div>
                              {hasProgress && steps && showAllHistory && (
                                <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">📍 Progress Proses</p>
                                  <OrderProgressTracker
                                    type={stamp.type}
                                    currentStep={stamp.status === "Completed" ? steps.length - 1 : processStep}
                                    readOnly
                                  />
                                </div>
                              )}
                            </li>
                          );
                        })}

                        {showAllHistory && (data.client.referralStamps ?? 0) > 0 &&
                          Array.from({ length: data.client.referralStamps }).map((_, i) => {
                            const detail: ReferralDetail | undefined = (data.client.referralDetails ?? [])[i];
                            const firstName = detail?.name?.trim().split(/\s+/).slice(0, 2).join(" ");
                            const orderLabel = detail?.orderType ? (TYPE_LABEL[detail.orderType] ?? detail.orderType) : null;
                            return (
                              <li key={`ref-${i}`} className="px-5 py-4 flex items-center gap-3 bg-emerald-50/40">
                                <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 text-xl flex items-center justify-center shrink-0">🎁</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                                    {firstName ? `Referral dari ${firstName}` : "Bonus Referral"}
                                  </p>
                                  <p className="text-xs text-gray-400 truncate mt-0.5">
                                    {detail ? [orderLabel, fmtDateLong(detail.createdAt)].filter(Boolean).join(" · ") : "Teman berhasil order via referral"}
                                  </p>
                                </div>
                                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 whitespace-nowrap">+1 stamp</span>
                              </li>
                            );
                          })
                        }
                      </ul>

                      {totalHistoryItems > 3 && (
                        <button type="button" onClick={() => setShowAllHistory(v => !v)}
                          className="w-full flex items-center justify-center gap-2 py-4 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors border-t border-gray-100">
                          {showAllHistory
                            ? <><ChevronDown className="h-4 w-4 rotate-180" /> Sembunyikan</>
                            : <><ChevronDown className="h-4 w-4" /> Lihat semua {totalHistoryItems} transaksi</>
                          }
                        </button>
                      )}
                    </>
                  )}
                </section>

                {/* ── Footer ── */}
                <div className="text-center pt-2 pb-4 space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <img src="/temantiket-icon.svg" alt="Temantiket" className="h-5 w-5 object-contain" />
                    <span className="text-sm font-bold text-blue-700">Temantiket</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    mudah, cepat, amanah ·{" "}
                    <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 font-medium">
                      Hubungi Admin
                    </a>
                  </p>
                </div>

              </div>{/* end right column */}
            </div>{/* end 2-col grid */}
          </motion.div>
        )}
      </main>
    </div>
  );
}
