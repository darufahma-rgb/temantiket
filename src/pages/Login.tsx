import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, AlertCircle, KeyRound, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AnimatePresence, motion } from "framer-motion";
import splashBackground from "@assets/image_1777530688079.png";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const cardVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.18 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const SPARKLES = Array.from({ length: 22 }, (_, i) => {
  const seed = (i + 1) * 9301 + 49297;
  const r1 = ((seed * 1103515245) % 1000) / 1000;
  const r2 = ((seed * 214013) % 1000) / 1000;
  const r3 = ((seed * 25214903917) % 1000) / 1000;
  return { x: r1 * 100, y: r2 * 100, size: 1.5 + r3 * 2.5, dur: 3 + r1 * 4, delay: r2 * 5 };
});

export default function Login() {
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [pin, setPin]               = useState("");
  const [phase, setPhase]           = useState<"form" | "pin">("form");
  const [forgotMode, setForgotMode] = useState(false);

  const { login, completePinLogin, isLoading, error, isAuthenticated, clearError, pendingLoginUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (pendingLoginUser) setPhase("pin");
    else setPhase("form");
  }, [pendingLoginUser]);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Masukkan email Anda terlebih dahulu.");
      return;
    }
    if (!supabase) {
      toast.error("Supabase belum dikonfigurasi.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) toast.error("Gagal mengirim email reset: " + error.message);
    else toast.success("Email reset password telah dikirim. Cek inbox Anda.");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email.trim() || !password) return;
    const result = await login(email.trim(), password);
    if (result === "ok") navigate("/", { replace: true });
    else if (result === "needs_pin") setPhase("pin");
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!pin.trim()) return;
    const ok = await completePinLogin(pin.trim());
    if (ok) navigate("/", { replace: true });
  };

  return (
    <div
      className="h-fill relative flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#020617" }}
    >
      {/* Ken-Burns background */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${splashBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          willChange: "transform",
        }}
        initial={{ scale: 1.08, x: -8, y: -4 }}
        animate={{ scale: 1.18, x: 8, y: 4 }}
        transition={{ duration: 18, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" />

      {/* Aurora blobs */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.35) 0%, rgba(56,189,248,0) 70%)", filter: "blur(40px)" }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.95, 0.6], x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-40 -right-24 h-[480px] w-[480px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,0.4) 0%, rgba(37,99,235,0) 70%)", filter: "blur(50px)" }}
        animate={{ scale: [1.1, 0.9, 1.1], opacity: [0.5, 0.85, 0.5], x: [0, -25, 0], y: [0, -15, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />

      {/* Sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {SPARKLES.map((s, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-white/70"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, boxShadow: "0 0 8px rgba(255,255,255,0.7)" }}
            animate={{ y: [0, -18, 0], opacity: [0.15, 0.85, 0.15] }}
            transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
          />
        ))}
      </div>

      {/* Shimmer sweep */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(110deg, transparent 40%, rgba(125,211,252,0.08) 50%, transparent 60%)" }}
        animate={{ backgroundPosition: ["-200% 0%", "200% 0%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Card wrapper */}
      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center px-6"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
      >
        <img
          src="/temantiket-logo-new.png"
          alt="Temantiket"
          className="h-16 w-auto object-contain mb-2"
          style={{ mixBlendMode: "screen", filter: "drop-shadow(0 8px 32px rgba(14,165,233,0.55))" }}
        />

        <AnimatePresence mode="wait">

          {/* ── Email / Password form ── */}
          {phase === "form" && (
            <motion.div
              key="form"
              className="mt-4 w-full"
              initial={{ opacity: 0, y: 32, scale: 0.94, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -16, scale: 0.97, filter: "blur(6px)" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="rounded-3xl border border-white/20 bg-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-md">
                <motion.div variants={cardVariants} initial="hidden" animate="show" className="space-y-4">

                  <motion.div variants={itemVariants} className="mb-6 text-center">
                    <h1 className="text-xl font-extrabold tracking-tight text-white">Portal Admin</h1>
                    <p className="mt-1 text-[12px] text-white/60">Masuk untuk mengakses Temantiket Portal</p>
                  </motion.div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-3.5 py-2.5"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300" />
                        <p className="text-[12px] font-medium text-red-200">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleLogin} className="space-y-3">
                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">Email</label>
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="admin@agensi.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">Password</label>
                      <div className="relative">
                        <input
                          type={showPass ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); clearError(); }}
                          disabled={isLoading}
                          className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 pr-11 text-sm text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass((p) => !p)}
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                        >
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </motion.div>

                    <motion.div variants={itemVariants} className="pt-1">
                      <motion.button
                        type="submit"
                        disabled={isLoading || !email.trim() || !password}
                        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-extrabold uppercase tracking-widest text-white transition-all disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #123499 0%, #1a44d4 60%, #6694ff 100%)",
                          boxShadow: "0 8px 28px rgba(14,165,233,0.4)",
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isLoading ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            Masuk…
                          </>
                        ) : (
                          <>
                            <LogIn className="h-4 w-4" />
                            Masuk
                          </>
                        )}
                      </motion.button>
                    </motion.div>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="w-full text-center text-[12px] text-white/50 hover:text-white/80 transition-colors mt-2"
                    >
                      Lupa password?
                    </button>
                  </form>

                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── PIN / 2FA ── */}
          {phase === "pin" && (
            <motion.div
              key="pin"
              className="mt-4 w-full"
              initial={{ opacity: 0, y: 32, scale: 0.94, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -16, scale: 0.97, filter: "blur(6px)" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="rounded-3xl border border-white/20 bg-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-md">
                <motion.div variants={cardVariants} initial="hidden" animate="show" className="space-y-4">
                  <motion.div variants={itemVariants} className="mb-6 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="h-12 w-12 rounded-2xl bg-sky-500/30 border border-sky-400/40 flex items-center justify-center">
                        <KeyRound className="h-5 w-5 text-sky-300" />
                      </div>
                    </div>
                    <h1 className="text-xl font-extrabold tracking-tight text-white">Verifikasi 2FA</h1>
                    <p className="mt-1 text-[12px] text-white/60">Masukkan PIN keamanan Anda</p>
                  </motion.div>

                  <form onSubmit={handlePinSubmit} className="space-y-4">
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-3.5 py-2.5"
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300" />
                          <p className="text-[12px] font-medium text-red-200">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">PIN Keamanan</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="••••••"
                        value={pin}
                        onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); clearError(); }}
                        disabled={isLoading}
                        className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-center text-xl font-bold tracking-[0.5em] text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <motion.button
                        type="submit"
                        disabled={isLoading || !pin.trim()}
                        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-extrabold uppercase tracking-widest text-white transition-all disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #123499 0%, #1a44d4 60%, #6694ff 100%)",
                          boxShadow: "0 8px 28px rgba(14,165,233,0.4)",
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isLoading ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            Memverifikasi…
                          </>
                        ) : (
                          <>
                            <KeyRound className="h-4 w-4" />
                            Verifikasi
                          </>
                        )}
                      </motion.button>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <button
                        type="button"
                        onClick={() => { setPhase("form"); setPin(""); clearError(); }}
                        className="w-full text-center text-[12px] text-white/50 hover:text-white/80 transition-colors mt-1"
                      >
                        Kembali ke login
                      </button>
                    </motion.div>
                  </form>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        <p className="mt-4 text-center text-[11px] text-white/40">
          Belum punya akun? Hubungi administrator biro Anda.
        </p>
      </motion.div>
    </div>
  );
}
