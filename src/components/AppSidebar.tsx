import { useState, useEffect } from "react";
import {
  LayoutDashboard, Calculator, Package, LogOut, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  Plane, FileBadge, Wallet, MessageSquare, Sparkles, Ticket,
  GitBranch, Command, Trophy, BookUser, Megaphone, BarChart3,
  Wrench, ChevronDown, ChevronUp, HelpCircle, Star, Zap,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

const ACCENT = "#0ea5e9";
const SIDEBAR_W = 240;

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
    key: "main",
    label: "Main Menu",
    collapsible: true,
    items: [
      { title: "Dashboard",         url: "/",              icon: LayoutDashboard, end: true },
      { title: "Klien & Jamaah",    url: "/clients",       icon: Users },
      { title: "Order Hub",         url: "/orders",        icon: ShoppingBag },
      { title: "Harga Tiket",       url: "/ticket-prices", icon: Ticket },
      { title: "AI Itinerary",      url: "/itinerary",     icon: Sparkles, badge: "AI" },
      { title: "Kalkulator & Kurs", url: "/calculator",    icon: Calculator },
      { title: "Paket Trip",        url: "/packages",      icon: Package },
      { title: "Progress Jamaah",   url: "/progress",      icon: GitBranch },
      { title: "Catatan",           url: "/notes",         icon: StickyNote },
      { title: "Template Broadcast",url: "/bc-templates",  icon: MessageSquare },
      { title: "Export & Manifest", url: "/exports",       icon: FileSpreadsheet },
      { title: "Marketing Kit",     url: "/agent/marketing", icon: Megaphone },
    ],
  },
  {
    key: "finance",
    label: "Keuangan",
    ownerOnly: true,
    items: [
      { title: "Laporan Keuangan",  url: "/reports",         icon: BarChart3 },
    ],
  },
  {
    key: "agent",
    label: "Sistem Agen",
    items: [
      { title: "Kontrol & Misi",   url: "/agent-center",     icon: Command, ownerOnly: true },
      { title: "Direktori Agen",   url: "/agent-directory",  icon: BookUser },
      { title: "Leaderboard",      url: "/agent/leaderboard",icon: Trophy },
    ],
  },
  {
    key: "settings",
    label: "Help & Settings",
    items: [
      { title: "Pengaturan",       url: "/settings",         icon: Settings },
    ],
  },
];

