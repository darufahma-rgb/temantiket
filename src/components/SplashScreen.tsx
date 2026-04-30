import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import splashBackground from "@assets/image_1776663921386.png";
import { useAuthStore } from "@/store/authStore";

export function SplashScreen() {
  const { isAuthenticated, isLoading, error, login, clearError } = useAuthStore();
  const [visible, setVisible] = useState(!isAuthenticated);
  const [phase, setPhase] = useState<"loading" | "form">("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  /* Skip splash entirely if already logged in */
  useEffect(() => {
    if (isAuthenticated) setVisible(false);
  }, [isAuthenticated]);

  /* Loading phase → form phase */
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setPhase("form"), 600);
    return () => clearTimeout(t);
  }, [visible]);

  /* Focus username field when form appears */
  useEffect(() => {
    if (phase === "form") {
      setTimeout(() => usernameRef.current?.focus(), 80);
    }
  }, [phase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    const ok = await login(username.trim(), password);
    if (ok) {
      /* Short pause for success feel, then fade out */
      setTimeout(() => setVisible(false), 200);
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="splash-root fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
          style={{
            backgroundImage: `url(${splashBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: "#190d23",
          }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/60" />

          {/* Animated radial glow behind logo — slowly breathes */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 42%, rgba(249,115,22,0.55) 0%, rgba(249,115,22,0.18) 22%, transparent 55%)",
            }}
            animate={{ opacity: [0.55, 0.95, 0.55], scale: [1, 1.08, 1] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Floating particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 14 }).map((_, i) => {
              const left = (i * 53) % 100;
              const size = 2 + (i % 3);
              const dur = 6 + (i % 5);
              const delay = (i * 0.4) % 5;
              return (
                <motion.span
                  key={i}
                  className="absolute rounded-full bg-white/40"
                  style={{
                    left: `${left}%`,
                    bottom: "-10px",
                    width: `${size}px`,
                    height: `${size}px`,
                    boxShadow: "0 0 6px rgba(255,255,255,0.6)",
                  }}
                  animate={{
                    y: ["0vh", "-110vh"],
                    opacity: [0, 0.9, 0.9, 0],
                  }}
                  transition={{
                    duration: dur,
                    delay,
                    repeat: Infinity,
                    ease: "linear",
                    times: [0, 0.1, 0.85, 1],
                  }}
                />
              );
            })}
          </div>

          {/* Sweeping shine bar */}
          <motion.div
            className="absolute inset-y-0 w-1/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
              filter: "blur(8px)",
            }}
            initial={{ x: "-50%" }}
            animate={{ x: ["-50%", "350%"] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
          />

          {/* Content */}
          <div
            className="relative z-10 flex flex-col items-center w-full max-w-sm px-6"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.34, 1.4, 0.64, 1] }}
              className="flex flex-col items-center mb-2"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <img
                  src="/logo-igh-tour-white.png"
                  alt="IGH Tour"
                  className="h-24 w-auto object-contain drop-shadow-[0_12px_32px_rgba(249,115,22,0.45)]"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = "none";
                    const fallback = document.createElement("span");
                    fallback.textContent = "IGH";
                    fallback.className =
                      "text-5xl font-black tracking-[-0.06em] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]";
                    img.parentElement!.appendChild(fallback);
                  }}
                />
              </motion.div>

              {/* Tagline letters reveal */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.4 }}
                className="flex gap-[3px] mt-3"
              >
                {"UMRAH · HAJI · TOURS".split("").map((ch, i) => (
                  <motion.span
                    key={i}
                    className="text-[10px] font-black tracking-[0.25em] text-white/90"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.025, duration: 0.3, ease: "easeOut" }}
                  >
                    {ch === " " ? "\u00A0" : ch}
                  </motion.span>
                ))}
              </motion.div>
            </motion.div>

            <AnimatePresence mode="wait">
              {/* ── Loading phase ── */}
              {phase === "loading" && (
                <motion.div
                  key="loading"
                  className="flex flex-col items-center gap-5 mt-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  {/* Dual-ring spinner */}
                  <div className="relative h-12 w-12">
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-white/15"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-400 border-r-orange-300"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ filter: "drop-shadow(0 0 6px rgba(251,146,60,0.8))" }}
                    />
                    <motion.div
                      className="absolute inset-1.5 rounded-full bg-white/10 backdrop-blur"
                      animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>

                  {/* Memuat with bouncing dots */}
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/85">
                      Memuat
                    </p>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1 w-1 rounded-full bg-white/85"
                          animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Progress bar with shimmer */}
                  <div className="relative w-60 h-[3px] rounded-full bg-white/15 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #fb923c, #f97316, #fdba74, #f97316, #fb923c)",
                        backgroundSize: "200% 100%",
                        boxShadow: "0 0 12px rgba(249,115,22,0.7)",
                      }}
                      initial={{ width: "0%", backgroundPosition: "0% 0%" }}
                      animate={{ width: "100%", backgroundPosition: "200% 0%" }}
                      transition={{
                        width: { duration: 1.5, delay: 0.2, ease: "easeInOut" },
                        backgroundPosition: { duration: 1.6, repeat: Infinity, ease: "linear" },
                      }}
                    />
                  </div>
                </motion.div>
              )}

              {/* ── Login form phase ── */}
              {phase === "form" && (
                <motion.div
                  key="form"
                  className="w-full"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Card */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                    {/* Heading */}
                    <div className="text-center mb-6">
                      <h2 className="text-white font-extrabold text-xl tracking-tight">
                        Portal Admin
                      </h2>
                      <p className="text-white/60 text-[12px] mt-1">
                        Masuk untuk mengakses IGH Tour Portal
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Error */}
                      <AnimatePresence>
                        {error && (
                          <motion.div
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/30"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                          >
                            <AlertCircle className="h-3.5 w-3.5 text-red-300 shrink-0" />
                            <p className="text-red-200 text-[12px] font-medium">{error}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Username */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-white/70 pl-1">
                          Username
                        </label>
                        <input
                          ref={usernameRef}
                          type="text"
                          autoComplete="username"
                          placeholder="admin"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            clearError();
                          }}
                          disabled={isLoading}
                          className="w-full h-11 bg-white/10 border border-white/20 rounded-xl px-4 text-white placeholder-white/30 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400/60 focus:border-transparent disabled:opacity-50 transition-all"
                        />
                      </div>

                      {/* Password */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-white/70 pl-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              clearError();
                            }}
                            disabled={isLoading}
                            className="w-full h-11 bg-white/10 border border-white/20 rounded-xl px-4 pr-11 text-white placeholder-white/30 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400/60 focus:border-transparent disabled:opacity-50 transition-all"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Submit */}
                      <motion.button
                        type="submit"
                        disabled={isLoading || !username.trim() || !password.trim()}
                        className="w-full h-12 rounded-xl font-extrabold text-sm uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)",
                          color: "white",
                          boxShadow: "0 8px 28px rgba(249,115,22,0.4)",
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isLoading ? (
                          <>
                            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            Masuk…
                          </>
                        ) : (
                          <>
                            <LogIn className="h-4 w-4" />
                            Masuk
                          </>
                        )}
                      </motion.button>
                    </form>
                  </div>

                  <p className="text-center text-white/30 text-[10px] mt-4 tracking-wide">
                    © IGH Tour — Land Arrangement Umrah & Haji
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
