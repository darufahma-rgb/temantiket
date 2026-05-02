import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, AlertCircle, KeyRound } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AnimatePresence, motion } from "framer-motion";
import splashBackground from "@assets/image_1777530688079.png";

// ── Stagger animation variants ────────────────────────────────────────────────
const cardVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.18 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

// Pre-computed sparkle positions — di-define di luar komponen supaya gak
// re-randomize tiap render (yg bikin posisi kelihatan "loncat" pas state berubah).
const SPARKLES = Array.from({ length: 22 }, (_, i) => {
  // Determinisitik via seed sederhana — biar konsisten antar re-render.
  const seed = (i + 1) * 9301 + 49297;
  const r1 = ((seed * 1103515245) % 1000) / 1000;
  const r2 = ((seed * 214013) % 1000) / 1000;
  const r3 = ((seed * 25214903917) % 1000) / 1000;
  return {
    x: r1 * 100,
    y: r2 * 100,
    size: 1.5 + r3 * 2.5,
    dur: 3 + r1 * 4,
    delay: r2 * 5,
  };
});

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<"loading" | "form" | "pin">("loading");
  const [pin, setPin] = useState("");
  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  const { login, completePinLogin, isLoading, error, isAuthenticated, clearError } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // 1050ms — lets the 0.85s progress bar finish + brief rest before form reveals
    const timer = setTimeout(() => setPhase("form"), 1050);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase === "form") {
      setTimeout(() => usernameRef.current?.focus(), 80);
    }
    if (phase === "pin") {
      setTimeout(() => pinRef.current?.focus(), 80);
    }
  }, [phase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email.trim() || !password.trim()) return;
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
      {/* Animated wallpaper — Ken Burns slow zoom + drift biar gak statis */}
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
        transition={{
          duration: 18,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "reverse",
        }}
      />

      {/* Vignette gradient supaya teks tetap kebaca */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" />

      {/* Aurora glow blob 1 — pulse perlahan */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(56,189,248,0.35) 0%, rgba(56,189,248,0) 70%)",
          filter: "blur(40px)",
        }}
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.6, 0.95, 0.6],
          x: [0, 30, 0],
          y: [0, 20, 0],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Aurora glow blob 2 — counter-pulse, fase beda biar gak sinkron */}
      <motion.div
        className="pointer-events-none absolute -bottom-40 -right-24 h-[480px] w-[480px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(37,99,235,0.4) 0%, rgba(37,99,235,0) 70%)",
          filter: "blur(50px)",
        }}
        animate={{
          scale: [1.1, 0.9, 1.1],
          opacity: [0.5, 0.85, 0.5],
          x: [0, -25, 0],
          y: [0, -15, 0],
        }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />

      {/* Sparkle layer — titik-titik kecil yg mengambang */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {SPARKLES.map((s, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-white/70"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              boxShadow: "0 0 8px rgba(255,255,255,0.7)",
            }}
            animate={{
              y: [0, -18, 0],
              opacity: [0.15, 0.85, 0.15],
            }}
            transition={{
              duration: s.dur,
              repeat: Infinity,
              ease: "easeInOut",
              delay: s.delay,
            }}
          />
        ))}
      </div>

      {/* Shimmer sweep — garis cahaya diagonal yg melintas lambat */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(110deg, transparent 40%, rgba(125,211,252,0.08) 50%, transparent 60%)",
        }}
        animate={{ backgroundPosition: ["-200% 0%", "200% 0%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center px-6"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
      >
        <img
          src="/temantiket-logo.png"
          alt="Temantiket"
          className="h-12 w-auto object-contain drop-shadow-[0_8px_24px_rgba(14,165,233,0.45)] mb-2"
        />

        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div
              key="loading"
              className="mt-8 flex flex-col items-center gap-5"
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.96, filter: "blur(4px)" }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/80">
                Memuat…
              </p>
              <div className="h-[2px] w-56 overflow-hidden rounded-full bg-white/20">
                <motion.div
                  className="h-full rounded-full bg-white"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.85, delay: 0.1, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          )}

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
                <motion.div
                  variants={cardVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-4"
                >
                  {/* Title */}
                  <motion.div variants={itemVariants} className="mb-6 text-center">
                    <h1 className="text-xl font-extrabold tracking-tight text-white">
                      Portal Admin
                    </h1>
                    <p className="mt-1 text-[12px] text-white/60">
                      Masuk untuk mengakses Temantiket Portal
                    </p>
                  </motion.div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-3.5 py-2.5"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300" />
                          <p className="text-[12px] font-medium text-red-200">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">
                        Email
                      </label>
                      <input
                        ref={usernameRef}
                        type="email"
                        autoComplete="email"
                        placeholder="owner@agency.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearError(); }}
                        disabled={isLoading}
                        className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-medium text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
                      />
                    </motion.div>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); clearError(); }}
                          disabled={isLoading}
                          className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 pr-11 text-sm font-medium text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/80"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <motion.button
                        type="submit"
                        disabled={isLoading || !email.trim() || !password.trim()}
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
                  </form>
                </motion.div>
              </div>
            </motion.div>
          )}

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
                <motion.div
                  variants={cardVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-4"
                >
                  <motion.div variants={itemVariants} className="mb-6 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="h-12 w-12 rounded-2xl bg-sky-500/30 border border-sky-400/40 flex items-center justify-center">
                        <KeyRound className="h-5 w-5 text-sky-300" />
                      </div>
                    </div>
                    <h1 className="text-xl font-extrabold tracking-tight text-white">
                      Verifikasi 2FA
                    </h1>
                    <p className="mt-1 text-[12px] text-white/60">
                      Masukkan PIN keamanan Anda
                    </p>
                  </motion.div>

                  <form onSubmit={handlePinSubmit} className="space-y-4">
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-3.5 py-2.5"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300" />
                          <p className="text-[12px] font-medium text-red-200">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.div variants={itemVariants} className="space-y-1.5">
                      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">
                        PIN Keamanan
                      </label>
                      <input
                        ref={pinRef}
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
      </motion.div>
    </div>
  );
}
