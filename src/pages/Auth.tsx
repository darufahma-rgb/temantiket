import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { bootstrapFirstOwner, useAuthStore } from "@/store/authStore";

export default function Auth() {
  const [agencyName, setAgencyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();
  const init = useAuthStore((s) => s.init);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agencyName.trim()) {
      setError("Nama agency wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      await bootstrapFirstOwner({ agencyName: agencyName.trim() });
      setSuccess(true);
      await init();
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur-md"
      >
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/30 border border-sky-400/40">
            <Building2 className="h-5 w-5 text-sky-300" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-white">Setup Agency</h1>
          <p className="mt-1 text-[12px] text-white/60">
            Akun Anda sudah terverifikasi. Buat nama agency untuk memulai.
          </p>
        </div>

        {success ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-emerald-200 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Agency dibuat. Mengarahkan…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2.5 text-red-200 text-[12px]">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">
                Nama Agency
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                  <Building2 className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Temantiket Jakarta"
                  disabled={loading}
                  className="h-11 w-full rounded-xl border border-white/20 bg-white/10 pl-10 pr-4 text-sm font-medium text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !agencyName.trim()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-sky-600 to-sky-400 text-sm font-extrabold uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Membuat…
                </>
              ) : (
                "Buat Agency"
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
