import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, Sparkles, MessageCircle, History } from "lucide-react";
import MemberCard from "@/components/MemberCard";
import { lookupMemberCard, type PublicMemberCard, type PublicMemberStamp } from "@/features/portal/memberCardRepo";
import { buildPublicMemberUrl, normalizePhoneForWa } from "@/lib/memberSlug";
import { loadIghAdminSettings } from "@/lib/ighSettings";

/**
 * Halaman publik (anon, read-only) Member Card Temantiket.
 *
 * Route: `/m/:slug` — slug = `firstname-NNNN`, mis. `/m/danang-0010`.
 *
 * Keamanan:
 *   • Hanya call RPC `get_member_card` (SECURITY DEFINER, projection minimal).
 *   • Tidak ada form, tidak ada mutate, tidak ada akses ke store auth.
 *   • Tidak nampilin phone/email/paspor/alamat/harga klien.
 *   • Komponen MemberCard di-render TANPA tombol Download/Share — hanya flip.
 *
 * Marketing:
 *   • Stamp History list (read-only, type + tanggal aja).
 *   • CTA "Pesan Tiket/Visa Lagi" → buka WhatsApp admin Temantiket.
 *   • OG meta tags (di index.html) bikin link punya thumbnail kartu pas di-share.
 */

// ── Type label & icon helpers ─────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  umrah: "Umrah Transit Saudi",
  flight: "Tiket Pesawat",
  visa_voa: "Visa on Arrival",
  visa_student: "Visa Pelajar / Entry",
};

const TYPE_EMOJI: Record<string, string> = {
  umrah: "🕋",
  flight: "✈️",
  visa_voa: "🔺",
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

  // Set per-page <title> (tetap, walau OG tags di index.html scraper-friendly).
  useEffect(() => {
    const prev = document.title;
    if (data?.client.name) document.title = `${data.client.name} — Temantiket Member Card`;
    return () => { document.title = prev; };
  }, [data?.client.name]);

  // CTA WhatsApp admin Temantiket
  const adminWa = useMemo(() => {
    const admin = loadIghAdminSettings();
    return normalizePhoneForWa(admin.adminWhatsapp);
  }, []);
  const ctaText = useMemo(() => {
    const name = data?.client.name?.trim().split(/\s+/)[0] || "Sahabat";
    return `Halo Admin Temantiket, gue ${name} (member ID TMNTKT${String(data?.client.memberIndex ?? 0).padStart(4, "0")}). Mau pesan tiket/visa lagi nih, bisa bantu cek opsinya?`;
  }, [data?.client.name, data?.client.memberIndex]);
  const ctaUrl = useMemo(() => {
    const text = encodeURIComponent(ctaText);
    return adminWa ? `https://wa.me/${adminWa}?text=${text}` : `https://wa.me/?text=${text}`;
  }, [adminWa, ctaText]);

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
          <img src="/logo-igh-tour.png" alt="Temantiket" className="h-8 w-auto" />
          <span className="text-sm font-bold text-sky-700">Temantiket</span>
        </Link>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))] inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Member Card
        </span>
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
              <h1 className="text-xl md:text-2xl font-extrabold text-[hsl(var(--foreground))] mt-1">
                {data.client.name}
              </h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Tap kartu untuk lihat sisi belakang & cek poin lo
              </p>
            </div>

            {/* Member Card (read-only — flip masih jalan, no download/share) */}
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

            {/* Progress / motivational banner */}
            <div className="rounded-xl bg-gradient-to-br from-sky-100 to-cyan-100 border border-sky-200 p-4 text-center">
              <p className="text-[12.5px] text-sky-900 leading-relaxed">
                <strong>Pantau terus stamp lo!</strong><br />
                Tiap transaksi sukses (umrah / tiket / visa) bakal otomatis nambah satu stamp.
                Penuhin 16 kotaknya buat reward spesial dari Temantiket. ✈️
              </p>
            </div>

            {/* Stamp History — read-only */}
            <section className="rounded-2xl bg-white border border-sky-100 overflow-hidden shadow-sm">
              <header className="px-4 py-3 border-b border-sky-100/80 flex items-center justify-between">
                <h2 className="text-sm font-bold text-sky-900 inline-flex items-center gap-1.5">
                  <History className="h-4 w-4" /> Stamp History
                </h2>
                <span className="text-[11px] text-sky-700/80 font-mono">
                  {history.length}/16
                </span>
              </header>
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
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
                        <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                          {stampLabel(stamp)}
                        </p>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                          {fmtDateLong(stamp.createdAt)}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {stamp.status}
                      </span>
                    </li>
                  ))}
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

            <p className="text-center text-[11px] text-[hsl(var(--muted-foreground))] pt-2">
              Bookmark link ini biar gampang cek lagi:&nbsp;
              <span className="font-mono break-all">
                {buildPublicMemberUrl(slug ?? "")}
              </span>
            </p>
          </motion.div>
        )}
      </main>

      <footer className="px-4 py-4 text-center text-[10px] text-[hsl(var(--muted-foreground))] border-t border-sky-100/60">
        © Temantiket — Member Card View · Read-Only · Tidak ada data sensitif yang ditampilkan.
      </footer>
    </div>
  );
}
