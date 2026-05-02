import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2, AlertCircle, Sparkles, MessageCircle, History,
  Share2, Users, Trophy, Gift, Crown,
} from "lucide-react";
import MemberCard from "@/components/MemberCard";
import { lookupMemberCard, type PublicMemberCard, type PublicMemberStamp } from "@/features/portal/memberCardRepo";
import { buildPublicMemberUrl, normalizePhoneForWa } from "@/lib/memberSlug";
import { loadIghAdminSettings } from "@/lib/ighSettings";

/**
 * Halaman publik (anon, read-only) Member Card Temantiket.
 * Route: `/m/:slug`
 *
 * Fase 17 additions:
 *   • "Ajak Teman" — share link referral via WhatsApp
 *   • "Mau jadi Agen?" — tampil jika totalStamps >= AGENT_THRESHOLD
 *   • Referral stamp badge (bonus stamps dari referral teman)
 */

const AGENT_THRESHOLD = 8; // Jumlah stamp minimum untuk tombol "Mau jadi Agen?"

// ── Type label & icon helpers ─────────────────────────────────────────────
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

export default function PublicMemberCardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicMemberCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<"not_found" | "invalid_slug" | "network" | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) { setErr("invalid_slug"); setLoading(false); return; }
      setLoading(true); setErr(null); setData(null);
      const res = await lookupMemberCard(slug);
      if (cancelled) return;
      if (res.ok) setData(res.data);
      else setErr(res.error);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const prev = document.title;
    if (data?.client.name) document.title = `${data.client.name} — Temantiket Member Card`;
    return () => { document.title = prev; };
  }, [data?.client.name]);

  // Admin WA CTA
  const adminWa = useMemo(() => {
    const admin = loadIghAdminSettings();
    return normalizePhoneForWa(admin.adminWhatsapp);
  }, []);

  const publicUrl = useMemo(() => buildPublicMemberUrl(slug ?? ""), [slug]);

  // Total stamps = orders + referral bonus
  const totalStamps = useMemo(() => {
    if (!data) return 0;
    return data.orders.length + (data.client.referralStamps ?? 0);
  }, [data]);

  const isGoldMember = totalStamps >= AGENT_THRESHOLD;

  // "Pesan Tiket Lagi" WA URL
  const ctaText = useMemo(() => {
    const name = data?.client.name?.trim().split(/\s+/)[0] || "Sahabat";
    const memberId = `TMNTKT${String(data?.client.memberIndex ?? 0).padStart(4, "0")}`;
    return `Halo Admin Temantiket, gue ${name} (${memberId}). Mau pesan tiket/visa lagi nih, bisa bantu cek opsinya?`;
  }, [data]);
  const ctaUrl = useMemo(() => {
    const encoded = encodeURIComponent(ctaText);
    return adminWa ? `https://wa.me/${adminWa}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [adminWa, ctaText]);

  // "Ajak Teman" referral share text
  const referralText = useMemo(() => {
    const name = data?.client.name?.trim().split(/\s+/)[0] || "Aku";
    return (
      `✈️ ${name} ngajak kamu gabung Temantiket!\n\n` +
      `Temantiket — travel agency terpercaya buat tiket umrah, pesawat & visa. ` +
      `Cek kartu member gue di sini:\n${publicUrl}\n\n` +
      `Daftar & order lewat Temantiket, kita sama-sama dapet reward! 🎁`
    );
  }, [data, publicUrl]);
  const referralWaUrl = useMemo(() => {
    return `https://wa.me/?text=${encodeURIComponent(referralText)}`;
  }, [referralText]);

  // "Mau jadi Agen?" WA text
  const agentText = useMemo(() => {
    const name = data?.client.name?.trim() || "Saya";
    const memberId = `TMNTKT${String(data?.client.memberIndex ?? 0).padStart(4, "0")}`;
    return (
      `Halo Admin Temantiket! 👋\n\n` +
      `Saya ${name} (Member ${memberId}) tertarik untuk bergabung sebagai Agen Temantiket.\n\n` +
      `Sudah ${totalStamps} transaksi & kepercayaan penuh dengan layanan Temantiket. ` +
      `Bisa share info syarat & benefit jadi agen? Terima kasih! ✈️`
    );
  }, [data, totalStamps]);
  const agentWaUrl = useMemo(() => {
    const encoded = encodeURIComponent(agentText);
    return adminWa ? `https://wa.me/${adminWa}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [adminWa, agentText]);

  // Copy referral link
  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2500);
    } catch {
      /* silently fail — user can manually copy the URL */
    }
  };

  // Sort history paling baru di atas
  const history = useMemo(() => {
    if (!data) return [];
    return [...data.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between border-b border-sky-100/60 bg-white/70 backdrop-blur sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-2">
          <img src="/temantiket-logo.png" alt="Temantiket" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/leaderboard"
            className="text-[11px] text-sky-600 hover:text-sky-800 flex items-center gap-1 font-medium"
          >
            <Trophy className="h-3 w-3" /> Leaderboard
          </Link>
          <span className="text-sky-200">·</span>
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Member Card
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 md:py-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-sky-700">
            <Loader2 className="h-6 w-6 animate-spin mb-3" />
            <p className="text-sm">Memuat kartu member…</p>
          </div>
        )}

        {!loading && err && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center"
          >
            <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <h2 className="text-base font-bold text-red-800">
              {err === "not_found" && "Kartu Member Tidak Ditemukan"}
              {err === "invalid_slug" && "Format Link Tidak Valid"}
              {err === "network" && "Gagal Terhubung"}
            </h2>
            <p className="text-sm text-red-700 mt-1">
              {err === "not_found" &&
                "Link ini mungkin udah berubah atau salah ketik. Coba minta link terbaru ke admin Temantiket."}
              {err === "invalid_slug" &&
                "Link member card harus dalam format /m/[nama]-[nomor], contoh /m/danang-0010."}
              {err === "network" &&
                "Server lagi sibuk. Coba refresh beberapa saat lagi."}
            </p>
          </motion.div>
        )}

        {!loading && !err && data && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-5"
          >
            {/* Salam header */}
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-wider text-sky-700/70 font-semibold">
                Temantiket Member
              </p>
              <h1 className="text-xl md:text-2xl font-extrabold text-foreground mt-1">
                {data.client.name}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Tap kartu untuk lihat sisi belakang & cek poin lo
              </p>
            </div>

            {/* Member Card (read-only — flip masih jalan) */}
            <div className="rounded-2xl bg-white/80 backdrop-blur border border-sky-100 p-4 shadow-sm">
              <MemberCard
                client={{
                  name: data.client.name,
                  createdAt: data.client.createdAt,
                }}
                memberIndex={data.client.memberIndex}
                orders={data.orders.map((o) => ({
                  type: o.type,
                  status: o.status,
                  createdAt: o.createdAt,
                  transitType: o.transitType,
                }))}
                readOnly
              />
            </div>

            {/* Stamp summary badge */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-1.5 bg-sky-100 text-sky-800 text-[12px] font-semibold px-3 py-1.5 rounded-full border border-sky-200">
                ✈️ {data.orders.length} stamp dari transaksi
              </div>
              {(data.client.referralStamps ?? 0) > 0 && (
                <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-[12px] font-semibold px-3 py-1.5 rounded-full border border-emerald-200">
                  <Gift className="h-3 w-3" /> +{data.client.referralStamps} bonus referral
                </div>
              )}
              {totalStamps >= 16 && (
                <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-[12px] font-semibold px-3 py-1.5 rounded-full border border-amber-200">
                  <Crown className="h-3 w-3" /> Full Card! 🎉
                </div>
              )}
            </div>

            {/* Progress / motivational banner */}
            <div className="rounded-xl bg-gradient-to-br from-sky-100 to-cyan-100 border border-sky-200 p-4 text-center">
              <p className="text-[12.5px] text-sky-900 leading-relaxed">
                <strong>Pantau terus stamp lo!</strong><br />
                Tiap transaksi sukses (umrah / tiket / visa) bakal otomatis nambah satu stamp.
                Penuhin 16 kotaknya buat <strong>reward spesial</strong> dari Temantiket. ✈️
              </p>
            </div>

            {/* ── Fase 17: Ajak Teman ──────────────────────────────── */}
            <div className="rounded-2xl bg-white border border-sky-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-600" />
                <h2 className="text-sm font-bold text-sky-900">Ajak Teman, Dapat Reward!</h2>
              </div>
              <p className="text-[12.5px] text-sky-800 leading-relaxed">
                Share link member card lo ke teman. Kalau mereka order lewat Temantiket,{" "}
                <strong>lo dapet +1 bonus stamp referral</strong> dari admin. 🎁
              </p>
              <div className="flex gap-2 flex-wrap">
                <a
                  href={referralWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1eb858] text-white text-[13px] font-bold py-2.5 rounded-xl transition-colors shadow-sm"
                >
                  <Share2 className="h-3.5 w-3.5" /> Ajak via WhatsApp
                </a>
                <button
                  type="button"
                  onClick={handleCopyReferral}
                  className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-[13px] font-semibold py-2.5 px-3 rounded-xl transition-colors"
                >
                  {referralCopied ? "✓ Tersalin!" : "Salin Link"}
                </button>
              </div>
              <p className="text-[10.5px] text-muted-foreground font-mono break-all bg-sky-50 rounded-lg px-2 py-1.5 border border-sky-100">
                {publicUrl}
              </p>
            </div>

            {/* ── Fase 17: Mau jadi Agen? (Gold Member only) ───────── */}
            {isGoldMember && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 shadow-sm p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-amber-900">Lo Udah Jadi Gold Member! 🏅</h2>
                </div>
                <p className="text-[12.5px] text-amber-800 leading-relaxed">
                  Dengan <strong>{totalStamps} stamp</strong>, lo udah masuk kategori pelanggan terbaik Temantiket.
                  Mau naikin level & jadi <strong>Agen Resmi Temantiket</strong>? Komisi, akses eksklusif, dan banyak lagi!
                </p>
                <a
                  href={agentWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold py-3 rounded-xl transition-colors shadow-sm"
                >
                  <Crown className="h-4 w-4" /> Mau jadi Agen Temantiket?
                </a>
              </motion.div>
            )}

            {/* Stamp History — read-only */}
            <section className="rounded-2xl bg-white border border-sky-100 overflow-hidden shadow-sm">
              <header className="px-4 py-3 border-b border-sky-100/80 flex items-center justify-between">
                <h2 className="text-sm font-bold text-sky-900 inline-flex items-center gap-1.5">
                  <History className="h-4 w-4" /> Stamp History
                </h2>
                <div className="flex items-center gap-1.5">
                  {(data.client.referralStamps ?? 0) > 0 && (
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                      +{data.client.referralStamps} referral
                    </span>
                  )}
                  <span className="text-[11px] text-sky-700/80 font-mono">
                    {data.orders.length}/16
                  </span>
                </div>
              </header>
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Belum ada stamp. Pesan tiket atau paket umrah pertama lo buat mulai koleksi! ✈️
                </div>
              ) : (
                <ul className="divide-y divide-sky-50">
                  {history.map((stamp, i) => (
                    <li key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center text-base shrink-0">
                        {stampEmoji(stamp)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {stampLabel(stamp)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {fmtDateLong(stamp.createdAt)}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {stamp.status}
                      </span>
                    </li>
                  ))}
                  {/* Referral bonus stamps — shown as virtual entries */}
                  {(data.client.referralStamps ?? 0) > 0 &&
                    Array.from({ length: data.client.referralStamps }).map((_, i) => (
                      <li key={`ref-${i}`} className="px-4 py-3 flex items-center gap-3 bg-emerald-50/40">
                        <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-base shrink-0">
                          🎁
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">Bonus Referral</p>
                          <p className="text-[11px] text-muted-foreground">Teman berhasil daftar & order</p>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                          +1 stamp
                        </span>
                      </li>
                    ))
                  }
                </ul>
              )}
            </section>

            {/* CTA — Pesan Tiket/Visa Lagi */}
            <a
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-2xl px-5 py-4 bg-[#25D366] hover:bg-[#1eb858] text-white text-center font-bold shadow-md transition-colors"
            >
              <MessageCircle className="h-5 w-5 inline-block -mt-0.5 mr-2" />
              Pesan Tiket/Visa Lagi
              <p className="text-[11px] opacity-90 font-medium mt-0.5">
                Chat langsung ke admin Temantiket via WhatsApp
              </p>
            </a>

            <p className="text-center text-[11px] text-muted-foreground pt-2">
              Bookmark link ini biar gampang cek lagi:&nbsp;
              <span className="font-mono break-all">{publicUrl}</span>
            </p>
          </motion.div>
        )}
      </main>

      <footer className="px-4 py-4 text-center text-[10px] text-muted-foreground border-t border-sky-100/60">
        © Temantiket — Member Card View · Read-Only · Tidak ada data sensitif yang ditampilkan.
      </footer>
    </div>
  );
}
