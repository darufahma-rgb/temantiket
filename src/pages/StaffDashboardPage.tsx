import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { MobileStaffDashboardSkeleton } from "@/components/MobileSkeletons";
import { motion } from "framer-motion";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Wallet, FileText, RefreshCw,
  ArrowUpRight, UserCircle, Calculator, Settings,
  Target, ChevronRight, BadgeCheck,
} from "lucide-react";
import { useStaffData } from "@/hooks/useStaffData";
import { StaffCard } from "@/components/StaffCard";
import { supabase } from "@/lib/supabase";
import { loadCardBackUrl } from "@/lib/cardBackStorage";
import { fmtIDR } from "@/lib/profit";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 },
  }),
};

function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); } catch { return iso; }
}

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const {
    user, myOrders, clientMap,
    walletBal, stats, totalAssignedFee, pendingFeeTotal,
    loading, refreshing, handleRefresh, VISA_STEPS,
  } = useStaffData();

  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [cardBackUrl, setCardBackUrl] = useState<string | null>(null);

  useEffect(() => {
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
  }, [user?.id, user?.agencyId]);

  useEffect(() => {
    if (user?.id && user?.agencyId) {
      void loadCardBackUrl(user.id, user.agencyId).then((url) => {
        if (url) setCardBackUrl(url);
      });
    }
  }, [user?.id, user?.agencyId]);

  if (loading) {
    return <MobileStaffDashboardSkeleton />;
  }

  const recentOrders = [...myOrders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  const quickActions = [
    { icon: ClipboardList, label: "Visa Saya",    path: "/staff/visa",       color: "bg-white text-blue-600 border-blue-300" },
    { icon: Wallet,        label: "Komisi Saya",  path: "/staff/commission", color: "bg-white text-blue-600 border-blue-300" },
    { icon: Calculator,    label: "Kalkulator",   path: "/calculator",       color: "bg-white text-blue-600 border-blue-300" },
    { icon: UserCircle,    label: "Profil Staff", path: "/staff/profile",    color: "bg-white text-blue-600 border-blue-300" },
    { icon: Settings,      label: "Pengaturan",   path: "/settings",         color: "bg-white text-blue-600 border-blue-300" },
  ];

  return (
    <div className="pb-8 md:p-6 max-w-[1400px] md:mx-auto space-y-4 md:space-y-5">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="md:hidden rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">Staff Dashboard</p>
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          <div className="px-4 pb-3">
            <h1 className="text-[16px] font-extrabold text-slate-900 tracking-tight leading-snug">
              Halo, {user?.displayName ?? "Staff"} 👋
            </h1>
            <p className="text-[10.5px] text-slate-400 mt-0.5">Pelaksana Visa Student</p>
          </div>
        </div>

        <div className="hidden md:flex rounded-3xl bg-white border border-slate-100 shadow-sm p-6 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1">Staff Dashboard</p>
            <h1 className="text-[26px] font-extrabold leading-tight text-slate-900 tracking-tight">
              Halo, {user?.displayName ?? "Staff"} 👋
            </h1>
            <p className="text-[12.5px] text-slate-400 mt-1">Selamat datang di ruang kerja pelaksana visa student.</p>
            <div className="flex flex-wrap gap-1.5 mt-3.5">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-blue-50 border border-blue-200 text-blue-700">
                🏛️ Pelaksana Visa Student
              </span>
              {user?.email && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-slate-50 border border-slate-200 text-slate-500">
                  {user.email}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors shrink-0 mt-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 md:gap-3">
        {([
          { icon: ClipboardList, label: "Ditugaskan", value: String(stats.total),   sub: "total berkas",      iconBg: "bg-blue-50",    iconColor: "text-blue-600" },
          { icon: Clock,         label: "Diproses",   value: String(stats.proses),  sub: "sedang berjalan",   iconBg: "bg-sky-50",     iconColor: "text-sky-600" },
          { icon: CheckCircle2,  label: "Selesai",    value: String(stats.selesai), sub: "visa terbit",       iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
          { icon: AlertTriangle, label: "Kendala",    value: String(stats.kendala), sub: "perlu tindak",      iconBg: stats.kendala > 0 ? "bg-amber-50" : "bg-slate-50", iconColor: stats.kendala > 0 ? "text-amber-500" : "text-slate-400" },
          { icon: Wallet,        label: "Total Fee",   value: fmtIDR(totalAssignedFee),  sub: "sejak ditugaskan",  iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
          { icon: FileText,      label: "Blm Dikreditkan", value: fmtIDR(pendingFeeTotal), sub: "menunggu owner",   iconBg: "bg-amber-50",   iconColor: "text-amber-500" },
        ] as const).map((card, i) => (
          <motion.div key={card.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
            <div className="rounded-2xl border border-slate-100 bg-white p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow h-full">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-tight">{card.label}</p>
                <div className={`h-6 w-6 md:h-7 md:w-7 rounded-xl flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
                  <card.icon className="h-3 w-3 md:h-3.5 md:w-3.5 stroke-[1.75]" />
                </div>
              </div>
              <p className="text-[15px] md:text-[18px] font-extrabold text-slate-800 leading-none font-mono">{card.value}</p>
              <p className="text-[8.5px] md:text-[9.5px] text-slate-400 mt-1 leading-tight">{card.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <p className="text-[12.5px] font-bold text-slate-700">Pintasan Cepat</p>
          </div>
          <div className="p-3 grid grid-cols-3 md:grid-cols-5 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all active:scale-95 hover:shadow-sm ${action.color}`}
              >
                <action.icon className="h-5 w-5 stroke-[1.5]" />
                <span className="text-[10px] font-semibold leading-tight text-center">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Latest Visa Updates (compact preview) ── */}
      <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[12.5px] font-bold text-slate-700">Update Terbaru</p>
              <p className="text-[10px] text-slate-400">Berkas visa yang ditugaskan</p>
            </div>
            <button
              onClick={() => navigate("/staff/visa")}
              className="flex items-center gap-0.5 text-[10.5px] text-blue-600 font-semibold hover:text-blue-800 transition-colors"
            >
              Lihat Semua <ArrowUpRight className="h-3 w-3 stroke-[2]" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Target className="h-6 w-6 text-blue-300 stroke-[1.25]" />
              </div>
              <p className="text-[12px] font-semibold text-slate-500">Belum ada berkas ditugaskan</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentOrders.map((order) => {
                const meta = (order.metadata ?? {}) as Record<string, unknown>;
                const currentStep = Number(meta.processStep ?? 0);
                const isDone = currentStep >= VISA_STEPS.length - 1;
                const kendala = (meta.visaKendala as string | null) ?? null;
                const client = clientMap.get(order.clientId ?? "");
                const step = VISA_STEPS[Math.min(currentStep, VISA_STEPS.length - 1)];

                return (
                  <div
                    key={order.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => navigate(`/orders/detail/${order.id}`)}
                  >
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-base ${
                      isDone ? "bg-emerald-50" : kendala ? "bg-amber-50" : "bg-blue-50"
                    }`}>
                      {step?.emoji ?? "📄"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-slate-700 truncate">
                        {client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {fmtDate(order.createdAt)} · {step?.label ?? "—"}
                        {kendala && " · ⚠️ Kendala"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" strokeWidth={2} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Official Staff Card ── */}
      {user?.id && (
        <motion.div custom={8} variants={fadeUp} initial="hidden" animate="visible">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center">
                  <BadgeCheck className="h-3.5 w-3.5 text-blue-600 stroke-[1.75]" />
                </div>
                <div>
                  <p className="text-[12.5px] font-bold text-slate-700">Kartu Staff Official</p>
                  <p className="text-[10px] text-slate-400">ID card resmi kamu sebagai staff Temantiket</p>
                </div>
              </div>
              <button
                onClick={() => navigate("/staff/profile")}
                className="flex items-center gap-0.5 text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Profil <ArrowUpRight className="h-3 w-3 stroke-[2]" />
              </button>
            </div>
            <div className="p-5 flex justify-center">
              <StaffCard
                displayName={user.displayName ?? "Staff"}
                staffId={user.id}
                since={joinedAt}
                backImageUrl={cardBackUrl}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
