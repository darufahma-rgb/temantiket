import { useState, useEffect } from "react";
import {
  LayoutDashboard, Calculator, Package, LogOut, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  Plane, FileBadge, Wallet, MessageSquare, Sparkles, Ticket,
  GitBranch, Command, Trophy, BookUser, Megaphone, BarChart3,
  Wrench, ChevronRight, X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

// ── Brand colors ────────────────────────────────────────────────────────────
const L1_BG   = "#0b1628";           // deep navy — Layer 1 icon bar
const L2_BG   = "#0f2044";           // mid navy — Layer 2 slide-out panel
const ACCENT  = "#0ea5e9";           // sky-500 active accent
const DIVIDER = "rgba(255,255,255,0.07)";
const L1_W    = 60;                  // px — slim icon bar width
const L2_W    = 196;                 // px — slide-out panel width

// ── Types ───────────────────────────────────────────────────────────────────
interface NavItemDef {
  title: string;
  url: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: string;
  ownerOnly?: boolean;
}

interface GroupDef {
  key: string;
  label: string;
  icon: React.ElementType;
  items: NavItemDef[];
  ownerOnly?: boolean;
  agentOnly?: boolean;
}

// ── Nav structure ────────────────────────────────────────────────────────────

const STAFF_GROUPS: GroupDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { title: "Dashboard",      url: "/",              icon: LayoutDashboard, end: true },
      { title: "Klien / Jamaah", url: "/clients",       icon: Users },
      { title: "Order Hub",      url: "/orders",        icon: ShoppingBag },
      { title: "Harga Tiket",    url: "/ticket-prices", icon: Ticket },
    ],
  },
  {
    key: "ops",
    label: "Operasional",
    icon: Wrench,
    items: [
      { title: "Kalkulator & Kurs", url: "/calculator", icon: Calculator },
      { title: "AI Itinerary",      url: "/itinerary",  icon: Sparkles, badge: "AI" },
      { title: "Paket Trip",        url: "/packages",   icon: Package },
      { title: "Progress Jamaah",   url: "/progress",   icon: GitBranch },
      { title: "Catatan",           url: "/notes",      icon: StickyNote },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { title: "Template Broadcast", url: "/bc-templates",    icon: MessageSquare },
      { title: "Export & Manifest",  url: "/exports",         icon: FileSpreadsheet },
      { title: "Marketing Kit",      url: "/agent/marketing", icon: Megaphone },
    ],
  },
  {
    key: "finance",
    label: "Keuangan",
    icon: BarChart3,
    ownerOnly: true,
    items: [
      { title: "Laporan Keuangan", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    key: "agent",
    label: "Sistem Agen",
    icon: Trophy,
    items: [
      { title: "Kontrol & Misi",  url: "/agent-center",      icon: Command,  ownerOnly: true },
      { title: "Direktori Agen",  url: "/agent-directory",   icon: BookUser },
      { title: "Leaderboard",     url: "/agent/leaderboard", icon: Trophy },
    ],
  },
];

const AGENT_GROUPS: GroupDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { title: "Mitra Dashboard", url: "/agent",   icon: Trophy, end: true },
      { title: "Klien / Jamaah",  url: "/clients", icon: Users },
      { title: "Order Hub",       url: "/orders",  icon: ShoppingBag },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { title: "Template Broadcast", url: "/bc-templates",    icon: MessageSquare },
      { title: "Marketing Kit",      url: "/agent/marketing", icon: Megaphone },
      { title: "Leaderboard",        url: "/agent/leaderboard", icon: Trophy },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function useActiveGroup(groups: GroupDef[]): string | null {
  const location = useLocation();
  for (const g of groups) {
    for (const item of g.items) {
      if (item.end ? location.pathname === item.url : location.pathname.startsWith(item.url)) {
        return g.key;
      }
    }
  }
  return null;
}

// ── Layer 1 — Slim icon button ───────────────────────────────────────────────
function L1Button({
  group,
  isActive,
  isOpen,
  onClick,
}: {
  group: GroupDef;
  isActive: boolean;
  isOpen: boolean;
  onClick: () => void;
}) {
  const Icon = group.icon;
  return (
    <button
      onClick={onClick}
      title={group.label}
      className="relative flex flex-col items-center justify-center w-full h-[52px] gap-[3px] transition-all duration-150 group"
      aria-label={group.label}
      aria-expanded={isOpen}
    >
      {/* Active indicator bar on left edge */}
      {(isActive || isOpen) && (
        <motion.span
          layoutId="l1-pill"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full"
          style={{ background: ACCENT }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}

      {/* Icon container */}
      <div
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150",
          isOpen
            ? "bg-sky-500/20"
            : isActive
            ? "bg-sky-500/15"
            : "group-hover:bg-white/[6%]",
        )}
      >
        <Icon
          strokeWidth={isActive || isOpen ? 2.1 : 1.6}
          className="h-[18px] w-[18px]"
          style={{ color: isActive || isOpen ? ACCENT : "rgba(255,255,255,0.45)" }}
        />
      </div>

      {/* Label */}
      <span
        className="text-[8.5px] font-semibold leading-none tracking-tight truncate max-w-[52px] px-1"
        style={{ color: isActive || isOpen ? ACCENT : "rgba(255,255,255,0.3)" }}
      >
        {group.label}
      </span>
    </button>
  );
}

// ── Layer 2 — Nav item in slide-out panel ────────────────────────────────────
function L2Item({ item, onClose }: { item: NavItemDef; onClose: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.url}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-2.5 h-9 px-3 rounded-xl text-left transition-all duration-150 w-full",
          isActive
            ? "text-sky-400"
            : "text-white/45 hover:text-white/85 hover:bg-white/[5%]",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="l2-pill"
              className="absolute inset-0 rounded-xl"
              style={{ background: "rgba(14,165,233,0.12)" }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <Icon
            strokeWidth={isActive ? 2.2 : 1.5}
            className="h-[15px] w-[15px] shrink-0 relative z-10"
          />
          <span className="relative z-10 text-[12px] font-medium flex-1 truncate">
            {item.title}
          </span>
          {item.badge && (
            <span className="relative z-10 text-[8px] font-black uppercase tracking-wide px-1 py-px rounded bg-sky-500/20 text-sky-400 shrink-0">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

// ── Layer 2 slide-out panel ──────────────────────────────────────────────────
function L2Panel({
  group,
  isOwner,
  onClose,
}: {
  group: GroupDef;
  isOwner: boolean;
  onClose: () => void;
}) {
  const visibleItems = group.items.filter((i) => !i.ownerOnly || isOwner);

  return (
    <motion.div
      key={group.key}
      initial={{ x: -12, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -8, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.85 }}
      className="flex flex-col h-full"
      style={{
        width: `${L2_W}px`,
        background: L2_BG,
        borderRight: `1px solid ${DIVIDER}`,
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-3 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${DIVIDER}` }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-[0.14em]"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {group.label}
        </span>
        <button
          onClick={onClose}
          className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-white/[6%]"
          aria-label="Tutup panel"
        >
          <X className="h-3 w-3" style={{ color: "rgba(255,255,255,0.3)" }} />
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-px" style={{ scrollbarWidth: "none" }}>
        {visibleItems.map((item) => (
          <L2Item key={item.url} item={item} onClose={onClose} />
        ))}
      </div>

      {/* Blue accent at bottom */}
      <div
        className="shrink-0 mx-3 mb-3"
        style={{ height: "1px", background: `linear-gradient(90deg, ${ACCENT}40, transparent)` }}
      />
    </motion.div>
  );
}

// ── Main sidebar component ───────────────────────────────────────────────────

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ open = false, onClose }: AppSidebarProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isOwner = user?.role === "owner";
  const isAgent = user?.role === "agent";

  const rawGroups = isAgent ? AGENT_GROUPS : STAFF_GROUPS;
  const groups = rawGroups.filter((g) => !g.ownerOnly || isOwner);

  const activeGroupKey = useActiveGroup(groups);
  const [openKey, setOpenKey] = useState<string | null>(activeGroupKey);

  // Sync open panel to active route on mount / route changes
  useEffect(() => {
    setOpenKey(activeGroupKey);
  }, [activeGroupKey]);

  const toggleGroup = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  const handleClose = () => setOpenKey(null);

  const openGroup = groups.find((g) => g.key === openKey) ?? null;

  // ── Inner chrome ────────────────────────────────────────────────────────────
  const sidebarChrome = (
    <div className="flex h-full shrink-0">
      {/* ── Layer 1: slim icon bar ── */}
      <div
        className="flex flex-col h-full py-2 shrink-0"
        style={{
          width: `${L1_W}px`,
          background: L1_BG,
          borderRight: `1px solid ${DIVIDER}`,
        }}
      >
        {/* Logo */}
        <div className="flex justify-center items-center h-[48px] shrink-0 mb-1">
          <img
            src="/temantiket-logo.png"
            alt="Temantiket"
            className="h-6 w-6 object-contain"
            style={{ filter: "brightness(0) invert(1) opacity(0.75)" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Sky gradient accent */}
        <div
          className="mx-2 mb-2 shrink-0"
          style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${ACCENT}70, transparent)` }}
        />

        {/* Group icons */}
        <div className="flex-1 flex flex-col items-center overflow-y-auto w-full px-1.5 gap-px" style={{ scrollbarWidth: "none" }}>
          {groups.map((group) => (
            <L1Button
              key={group.key}
              group={group}
              isActive={activeGroupKey === group.key}
              isOpen={openKey === group.key}
              onClick={() => toggleGroup(group.key)}
            />
          ))}
        </div>

        {/* Bottom actions */}
        <div
          className="shrink-0 flex flex-col items-center gap-1 pt-2 pb-1 px-1.5"
          style={{ borderTop: `1px solid ${DIVIDER}` }}
        >
          {/* Avatar */}
          {user && (
            <button
              title={`${user.displayName} · ${user.role}`}
              onClick={() => navigate("/settings")}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:bg-white/[6%]"
            >
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center shadow"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, #0369a1)` }}
              >
                <span className="text-[11px] font-bold text-white leading-none">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            </button>
          )}

          {/* Settings */}
          <NavLink
            to="/settings"
            title="Pengaturan"
            className={({ isActive }) =>
              cn(
                "flex items-center justify-center w-9 h-9 rounded-xl transition-all",
                isActive ? "bg-sky-500/15" : "hover:bg-white/[6%]",
              )
            }
          >
            {({ isActive }) => (
              <Settings
                strokeWidth={isActive ? 2.1 : 1.6}
                className="h-[17px] w-[17px]"
                style={{ color: isActive ? ACCENT : "rgba(255,255,255,0.35)" }}
              />
            )}
          </NavLink>

          {/* Logout */}
          <button
            title="Keluar"
            onClick={() => { logout(); onClose?.(); }}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:bg-red-500/10 group"
          >
            <LogOut
              strokeWidth={1.6}
              className="h-[17px] w-[17px] group-hover:text-red-400 transition-colors"
              style={{ color: "rgba(255,255,255,0.3)" }}
            />
          </button>
        </div>
      </div>

      {/* ── Layer 2: slide-out panel ── */}
      <AnimatePresence mode="wait">
        {openGroup && (
          <L2Panel
            key={openGroup.key}
            group={openGroup}
            isOwner={isOwner}
            onClose={handleClose}
          />
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <>
      {/* Desktop — always-visible */}
      <div className="hidden md:flex shrink-0 h-full">{sidebarChrome}</div>

      {/* Mobile — slide-in overlay */}
      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
            />
            <motion.div
              className="relative flex-shrink-0"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 36, mass: 0.88 }}
            >
              {sidebarChrome}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
