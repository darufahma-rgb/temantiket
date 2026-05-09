import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, AlertCircle, MessageCircle, History,
  Share2, Users, Trophy, Gift, Crown, Copy, Check,
  ChevronLeft, ChevronRight, Sparkles, ExternalLink,
  Star, Calendar, Hash, TrendingUp,
} from "lucide-react";
import MemberCard from "@/components/MemberCard";
import { OrderProgressTracker, ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { lookupMemberCard, type PublicMemberCard, type PublicMemberStamp } from "@/features/portal/memberCardRepo";
import { fetchPublicPromoPosters, type PromoPost } from "@/lib/promoPostersSettings";
import { buildPublicMemberUrl, buildReferralUrl, normalizePhoneForWa } from "@/lib/memberSlug";
import { loadIghAdminSettings } from "@/lib/ighSettings";

const AGENT_THRESHOLD = 8;

const TYPE_LABEL: Record<string, string> = {
  umrah:        "Umrah Transit Saudi",
  flight:       "Tiket Pesawat",
  visa_voa:     "Visa on Arrival",
  visa_student: "Visa Pelajar / Entry",
};

const TYPE_EMOJI: Record<string, string> = {
  umrah:        "🕋",
  flight:       "✈️",
  visa_voa:     "🔺",
  visa_student: "📘",
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
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
  } catch { return iso; }
}

