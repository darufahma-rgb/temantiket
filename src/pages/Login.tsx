import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { motion } from "framer-motion";
import splashBackground from "@assets/image_1777530688079.png";

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
  const { login, isLoading, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    void login();
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

        <motion.div
          className="mt-4 w-full"
          initial={{ opacity: 0, y: 32, scale: 0.94, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-3xl border border-white/20 bg-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-md">
            <motion.div variants={cardVariants} initial="hidden" animate="show" className="space-y-4">

              <motion.div variants={itemVariants} className="mb-6 text-center">
                <h1 className="text-xl font-extrabold tracking-tight text-white">Portal Admin</h1>
                <p className="mt-1 text-[12px] text-white/60">Masuk untuk mengakses Temantiket Portal</p>
              </motion.div>

              <motion.div variants={itemVariants} className="pt-1">
                <form onSubmit={handleLogin}>
                  <motion.button
                    type="submit"
                    disabled={isLoading}
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
                        Mengarahkan…
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Masuk dengan Replit
                      </>
                    )}
                  </motion.button>
                </form>
              </motion.div>

            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
