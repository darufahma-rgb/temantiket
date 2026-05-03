import {
  LayoutDashboard, Calculator, Package, LogOut, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  MessageSquare, Sparkles, Ticket,
  Command, Trophy, BookUser, Megaphone, BarChart3,
  Bot,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

const ACCENT = "#1a44d4";
const SIDEBAR_W = 264;

interface NavItemDef {
  title: string;
  url: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: string;
  ownerOnly?: boolean;
}

interface SectionDef {
  key: string;
  label: string;
  items: NavItemDef[];
  ownerOnly?: boolean;
  agentOnly?: boolean;
  collapsible?: boolean;
}

const STAFF_SECTIONS: SectionDef[] = [
  {
    key: "home",
    label: "",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
    ],
  },
  {
    key: "bisnis",
    label: "Bisnis",
    items: [
      { title: "Klien & Jamaah",  url: "/clients", icon: Users },
      { title: "Order Hub",       url: "/orders",  icon: ShoppingBag },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    items: [
      { title: "Harga Tiket",       url: "/ticket-prices", icon: Ticket },
      { title: "Itinerary",          url: "/itinerary",     icon: Sparkles, badge: "AI" },
      { title: "Kalkulator & Kurs", url: "/calculator",    icon: Calculator },
      { title: "Paket Trip",        url: "/packages",      icon: Package },
    ],
  },
  {
    key: "konten",
    label: "Konten",
    items: [
      { title: "Template Broadcast", url: "/bc-templates",    icon: MessageSquare },
      { title: "Caption Generator",  url: "/agent/marketing", icon: Megaphone },
      { title: "Catatan",            url: "/notes",           icon: StickyNote },
    ],
  },
  {
    key: "finance",
    label: "Keuangan",
    ownerOnly: true,
    items: [
      { title: "Laporan Keuangan", url: "/reports", icon: BarChart3 },
      { title: "Export & Manifest", url: "/exports", icon: FileSpreadsheet },
    ],
  },
  {
    key: "agent",
    label: "Agen",
    items: [
      { title: "Manajemen Agen",   url: "/agent-center",      icon: BookUser },
      { title: "Leaderboard",     url: "/agent/leaderboard", icon: Trophy },
    ],
  },
  {
    key: "settings",
    label: "",
    items: [
      { title: "Pengaturan", url: "/settings", icon: Settings },
    ],
  },
];

const AGENT_SECTIONS: SectionDef[] = [
  {
    key: "home",
    label: "",
    items: [
      { title: "Mitra Dashboard", url: "/agent", icon: Trophy, end: true },
    ],
  },
  {
    key: "bisnis",
    label: "Bisnis",
    items: [
      { title: "Klien & Jamaah", url: "/clients", icon: Users },
      { title: "Order Hub",      url: "/orders",  icon: ShoppingBag },
    ],
  },
  {
    key: "konten",
    label: "Konten",
    items: [
      { title: "Template Broadcast", url: "/bc-templates",       icon: MessageSquare },
      { title: "Caption Generator",   url: "/agent/marketing",    icon: Megaphone },
    ],
  },
  {
    key: "agen",
    label: "Agen",
    items: [
      { title: "Leaderboard", url: "/agent/leaderboard", icon: Trophy },
    ],
  },
  {
    key: "settings",
    label: "",
    items: [
      { title: "Pengaturan", url: "/settings", icon: Settings },
    ],
  },
];

function useIsAnyActive(items: NavItemDef[]): boolean {
  const location = useLocation();
  return items.some((item) =>
    item.end ? location.pathname === item.url : location.pathname.startsWith(item.url)
  );
}

function SidebarNavItem({ item, onClose }: { item: NavItemDef; onClose?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.url}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 h-[40px] px-3 rounded-lg text-left transition-all duration-150 w-full group",
          isActive
            ? "text-white"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-pill"
              className="absolute inset-0 rounded-lg"
              style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #0a2472 100%)` }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}

          <span
            className={cn(
              "relative z-10 flex items-center justify-center h-[26px] w-[26px] rounded-md shrink-0 transition-all duration-150",
              isActive
                ? "bg-white/15"
                : "bg-transparent group-hover:bg-[hsl(var(--secondary))]"
            )}
          >
            <Icon
              strokeWidth={isActive ? 2.2 : 1.8}
              className="h-[15px] w-[15px] transition-colors"
              style={{ color: isActive ? "white" : undefined }}
            />
          </span>

          <span className="relative z-10 text-[13px] font-medium flex-1 truncate leading-none">
            {item.title}
          </span>

          {item.badge && (
            <span
              className="relative z-10 text-[7.5px] font-black uppercase tracking-wider px-1.5 py-[3px] rounded-full shrink-0"
              style={
                isActive
                  ? { background: "rgba(255,255,255,0.22)", color: "white" }
                  : { background: `${ACCENT}18`, color: ACCENT }
              }
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarSection({
  section,
  isOwner,
  onClose,
}: {
  section: SectionDef;
  isOwner: boolean;
  onClose?: () => void;
}) {
  const visibleItems = section.items.filter((i) => !i.ownerOnly || isOwner);

  if (visibleItems.length === 0) return null;

  const hasLabel = section.label.length > 0;

  return (
    <div>
      {hasLabel && (
        <div className="flex items-center gap-2 px-3 mb-1.5 mt-1">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.16em] shrink-0"
            style={{ color: "hsl(var(--muted-foreground))", opacity: 0.45 }}
          >
            {section.label}
          </span>
          <div className="flex-1 h-px" style={{ background: "hsl(var(--border))", opacity: 0.6 }} />
        </div>
      )}

      <div className="space-y-1">
        {visibleItems.map((item) => (
          <SidebarNavItem key={item.url} item={item} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ open = false, onClose }: AppSidebarProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isOwner = user?.role === "owner";
  const isAgent = user?.role === "agent";

  const sections = (isAgent ? AGENT_SECTIONS : STAFF_SECTIONS).filter(
    (s) => !s.ownerOnly || isOwner
  );

  const handleLogout = () => { logout(); onClose?.(); navigate("/login"); };

  const roleLabel =
    user?.role === "owner" ? "Owner" :
    user?.role === "staff" ? "Staff" : "Agen Mitra";

  const roleColor =
    user?.role === "owner" ? "#f59e0b" :
    user?.role === "staff" ? ACCENT : "#10b981";

  const sidebarContent = (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: `${SIDEBAR_W}px`, background: "hsl(var(--card))", borderRight: "1px solid hsl(var(--border))" }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center gap-2.5 px-4 py-[14px] shrink-0">
        <div className="h-7 w-7 shrink-0 icon-mark" role="img" aria-label="Temantiket" />
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-black text-[hsl(var(--foreground))] leading-none tracking-[-0.02em]">
            Temantiket
          </p>
          <p className="text-[9.5px] text-[hsl(var(--muted-foreground))] mt-[3px] leading-none" style={{ opacity: 0.6 }}>
            Travel Management
          </p>
        </div>
      </div>

      {/* ── Thin divider ── */}
      <div className="mx-4 shrink-0" style={{ height: "1px", background: "hsl(var(--border))" }} />

      {/* ── User profile ── */}
      {user && (
        <button
          onClick={() => { navigate("/settings"); onClose?.(); }}
          className="flex items-center gap-2.5 mx-3 mt-3 mb-2.5 px-3 py-2.5 rounded-xl hover:bg-[hsl(var(--accent))] transition-colors text-left group"
        >
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-[11px] font-black shrink-0"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #051650)` }}
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[hsl(var(--foreground))] truncate leading-tight">
              {user.displayName}
            </p>
            <div className="flex items-center gap-1 mt-[2px]">
              <span
                className="text-[8.5px] font-bold uppercase tracking-wider leading-none"
                style={{ color: roleColor }}
              >
                ● {roleLabel}
              </span>
            </div>
          </div>
        </button>
      )}

      {/* ── Nav sections ── */}
      <div
        className="flex-1 overflow-y-auto px-3 pb-3 space-y-4"
        style={{ scrollbarWidth: "none" }}
      >
        {sections.map((section) => (
          <SidebarSection
            key={section.key}
            section={section}
            isOwner={isOwner}
            onClose={onClose}
          />
        ))}
      </div>

      {/* ── Bottom ── */}
      <div
        className="shrink-0 px-3 pt-2.5 pb-4 space-y-1.5"
        style={{ borderTop: "1px solid hsl(var(--border))" }}
      >
        {/* AI CTA */}
        <button
          onClick={() => { navigate("/itinerary"); onClose?.(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: `linear-gradient(135deg, ${ACCENT}18 0%, #0a247215 100%)`, border: `1px solid ${ACCENT}22` }}
        >
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #0a2472)` }}
          >
            <Bot className="h-3.5 w-3.5 text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11.5px] font-bold leading-tight" style={{ color: ACCENT }}>
              Itinerary
            </p>
            <p className="text-[9.5px] text-[hsl(var(--muted-foreground))] leading-tight mt-[1px]" style={{ opacity: 0.7 }}>
              Buat program perjalanan otomatis
            </p>
          </div>
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: ACCENT, opacity: 0.6 }} strokeWidth={2} />
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[12px] font-medium text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-500/8 transition-all duration-150 group"
        >
          <LogOut className="h-[14px] w-[14px] shrink-0 transition-colors group-hover:text-red-500" strokeWidth={1.8} />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex shrink-0 h-full">{sidebarContent}</div>

      {/* Mobile */}
      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
            />
            <motion.div
              className="relative flex-shrink-0 shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 36, mass: 0.88 }}
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
