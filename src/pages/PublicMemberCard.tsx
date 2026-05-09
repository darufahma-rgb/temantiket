import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, AlertCircle, MessageCircle, History,
  Share2, Users, Trophy, Gift, Crown, Copy, Check,
  ChevronLeft, ChevronRight, Sparkles, ExternalLink,
  Star, Calendar, Hash,
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

// ── Poster Carousel ────────────────────────────────────────────────────────
function PromoCarousel({ posters }: { posters: PromoPost[] }) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = (idx: number) => {
    setActive(idx);
    scrollRef.current?.children[idx]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  if (posters.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400/80">Info Terbaru</span>
        </div>
        <div className="flex items-center gap-1">
          {posters.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-sky-400" : "w-1.5 bg-white/20"}`}
            />
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory"
        onScroll={(e) => {
          const el = e.currentTarget;
          const idx = Math.round(el.scrollLeft / el.offsetWidth);
          setActive(Math.min(idx, posters.length - 1));
        }}
      >
        {posters.map((post) => (
          <div
            key={post.id}
            className="flex-none w-full snap-center rounded-2xl overflow-hidden relative"
          >
            {post.imageUrl ? (
              <div className="relative w-full aspect-[16/7] overflow-hidden rounded-2xl">
                <img
                  src={post.imageUrl}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
                {(post.title || post.caption) && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-4">
                    {post.title && (
                      <p className="text-white font-bold text-[14px] leading-tight drop-shadow">{post.title}</p>
                    )}
                    {post.caption && (
                      <p className="text-white/80 text-[11px] mt-0.5 leading-relaxed drop-shadow">{post.caption}</p>
                    )}
                    {post.ctaUrl && (
                      <a
                        href={post.ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 self-start inline-flex items-center gap-1 bg-white/90 hover:bg-white text-sky-900 text-[11px] font-bold px-3 py-1 rounded-full transition-colors"
                      >
                        {post.ctaLabel || "Selengkapnya"} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full rounded-2xl bg-gradient-to-br from-sky-800/60 to-indigo-800/60 border border-white/10 p-5">
                {post.title && <p className="text-white font-bold text-[14px]">{post.title}</p>}
                {post.caption && <p className="text-white/70 text-[12px] mt-1">{post.caption}</p>}
                {post.ctaUrl && (
                  <a
                    href={post.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors"
                  >
                    {post.ctaLabel || "Selengkapnya"} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {posters.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => scrollTo(Math.max(0, active - 1))}
            disabled={active === 0}
            className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-3 w-3 text-white" />
          </button>
          <span className="text-[10px] text-white/40 font-mono">{active + 1}/{posters.length}</span>
          <button
            onClick={() => scrollTo(Math.min(posters.length - 1, active + 1))}
            disabled={active === posters.length - 1}
            className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3 w-3 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PublicMemberCardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const refSlug = searchParams.get("ref");
  const isReferralView = !!refSlug && refSlug !== slug;

  const [data, setData] = useState<PublicMemberCard | null>(null);
  const [refData, setRefData] = useState<PublicMemberCard | null>(null);
  const [posters, setPosters] = useState<PromoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<"not_found" | "invalid_slug" | "network" | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

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

  const adminWa = useMemo(() => {
    const admin = loadIghAdminSettings();
    return normalizePhoneForWa(admin.adminWhatsapp);
  }, []);

  const publicUrl = useMemo(() => buildPublicMemberUrl(slug ?? ""), [slug]);
  const referralUrl = useMemo(() => buildReferralUrl(slug ?? ""), [slug]);

  const totalStamps = useMemo(() => {
    if (!data) return 0;
    return data.orders.length + (data.client.referralStamps ?? 0);
  }, [data]);

  const isGoldMember = totalStamps >= AGENT_THRESHOLD;

  const memberIdStr = useMemo(
    () => `TMNTKT${String(data?.client.memberIndex ?? 0).padStart(4, "0")}`,
    [data]
  );

  const ctaText = useMemo(() => {
    if (isReferralView && refData) {
      const refName = refData.client.name?.trim().split(/\s+/).slice(0, 2).join(" ") || "teman";
      const refId = `TMNTKT${String(refData.client.memberIndex ?? 0).padStart(4, "0")}`;
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

  const referralWaUrl = useMemo(() => `https://wa.me/?text=${encodeURIComponent(referralText)}`, [referralText]);

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
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] backdrop-blur-md sticky top-0 z-20">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
            <img src="/temantiket-icon.svg" alt="Temantiket" className="h-4 w-4 object-contain" />
          </div>
          <span className="text-[12px] font-bold text-white/80 tracking-wide">TEMANTIKET</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/leaderboard"
            className="flex items-center gap-1 text-[11px] text-sky-400/80 hover:text-sky-300 font-medium transition-colors"
          >
            <Trophy className="h-3 w-3" /> Leaderboard
          </Link>
          <span className="text-white/20">·</span>
          <span className="text-[11px] text-white/30 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Member
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 md:py-10">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-sky-400">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-2 border-sky-500/20 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
              </div>
              <div className="absolute inset-0 rounded-full border border-sky-500/40 animate-ping" />
            </div>
            <p className="text-[12px] text-white/40 mt-4 tracking-wide">Memuat kartu member…</p>
          </div>
        )}

        {/* Error */}
        {!loading && err && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-8 text-center"
          >
            <div className="h-12 w-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <h2 className="text-[15px] font-bold text-red-300">
              {err === "not_found" && "Kartu Member Tidak Ditemukan"}
              {err === "invalid_slug" && "Format Link Tidak Valid"}
              {err === "network" && "Gagal Terhubung"}
            </h2>
            <p className="text-[12px] text-red-400/70 mt-2 leading-relaxed max-w-[280px] mx-auto">
              {err === "not_found" && "Link ini mungkin sudah berubah atau salah ketik. Minta link terbaru ke admin Temantiket."}
              {err === "invalid_slug" && "Format harus /m/nama-0000, contoh /m/danang-0010."}
              {err === "network" && "Server sibuk. Coba refresh beberapa saat lagi."}
            </p>
          </motion.div>
        )}

        {/* Content */}
        {!loading && !err && data && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >

            {/* ── Referral Banner ───────────────────────────────────────── */}
            {isReferralView && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 px-4 py-3.5 flex items-start gap-3"
              >
                <div className="h-8 w-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <span className="text-base">🤝</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-emerald-300">
                    {refData
                      ? `Kamu dibawa oleh ${refData.client.name.trim().split(/\s+/).slice(0, 2).join(" ")}!`
                      : "Kamu dibuka dari link referral!"}
                  </p>
                  <p className="text-[11.5px] text-emerald-400/70 mt-0.5 leading-relaxed">
                    Order lewat Temantiket & sebut nama referrer ke admin — dia dapat bonus stamp reward 🎁
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Hero Header ───────────────────────────────────────────── */}
            <div className="text-center pt-2">
              <div className="inline-flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[9.5px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                <Sparkles className="h-2.5 w-2.5" /> Temantiket Member
              </div>
              <h1 className="text-[22px] md:text-[26px] font-black text-white tracking-tight leading-tight">
                {data.client.name}
              </h1>
              <p className="text-[11px] text-white/30 mt-1">
                Tap kartu untuk lihat sisi belakang & cek poin
              </p>
            </div>

            {/* ── Stats Bar ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Hash, label: "Member ID", value: memberIdStr, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
                { icon: Star, label: "Total Stamp", value: `${totalStamps}/16`, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                { icon: Calendar, label: "Bergabung", value: fmtDateShort(data.client.createdAt), color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className={`rounded-xl border p-2.5 text-center ${bg}`}>
                  <Icon className={`h-3.5 w-3.5 mx-auto mb-1 ${color}`} />
                  <p className={`text-[12px] font-bold ${color} leading-tight`}>{value}</p>
                  <p className="text-[9px] text-white/30 mt-0.5 font-medium">{label}</p>
                </div>
              ))}
            </div>

            {/* ── Progress Bar ──────────────────────────────────────────── */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/50 font-medium">Progress Stamp</span>
                <span className="text-[11px] font-bold text-sky-400">{totalStamps} / 16</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${stampProgress}%` }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
                />
              </div>
              <p className="text-[10.5px] text-white/30 leading-relaxed">
                {totalStamps >= 16
                  ? "🎉 Stamp penuh! Hubungi admin untuk klaim reward spesial."
                  : `${16 - totalStamps} stamp lagi untuk reward spesial dari Temantiket ✈️`}
              </p>
            </div>

            {/* ── Member Card ───────────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] p-3 shadow-2xl">
              <MemberCard
                client={{ name: data.client.name, createdAt: data.client.createdAt }}
                memberIndex={data.client.memberIndex}
                orders={data.orders.map((o) => ({
                  type: o.type, status: o.status, createdAt: o.createdAt, transitType: o.transitType,
                }))}
                readOnly
              />
              <div className="flex items-center justify-center gap-2 mt-2.5 flex-wrap">
                {(data.client.referralStamps ?? 0) > 0 && (
                  <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                    <Gift className="h-2.5 w-2.5" /> +{data.client.referralStamps} referral
                  </div>
                )}
                {totalStamps >= 16 && (
                  <div className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                    <Crown className="h-2.5 w-2.5" /> Full Card! 🎉
                  </div>
                )}
                {isGoldMember && totalStamps < 16 && (
                  <div className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10.5px] font-semibold px-2.5 py-1 rounded-full">
                    <Crown className="h-2.5 w-2.5" /> Gold Member
                  </div>
                )}
              </div>
            </div>

            {/* ── Promo Poster Carousel ─────────────────────────────────── */}
            {posters.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4"
              >
                <PromoCarousel posters={posters} />
              </motion.div>
            )}

            {/* ── Ajak Teman (only owner view) ──────────────────────────── */}
            {!isReferralView && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-[13px] font-bold text-white">Ajak Teman, Dapat Reward!</h2>
                    <p className="text-[10.5px] text-white/40">Share link referral → teman order → kamu +1 stamp</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={referralWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1eb858] text-white text-[12.5px] font-bold py-2.5 rounded-xl transition-colors"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Ajak via WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyReferral}
                    className="flex items-center gap-1.5 bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 text-white/70 text-[12px] font-semibold py-2.5 px-3 rounded-xl transition-colors"
                  >
                    {referralCopied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Tersalin!</> : <><Copy className="h-3.5 w-3.5" /> Salin</>}
                  </button>
                </div>
                <p className="text-[9.5px] text-white/20 font-mono break-all bg-white/[0.04] rounded-lg px-2.5 py-1.5 border border-white/[0.06]">
                  {referralUrl}
                </p>
              </div>
            )}

            {/* ── Gold Member / Become Agent ────────────────────────────── */}
            {isGoldMember && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <Crown className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-amber-300">Gold Member 🏅</p>
                    <p className="text-[10.5px] text-amber-400/60">{totalStamps} transaksi — pelanggan terbaik</p>
                  </div>
                </div>
                <p className="text-[12px] text-amber-300/70 leading-relaxed">
                  Mau naikin level jadi <strong className="text-amber-300">Agen Resmi Temantiket</strong>? Komisi, akses eksklusif, dan banyak benefit lainnya!
                </p>
                <a
                  href={agentWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-[13px] font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
                >
                  <Crown className="h-4 w-4" /> Daftar Jadi Agen Temantiket
                </a>
              </motion.div>
            )}

            {/* ── Riwayat Transaksi ─────────────────────────────────────── */}
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
              <header className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-white flex items-center gap-2">
                  <History className="h-4 w-4 text-sky-400" /> Riwayat Transaksi
                </h2>
                <div className="flex items-center gap-1.5">
                  {(data.client.referralStamps ?? 0) > 0 && (
                    <span className="text-[9.5px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      +{data.client.referralStamps} ref
                    </span>
                  )}
                  <span className="text-[11px] text-white/30 font-mono tabular-nums">
                    {data.orders.length}/16
                  </span>
                </div>
              </header>

              {history.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl">✈️</span>
                  </div>
                  <p className="text-[12px] text-white/30">Belum ada stamp.</p>
                  <p className="text-[11px] text-white/20 mt-0.5">Pesan paket pertama untuk mulai koleksi!</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {history.map((stamp, i) => {
                    const steps = ORDER_PROCESS_STEPS[stamp.type];
                    const processStep = stamp.processStep ?? 0;
                    const hasProgress = steps && (processStep > 0 || stamp.status === "Completed");
                    return (
                      <li key={i} className="px-4 py-3.5 space-y-2.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-lg flex items-center justify-center shrink-0">
                            {stampEmoji(stamp)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">
                              {stampLabel(stamp)}
                            </p>
                            <p className="text-[10.5px] text-white/30 mt-0.5">
                              {fmtDateLong(stamp.createdAt)}
                            </p>
                          </div>
                          <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0 ${
                            stamp.status === "Completed"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : stamp.status === "Paid"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {stamp.status}
                          </span>
                        </div>
                        {hasProgress && steps && (
                          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
                            <p className="text-[9.5px] font-bold uppercase tracking-widest text-white/40 mb-2">
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
                      <li key={`ref-${i}`} className="px-4 py-3.5 flex items-center gap-3 bg-emerald-500/[0.03]">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-lg flex items-center justify-center shrink-0">
                          🎁
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white">Bonus Referral</p>
                          <p className="text-[10.5px] text-white/30 mt-0.5">Teman berhasil order via referral</p>
                        </div>
                        <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          +1 stamp
                        </span>
                      </li>
                    ))
                  }
                </ul>
              )}
            </section>

            {/* ── CTA — Pesan / Hubungi Admin ───────────────────────────── */}
            <a
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-2xl overflow-hidden shadow-xl shadow-green-900/30 group"
            >
              <div className="bg-gradient-to-r from-[#1a8a3c] to-[#25D366] group-hover:from-[#157a34] group-hover:to-[#1eb858] transition-all px-5 py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold text-[14px]">
                    {isReferralView ? "Hubungi Admin & Sebut Referrer" : "Pesan Tiket / Visa Lagi"}
                  </p>
                  <p className="text-white/70 text-[11px] mt-0.5">
                    {isReferralView && refData
                      ? `Template WA sudah menyebut ${refData.client.name.trim().split(/\s+/)[0]} otomatis`
                      : "Chat langsung ke admin Temantiket via WhatsApp"}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-white/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </a>

            <p className="text-center text-[10px] text-white/20 pt-1 font-mono break-all">
              {publicUrl}
            </p>
          </motion.div>
        )}
      </main>

      <footer className="px-4 py-4 text-center text-[10px] text-white/15 border-t border-white/[0.05]">
        © Temantiket — Member Card View · Read-Only · Data ditampilkan terbatas.
      </footer>
    </div>
  );
}
