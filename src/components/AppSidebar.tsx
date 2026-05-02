import { useState } from "react";
import {
  LayoutDashboard, Calculator, Package, LogOut, Settings, X,
  ShieldCheck, StickyNote, FileSpreadsheet, Users, ShoppingBag,
  ChevronDown, Plane, FileBadge, Wallet, Megaphone, Crown,
  MessageSquare, Sparkles, Ticket, GitBranch, Command, Trophy,
  CreditCard, BookUser,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useAuthStore } from "@/store/authStore";

// ── Animation variants ─────────────────────────────────────────────────────

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};

const itemVariant: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
};

// ── Types ──────────────────────────────────────────────────────────────────

interface NavItemDef {
  title: string;
  url: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: string;
}

interface SectionDef {
  key: string;
  label: string;
  items: NavItemDef[];
  collapsible?: boolean;
  ownerOnly?: boolean;
}

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

// ── Nav item component ─────────────────────────────────────────────────────

function NavItem({ title, url, icon: Icon, end = false, badge, onClose }: NavItemDef & { onClose?: () => void }) {
  const location = useLocation();
  const active = end
    ? location.pathname === url
    : url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  return (
    <NavLink
      to={url}
      end={end}
      onClick={onClose}
      className={cn(
        "relative flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-xl transition-all duration-150 group",
        active
          ? "text-sky-600 bg-sky-50"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 hover:translate-x-0.5",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sky-500"
          transition={{ type: "spring", stiffness: 480, damping: 36 }}
        />
      )}
      <Icon
        strokeWidth={active ? 2.2 : 1.6}
        className={cn(
          "h-[16px] w-[16px] shrink-0 transition-colors duration-150",
          active ? "text-sky-500" : "",
        )}
      />
      <span className="flex-1 leading-none">{title}</span>
      {badge && (
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-600">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

// ── Collapsible Orders sub-nav ─────────────────────────────────────────────

const ORDER_CHILDREN: NavItemDef[] = [
  { title: "Umrah & Haji",    url: "/orders/umrah",        icon: Package,   end: false },
  { title: "Tiket Pesawat",   url: "/orders/flight",       icon: Plane,     end: false },
  { title: "Visa Mesir",      url: "/orders/visa_student", icon: FileBadge, end: false },
];

function OrdersGroup({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const groupActive = location.pathname.startsWith("/orders");
  const [open, setOpen] = useState<boolean>(() => groupActive);

  const isChildActive = (url: string) => {
    const type = url.split("/").pop() ?? "";
    return location.pathname === `/orders/${type}` || location.pathname.startsWith(`/orders/${type}/`);
  };

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-xl transition-all duration-150",
          groupActive
            ? "text-sky-600 bg-sky-50"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
        )}
      >
        {groupActive && (
          <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-sky-500" />
        )}
        <ShoppingBag strokeWidth={groupActive ? 2.2 : 1.6} className={cn("h-[16px] w-[16px] shrink-0", groupActive ? "text-sky-500" : "")} />
        <span className="flex-1 leading-none text-left">Orders</span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-3 pl-3 border-l border-border/60 mt-0.5 space-y-0.5 mb-0.5">
              {ORDER_CHILDREN.map((item) => {
                const active = isChildActive(item.url);
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] font-medium rounded-lg transition-colors duration-150",
                      active
                        ? "text-sky-600 bg-sky-50"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    )}
                  >
                    <Icon strokeWidth={active ? 2.2 : 1.6} className={cn("h-[14px] w-[14px] shrink-0", active ? "text-sky-500" : "")} />
                    <span className="flex-1 leading-none">{item.title}</span>
                  </NavLink>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Collapsible section wrapper ────────────────────────────────────────────

function CollapsibleSection({
  label, items, defaultOpen = true, onClose,
}: {
  label: string;
  items: NavItemDef[];
  defaultOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-3 py-1 mb-0.5 group"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
          {label}
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("h-3 w-3 text-muted-foreground/40 ml-auto transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden space-y-0.5"
          >
            {items.map((item) => (
              <NavItem key={item.url} {...item} onClose={onClose} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section label (non-collapsible) ────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 py-1 mb-0.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
    </div>
  );
}

function SectionDivider() {
  return <div className="mx-3 border-t border-border/50 my-1" />;
}

// ── Main sidebar ───────────────────────────────────────────────────────────

export function AppSidebar({ open = false, onClose }: AppSidebarProps) {
  const { user, logout } = useAuthStore();
  const isOwner = user?.role === "owner";
  const isAgent = user?.role === "agent";

  // Sections for agent (minimal view)
  const agentContent = (
    <>
      <motion.div variants={itemVariant}>
        <NavItem title="Mitra Dashboard" url="/agent" icon={Trophy} end onClose={onClose} />
      </motion.div>

      <SectionDivider />
      <motion.div variants={itemVariant}><SectionLabel label="Order Hub" /></motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Klien" url="/clients" icon={Users} onClose={onClose} />
      </motion.div>
      <motion.div variants={itemVariant}><OrdersGroup onClose={onClose} /></motion.div>

      <SectionDivider />
      <motion.div variants={itemVariant}><SectionLabel label="Marketing" /></motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Template BC WA" url="/bc-templates" icon={MessageSquare} onClose={onClose} />
      </motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Marketing Kit" url="/agent/marketing" icon={Megaphone} onClose={onClose} />
      </motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Leaderboard" url="/agent/leaderboard" icon={Crown} onClose={onClose} />
      </motion.div>
    </>
  );

  // Sections for owner/staff (full view)
  const staffContent = (
    <>
      {/* MAIN */}
      <motion.div variants={itemVariant}>
        <NavItem title="Dashboard" url="/" icon={LayoutDashboard} end onClose={onClose} />
      </motion.div>

      <SectionDivider />

      {/* ORDER HUB */}
      <motion.div variants={itemVariant}><SectionLabel label="Order Hub" /></motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Klien" url="/clients" icon={Users} onClose={onClose} />
      </motion.div>
      <motion.div variants={itemVariant}><OrdersGroup onClose={onClose} /></motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Daftar Harga Tiket" url="/ticket-prices" icon={Ticket} onClose={onClose} />
      </motion.div>
      <motion.div variants={itemVariant}>
        <NavItem title="Direktori Agen" url="/agent-directory" icon={BookUser} onClose={onClose} />
      </motion.div>

      <SectionDivider />

      {/* AI TOOLS */}
      <motion.div variants={itemVariant}>
        <CollapsibleSection
          label="AI Tools"
          defaultOpen
          onClose={onClose}
          items={[
            { title: "AI Itinerary Generator", url: "/itinerary",      icon: Sparkles,  badge: "AI" },
            { title: "Smart Price Importer",    url: "/ticket-prices",  icon: CreditCard, badge: "AI" },
          ]}
        />
      </motion.div>

      <SectionDivider />

      {/* OPERASIONAL */}
      <motion.div variants={itemVariant}>
        <CollapsibleSection
          label="Operasional"
          defaultOpen
          onClose={onClose}
          items={[
            { title: "Kalkulator & Kurs",  url: "/calculator", icon: Calculator },
            { title: "Paket Trip",          url: "/packages",   icon: Package },
            { title: "Progress Jamaah",     url: "/progress",   icon: GitBranch },
            { title: "Catatan",             url: "/notes",      icon: StickyNote },
          ]}
        />
      </motion.div>

      <SectionDivider />

      {/* MARKETING */}
      <motion.div variants={itemVariant}>
        <CollapsibleSection
          label="Marketing"
          defaultOpen
          onClose={onClose}
          items={[
            { title: "Template BC WA",       url: "/bc-templates", icon: MessageSquare },
            { title: "Export & Member Card",  url: "/exports",      icon: FileSpreadsheet },
          ]}
        />
      </motion.div>

      {/* ADMIN — owner only */}
      {isOwner && (
        <>
          <SectionDivider />
          <motion.div variants={itemVariant}>
            <CollapsibleSection
              label="Admin"
              defaultOpen={false}
              onClose={onClose}
              items={[
                { title: "Laporan Keuangan",    url: "/reports",       icon: Wallet },
                { title: "Kontrol Agen & Misi", url: "/agent-center",  icon: Command },
              ]}
            />
          </motion.div>
        </>
      )}
    </>
  );

  const sidebarContent = (
    <aside
      className="flex h-full flex-col border-r border-border bg-white/98 backdrop-blur-sm max-md:rounded-r-3xl max-md:border"
      style={{ width: "var(--sidebar-width, 228px)", boxShadow: "2px 0 16px rgba(0,0,0,0.04)" }}
    >
      {/* ── Logo header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/temantiket-logo.png"
            alt="Temantiket"
            className="h-7 w-auto object-contain"
          />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X strokeWidth={1.5} className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Thin accent line below logo */}
      <div className="mx-4 mb-3 h-px bg-gradient-to-r from-sky-200/80 via-sky-100/40 to-transparent" />

      {/* ── Nav ── */}
      <motion.div
        className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-3"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {isAgent ? agentContent : staffContent}
      </motion.div>

      {/* ── Bottom user + settings ── */}
      <div className="shrink-0 mx-2 pb-3 pt-2 border-t border-border space-y-0.5">
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1.5 rounded-xl bg-sky-50 border border-sky-100/80">
            <div className="h-7 w-7 rounded-full bg-sky-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-sky-800 truncate leading-tight">
                {user.displayName}
              </p>
              <p className="text-[9.5px] text-sky-400 uppercase tracking-widest font-semibold">
                {user.role}
              </p>
            </div>
          </div>
        )}

        <NavItem title="Pengaturan" url="/settings" icon={Settings} onClose={onClose} />

        <button
          onClick={() => { logout(); onClose?.(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-xl transition-all duration-150 text-muted-foreground hover:text-red-500 hover:bg-red-50 group"
        >
          <LogOut strokeWidth={1.6} className="h-[16px] w-[16px] shrink-0 group-hover:text-red-500 transition-colors" />
          <span className="flex-1 leading-none text-left">Keluar</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
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
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
