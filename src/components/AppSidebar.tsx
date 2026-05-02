import { useState } from "react";
import {
  LayoutDashboard, Calculator, Package, LogOut, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  Plane, FileBadge, Wallet, MessageSquare, Sparkles, Ticket,
  GitBranch, Command, Trophy, BookUser, Megaphone, BarChart3,
  ChevronRight,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

// ── Constants ──────────────────────────────────────────────────────────────

const BG = "#0f1117";
const BG_POPUP = "#1c2030";
const DIVIDER = "rgba(255,255,255,0.07)";
const SIDEBAR_W = 192;

// ── Types ──────────────────────────────────────────────────────────────────

interface NavItemDef {
  title: string;
  url: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: string;
  ownerOnly?: boolean;
  children?: Omit<NavItemDef, "children">[];
}

interface GroupDef {
  key: string;
  label?: string;
  items: NavItemDef[];
  ownerOnly?: boolean;
}

// ── Nav structure ──────────────────────────────────────────────────────────

const STAFF_GROUPS: GroupDef[] = [
  {
    key: "main",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
    ],
  },
  {
    key: "hub",
    label: "Order Hub",
    items: [
      { title: "Klien / Jamaah",  url: "/clients",      icon: Users },
      {
        title: "Order Hub",
        url: "/orders",
        icon: ShoppingBag,
        children: [
          { title: "Umrah & Haji",  url: "/orders/umrah",        icon: Package },
          { title: "Tiket Pesawat", url: "/orders/flight",       icon: Plane },
          { title: "Visa Mesir",    url: "/orders/visa_student", icon: FileBadge },
        ],
      },
      { title: "Harga Tiket",    url: "/ticket-prices", icon: Ticket },
    ],
  },
  {
    key: "ops",
    label: "Operasional",
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
    items: [
      { title: "Template Broadcast", url: "/bc-templates",    icon: MessageSquare },
      { title: "Export & Manifest",  url: "/exports",         icon: FileSpreadsheet },
      { title: "Marketing Kit",      url: "/agent/marketing", icon: Megaphone },
    ],
  },
  {
    key: "finance",
    label: "Keuangan",
    ownerOnly: true,
    items: [
      { title: "Laporan Keuangan", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    key: "agent",
    label: "Sistem Agen",
    items: [
      { title: "Kontrol & Misi",  url: "/agent-center",      icon: Command,  ownerOnly: true },
      { title: "Direktori Agen",  url: "/agent-directory",   icon: BookUser },
      { title: "Leaderboard",     url: "/agent/leaderboard", icon: Trophy },
    ],
  },
];

const AGENT_GROUPS: GroupDef[] = [
  {
    key: "main",
    items: [
      { title: "Mitra Dashboard", url: "/agent", icon: Trophy, end: true },
    ],
  },
  {
    key: "hub",
    label: "Order Hub",
    items: [
      { title: "Klien / Jamaah", url: "/clients", icon: Users },
      {
        title: "Order Hub",
        url: "/orders",
        icon: ShoppingBag,
        children: [
          { title: "Umrah & Haji",  url: "/orders/umrah",        icon: Package },
          { title: "Tiket Pesawat", url: "/orders/flight",       icon: Plane },
          { title: "Visa Mesir",    url: "/orders/visa_student", icon: FileBadge },
        ],
      },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    items: [
      { title: "Template Broadcast", url: "/bc-templates",      icon: MessageSquare },
      { title: "Leaderboard",        url: "/agent/leaderboard", icon: Trophy },
    ],
  },
];

// ── Shared item button base ────────────────────────────────────────────────

const itemBase =
  "relative w-full flex items-center gap-2.5 h-9 px-3 rounded-xl text-left transition-all duration-150 cursor-pointer select-none";

// ── Section divider with label ─────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1">
      <span
        className="text-[9.5px] font-black uppercase tracking-[0.14em] whitespace-nowrap shrink-0"
        style={{ color: "rgba(255,255,255,0.28)" }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: DIVIDER }} />
    </div>
  );
}

// ── Flyout tooltip (only for items that have children) ────────────────────