const AGENT_SECTIONS: SectionDef[] = [
  {
    key: "main",
    label: "Main Menu",
    collapsible: true,
    items: [
      { title: "Mitra Dashboard",    url: "/agent",          icon: Trophy, end: true },
      { title: "Klien & Jamaah",     url: "/clients",        icon: Users },
      { title: "Order Hub",          url: "/orders",         icon: ShoppingBag },
      { title: "Template Broadcast", url: "/bc-templates",   icon: MessageSquare },
      { title: "Marketing Kit",      url: "/agent/marketing",icon: Megaphone },
      { title: "Leaderboard",        url: "/agent/leaderboard", icon: Trophy },
    ],
  },
  {
    key: "settings",
    label: "Help & Settings",
    items: [
      { title: "Pengaturan",         url: "/settings",       icon: Settings },
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
          "relative flex items-center gap-3 h-9 px-3 rounded-xl text-left transition-all duration-150 w-full group",
          isActive
            ? "text-white"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-pill"
              className="absolute inset-0 rounded-xl"
              style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)" }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <Icon
            strokeWidth={isActive ? 2.2 : 1.7}
            className="h-[16px] w-[16px] shrink-0 relative z-10 transition-colors"
            style={{ color: isActive ? "white" : undefined }}
          />
          <span className="relative z-10 text-[13px] font-medium flex-1 truncate leading-none">
            {item.title}
          </span>
          {item.badge && (
            <span
              className="relative z-10 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
              style={
                isActive
                  ? { background: "rgba(255,255,255,0.25)", color: "white" }
                  : { background: `${ACCENT}20`, color: ACCENT }
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
  const hasActive = useIsAnyActive(visibleItems);
  const [collapsed, setCollapsed] = useState(false);

  if (visibleItems.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <button
        onClick={section.collapsible ? () => setCollapsed((c) => !c) : undefined}
        className={cn(
          "flex items-center justify-between w-full px-3 py-1.5",
          section.collapsible ? "cursor-pointer" : "cursor-default"
        )}
      >
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
          {section.label}
        </span>
        {section.collapsible && (
          collapsed
            ? <ChevronDown className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
            : <ChevronUp className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 px-1">
              {visibleItems.map((item) => (
                <SidebarNavItem key={item.url} item={item} onClose={onClose} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{ width: `${SIDEBAR_W}px`, background: "hsl(var(--card))", borderRight: "1px solid hsl(var(--border))" }}
    >
      {/* ── Logo area ── */}
      <div className="flex items-center gap-2.5 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}
        >
          <img
            src="/temantiket-logo.png"
            alt="Temantiket"
            className="h-5 w-5 object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              const span = document.createElement("span");
              span.textContent = "T";
              span.className = "text-white font-black text-lg";
              img.parentElement!.appendChild(span);
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-[hsl(var(--foreground))] leading-none tracking-tight">Temantiket</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-none">Travel Management</p>
        </div>
      </div>

      {/* ── User profile ── */}
      {user && (
        <button
          onClick={() => { navigate("/settings"); onClose?.(); }}
          className="flex items-center gap-3 mx-3 mt-3 mb-1 px-3 py-2.5 rounded-xl hover:bg-[hsl(var(--secondary))] transition-colors text-left"
        >
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-[12px] font-black shrink-0 shadow"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold text-[hsl(var(--foreground))] truncate leading-tight">{user.displayName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ background: `${ACCENT}15`, color: ACCENT }}
              >
                <Zap className="h-2.5 w-2.5" strokeWidth={2.5} />
                {roleLabel}
              </span>
            </div>
          </div>
        </button>
      )}

      {/* ── Nav sections ── */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4" style={{ scrollbarWidth: "none" }}>
        {sections.map((section) => (
          <SidebarSection
            key={section.key}
            section={section}
            isOwner={isOwner}
            onClose={onClose}
          />
        ))}
      </div>

      {/* ── Bottom: CTA + Logout ── */}
      <div className="shrink-0 px-3 pb-4 space-y-2" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: "12px" }}>
        {/* CTA upgrade card */}
        <div
          className="rounded-2xl p-3.5 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)" }}
        >
          <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "white" }} />
          <div className="absolute -bottom-3 -left-3 h-12 w-12 rounded-full opacity-10" style={{ background: "white" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-1">
              <Star className="h-3.5 w-3.5 text-yellow-300" strokeWidth={2} fill="currentColor" />
              <span className="text-[11px] font-black text-white tracking-wide">Pro Tips</span>
            </div>
            <p className="text-[10px] text-white/80 leading-snug mb-2.5">
              Gunakan AI Itinerary untuk buat program perjalanan otomatis!
            </p>
            <button
              onClick={() => { navigate("/itinerary"); onClose?.(); }}
              className="w-full flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-bold text-sky-700 bg-white/90 hover:bg-white transition-colors"
            >
              <Sparkles className="h-3 w-3" strokeWidth={2.5} />
              Coba Sekarang
            </button>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 h-9 px-3 rounded-xl text-[12.5px] font-medium text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-50 transition-colors group"
        >
          <LogOut className="h-[15px] w-[15px] shrink-0 group-hover:text-red-500 transition-colors" strokeWidth={1.8} />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop — always visible */}
      <div className="hidden md:flex shrink-0 h-full">{sidebarContent}</div>

      {/* Mobile — slide-in overlay */}
      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
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
