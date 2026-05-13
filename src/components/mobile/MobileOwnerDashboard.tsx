import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Users, ShoppingBag, Ticket, Calculator,
  Package, StickyNote, BookUser, Settings, ChevronRight,
  TrendingUp, Plane, Map, FileText, CheckCircle,
  Info, AlertTriangle, Zap, RefreshCw,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useNotificationStore } from "@/store/notificationStore";
import { cn } from "@/lib/utils";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function fmtIDR(n: number): string {
  if (n >= 1_000_000_000) return "Rp " + (n / 1_000_000_000).toFixed(1) + "M";
  if (n >= 1_000_000) return "Rp " + (n / 1_000_000).toFixed(0) + "Jt";
  if (n >= 1_000) return "Rp " + (n / 1_000).toFixed(0) + "Rb";
  return "Rp " + n;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hr lalu`;
}

function roleLabel(role?: string): string {
  if (role === "owner") return "OWNER";
  if (role === "staff") return "STAFF";
  if (role === "agent") return "AGEN";
  return "USER";
}

function getInitials(name?: string): string {
  if (!name) return "A";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ── animation presets ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.38, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] } }),
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } };

// ── quick-access items ────────────────────────────────────────────────────────

const QUICK_ACCESS = [
  { icon: Users,       label: "Klien & Jamaah",    path: "/clients",       color: "#0ea5e9", bg: "#e0f2fe" },
  { icon: ShoppingBag, label: "Order Hub",         path: "/orders",        color: "#8b5cf6", bg: "#ede9fe" },
  { icon: Ticket,      label: "Harga Tiket",       path: "/ticket-prices", color: "#f59e0b", bg: "#fef3c7" },
  { icon: Map,         label: "Itinerary",         path: "/itinerary",     color: "#10b981", bg: "#d1fae5" },
  { icon: CheckCircle, label: "Visa Tracker",      path: "/visa-tracker",  color: "#ef4444", bg: "#fee2e2" },
  { icon: Calculator,  label: "Kalkulator",        path: "/calculator",    color: "#0066FF", bg: "#dbeafe" },
  { icon: Package,     label: "Paket & Trip",      path: "/packages",      color: "#06b6d4", bg: "#cffafe" },
  { icon: StickyNote,  label: "Catatan",           path: "/notes",         color: "#ec4899", bg: "#fce7f3" },
];

const NOTIF_ICON: Record<string, React.ReactNode> = {
  info:    <Info    className="h-4 w-4 text-sky-500"    strokeWidth={1.8} />,
  success: <CheckCircle className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={1.8} />,
  urgent:  <Zap     className="h-4 w-4 text-red-500"   strokeWidth={1.8} />,
};

const NOTIF_BG: Record<string, string> = {
  info:    "bg-sky-50",
  success: "bg-emerald-50",
  warning: "bg-amber-50",
  urgent:  "bg-red-50",
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function MobileOwnerDashboard() {
  const navigate = useNavigate();

  const user    = useAuthStore((s) => s.user);
  const { orders, fetchOrders, loaded: ordersLoaded }     = useOrdersStore();
  const { clients, fetchClients, loaded: clientsLoaded }  = useClientsStore();
  const { items: packages, refresh: refreshPkg, loaded: pkgLoaded } = usePackagesStore();
  const { notifications, fetchNotifications } = useNotificationStore();

  const [refreshing, setRefreshing] = useState(false);
  const [heroDot, setHeroDot]       = useState(0);

  useEffect(() => { if (!ordersLoaded)  void fetchOrders();   }, [ordersLoaded,  fetchOrders]);
  useEffect(() => { if (!clientsLoaded) void fetchClients();  }, [clientsLoaded, fetchClients]);
  useEffect(() => { if (!pkgLoaded)     void refreshPkg();    }, [pkgLoaded,     refreshPkg]);
  useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);

  // Carousel dots timer
  useEffect(() => {
    const id = setInterval(() => setHeroDot((d) => (d + 1) % 3), 3500);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchClients(), refreshPkg(), fetchNotifications()]).catch(() => {});
    setRefreshing(false);
  };

  // ── derived stats ────────────────────────────────────────────────────────
  const today       = todayStr();
  const newOrders   = orders.filter((o) => (o.createdAt ?? "").startsWith(today)).length;
  const activeClients = clients.length;
  const flightOrders = orders.filter((o) => o.type === "flight").length;
  const completedPkg = packages.filter((p) => p.status === "Completed").length;

  const unread = notifications.filter((n) => !n.is_read).length;
  const recentNotifs = [...notifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  const pendingOrders = orders.filter((o) =>
    ["Draft", "Confirmed", "Processing"].includes(o.status ?? "")
  ).length;

  const firstName = user?.displayName?.split(" ")[0] ?? "Admin";

  return (
    <div className="min-h-screen bg-[#F0F4FB] overflow-x-hidden pb-28">

      {/* ── TOP HEADER ─────────────────────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="bg-white px-5 pt-12 pb-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          {/* Greeting & Name */}
          <motion.div variants={fadeUp} className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">
              Assalamu'alaikum,
            </p>
            <h1 className="text-[26px] font-extrabold text-[#0f1c3f] leading-tight truncate">
              {firstName}
            </h1>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-[#0066FF] text-white text-[9px] font-extrabold uppercase tracking-widest">
              {roleLabel(user?.role)}
            </span>
          </motion.div>

          {/* Actions: refresh + notif + avatar */}
          <motion.div variants={fadeUp} className="flex items-center gap-2.5 shrink-0 mt-1">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-9 w-9 rounded-full bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity disabled:opacity-40"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <RefreshCw strokeWidth={2} className={cn("h-4 w-4 text-slate-500", refreshing && "animate-spin")} />
            </button>

            <button
              onClick={() => navigate("/notifications")}
              className="relative h-9 w-9 rounded-full bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <Bell strokeWidth={1.8} className="h-4.5 w-4.5 text-slate-600" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            <button
              onClick={() => navigate("/settings")}
              className="relative h-10 w-10 rounded-full bg-gradient-to-br from-[#0057E7] to-[#33A6FF] flex items-center justify-center shadow-md active:opacity-80 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <span className="text-white text-[13px] font-extrabold">{getInitials(user?.displayName)}</span>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white" />
            </button>
          </motion.div>
        </div>
      </motion.div>

      {/* ── HERO CARD ──────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        custom={1}
        className="px-4 mt-5"
      >
        <div
          className="relative rounded-3xl overflow-hidden px-6 pt-6 pb-5"
          style={{
            background: "linear-gradient(145deg, #0038B8 0%, #0066FF 50%, #33A6FF 100%)",
            boxShadow: "0 16px 40px rgba(0,102,255,0.28)",
          }}
        >
          {/* Background decoration */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-10 -right-10 h-52 w-52 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
            <div className="absolute -bottom-12 -left-8 h-44 w-44 rounded-full" style={{ background: "radial-gradient(circle, rgba(51,166,255,0.22) 0%, transparent 65%)" }} />
            {/* Plane icon decorative */}
            <Plane className="absolute right-6 top-5 h-20 w-20 text-white/10 rotate-45" strokeWidth={1} />
          </div>

          <div className="relative">
            <p className="text-sky-200/80 text-[12px] font-medium mb-1">Selamat datang kembali!</p>
            <h2 className="text-white text-[20px] font-extrabold leading-snug mb-1">
              Kelola bisnis perjalanan<br />lebih mudah bersama Temantiket.
            </h2>
            {pendingOrders > 0 && (
              <p className="text-sky-200/70 text-[11px] mb-3">
                {pendingOrders} order menunggu tindak lanjut
              </p>
            )}
            <button
              onClick={() => navigate("/orders")}
              className="inline-flex items-center gap-1.5 bg-white text-[#0066FF] text-[12px] font-extrabold px-4 py-2 rounded-full shadow-md active:opacity-80 transition-opacity mt-1"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              Lihat Ringkasan <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Carousel dots */}
          <div className="relative flex justify-center gap-1.5 mt-4">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                onClick={() => setHeroDot(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  heroDot === i ? "w-5 bg-white" : "w-1.5 bg-white/35"
                )}
              />
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── RINGKASAN HARI INI ─────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        custom={2}
        className="px-4 mt-5"
      >
        <div className="bg-white rounded-3xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Ringkasan Hari Ini</h3>
            <span className="text-[11px] text-slate-400 font-medium">
              {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date())}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Order Baru",   value: newOrders,    color: "#0066FF", bg: "#dbeafe", icon: <ShoppingBag className="h-4 w-4" style={{ color: "#0066FF" }} strokeWidth={1.8} /> },
              { label: "Klien Aktif",  value: activeClients, color: "#10b981", bg: "#d1fae5", icon: <Users       className="h-4 w-4" style={{ color: "#10b981" }} strokeWidth={1.8} /> },
              { label: "Tiket Terbit", value: flightOrders, color: "#f59e0b", bg: "#fef3c7", icon: <Plane        className="h-4 w-4" style={{ color: "#f59e0b" }} strokeWidth={1.8} /> },
              { label: "Paket Done",   value: completedPkg, color: "#8b5cf6", bg: "#ede9fe", icon: <Package      className="h-4 w-4" style={{ color: "#8b5cf6" }} strokeWidth={1.8} /> },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1.5">
                <div className="h-9 w-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: stat.bg }}>
                  {stat.icon}
                </div>
                <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none">{fmt(stat.value)}</p>
                <p className="text-[9px] font-semibold text-slate-400 text-center leading-tight uppercase tracking-wide">{stat.label}</p>
                <div className="flex items-center gap-0.5">
                  <TrendingUp className="h-2.5 w-2.5 text-emerald-500" strokeWidth={2.5} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── AKSES CEPAT ────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        custom={3}
        className="px-4 mt-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Akses Cepat</h3>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {QUICK_ACCESS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.path}
                variants={fadeUp}
                custom={i * 0.5}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-2 active:opacity-70 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: item.bg }}
                >
                  <Icon className="h-6 w-6" style={{ color: item.color }} strokeWidth={1.8} />
                </div>
                <p className="text-[9.5px] font-semibold text-slate-600 text-center leading-tight px-0.5">
                  {item.label}
                </p>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ── STATISTIK ORDER ─────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        custom={4}
        className="px-4 mt-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Statistik Order</h3>
          <button
            onClick={() => navigate("/orders")}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] active:opacity-60"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Lihat Semua <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Order",   value: orders.length,  sub: `${pendingOrders} pending`,   color: "#0066FF", bg: "#dbeafe", icon: <ShoppingBag className="h-5 w-5" strokeWidth={1.8} />, path: "/orders" },
            { label: "Total Klien",   value: clients.length, sub: "terdaftar",                   color: "#10b981", bg: "#d1fae5", icon: <Users       className="h-5 w-5" strokeWidth={1.8} />, path: "/clients" },
            { label: "Paket & Trip",  value: packages.length, sub: `${completedPkg} selesai`,    color: "#8b5cf6", bg: "#ede9fe", icon: <Package     className="h-5 w-5" strokeWidth={1.8} />, path: "/packages" },
            { label: "Tiket Pesawat", value: flightOrders,   sub: "order tiket",                 color: "#f59e0b", bg: "#fef3c7", icon: <Plane       className="h-5 w-5" strokeWidth={1.8} />, path: "/orders" },
          ].map((card) => (
            <button
              key={card.label}
              onClick={() => navigate(card.path)}
              className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left active:opacity-80 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: card.bg, color: card.color }}>
                {card.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none">{fmt(card.value)}</p>
                <p className="text-[10px] font-semibold text-slate-500 mt-0.5 truncate">{card.label}</p>
                <p className="text-[9px] text-slate-400 truncate">{card.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── NOTIFIKASI TERBARU ──────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        custom={5}
        className="px-4 mt-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Notifikasi Terbaru</h3>
          <button
            onClick={() => navigate("/notifications")}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] active:opacity-60"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Lihat Semua <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="bg-white rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
          <AnimatePresence>
            {recentNotifs.length === 0 ? (
              <div className="py-8 text-center">
                <Bell strokeWidth={1.5} className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-[12px] text-slate-400 font-medium">Belum ada notifikasi</p>
              </div>
            ) : (
              recentNotifs.map((notif, i) => (
                <motion.button
                  key={notif.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => navigate(notif.action_url ?? "/notifications")}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity",
                    !notif.is_read && "bg-sky-50/50"
                  )}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", NOTIF_BG[notif.type] ?? "bg-slate-100")}>
                    {NOTIF_ICON[notif.type] ?? <Info className="h-4 w-4 text-slate-500" strokeWidth={1.8} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-[12px] font-semibold text-[#0f1c3f] leading-snug truncate", !notif.is_read && "font-bold")}>
                        {notif.title}
                      </p>
                      <span className="text-[9px] text-slate-400 font-medium shrink-0 mt-0.5">
                        {timeAgo(notif.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-snug">{notif.message}</p>
                  </div>
                  {!notif.is_read && (
                    <span className="h-2 w-2 rounded-full bg-[#0066FF] shrink-0 mt-2" />
                  )}
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── QUICK ORDER TERBARU ─────────────────────────────────────────────── */}
      {orders.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={6}
          className="px-4 mt-5"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Order Terbaru</h3>
            <button
              onClick={() => navigate("/orders")}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] active:opacity-60"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              Lihat Semua <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="bg-white rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
            {[...orders]
              .sort((a, b) => new Date(b.createdAt ?? "").getTime() - new Date(a.createdAt ?? "").getTime())
              .slice(0, 4)
              .map((order, i) => {
                const TYPE_LABEL: Record<string, string> = {
                  flight: "Tiket Pesawat", visa_student: "Visa Mesir",
                  visa_voa: "VOA", other: "Lainnya",
                };
                const STATUS_COLOR: Record<string, string> = {
                  Draft: "bg-slate-100 text-slate-600",
                  Confirmed: "bg-amber-100 text-amber-700",
                  Processing: "bg-blue-100 text-blue-700",
                  Completed: "bg-emerald-100 text-emerald-700",
                  Cancelled: "bg-red-100 text-red-600",
                  Paid: "bg-purple-100 text-purple-700",
                };
                return (
                  <motion.button
                    key={order.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <div className="h-10 w-10 rounded-xl bg-[#dbeafe] flex items-center justify-center shrink-0">
                      <ShoppingBag className="h-4.5 w-4.5 text-[#0066FF]" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#0f1c3f] truncate">
                        {order.title ?? TYPE_LABEL[order.type] ?? "Order"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {TYPE_LABEL[order.type] ?? "Order"}
                      </p>
                    </div>
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0", STATUS_COLOR[order.status ?? ""] ?? "bg-slate-100 text-slate-600")}>
                      {order.status ?? "Draft"}
                    </span>
                  </motion.button>
                );
              })}
          </div>
        </motion.div>
      )}

      {/* ── AGENCY FOOTER ───────────────────────────────────────────────────── */}
      <div className="px-4 mt-6 mb-2 text-center">
        <p className="text-[10px] text-slate-400 font-medium">{user?.agencyName ?? "Temantiket"}</p>
      </div>
    </div>
  );
}