function FlyoutMenu({
  item,
  onClose,
}: {
  item: NavItemDef & { children: NonNullable<NavItemDef["children"]> };
  onClose?: () => void;
}) {
  const location = useLocation();
  const [flyout, setFlyout] = useState(false);
  const anyChildActive = item.children.some((c) => location.pathname.startsWith(c.url));
  const active = location.pathname.startsWith(item.url) || anyChildActive;
  const Icon = item.icon;

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setFlyout(true)}
      onMouseLeave={() => setFlyout(false)}
    >
      <button
        className={cn(
          itemBase,
          active
            ? "text-sky-400"
            : "text-white/40 hover:text-white/80 hover:bg-white/[5%]"
        )}
        style={active ? { background: "rgba(14,165,233,0.10)" } : {}}
      >
        {active && (
          <motion.span
            layoutId="toolbar-pill"
            className="absolute inset-0 rounded-xl"
            style={{ background: "rgba(14,165,233,0.10)" }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <Icon
          strokeWidth={active ? 2.1 : 1.5}
          className="h-[16px] w-[16px] shrink-0 relative z-10"
        />
        <span className="relative z-10 text-[12px] font-medium flex-1 truncate">
          {item.title}
        </span>
        <ChevronRight
          strokeWidth={1.5}
          className="h-3 w-3 shrink-0 relative z-10 opacity-50"
        />
      </button>

      <AnimatePresence>
        {flyout && (
          <motion.div
            initial={{ opacity: 0, x: 4, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 4, scale: 0.97 }}
            transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-[calc(100%+6px)] top-0 z-[300] rounded-xl overflow-hidden shadow-2xl"
            style={{
              background: BG_POPUP,
              border: `1px solid ${DIVIDER}`,
              minWidth: "170px",
            }}
          >
            <div
              className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.3)", borderBottom: `1px solid ${DIVIDER}` }}
            >
              {item.title}
            </div>
            {item.children.map((child) => {
              const ChildIcon = child.icon;
              const cActive = location.pathname.startsWith(child.url);
              return (
                <NavLink
                  key={child.url}
                  to={child.url}
                  onClick={() => { setFlyout(false); onClose?.(); }}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                    cActive
                      ? "text-sky-400 bg-sky-500/10"
                      : "text-white/55 hover:text-white/90 hover:bg-white/[5%]"
                  )}
                >
                  <ChildIcon strokeWidth={cActive ? 2.2 : 1.5} className="h-3.5 w-3.5 shrink-0" />
                  {child.title}
                </NavLink>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Regular nav item ───────────────────────────────────────────────────────

function NavItem({ item, onClose }: { item: NavItemDef; onClose?: () => void }) {
  const Icon = item.icon;

  if (item.children) {
    return (
      <FlyoutMenu
        item={item as NavItemDef & { children: NonNullable<NavItemDef["children"]> }}
        onClose={onClose}
      />
    );
  }

  return (
    <NavLink
      to={item.url}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          itemBase,
          isActive
            ? "text-sky-400"
            : "text-white/40 hover:text-white/80 hover:bg-white/[5%]"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="toolbar-pill"
              className="absolute inset-0 rounded-xl"
              style={{ background: "rgba(14,165,233,0.10)" }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <Icon
            strokeWidth={isActive ? 2.1 : 1.5}
            className="h-[16px] w-[16px] shrink-0 relative z-10"
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

// ── Main sidebar component ─────────────────────────────────────────────────

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ open = false, onClose }: AppSidebarProps) {
  const { user, logout } = useAuthStore();
  const isOwner = user?.role === "owner";
  const isAgent = user?.role === "agent";

  const rawGroups = isAgent ? AGENT_GROUPS : STAFF_GROUPS;
  const groups = rawGroups.filter((g) => !g.ownerOnly || isOwner);

  const toolbar = (
    <aside
      className="flex h-full flex-col py-3 shrink-0"
      style={{
        width: `${SIDEBAR_W}px`,
        background: BG,
        borderRight: `1px solid ${DIVIDER}`,
      }}
    >
      {/* ── Logo + brand ── */}
      <div className="flex items-center gap-2.5 px-4 mb-2 shrink-0">
        <img
          src="/temantiket-logo.png"
          alt="Temantiket"
          className="h-5 w-5 object-contain shrink-0"
          style={{ filter: "brightness(0) invert(1) opacity(0.85)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span
          className="text-[12.5px] font-bold tracking-tight"
          style={{ color: "rgba(255,255,255,0.82)" }}
        >
          temantiket
        </span>
      </div>

      {/* Sky accent line */}
      <div
        className="mx-4 mb-3 shrink-0"
        style={{ height: "1px", background: "linear-gradient(90deg, rgba(14,165,233,0.6), transparent)" }}
      />

      {/* ── Nav groups ── */}
      <div
        className="flex-1 w-full overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="px-2 pb-3 space-y-px">
          {groups.map((group, gi) => {
            const visibleItems = group.items.filter(
              (item) => !item.ownerOnly || isOwner
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.key}>
                {gi > 0 && group.label && (
                  <SectionLabel label={group.label} />
                )}
                {visibleItems.map((item) => (
                  <NavItem key={item.url} item={item} onClose={onClose} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom actions ── */}
      <div
        className="shrink-0 px-2 pt-2 space-y-px"
        style={{ borderTop: `1px solid ${DIVIDER}` }}
      >
        {/* Profile */}
        {user && (
          <div className={cn(itemBase, "cursor-default text-white/50 pointer-events-none")}>
            <div
              className="h-6 w-6 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0 shadow-md"
              style={{ boxShadow: "0 0 8px rgba(14,165,233,0.3)" }}
            >
              <span className="text-[10px] font-bold text-white leading-none">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                {user.displayName}
              </p>
              <p className="text-[9.5px] capitalize" style={{ color: "rgba(255,255,255,0.3)" }}>
                {user.role}
              </p>
            </div>
          </div>
        )}

        {/* Settings */}
        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            cn(itemBase, isActive ? "text-sky-400" : "text-white/35 hover:text-white/75 hover:bg-white/[5%]")
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="toolbar-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "rgba(14,165,233,0.10)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Settings strokeWidth={isActive ? 2.1 : 1.5} className="h-[16px] w-[16px] shrink-0 relative z-10" />
              <span className="relative z-10 text-[12px] font-medium">Pengaturan</span>
            </>
          )}
        </NavLink>

        {/* Logout */}
        <button
          onClick={() => { logout(); onClose?.(); }}
          className={cn(itemBase, "text-white/30 hover:text-red-400 hover:bg-red-500/[8%]")}
        >
          <LogOut strokeWidth={1.5} className="h-[16px] w-[16px] shrink-0" />
          <span className="text-[12px] font-medium">Keluar</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop — always-visible sidebar */}
      <div className="hidden md:flex shrink-0">{toolbar}</div>

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
              {toolbar}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
