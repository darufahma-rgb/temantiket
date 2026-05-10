/**
 * NotificationBell — Lonceng notifikasi dengan dropdown panel realtime.
 *
 * Digunakan di DashboardLayout (desktop + mobile header).
 * Terhubung ke notificationStore via Zustand — data tersinkron realtime.
 *
 * Props:
 *   mobileMode  — true = tampil sebagai ikon mobile di mobile header (32×32)
 *                 false (default) = tampil sebagai desktop bell (hidden sm:flex)
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, CheckCheck, Trash2, X, Info,
  Calendar, MessageCircle, CreditCard, BarChart3,
  Megaphone, CheckCircle2, Settings, ClipboardList,
} from "lucide-react";
import {
  useNotificationStore,
  selectUnreadCount,
  type AppNotification,
  type NotifCategory,
} from "@/store/notificationStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_CFG: Record<NotifCategory, {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}> = {
  trip_reminder:  { icon: Calendar,      iconColor: "text-blue-600",    iconBg: "bg-blue-100"    },
  new_message:    { icon: MessageCircle, iconColor: "text-green-600",   iconBg: "bg-green-100"   },
  payment:        { icon: CreditCard,    iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  weekly_report:  { icon: BarChart3,     iconColor: "text-purple-600",  iconBg: "bg-purple-100"  },
  promo:          { icon: Megaphone,     iconColor: "text-orange-600",  iconBg: "bg-orange-100"  },
  task:           { icon: ClipboardList, iconColor: "text-sky-600",     iconBg: "bg-sky-100"     },
  broadcast:      { icon: Megaphone,     iconColor: "text-indigo-600",  iconBg: "bg-indigo-100"  },
  system:         { icon: Settings,      iconColor: "text-slate-600",   iconBg: "bg-slate-100"   },
};

const PRIORITY_LEFT: Record<string, string> = {
  normal:    "border-l-transparent",
  important: "border-l-amber-400",
  urgent:    "border-l-red-500",
};

const TYPE_BADGE: Record<string, { cls: string; label: string }> = {
  info:    { cls: "bg-blue-100 text-blue-700",      label: "Info"    },
  success: { cls: "bg-emerald-100 text-emerald-700", label: "OK"     },
  warning: { cls: "bg-amber-100 text-amber-700",    label: "Penting" },
  urgent:  { cls: "bg-red-100 text-red-700",        label: "URGENT"  },
};

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(iso));
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION ITEM
// ─────────────────────────────────────────────────────────────────────────────

function NotifItem({
  n,
  onRead,
  onDelete,
}: {
  n: AppNotification;
  onRead: () => void;
  onDelete: () => void;
}) {
  const cfg = CATEGORY_CFG[n.category] ?? CATEGORY_CFG.system;
  const IconEl = cfg.icon;
  const badge = TYPE_BADGE[n.type] ?? TYPE_BADGE.info;
  const leftBorder = PRIORITY_LEFT[n.priority] ?? PRIORITY_LEFT.normal;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
      transition={{ duration: 0.18 }}
      onClick={onRead}
      className={cn(
        "group relative flex gap-3 px-4 py-3 border-b border-l-[3px] transition-colors cursor-pointer select-none",
        leftBorder,
        n.is_read
          ? "hover:bg-slate-50/60"
          : "bg-blue-50/40 hover:bg-blue-50/70",
      )}
      style={{ borderBottomColor: "hsl(var(--border))" }}
    >
      {/* Category icon */}
      <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", cfg.iconBg)}>
        <IconEl className={cn("h-3.5 w-3.5", cfg.iconColor)} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={cn(
            "text-[12px] font-semibold leading-tight",
            n.is_read ? "text-muted-foreground" : "text-foreground",
          )}>
            {n.title}
          </p>
          {n.priority !== "normal" && (
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", badge.cls)}>
              {badge.label}
            </span>
          )}
          {!n.is_read && (
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {n.message}
        </p>
        <p className="text-[9.5px] text-muted-foreground mt-1">
          {fmtRelative(n.created_at)}
        </p>
      </div>

      {/* Delete button — appears on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-3 top-3 h-5 w-5 flex items-center justify-center rounded-md hover:bg-red-100 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        title="Hapus"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationBell({ mobileMode = false }: { mobileMode?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const {
    notifications, isLoading,
    fetch, markAsRead, markAllAsRead, deleteNotif, clearAll,
    subscribeRealtime,
  } = useNotificationStore();
  const unreadCount = useNotificationStore(selectUnreadCount);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Load + subscribe on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    void fetch(user.id);
    const unsub = subscribeRealtime(user.id, (n) => {
      const toastFn =
        n.priority === "urgent"    ? toast.error   :
        n.priority === "important" ? toast.warning : toast.info;
      toastFn(n.title, {
        description: n.message,
        duration: n.priority === "urgent" ? 9000 : 5000,
      });
    });
    return unsub;
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Bell button styles ─────────────────────────────────────────────────────
  const buttonCls = mobileMode
    ? "relative flex items-center justify-center h-8 w-8 rounded-xl active:opacity-55 transition-opacity shrink-0"
    : "keep-icon-bg hidden sm:flex relative h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0";

  const buttonStyle = mobileMode
    ? { WebkitTapHighlightColor: "transparent" }
    : { border: "1px solid hsl(var(--border))" };

  const bellSize = mobileMode ? "h-[15px] w-[15px]" : "h-4 w-4";

  // ── Panel positioning ──────────────────────────────────────────────────────
  // Mobile: fixed panel below the mobile header (top ~64px)
  // Desktop: absolute dropdown from button
  const panelCls = mobileMode
    ? "fixed left-2 right-2 z-[300] rounded-2xl shadow-2xl overflow-hidden"
    : "absolute right-0 top-11 z-[200] w-80 sm:w-96 rounded-2xl shadow-2xl overflow-hidden";

  const panelStyle = mobileMode
    ? { top: "64px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }
    : { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" };

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Bell button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={buttonCls}
        style={buttonStyle}
        title="Notifikasi"
        aria-label="Buka notifikasi"
      >
        <Bell
          className={bellSize}
          style={{ color: "hsl(var(--muted-foreground))" }}
          strokeWidth={1.75}
        />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ── Notification Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: mobileMode ? -4 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: mobileMode ? -4 : -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={panelCls}
            style={panelStyle}
          >
            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between shrink-0 border-b"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-blue-500" strokeWidth={2} />
                <p className="text-[13px] font-bold">Notifikasi</p>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && user?.id && (
                  <button
                    onClick={() => void markAllAsRead(user.id)}
                    className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" /> Baca semua
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div
              className="overflow-y-auto"
              style={{ maxHeight: mobileMode ? "70vh" : "420px" }}
            >
              {isLoading && (
                <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                  Memuat notifikasi…
                </div>
              )}

              {!isLoading && notifications.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <Bell className="h-9 w-9 mx-auto opacity-15 mb-3" />
                  <p className="text-[12px] font-medium text-muted-foreground">Tidak ada notifikasi.</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Notifikasi baru akan muncul di sini.</p>
                </div>
              )}

              <AnimatePresence initial={false}>
                {notifications.map((n) => (
                  <NotifItem
                    key={n.id}
                    n={n}
                    onRead={() => { if (!n.is_read) void markAsRead(n.id); }}
                    onDelete={() => void deleteNotif(n.id)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {notifications.length > 0 && user?.id && (
              <div
                className="px-4 py-2.5 border-t flex items-center justify-between"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <p className="text-[10px] text-muted-foreground">
                  {notifications.length} notifikasi · {unreadCount} belum dibaca
                </p>
                <button
                  onClick={() => void clearAll(user.id)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Hapus semua
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
