import {
  LayoutDashboard, Calculator, Package, LogOut, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  MessageSquare, Sparkles, Ticket,
  Command, Trophy, BookUser, Megaphone, BarChart3, Landmark, Wallet, Activity,
} from "lucide-react";

import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.911 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.182a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .511 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.998-2.9 6.056 6.056 0 0 0-.748-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.041l.141-.08 4.779-2.758a.776.776 0 0 0 .393-.681v-6.737l2.02 1.169a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.493zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.776.776 0 0 0 .781 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95A4.5 4.5 0 0 1 3.6 18.304zm-1.259-10.43a4.485 4.485 0 0 1 2.366-1.973v5.7a.766.766 0 0 0 .388.676l5.815 3.354-2.02 1.169a.076.076 0 0 1-.071 0l-4.83-2.787A4.504 4.504 0 0 1 2.341 7.874zm16.597 3.856-5.814-3.358 2.015-1.169a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.104v-5.677a.79.79 0 0 0-.407-.667l-.019-.024zm2.011-3.023-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.41 9.207V6.875a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.681 4.66zm-12.73 4.18-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.376-3.454l-.142.08-4.778 2.758a.776.776 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

const ACCENT = "#1a44d4";
const SIDEBAR_W = 224;

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

const OWNER_SECTIONS: SectionDef[] = [
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
      { title: "Klien & Jamaah", url: "/clients", icon: Users },
      { title: "Order Hub",      url: "/orders",  icon: ShoppingBag },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    items: [
      { title: "Harga Tiket",    url: "/ticket-prices", icon: Ticket },
      { title: "Itinerary",      url: "/itinerary",     icon: Sparkles, badge: "AI" },
      { title: "Kalkulator & Kurs", url: "/calculator", icon: Calculator },
      { title: "Paket & Trip",   url: "/packages",      icon: Package },
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
    key: "keuangan",
    label: "Keuangan",
    items: [
      { title: "Laporan Keuangan", url: "/reports",  icon: BarChart3 },
      { title: "Export Center",    url: "/exports",  icon: FileSpreadsheet },
    ],
  },
  {
    key: "manajemen",
    label: "Manajemen",
    items: [
      { title: "Visa Tracker",        url: "/visa-tracker",        icon: Landmark },
      { title: "Manajemen Agen",      url: "/agent-center",        icon: BookUser },
      { title: "Leaderboard",         url: "/agent/leaderboard",   icon: Trophy },
      { title: "Pantau Kinerja Staff", url: "/staff-performance",  icon: Activity, ownerOnly: true },
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

const STAFF_SECTIONS: SectionDef[] = [
  {
    key: "home",
    label: "",
    items: [
      { title: "Dashboard",   url: "/staff/dashboard", icon: LayoutDashboard, end: true },
      { title: "Profil Staff", url: "/staff/profile",  icon: BookUser,        end: true },
    ],
  },
  {
    key: "tugas",
    label: "Tugas Saya",
    items: [
      { title: "Visa Saya",   url: "/staff/visa",       icon: Landmark, end: true },
      { title: "Komisi Saya", url: "/staff/commission", icon: Wallet,   end: true },
    ],
  },
  {
    key: "operasional",
    label: "Operasional",
    items: [
      { title: "Kalkulator Visa", url: "/calculator", icon: Calculator },
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
          <SidebarNavItem key={item.title} item={item} onClose={onClose} />
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

  const isStaff = user?.role === "staff";
  const sections = (
    isAgent ? AGENT_SECTIONS :
    isStaff ? STAFF_SECTIONS :
    OWNER_SECTIONS
  ).filter((s) => !s.ownerOnly || isOwner);

  const handleLogout = () => { logout(); onClose?.(); navigate("/login"); };

  const roleLabel =
    user?.role === "owner" ? "Owner" :
    user?.role === "staff" ? "Pelaksana Visa" : "Agen Mitra";

  const roleColor =
    user?.role === "owner" ? "#f59e0b" :
    user?.role === "staff" ? "#0ea5e9" : "#10b981";

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
          onClick={() => { navigate(isStaff ? "/staff/profile" : "/settings"); onClose?.(); }}
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
        {/* AI CTA — owner/agent only */}
        {!isStaff && (
        <button
          onClick={() => { navigate("/itinerary"); onClose?.(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: `linear-gradient(135deg, ${ACCENT}18 0%, #0a247215 100%)`, border: `1px solid ${ACCENT}22` }}
        >
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #0a2472)` }}
          >
            <ChatGPTIcon className="h-3.5 w-3.5 text-white" />
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
        )}

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
