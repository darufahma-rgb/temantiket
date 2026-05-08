import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Loader2, AlertCircle, Sparkles, Star, Gift } from "lucide-react";
import { fetchTopMembers, type LeaderboardEntry } from "@/features/portal/leaderboardRepo";

const MEDAL: Record<number, { emoji: string; label: string; bg: string; text: string; border: string }> = {
  0: { emoji: "🥇", label: "1", bg: "bg-amber-50",   text: "text-amber-700", border: "border-amber-300" },
  1: { emoji: "🥈", label: "2", bg: "bg-slate-50",   text: "text-slate-600", border: "border-slate-300" },
  2: { emoji: "🥉", label: "3", bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-300" },
};

function getMemberId(memberIndex: number): string {
  return `TMNTKT${String(memberIndex).padStart(4, "0")}`;
}

function StampBar({ count, max = 16 }: { count: number; max?: number }) {
  const pct = Math.min(100, Math.round((count / max) * 100));
  return (
    <div className="w-full flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-sky-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-sky-400 to-cyan-500 rounded-full"
        />
      </div>
      <span className="text-[10px] font-mono text-sky-700 shrink-0">{count}/16</span>
    </div>
  );
}

export default function PublicLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchTopMembers(15).then((res) => {
      if (res.ok) setEntries(res.entries);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  const thisMonth = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between border-b border-sky-100/60 bg-white/70 backdrop-blur sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-2">
          <img src="/temantiket-icon.svg" alt="Temantiket" className="h-7 w-7 object-contain icon-adaptive" />
          <span className="text-sm font-bold text-sky-700">Temantiket</span>
        </Link>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Trophy className="h-3 w-3 text-amber-500" /> Travel Enthusiast
        </span>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 md:py-10 space-y-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 text-[11px] font-semibold px-3 py-1 rounded-full border border-amber-200">
            <Sparkles className="h-3 w-3" /> {thisMonth}
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-sky-900">Top Travel Enthusiast</h1>
          <p className="text-sm text-sky-700/80">
            Member Temantiket paling aktif — diukur dari jumlah stamp perjalanan.
          </p>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-sky-700">
            <Loader2 className="h-6 w-6 animate-spin mb-3" />
            <p className="text-sm">Memuat leaderboard…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Leaderboard */}
        {!loading && !error && entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-sky-200 p-8 text-center text-sky-700">
            <Trophy className="h-10 w-10 mx-auto mb-3 text-sky-300" />
            <p className="text-sm font-medium">Leaderboard masih kosong.</p>
            <p className="text-[12px] text-sky-600 mt-1">Jadilah yang pertama mengisi stamp card-mu!</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-3"
          >
            {entries.map((entry, i) => {
              const medal = MEDAL[i];
              const isTop3 = i < 3;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl border ${medal?.border ?? "border-sky-100"} ${medal?.bg ?? "bg-white"} p-4 flex items-center gap-4 shadow-sm`}
                >
                  {/* Rank */}
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold ${isTop3 ? "" : "bg-sky-50"}`}>
                    {isTop3 ? medal.emoji : <span className={`text-sm font-bold text-sky-500`}>#{i + 1}</span>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className={`text-sm font-bold ${medal?.text ?? "text-sky-900"}`}>
                        {entry.firstName}
                      </p>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {getMemberId(entry.memberIndex)}
                      </span>
                    </div>
                    <StampBar count={entry.totalStamps} />
                    {entry.referralStamps > 0 && (
                      <p className="text-[10.5px] text-emerald-600 mt-0.5 flex items-center gap-1">
                        <Gift className="h-2.5 w-2.5" />
                        +{entry.referralStamps} bonus referral
                      </p>
                    )}
                  </div>

                  {/* Stamp count badge */}
                  <div className={`shrink-0 text-right`}>
                    <div className={`text-xl font-black ${medal?.text ?? "text-sky-700"}`}>
                      {entry.totalStamps}
                    </div>
                    <div className="text-[10px] text-muted-foreground">stamp</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* How stamps work */}
        <div className="rounded-2xl bg-white/80 border border-sky-100 p-4 space-y-2">
          <h3 className="text-sm font-bold text-sky-900 flex items-center gap-1.5">
            <Star className="h-4 w-4 text-amber-500" /> Cara Dapat Stamp
          </h3>
          <ul className="text-[12.5px] text-sky-800 space-y-1">
            <li>✈️ Beli tiket pesawat melalui Temantiket</li>
            <li>🕋 Ikut paket Umrah / transit Saudi</li>
            <li>🔺 Proses Visa on Arrival / Visa Pelajar</li>
            <li>🎁 Referensikan teman ke Temantiket (+1 bonus stamp)</li>
          </ul>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 p-5 text-white text-center space-y-2 shadow-md">
          <h3 className="font-bold text-base">Mau masuk leaderboard?</h3>
          <p className="text-[12.5px] opacity-90">
            Kumpulkan stamp dari setiap perjalanan & ajak teman untuk bonus stamp referral.
          </p>
          <a
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 bg-white text-sky-700 text-[13px] font-bold px-4 py-2 rounded-xl shadow"
          >
            Mulai Perjalananmu ✈️
          </a>
        </div>
      </main>

      <footer className="px-4 py-4 text-center text-[10px] text-muted-foreground border-t border-sky-100/60">
        © Temantiket — Public Leaderboard · Hanya menampilkan nama depan & jumlah stamp.
      </footer>
    </div>
  );
}