// ── Poster Carousel ─────────────────────────────────────────────────────────
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
            Info Terbaru
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {posters.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={`rounded-full transition-all duration-300 ${
                i === active ? "w-5 h-2 bg-blue-500" : "w-2 h-2 bg-blue-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Compact poster cards — 2 visible on mobile, 3 on md+ */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1"
        onScroll={(e) => {
          const el   = e.currentTarget;
          const card = el.children[0] as HTMLElement | undefined;
          const w    = card ? card.offsetWidth + 12 : el.offsetWidth;
          const idx  = Math.round(el.scrollLeft / w);
          setActive(Math.min(idx, posters.length - 1));
        }}
      >
        {posters.map((post) => (
          <div
            key={post.id}
            /* ~47% wide on mobile shows 2 cards + peek; ~30% on md shows 3 */
            className="flex-none w-[47%] sm:w-[30%] snap-start"
          >
            {post.imageUrl ? (
              <div className="group flex flex-col rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-white hover:shadow-md transition-shadow">
                {/* Poster image — fixed 4:5 portrait ratio */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                {/* Caption below image */}
                {(post.title || post.caption || post.ctaUrl) && (
                  <div className="px-3 py-2.5 space-y-1.5">
                    {post.title && (
                      <p className="text-gray-900 font-bold text-[12px] leading-snug line-clamp-2">
                        {post.title}
                      </p>
                    )}
                    {post.caption && (
                      <p className="text-gray-400 text-[10.5px] leading-relaxed line-clamp-2">
                        {post.caption}
                      </p>
                    )}
                    {post.ctaUrl && (
                      <a
                        href={post.ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-[10.5px] font-semibold transition-colors"
                      >
                        {post.ctaLabel || "Selengkapnya"} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Text-only card — same compact size */
              <div
                className="flex flex-col rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 shadow-sm overflow-hidden"
                style={{ aspectRatio: "4 / 5" }}
              >
                <div className="flex-1 flex flex-col justify-center px-4 py-4 space-y-2">
                  {post.title && (
                    <p className="text-gray-900 font-extrabold text-[13px] leading-snug line-clamp-3">
                      {post.title}
                    </p>
                  )}
                  {post.caption && (
                    <p className="text-gray-500 text-[10.5px] leading-relaxed line-clamp-3">
                      {post.caption}
                    </p>
                  )}
                  {post.ctaUrl && (
                    <a
                      href={post.ctaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 self-start inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {post.ctaLabel || "Selengkapnya"} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Prev / Next — only shown when more than 2 posters */}
      {posters.length > 2 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => scrollTo(active - 1)}
            disabled={active === 0}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm flex items-center justify-center disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-[11px] text-gray-400 font-mono tabular-nums">
            {active + 1} / {posters.length}
          </span>
          <button
            onClick={() => scrollTo(active + 1)}
            disabled={active === posters.length - 1}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm flex items-center justify-center disabled:opacity-30 transition-all"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PublicMemberCardPage() {
  const { slug }         = useParams<{ slug: string }>();
  const [searchParams]   = useSearchParams();
  const refSlug          = searchParams.get("ref");
  const isReferralView   = !!refSlug && refSlug !== slug;

  const [data,          setData]          = useState<PublicMemberCard | null>(null);
  const [refData,       setRefData]       = useState<PublicMemberCard | null>(null);
  const [posters,       setPosters]       = useState<PromoPost[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState<"not_found" | "invalid_slug" | "network" | null>(null);
  const [referralCopied,setReferralCopied]= useState(false);

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
      if (res.ok) setData(res.data);
      else setErr(res.error);
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
      return (
        `Halo Admin Temantiket! 👋\n\n` +
        `Saya tertarik order tiket/visa nih. Dapat info dari *${refName}* (${refId}).\n\n` +
        `Bisa bantu cek opsi yang tersedia? Terima kasih! ✈️`
      );
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
    return (
      `✈️ ${name} ngajak kamu gabung Temantiket!\n\n` +
      `Temantiket — travel agency terpercaya buat tiket umrah, pesawat & visa.\n\n` +
      `Cek kartu member & daftar via link ini:\n${referralUrl}\n\n` +
      `Kalau kamu order lewat Temantiket, sebut nama gue ke admin ya — kita sama-sama dapet reward! 🎁`
    );
  }, [data, referralUrl]);

  const referralWaUrl = useMemo(
    () => `https://wa.me/?text=${encodeURIComponent(referralText)}`,
    [referralText],
  );

  const agentText = useMemo(() => {
    const name = data?.client.name?.trim() || "Saya";
    return (
      `Halo Admin Temantiket! 👋\n\n` +
      `Saya ${name} (Member ${memberIdStr}) tertarik untuk bergabung sebagai Agen Temantiket.\n\n` +
      `Sudah ${totalStamps} transaksi & kepercayaan penuh dengan layanan Temantiket. ` +
      `Bisa share info syarat & benefit jadi agen? Terima kasih! ✈️`
    );
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
    return [...data.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data]);

  const stampProgress = Math.min(100, (totalStamps / 16) * 100);

  return (
    /*
     * Root wrapper:
     * - min-h-screen ensures the gradient background always fills the viewport,
     *   even on short pages — no "cut-off" gray/white areas.
     * - overflow-y: auto (via overflow-auto) lets the page scroll normally on
     *   every device without being blocked by a parent with overflow: hidden.
     */
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: "linear-gradient(165deg, #f0f6ff 0%, #f8fafc 45%, #ffffff 100%)" }}
    >

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/80 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/logo-igh-tour-maskable.png"
              alt="Temantiket"
              className="h-7 w-7 rounded-lg object-cover shrink-0"
            />
            <span className="text-[15px] font-extrabold tracking-tight text-blue-600 leading-none">
              temantiket
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/leaderboard"
              className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-700 font-semibold transition-colors"
            >
              <Trophy className="h-3.5 w-3.5" /> Leaderboard
            </Link>
            <span className="text-gray-200">|</span>
            <span className="text-[12px] text-gray-400 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Member
            </span>
          </div>
        </div>
      </header>

      {/* ── Main scrollable area ─────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto w-full px-4 py-6 pb-12">

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-40 text-blue-500"
            >
              <div className="relative">
                <div className="h-14 w-14 rounded-full border-2 border-blue-100 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
                <div className="absolute inset-0 rounded-full border border-blue-200 animate-ping opacity-60" />
              </div>
              <p className="text-[13px] text-gray-400 mt-5 tracking-wide">Memuat kartu member…</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {!loading && err && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mt-16 rounded-3xl border border-red-100 bg-white px-6 py-10 text-center shadow-sm"
          >
            <div className="h-14 w-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="text-[16px] font-bold text-red-700">
              {err === "not_found"    && "Kartu Member Tidak Ditemukan"}
              {err === "invalid_slug" && "Format Link Tidak Valid"}
              {err === "network"      && "Gagal Terhubung"}
            </h2>
            <p className="text-[12px] text-gray-500 mt-2 leading-relaxed max-w-[280px] mx-auto">
              {err === "not_found"    && "Link ini mungkin sudah berubah atau salah ketik. Minta link terbaru ke admin Temantiket."}
              {err === "invalid_slug" && "Format harus /m/nama-0000, contoh /m/danang-0010."}
              {err === "network"      && "Server sibuk. Coba refresh beberapa saat lagi."}
            </p>
          </motion.div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {!loading && !err && data && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            {/* Referral Banner */}
            {isReferralView && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5 flex items-start gap-3"
              >
                <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-lg">
                  🤝
                </div>
                <div>
                  <p className="text-[13px] font-bold text-emerald-800">
                    {refData
                      ? `Kamu dibawa oleh ${refData.client.name.trim().split(/\s+/).slice(0, 2).join(" ")}!`
                      : "Kamu dibuka dari link referral!"}
                  </p>
                  <p className="text-[11.5px] text-emerald-600 mt-0.5 leading-relaxed">
                    Order lewat Temantiket & sebut nama referrer ke admin — dia dapat bonus stamp reward 🎁
                  </p>
                </div>
              </motion.div>
            )}

            {/* Page Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 bg-blue-600/10 border border-blue-200 text-blue-600 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-2">
                  <Sparkles className="h-2.5 w-2.5" /> Temantiket Member
                </div>
                <h1 className="text-[26px] md:text-[30px] font-black text-gray-900 tracking-tight leading-tight">
                  {data.client.name}
                </h1>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {memberIdStr} · Bergabung {fmtDateShort(data.client.createdAt)}
                </p>
              </div>
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1eb858] text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors shadow-md shadow-green-200"
              >
                <MessageCircle className="h-4 w-4" />
                {isReferralView ? "Hubungi Admin" : "Pesan Sekarang"}
              </a>
            </div>

            {/* ── Promo Poster — FULL WIDTH, prominent ──────────────────── */}
            {posters.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="rounded-3xl border border-blue-100 bg-white shadow-sm overflow-hidden"
              >
                <div className="px-5 pt-5 pb-4">
                  <PromoCarousel posters={posters} />
                </div>
              </motion.div>
            )}

            {/* ── Main Grid ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* LEFT: Member Card + badges + Gold CTA */}
              <div className="lg:col-span-1 space-y-4">

                {/* Card */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <MemberCard
                    client={{ name: data.client.name, createdAt: data.client.createdAt }}
                    memberIndex={data.client.memberIndex}
                    orders={data.orders.map((o) => ({
                      type: o.type, status: o.status, createdAt: o.createdAt, transitType: o.transitType,
                    }))}
                    readOnly
                  />
                  <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                    {(data.client.referralStamps ?? 0) > 0 && (
                      <div className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                        <Gift className="h-2.5 w-2.5" /> +{data.client.referralStamps} referral
                      </div>
                    )}
                    {totalStamps >= 16 && (
                      <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                        <Crown className="h-2.5 w-2.5" /> Full Card! 🎉
                      </div>
                    )}
                    {isGoldMember && totalStamps < 16 && (
                      <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                        <Crown className="h-2.5 w-2.5" /> Gold Member
                      </div>
                    )}
                  </div>
                </div>

                {/* Gold Member / Agent CTA */}
                {isGoldMember && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                        <Crown className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-amber-900">Gold Member 🏅</p>
                        <p className="text-[10.5px] text-amber-600">{totalStamps} transaksi — pelanggan terbaik</p>
                      </div>
                    </div>
                    <p className="text-[12px] text-amber-800 leading-relaxed">
                      Mau naik level jadi <strong>Agen Resmi Temantiket</strong>? Komisi, akses eksklusif, dan banyak benefit lainnya!
                    </p>
                    <a
                      href={agentWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold py-2.5 rounded-xl transition-colors shadow shadow-amber-200"
                    >
                      <Crown className="h-4 w-4" /> Daftar Jadi Agen
                    </a>
                  </motion.div>
                )}
              </div>

              {/* RIGHT: Stats + Progress + Referral + History */}
              <div className="lg:col-span-2 space-y-4">

                {/* Stat Cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Hash,       label: "Member ID",   value: memberIdStr,                      accent: "bg-blue-50 border-blue-100",   iconColor: "text-blue-600",   iconBg: "bg-blue-100" },
                    { icon: Star,       label: "Total Stamp", value: `${totalStamps}/16`,              accent: "bg-amber-50 border-amber-100", iconColor: "text-amber-600",  iconBg: "bg-amber-100" },
                    { icon: Calendar,   label: "Bergabung",   value: fmtDateShort(data.client.createdAt), accent: "bg-violet-50 border-violet-100",iconColor: "text-violet-600", iconBg: "bg-violet-100" },
                  ].map(({ icon: Icon, label, value, accent, iconColor, iconBg }) => (
                    <div key={label} className={`rounded-2xl border p-3.5 bg-white ${accent}`}>
                      <div className={`h-8 w-8 rounded-lg ${iconBg} flex items-center justify-center mb-2`}>
                        <Icon className={`h-4 w-4 ${iconColor}`} />
                      </div>
                      <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{value}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Progress */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <span className="text-[13px] font-bold text-gray-900">Progress Stamp</span>
                    </div>
                    <span className="text-[13px] font-bold text-blue-600">{totalStamps} / 16</span>
                  </div>
                  <div className="h-3 rounded-full bg-blue-50 border border-blue-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${stampProgress}%` }}
                      transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
                    />
                  </div>
                  <p className="text-[11.5px] text-gray-500 leading-relaxed">
                    {totalStamps >= 16
                      ? "🎉 Stamp penuh! Hubungi admin untuk klaim reward spesial."
                      : `${16 - totalStamps} stamp lagi untuk reward spesial dari Temantiket ✈️`}
                  </p>
                </div>

                {/* Ajak Teman */}
                {!isReferralView && (
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Users className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-[13px] font-bold text-gray-900">Ajak Teman, Dapat Reward!</h2>
                        <p className="text-[10.5px] text-gray-400">Share link referral → teman order → kamu +1 stamp</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={referralWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1eb858] text-white text-[12.5px] font-bold py-2.5 rounded-xl transition-colors shadow shadow-green-100"
                      >
                        <Share2 className="h-3.5 w-3.5" /> Ajak via WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyReferral}
                        className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-[12px] font-semibold py-2.5 px-3 rounded-xl transition-colors"
                      >
                        {referralCopied
                          ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Tersalin!</>
                          : <><Copy className="h-3.5 w-3.5" /> Salin</>}
                      </button>
                    </div>
                    <p className="text-[9.5px] text-gray-400 font-mono break-all bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                      {referralUrl}
                    </p>
                  </div>
                )}

                {/* Riwayat Transaksi */}
                <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                  <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center">
                        <History className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      Riwayat Transaksi
                    </h2>
                    <div className="flex items-center gap-1.5">
                      {(data.client.referralStamps ?? 0) > 0 && (
                        <span className="text-[9.5px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                          +{data.client.referralStamps} ref
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400 font-mono tabular-nums">
                        {data.orders.length}/16
                      </span>
                    </div>
                  </header>

                  {history.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <div className="h-14 w-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">✈️</span>
                      </div>
                      <p className="text-[13px] font-semibold text-gray-600">Belum ada stamp.</p>
                      <p className="text-[11px] text-gray-400 mt-1">Pesan paket pertama untuk mulai koleksi!</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {history.map((stamp, i) => {
                        const steps       = ORDER_PROCESS_STEPS[stamp.type];
                        const processStep = stamp.processStep ?? 0;
                        const hasProgress = steps && (processStep > 0 || stamp.status === "Completed");
                        return (
                          <li key={i} className="px-4 py-3.5 space-y-2.5">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 text-xl flex items-center justify-center shrink-0">
                                {stampEmoji(stamp)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-gray-900 truncate">
                                  {stampLabel(stamp)}
                                </p>
                                <p className="text-[10.5px] text-gray-400 mt-0.5">
                                  {fmtDateLong(stamp.createdAt)}
                                </p>
                              </div>
                              <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0 ${
                                stamp.status === "Completed"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : stamp.status === "Paid"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {stamp.status}
                              </span>
                            </div>
                            {hasProgress && steps && (
                              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                                <p className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                  📍 Progress Proses
                                </p>
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

                      {(data.client.referralStamps ?? 0) > 0 &&
                        Array.from({ length: data.client.referralStamps }).map((_, i) => (
                          <li key={`ref-${i}`} className="px-4 py-3.5 flex items-center gap-3 bg-emerald-50/40">
                            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 text-xl flex items-center justify-center shrink-0">
                              🎁
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-gray-900">Bonus Referral</p>
                              <p className="text-[10.5px] text-gray-400 mt-0.5">Teman berhasil order via referral</p>
                            </div>
                            <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              +1 stamp
                            </span>
                          </li>
                        ))
                      }
                    </ul>
                  )}
                </section>
              </div>
            </div>

            {/* Bottom URL watermark */}
            <p className="text-center text-[10px] text-gray-300 pt-2 font-mono break-all">
              {publicUrl}
            </p>
          </motion.div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────
          Background matches the page gradient — no jarring color block. */}
      <footer className="border-t border-gray-100/60 px-4 py-5 text-center text-[10px] text-gray-400">
        © Temantiket — Member Card View · Read-Only · Data ditampilkan terbatas.
      </footer>
    </div>
  );
}
