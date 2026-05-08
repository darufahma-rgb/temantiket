/**
 * StaffProfile — /staff/profile
 *
 * Polished profile dashboard for staff users (role = "staff").
 * Visual language matches AgentProfile: blue gradient hero card,
 * stat cards, digital staff card, quick actions.
 *
 * No HPP / margin / leaderboard / tier / sales data shown.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ClipboardList, CheckCircle2, AlertTriangle,
  Clock, Wallet, UserCircle, Camera, RefreshCw,
  ChevronRight, FileText, BadgeCheck, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { pullWalletTxs, walletBalance, type WalletTransaction } from "@/lib/agentWallet";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";
import { fmtIDR } from "@/lib/profit";
import { uploadAvatar, savePhotoUrl, loadPhotoUrl } from "@/lib/avatarStorage";
import { supabase } from "@/lib/supabase";
import { StaffCard } from "@/components/StaffCard";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];

function deriveStaffCode(uid: string): string {
  const hex = uid.replace(/-/g, "").slice(-8);
  const num = (parseInt(hex, 16) % 9999) + 1;
  return num.toString().padStart(4, "0");
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 },
  }),
};

export default function StaffProfile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders } = useOrdersStore();

  const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const staffId = user?.id ?? "";

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchOrders();
      if (staffId) {
        const txs = await pullWalletTxs(staffId);
        setWalletTxs(txs);
      }
      setLoading(false);
    })();

    // Fetch joined date
    if (user?.id && user?.agencyId && supabase) {
      void supabase
        .from("agency_members")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("agency_id", user.agencyId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.created_at) setJoinedAt(data.created_at as string);
        });
    }

    // Load avatar
    if (user?.id) {
      const localKey = `igh.profile.photo.${user.id}`;
      try {
        const local = localStorage.getItem(localKey);
        if (local) setPhotoUrl(local);
      } catch { /* ignore */ }
      void loadPhotoUrl(user.id).then((url) => { if (url) setPhotoUrl(url); });
    }
  }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePhotoFile = async (file: File) => {
    if (!user?.id || !file.type.startsWith("image/")) return;
    setPhotoUploading(true);
    try {
      const url = await uploadAvatar(user.id, file);
      await savePhotoUrl(user.id, url);
      setPhotoUrl(url);
      try { localStorage.setItem(`igh.profile.photo.${user.id}`, url); } catch { /* ignore */ }
      const { toast } = await import("sonner");
      toast.success("Foto profil diperbarui!");
    } catch (e: unknown) {
      const { toast } = await import("sonner");
      toast.error(`Gagal upload foto: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  const myOrders = useMemo(
    () => orders.filter(
      (o) => o.type === "visa_student" &&
        (o.metadata as Record<string, unknown>)?.pelaksanaId === staffId,
    ),
    [orders, staffId],
  );

  const stats = useMemo(() => {
    const total   = myOrders.length;
    const selesai = myOrders.filter(
      (o) => Number((o.metadata as Record<string, unknown>)?.processStep ?? 0) >= VISA_STEPS.length - 1,
    ).length;
    const kendala = myOrders.filter(
      (o) => !!(o.metadata as Record<string, unknown>)?.visaKendala,
    ).length;
    const proses = Math.max(0, total - selesai - kendala);
    return { total, selesai, kendala, proses };
  }, [myOrders]);

  const walletBal = useMemo(() => {
    const pelaksanaTxs = walletTxs.filter((t) => t.type === "pelaksana_fee" || t.type === "payout");
    return walletBalance(pelaksanaTxs);
  }, [walletTxs]);

  const staffCode = staffId ? deriveStaffCode(staffId) : "0000";
  const staffLabel = `#TMNSTF${staffCode}`;

  const joinedLabel = useMemo(() => {
    if (!joinedAt) return null;
    try {
      return new Date(joinedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    } catch { return null; }
  }, [joinedAt]);

  const quickActions = [
    { label: "Visa Saya", icon: ClipboardList, path: "/staff/visa", color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { label: "Komisi Saya", icon: Wallet, path: "/staff/visa?tab=komisi", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    { label: "Edit Profil", icon: UserCircle, path: "/settings", color: "bg-slate-100 hover:bg-slate-200 text-slate-700" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate("/staff/visa")}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
      </button>

      {/* ── Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 p-5 md:p-6 text-white shadow-lg"
      >
        <div className="flex items-start gap-4">
          {/* Avatar with upload */}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoUploading}
            className="relative group shrink-0 cursor-pointer disabled:cursor-default"
            title="Klik untuk ganti foto"
          >
            <div className="h-16 w-16 rounded-2xl bg-white/20 border-2 border-white/40 overflow-hidden flex items-center justify-center backdrop-blur">
              {photoUrl ? (
                <img src={photoUrl} alt="foto" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-extrabold">
                  {(user?.displayName ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {photoUploading ? (
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-white animate-spin" />
              </div>
            ) : (
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            )}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePhotoFile(f);
              e.target.value = "";
            }}
          />

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                🏛️ Pelaksana Visa
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
                Staff
              </span>
            </div>
            <h1 className="text-xl font-extrabold mt-1.5 leading-tight">{user?.displayName ?? "Staff"}</h1>
            <p className="text-[12px] opacity-90 truncate">{user?.email}</p>
            {user?.agencyName && (
              <p className="text-[11px] opacity-70 mt-0.5">{user.agencyName}</p>
            )}
          </div>
        </div>

        {/* Staff ID + Since */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <div className="rounded-xl bg-white/10 border border-white/20 px-3 py-2">
            <div className="text-[9px] opacity-70 uppercase tracking-wider">Staff ID</div>
            <div className="text-[13px] font-extrabold font-mono">{staffLabel}</div>
          </div>
          {joinedLabel && (
            <div className="rounded-xl bg-white/10 border border-white/20 px-3 py-2">
              <div className="text-[9px] opacity-70 uppercase tracking-wider">Bergabung Sejak</div>
              <div className="text-[13px] font-bold">{joinedLabel}</div>
            </div>
          )}
          <div className="rounded-xl bg-white/10 border border-white/20 px-3 py-2">
            <div className="text-[9px] opacity-70 uppercase tracking-wider">Fee Wallet</div>
            <div className="text-[13px] font-extrabold font-mono">{fmtIDR(walletBal.netIDR)}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur text-[11px] h-8"
            onClick={() => navigate("/settings")}
          >
            <UserCircle className="h-3.5 w-3.5 mr-1" /> Edit Profil
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur text-[11px] h-8"
            onClick={() => navigate("/staff/visa")}
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Lihat Visa Saya
          </Button>
        </div>
      </motion.div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 md:gap-3">
        {([
          {
            icon: ClipboardList,
            label: "Ditugaskan",
            value: loading ? "…" : String(stats.total),
            sub: "total berkas",
            iconBg: "bg-blue-50",
            iconColor: "text-blue-600",
          },
          {
            icon: Clock,
            label: "Diproses",
            value: loading ? "…" : String(stats.proses),
            sub: "sedang berjalan",
            iconBg: "bg-sky-50",
            iconColor: "text-sky-600",
          },
          {
            icon: CheckCircle2,
            label: "Selesai",
            value: loading ? "…" : String(stats.selesai),
            sub: "visa terbit",
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
          },
          {
            icon: AlertTriangle,
            label: "Kendala",
            value: loading ? "…" : String(stats.kendala),
            sub: "perlu tindak",
            iconBg: stats.kendala > 0 ? "bg-amber-50" : "bg-slate-50",
            iconColor: stats.kendala > 0 ? "text-amber-500" : "text-slate-400",
          },
          {
            icon: Wallet,
            label: "Fee Earned",
            value: loading ? "…" : fmtIDR(walletBal.totalCreditIDR),
            sub: "total dikreditkan",
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
          },
          {
            icon: FileText,
            label: "Belum Cair",
            value: loading ? "…" : fmtIDR(Math.max(0, walletBal.totalCreditIDR - walletBal.totalDebitIDR)),
            sub: "belum dicairkan",
            iconBg: "bg-orange-50",
            iconColor: "text-orange-500",
          },
        ] as const).map((card, i) => (
          <motion.div key={card.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
            <div className="rounded-2xl border border-slate-100 bg-white p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow h-full">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-tight">
                  {card.label}
                </p>
                <div className={`h-6 w-6 md:h-7 md:w-7 rounded-xl flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
                  <card.icon className="h-3 w-3 md:h-3.5 md:w-3.5 stroke-[1.75]" />
                </div>
              </div>
              <p className="text-[15px] md:text-[18px] font-extrabold text-slate-800 leading-none font-mono">
                {card.value}
              </p>
              <p className="text-[8.5px] md:text-[9.5px] text-slate-400 mt-1 leading-tight">{card.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
        <div className="grid grid-cols-3 gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className={`flex flex-col items-center gap-2 py-4 rounded-2xl text-[11px] font-semibold transition-all active:scale-95 ${a.color}`}
            >
              <a.icon className="h-5 w-5 stroke-[1.75]" />
              {a.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Digital Staff Card ── */}
      {user?.id && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm"
        >
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center">
                <BadgeCheck className="h-3.5 w-3.5 text-blue-600 stroke-[1.75]" />
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-slate-700">Kartu Staff Digital</p>
                <p className="text-[10px] text-slate-400">ID card resmi kamu sebagai staff Temantiket</p>
              </div>
            </div>
          </div>
          <div className="p-5 flex justify-center">
            <StaffCard
              displayName={user.displayName}
              staffId={user.id}
              since={joinedAt}
            />
          </div>
        </motion.div>
      )}

      {/* ── Fee Wallet Summary ── */}
      <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5 text-emerald-600 stroke-[1.75]" />
            </div>
            <div>
              <p className="text-[12.5px] font-bold text-slate-700">Fee Pelaksana Visa</p>
              <p className="text-[10px] text-slate-400">Terpisah dari komisi agen penjual</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="text-center py-1">
              <div className="text-[28px] font-extrabold font-mono text-slate-800 leading-tight">
                {loading ? "…" : fmtIDR(walletBal.netIDR)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">saldo wallet saat ini</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">Dikreditkan</div>
                <div className="text-[13px] font-extrabold font-mono text-emerald-700 mt-0.5">
                  {fmtIDR(walletBal.totalCreditIDR)}
                </div>
              </div>
              <div className="rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
                <div className="text-[9px] text-orange-600 font-bold uppercase tracking-wide">Dicairkan</div>
                <div className="text-[13px] font-extrabold font-mono text-orange-700 mt-0.5">
                  {fmtIDR(walletBal.totalDebitIDR)}
                </div>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
                <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Selesai</div>
                <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{stats.selesai}</div>
                <div className="text-[9px] text-slate-400">dari {stats.total} berkas</div>
              </div>
            </div>
            <button
              onClick={() => navigate("/staff/visa?tab=komisi")}
              className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-all"
            >
              Lihat Riwayat Fee <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Info note ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-[11px] text-slate-500 leading-relaxed">
        <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="h-3.5 w-3.5 text-blue-500 stroke-[1.75]" />
        </div>
        <p>
          <strong className="text-slate-700">Tentang akun staff:</strong>{" "}
          Kamu memiliki akses ke berkas visa yang ditugaskan, fee pelaksana, dan alat operasional.
          Untuk mengubah data profil, password, atau notifikasi, kunjungi halaman{" "}
          <button onClick={() => navigate("/settings")} className="text-blue-600 font-semibold hover:underline">
            Pengaturan
          </button>.
        </p>
      </div>

      {/* Bottom padding */}
      <div className="pb-4" />
    </div>
  );
}
