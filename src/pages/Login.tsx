import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, AlertCircle, KeyRound } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { AnimatePresence, motion } from "framer-motion";
import splashBackground from "@assets/image_1776663921386.png";

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
    const timer = setTimeout(() => setPhase("form"), 200);
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
      style={{
        backgroundImage: `url(${splashBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#190d23",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/65" />
      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center px-6"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
      >
        <img
          src="/logo-igh-tour-white.png"
          alt="IGH Tour"
          className="h-24 w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        />

        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div
              key="loading"
              className="mt-8 flex flex-col items-center gap-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
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
                  transition={{ duration: 0.75, delay: 0.1, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          )}

          {phase === "form" && (
            <motion.div
              key="form"
              className="mt-4 w-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="rounded-3xl border border-white/20 bg-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-md">
                <div className="mb-6 text-center">
                  <h1 className="text-xl font-extrabold tracking-tight text-white">
                    Portal Admin
                  </h1>
                  <p className="mt-1 text-[12px] text-white/60">
                    Masuk untuk mengakses IGH Tour Portal
                  </p>
                </div>

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

                  <div className="space-y-1.5">
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
                      className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-medium text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400/60 disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-1.5">
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
                        className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 pr-11 text-sm font-medium text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400/60 disabled:opacity-50"
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
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading || !email.trim() || !password.trim()}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-extrabold uppercase tracking-widest text-white transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)",
                      boxShadow: "0 8px 28px rgba(249,115,22,0.4)",
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
                </form>
              </div>
            </motion.div>
          )}

          {phase === "pin" && (
            <motion.div
              key="pin"
              className="mt-4 w-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="rounded-3xl border border-white/20 bg-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-md">
                <div className="mb-6 text-center">
                  <div className="flex justify-center mb-3">
                    <div className="h-12 w-12 rounded-2xl bg-orange-500/30 border border-orange-400/40 flex items-center justify-center">
                      <KeyRound className="h-5 w-5 text-orange-300" />
                    </div>
                  </div>
                  <h1 className="text-xl font-extrabold tracking-tight text-white">
                    Verifikasi 2FA
                  </h1>
                  <p className="mt-1 text-[12px] text-white/60">
                    Masukkan PIN keamanan Anda
                  </p>
                </div>

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

                  <div className="space-y-1.5">
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
                      className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-center text-xl font-bold tracking-[0.5em] text-white placeholder-white/30 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400/60 disabled:opacity-50"
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading || !pin.trim()}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-extrabold uppercase tracking-widest text-white transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)",
                      boxShadow: "0 8px 28px rgba(249,115,22,0.4)",
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

                  <button
                    type="button"
                    onClick={() => { setPhase("form"); setPin(""); clearError(); }}
                    className="w-full text-center text-[12px] text-white/50 hover:text-white/80 transition-colors mt-1"
                  >
                    Kembali ke login
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
