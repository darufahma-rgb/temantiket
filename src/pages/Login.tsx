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
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

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
    <div className="h-fill relative flex items-center justify-center overflow-hidden bg-[#0a1317]">
      {/* Ken-Burns background */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${splashBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          willChange: "transform",
        }}
        initial={{ scale: 1.06, x: -6, y: -3 }}
        animate={{ scale: 1.14, x: 6, y: 3 }}
        transition={{ duration: 20, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
      />

      {/* Dark overlay — lighter than before so photo breathes */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1317]/60 via-[#0a1317]/40 to-[#0a1317]/75" />

      {/* Cobalt aurora blob */}
      <motion.div
        className="pointer-events-none absolute -top-24 -left-24 h-[360px] w-[360px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,100,224,0.28) 0%, rgba(0,100,224,0) 70%)", filter: "blur(48px)" }}
        animate={{ scale: [1, 1.22, 1], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-32 -right-16 h-[420px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(4,87,203,0.32) 0%, rgba(4,87,203,0) 70%)", filter: "blur(56px)" }}
        animate={{ scale: [1.08, 0.92, 1.08], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      {/* Card wrapper */}
      <motion.div
        className="relative z-10 flex w-full max-w-[400px] flex-col items-center px-5"
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.34, 1.2, 0.64, 1] }}
      >
        {/* Logo */}
        <img
          src="/temantiket-logo-new.png"
          alt="Temantiket"
          className="h-14 w-auto object-contain mb-6"
          style={{ filter: "drop-shadow(0 4px 20px rgba(0,100,224,0.50)) brightness(0) invert(1)" }}
        />

        <AnimatePresence mode="wait">

          {/* ── Email / Password form ── */}
          {phase === "form" && (
            <motion.div
              key="form"
              className="w-full"
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.97 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Meta-style white card */}
              <div className="w-full rounded-3xl bg-white border border-[#dee3e9] px-8 py-8 shadow-[rgba(20,22,26,0.20)_0px_4px_24px_0px]">
                <motion.div variants={cardVariants} initial="hidden" animate="show" className="space-y-5">

                  <motion.div variants={itemVariants} className="text-center">
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#0a1317]">Portal Admin</h1>
                    <p className="mt-1 text-[13px] text-[#5d6c7b]">Masuk untuk mengakses Temantiket Portal</p>
                  </motion.div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <p className="text-[13px] font-medium text-red-600">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-[#444950]">Email</label>
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="admin@agensi.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-4 text-[14px] text-[#0a1317] placeholder-[#8595a4] outline-none transition-all focus:border-[#0866FF] focus:ring-2 focus:ring-[#0866FF]/20 disabled:opacity-50"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-[#444950]">Password</label>
                      <div className="relative">
                        <input
                          type={showPass ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); clearError(); }}
                          disabled={isLoading}
                          className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-4 pr-11 text-[14px] text-[#0a1317] placeholder-[#8595a4] outline-none transition-all focus:border-[#0866FF] focus:ring-2 focus:ring-[#0866FF]/20 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass((p) => !p)}
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8595a4] hover:text-[#5d6c7b] transition-colors"
                        >
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </motion.div>

                    <motion.div variants={itemVariants} className="pt-1">
                      <motion.button
                        type="submit"
                        disabled={isLoading || !email.trim() || !password}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold tracking-[-0.14px] text-white transition-all disabled:opacity-50"
                        style={{
                          background: "#0866FF",
                          boxShadow: "rgba(20,22,26,0.20) 0px 2px 8px 0px",
                        }}
                        whileHover={{ scale: 1.01, backgroundColor: "#0654D6" } as any}
                        whileTap={{ scale: 0.99 }}
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

                    <motion.div variants={itemVariants}>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="w-full text-center text-[13px] text-[#5d6c7b] hover:text-[#0866FF] transition-colors mt-1"
                      >
                        Lupa password?
                      </button>
                    </motion.div>
                  </form>

                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── PIN / 2FA ── */}
          {phase === "pin" && (
            <motion.div
              key="pin"
              className="w-full"
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.97 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="w-full rounded-3xl bg-white border border-[#dee3e9] px-8 py-8 shadow-[rgba(20,22,26,0.20)_0px_4px_24px_0px]">
                <motion.div variants={cardVariants} initial="hidden" animate="show" className="space-y-5">
                  <motion.div variants={itemVariants} className="text-center">
                    <div className="flex justify-center mb-3">
                      <div className="h-12 w-12 rounded-2xl bg-[#e8f0fb] border border-[#cce0ff] flex items-center justify-center">
                        <KeyRound className="h-5 w-5 text-[#0866FF]" />
                      </div>
                    </div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-[#0a1317]">Verifikasi 2FA</h1>
                    <p className="mt-1 text-[13px] text-[#5d6c7b]">Masukkan PIN keamanan Anda</p>
                  </motion.div>

                  <form onSubmit={handlePinSubmit} className="space-y-4">
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5"
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          <p className="text-[13px] font-medium text-red-600">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-[#444950]">PIN Keamanan</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="••••••"
                        value={pin}
                        onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); clearError(); }}
                        disabled={isLoading}
                        className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-4 text-center text-xl font-bold tracking-[0.4em] text-[#0a1317] placeholder-[#8595a4] outline-none transition-all focus:border-[#0866FF] focus:ring-2 focus:ring-[#0866FF]/20 disabled:opacity-50"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <motion.button
                        type="submit"
                        disabled={isLoading || !pin.trim()}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold tracking-[-0.14px] text-white transition-all disabled:opacity-50"
                        style={{
                          background: "#0866FF",
                          boxShadow: "rgba(20,22,26,0.20) 0px 2px 8px 0px",
                        }}
                        whileHover={{ scale: 1.01 } as any}
                        whileTap={{ scale: 0.99 }}
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
                        className="w-full text-center text-[13px] text-[#5d6c7b] hover:text-[#0866FF] transition-colors"
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

        <p className="mt-5 text-center text-[12px] text-white/50">
          Belum punya akun? Hubungi administrator biro Anda.
        </p>
      </motion.div>
    </div>
  );
}
