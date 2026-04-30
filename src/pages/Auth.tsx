// Bootstrap page: dipake sekali untuk bikin agency + owner pertama.
// Halaman ini cuma boleh dipake kalo DB belum ada agency.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Mail, Lock, User, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { bootstrapFirstOwner, useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

export default function Auth() {
  const [agencyName, setAgencyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyBootstrapped, setAlreadyBootstrapped] = useState(false);

  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) { setChecking(false); return; }
      try {
        const query = supabase
          .from("agencies").select("*", { count: "exact", head: true });
        const result = await Promise.race([
          query,
          new Promise<{ count: null; error: { message: string } }>((res) =>
            setTimeout(() => res({ count: null, error: { message: "timeout" } }), 2500),
          ),
        ]);
        if (!active) return;
        const { count, error: e } = result as { count: number | null; error: any };
        if (e) {
          setAlreadyBootstrapped(false);
        } else {
          setAlreadyBootstrapped((count ?? 0) > 0);
        }
      } catch {
        setAlreadyBootstrapped(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agencyName.trim() || !email.trim() || !password.trim()) {
      setError("Semua field wajib diisi.");
      return;
    }
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    setLoading(true);
    try {
      await bootstrapFirstOwner({
        agencyName: agencyName.trim(),
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      setSuccess(true);
      // Auto login
      const result = await login(email.trim(), password);
      if (result === "ok") {
        navigate("/", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </div>
    );
  }

  if (alreadyBootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
        <div className="max-w-md text-center text-white">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <h1 className="mt-4 text-xl font-bold">Bootstrap sudah dilakukan</h1>
          <p className="mt-2 text-sm text-white/60">
            Agency awal sudah dibuat. Silakan login pakai akun owner. Member baru hanya bisa diundang oleh owner dari menu Settings.
          </p>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-orange-500 px-6 text-sm font-bold uppercase tracking-widest text-white"
          >
            Ke Halaman Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur-md"
      >
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/30 border border-orange-400/40">
            <Building2 className="h-5 w-5 text-orange-300" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-white">Setup Agency Pertama</h1>
          <p className="mt-1 text-[12px] text-white/60">
            Bikin akun owner & nama agency. Hanya muncul sekali.
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

            <Field icon={<Building2 className="h-4 w-4" />} label="Nama Agency"
              value={agencyName} onChange={setAgencyName} placeholder="IGH Tour Jakarta" disabled={loading} />
            <Field icon={<User className="h-4 w-4" />} label="Nama Owner"
              value={displayName} onChange={setDisplayName} placeholder="Owner Name" disabled={loading} />
            <Field icon={<Mail className="h-4 w-4" />} label="Email" type="email"
              value={email} onChange={setEmail} placeholder="owner@agency.com" disabled={loading} />
            <Field icon={<Lock className="h-4 w-4" />} label="Password (min 8 char)" type="password"
              value={password} onChange={setPassword} placeholder="••••••••" disabled={loading} />

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-orange-600 to-orange-400 text-sm font-extrabold uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
            >
              {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Membuat…</>) : "Bikin Agency"}
            </button>

            <p className="text-center text-[11px] text-white/40">
              Pastikan Edge Function <code>bootstrap</code> sudah di-deploy.
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function Field({ icon, label, value, onChange, placeholder, type = "text", disabled }: {
  icon: React.ReactNode; label: string; value: string;
  onChange: (v: string) => void; placeholder: string; type?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-white/70">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">{icon}</span>
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          className="h-11 w-full rounded-xl border border-white/20 bg-white/10 pl-10 pr-4 text-sm font-medium text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400/60 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
