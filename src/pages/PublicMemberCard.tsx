import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, Sparkles } from "lucide-react";
import MemberCard from "@/components/MemberCard";
import { lookupMemberCard, type PublicMemberCard } from "@/features/portal/memberCardRepo";
import { buildPublicMemberUrl } from "@/lib/memberSlug";

/**
 * Halaman publik (anon, read-only) Member Card Temantiket.
 *
 * Route: `/m/:slug` — slug = lowercase first-name + memberIndex (mis. "danang10").
 *
 * Keamanan:
 *   • Hanya call RPC `get_member_card` (SECURITY DEFINER, projection minimal).
 *   • Tidak ada form, tidak ada mutate, tidak ada akses ke store auth.
 *   • Komponen MemberCard di-render TANPA tombol Download/Share — hanya flip.
 */
export default function PublicMemberCard() {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between border-b border-sky-100/60 bg-white/70 backdrop-blur">
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
                "Link member card harus dalam format /m/[nama][nomor], contoh /m/danang10."}
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

            <div className="rounded-xl bg-gradient-to-br from-sky-100 to-cyan-100 border border-sky-200 p-4 text-center">
              <p className="text-[12.5px] text-sky-900 leading-relaxed">
                <strong>Pantau terus stamp lo!</strong><br />
                Tiap transaksi sukses (umrah / tiket / visa) bakal otomatis nambah satu stamp.
                Penuhin 16 kotaknya buat reward spesial dari Temantiket. ✈️
              </p>
            </div>

            <p className="text-center text-[11px] text-[hsl(var(--muted-foreground))]">
              Bookmark link ini biar gampang cek lagi:&nbsp;
              <span className="font-mono break-all">
                {buildPublicMemberUrl(slug ?? "")}
              </span>
            </p>
          </motion.div>
        )}
      </main>

      <footer className="px-4 py-4 text-center text-[10px] text-[hsl(var(--muted-foreground))] border-t border-sky-100/60">
        © Temantiket — Member Card Read-Only View
      </footer>
    </div>
  );
}
