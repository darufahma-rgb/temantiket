import { useState } from "react";
import {
  LayoutDashboard, Calculator, Package, LogOut, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  Plane, FileBadge, Wallet, MessageSquare, Sparkles, Ticket,
  GitBranch, Command, Trophy, BookUser, Megaphone, BarChart3,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

// ── Constants ──────────────────────────────────────────────────────────────

const BG = "#0f1117";
const BG_POPUP = "#1c2030";
const DIVIDER = "rgba(255,255,255,0.07)";

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
    label: "Hub",
    items: [
      { title: "Klien (Jamaah)", url: "/clients", icon: Users },
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
      { title: "Harga Tiket", url: "/ticket-prices", icon: Ticket },
    ],
  },
  {
    key: "ops",
    label: "Ops",
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
    label: "Mkt",
    items: [
      { title: "Template BC WA",       url: "/bc-templates",    icon: MessageSquare },
      { title: "Export & Member Card", url: "/exports",         icon: FileSpreadsheet },
      { title: "Marketing Kit",        url: "/agent/marketing", icon: Megaphone },
    ],
  },
  {
    key: "finance",
    label: "Fin",
    ownerOnly: true,
    items: [
      { title: "Laporan Keuangan", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    key: "agent",
    label: "Agen",
    items: [
      { title: "Kontrol Agen & Misi", url: "/agent-center",      icon: Command,   ownerOnly: true },
      { title: "Direktori Agen",      url: "/agent-directory",   icon: BookUser },
      { title: "Leaderboard",         url: "/agent/leaderboard", icon: Trophy },
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
    label: "Hub",
    items: [
      { title: "Klien (Jamaah)", url: "/clients", icon: Users },
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
    label: "Mkt",
    items: [
      { title: "Template BC WA", url: "/bc-templates",      icon: MessageSquare },
      { title: "Leaderboard",    url: "/agent/leaderboard", icon: Trophy },
    ],
  },
];

// ── Tooltip ────────────────────────────────────────────────────────────────

function Tip({ label, badge, children }: { label: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip w-full flex justify-center">
      {children}
      <div className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 z-[300] opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div
          className="relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-[7px] text-[11.5px] font-semibold text-white/90 shadow-2xl"
          style={{ background: BG_POPUP, border: `1px solid ${DIVIDER}` }}
        >
          {/* Arrow pointing left */}
          <span
            className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-0 h-0"
            style={{
              borderTop: "5px solid transparent",
              borderBottom: "5px solid transparent",
              borderRight: `5px solid ${BG_POPUP}`,
            }}
          />
          {label}
          {badge && (
            <span className="text-[8.5px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-sky-500/25 text-sky-400">
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icon button shared styles ──────────────────────────────────────────────

const btnBase =
  "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150 cursor-pointer";

// ── Nav item with optional flyout ─────────────────────────────────────────

function ToolItem({ item, onClose }: { item: NavItemDef; onClose?: () => void }) {
  const location = useLocation();
  const [flyout, setFlyout] = useState(false);

  if (item.children) {
    const anyChildActive = item.children.some((c) =>
      location.pathname.startsWith(c.url)
    );
    const active = location.pathname.startsWith(item.url) || anyChildActive;

    return (
      <Tip label={item.title}>
        <div
          className="relative"
          onMouseEnter={() => setFlyout(true)}
          onMouseLeave={() => setFlyout(false)}
        >
          {/* Parent icon */}
          <button
            className={cn(
              btnBase,
              active
                ? "text-sky-400"
                : "text-white/35 hover:text-white/75 hover:bg-white/[5%]"
            )}
            style={active ? { background: "rgba(14,165,233,0.12)" } : {}}
          >
            {active && (
              <motion.span
                layoutId="toolbar-pill"
                className="absolute inset-0 rounded-xl"
                style={{ background: "rgba(14,165,233,0.12)" }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <item.icon
              strokeWidth={active ? 2.1 : 1.5}
              className="h-[19px] w-[19px] relative z-10"
            />
          </button>

          {/* Flyout panel */}
          <AnimatePresence>
            {flyout && (
              <motion.div
                initial={{ opacity: 0, x: 6, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 6, scale: 0.96 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-[calc(100%+10px)] top-0 z-[300] rounded-xl overflow-hidden shadow-2xl"
                style={{
                  background: BG_POPUP,
                  border: `1px solid ${DIVIDER}`,
                  minWidth: "165px",
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
      </Tip>
    );
  }

  return (
    <Tip label={item.title} badge={item.badge}>
      <NavLink
        to={item.url}
        end={item.end}
        onClick={onClose}
        className={({ isActive }) =>
          cn(
            btnBase,
            isActive
              ? "text-sky-400"
              : "text-white/35 hover:text-white/75 hover:bg-white/[5%]"
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="toolbar-pill"
                className="absolute inset-0 rounded-xl"
                style={{ background: "rgba(14,165,233,0.12)" }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <item.icon
              strokeWidth={isActive ? 2.1 : 1.5}
              className="h-[19px] w-[19px] relative z-10 transition-colors"
            />
            {item.badge && isActive && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sky-400 z-10" />
            )}
          </>
        )}
      </NavLink>
    </Tip>
  );
}

// ── Section divider with optional category label ───────────────────────────

function Divider({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center w-full mt-2 mb-1.5">
      {label && (
        <span
          className="text-[7px] font-black uppercase tracking-[0.18em] mb-1 select-none"
          style={{ color: "rgba(255,255,255,0.2)" }}
        >
          {label}
        </span>
      )}
      <div className="w-7 h-px" style={{ background: DIVIDER }} />
    </div>
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
      className="flex h-full flex-col items-center py-3 shrink-0"
      style={{
        width: "64px",
        background: BG,
        borderRight: `1px solid ${DIVIDER}`,
      }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center justify-center w-full mb-2.5 shrink-0">
        <img
          src="/temantiket-logo.png"
          alt="Temantiket"
          className="h-6 w-6 object-contain"
          style={{ filter: "brightness(0) invert(1) opacity(0.85)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      {/* Sky accent line under logo */}
      <div
        className="w-7 mb-3 shrink-0"
        style={{ height: "1.5px", background: "linear-gradient(90deg, transparent, rgba(14,165,233,0.6), transparent)" }}
      />

      {/* ── Nav groups ── */}
      <div
        className="flex-1 w-full flex flex-col items-center overflow-y-auto pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        {groups.map((group, gi) => {
          const visibleItems = group.items.filter(
            (item) => !item.ownerOnly || isOwner
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.key} className="w-full flex flex-col items-center">
              {gi > 0 && <Divider label={group.label} />}
              <div className="flex flex-col items-center gap-0.5 w-full px-2">
                {visibleItems.map((item) => (
                  <ToolItem key={item.url} item={item} onClose={onClose} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom actions ── */}
      <div
        className="shrink-0 w-full flex flex-col items-center gap-0.5 pt-2 px-2"
        style={{ borderTop: `1px solid ${DIVIDER}` }}
      >
        {/* Profile avatar */}
        {user && (
          <Tip label={`${user.displayName} · ${user.role}`}>
            <div className={cn(btnBase, "cursor-default")}>
              <div
                className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-lg"
                style={{ boxShadow: "0 0 10px rgba(14,165,233,0.35)" }}
              >
                <span className="text-[11px] font-bold text-white leading-none">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </Tip>
        )}

        {/* Settings */}
        <Tip label="Pengaturan">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              cn(btnBase, isActive ? "text-sky-400" : "text-white/35 hover:text-white/75 hover:bg-white/[5%]")
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="toolbar-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: "rgba(14,165,233,0.12)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Settings strokeWidth={isActive ? 2.1 : 1.5} className="h-[19px] w-[19px] relative z-10" />
              </>
            )}
          </NavLink>
        </Tip>

        {/* Logout */}
        <Tip label="Keluar">
          <button
            onClick={() => { logout(); onClose?.(); }}
            className={cn(btnBase, "text-white/30 hover:text-red-400 hover:bg-red-500/[8%]")}
          >
            <LogOut strokeWidth={1.5} className="h-[19px] w-[19px] transition-colors" />
          </button>
        </Tip>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop — always-visible slim toolbar */}
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
