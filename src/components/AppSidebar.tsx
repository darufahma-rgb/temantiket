import { useState } from "react";
import {
  LayoutDashboard, Calculator, Package, GitBranch, LogOut, Settings, X,
  ShieldCheck, StickyNote, FileSpreadsheet, Users, ShoppingBag, ChevronDown,
  Plane, FileBadge, Wallet, Trophy, Megaphone, Crown, MessageSquare,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { useT } from "@/lib/regional";

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const itemVariant: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
};

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function AppSidebar({ open = false, onClose }: AppSidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const t = useT();

  // Auto-buka group Orders kalau lagi di /orders
  const [ordersOpen, setOrdersOpen] = useState<boolean>(
    () => location.pathname.startsWith("/orders"),
  );

  const isActive = (url: string, end: boolean) => {
    if (url === "#") return false;
    if (url.startsWith("/trips")) return location.pathname.startsWith("/trips");
    return end ? location.pathname === url : location.pathname.startsWith(url);
  };

  // Match exact `/orders/<type>` (atau `/orders/detail/...` kalau type-nya cocok)
  const isOrdersTypeActive = (type: string) => {
    return location.pathname === `/orders/${type}` ||
      location.pathname.startsWith(`/orders/${type}?`) ||
      location.pathname.startsWith(`/orders/${type}/`);
  };

  type NavItemDef = { title: string; url: string; icon: typeof LayoutDashboard; end: boolean; danger?: boolean };

  const ordersChildren: NavItemDef[] = [
    { title: t.nav_orders_umrah,  url: "/orders/umrah",        icon: Package,    end: false },
    { title: t.nav_orders_flight, url: "/orders/flight",       icon: Plane,      end: false },
    { title: t.nav_orders_visa,   url: "/orders/visa_student", icon: FileBadge,  end: false },
  ];

  const isOwner = user?.role === "owner";
  const isAgent = user?.role === "agent";

  // Agent dapat nav minimal: Mitra Dashboard + Klien + Order + Settings.
  // Owner/staff dapat nav full sesuai role-nya.
  const navGroups: { label: string | null; items: NavItemDef[] }[] = isAgent
    ? [
        {
          label: null,
          items: [
            { title: t.nav_agent_dashboard ?? "Mitra Dashboard", url: "/agent", icon: Trophy, end: true },
          ],
        },
        {
          label: t.nav_group_hub,
          items: [
            { title: t.nav_clients, url: "/clients", icon: Users, end: false },
            // Orders di-handle terpisah sbg collapsible group di bawah.
          ],
        },
        {
          label: "Marketing & Reward",
          items: [
            { title: "Marketing Kit", url: "/agent/marketing", icon: Megaphone, end: false },
            { title: "Leaderboard", url: "/agent/leaderboard", icon: Crown, end: false },
          ],
        },
        {
          label: "Referensi",
          items: [
            { title: "Template BC WA", url: "/bc-templates", icon: MessageSquare, end: false },
          ],
        },
      ]
    : [
        {
          label: null,
          items: [
            { title: t.nav_dashboard, url: "/", icon: LayoutDashboard, end: true },
          ],
        },
        {
          label: t.nav_group_hub,
          items: [
            { title: t.nav_clients, url: "/clients", icon: Users, end: false },
          ],
        },
        {
          label: t.nav_group_operational,
          items: [
            { title: t.nav_calculator, url: "/calculator", icon: Calculator, end: false },
            { title: t.nav_packages, url: "/packages", icon: Package, end: false },
            { title: t.nav_progress, url: "/progress", icon: GitBranch, end: false },
          ],
        },
        {
          label: t.nav_group_tools,
          items: [
            { title: t.nav_notes, url: "/notes", icon: StickyNote, end: false },
            { title: t.nav_exports ?? "Export Center", url: "/exports", icon: FileSpreadsheet, end: false },
            { title: "Template BC WA", url: "/bc-templates", icon: MessageSquare, end: false },
          ],
        },
        // Admin group — owner-only. Disembunyikan utk staff supaya bocor data
        // finansial gak terjadi via UI (route juga digard di App.tsx).
        ...(isOwner
          ? [{
              label: t.nav_group_admin,
              items: [
                { title: t.nav_reports, url: "/reports", icon: Wallet, end: false },
              ],
            }]
          : []),
      ];

  const settingsItem: NavItemDef = { title: t.nav_settings, url: "/settings", icon: Settings, end: false };

  const NavItem = ({ title, url, icon: Icon, end, danger = false }: NavItemDef) => {
    const active = isActive(url, end);
    return (
      <NavLink
        to={url}
        end={end}
        onClick={onClose}
        className={cn(
          "relative flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium rounded-2xl transition-[background-color,color,box-shadow,transform] duration-150 group",
          active
            ? "text-[hsl(var(--primary))] bg-[hsl(var(--accent))] shadow-[0_10px_24px_hsl(27_91%_54%_/_0.12)]"
            : danger
              ? "text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-50"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] hover:translate-x-0.5"
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-pill"
            className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[hsl(var(--primary))]"
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
        )}
        <Icon
          strokeWidth={active ? 2 : 1.5}
          className={cn(
            "h-[17px] w-[17px] shrink-0 transition-colors duration-150",
            active ? "text-[hsl(var(--primary))]" : danger ? "group-hover:text-red-500" : ""
          )}
        />
        <span className="flex-1 leading-none pl-1">{title}</span>
      </NavLink>
    );
  };

  // Collapsible "Orders" group
  const ordersGroupActive = location.pathname.startsWith("/orders");
  const OrdersGroup = () => (
    <div>
      <button
        onClick={() => setOrdersOpen((v) => !v)}
        className={cn(
          "w-full relative flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium rounded-2xl transition-[background-color,color] duration-150",
          ordersGroupActive
            ? "text-[hsl(var(--primary))] bg-[hsl(var(--accent))]"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]",
        )}
      >
        <ShoppingBag strokeWidth={ordersGroupActive ? 2 : 1.5} className="h-[17px] w-[17px] shrink-0" />
        <span className="flex-1 leading-none pl-1 text-left">{t.nav_orders}</span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("h-3.5 w-3.5 transition-transform", ordersOpen && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {ordersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden pl-3 mt-0.5 space-y-0.5"
          >
            {ordersChildren.map((item) => {
              const type = item.url.split("/").pop() ?? "";
              const active = isOrdersTypeActive(type);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.url}
                  to={item.url}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 text-[12.5px] font-medium rounded-xl transition-colors",
                    active
                      ? "text-[hsl(var(--primary))] bg-[hsl(var(--accent))]"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]",
                  )}
                >
                  <Icon strokeWidth={active ? 2 : 1.5} className="h-[15px] w-[15px] shrink-0" />
                  <span className="flex-1 leading-none">{item.title}</span>
                </NavLink>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const sidebarContent = (
    <aside
      className="flex h-full flex-col border-r border-[hsl(var(--border))] bg-white/95 backdrop-blur shadow-[0_8px_28px_hsl(27_91%_54%_/_0.06)] max-md:rounded-r-[2rem] max-md:border"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-center">
          <img
            src="/temantiket-logo.png"
            alt="Temantiket"
            className="sidebar-logo h-9 w-auto object-contain shrink-0"
          />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden h-7 w-7 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <X strokeWidth={1.5} className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Nav groups ── */}
      <motion.div
        className="flex-1 overflow-y-auto px-3 space-y-1 pb-2"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "pt-3" : ""}>
            {group.label && (
              <motion.p
                variants={itemVariant}
                className="px-4 mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"
              >
                {group.label}
              </motion.p>
            )}
            {group.items.map((item) => (
              <motion.div key={item.url} variants={itemVariant}>
                <NavItem {...item} />
              </motion.div>
            ))}
            {/* Inject Orders collapsible group dalam bagian Order Hub */}
            {group.label === t.nav_group_hub && (
              <motion.div variants={itemVariant}>
                <OrdersGroup />
              </motion.div>
            )}
          </div>
        ))}
      </motion.div>

      {/* ── Bottom: User info + Settings + Logout ── */}
      <div className="shrink-0 mx-3 py-4 border-t border-[hsl(var(--border))] space-y-0.5">
        {user && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 mb-1 rounded-2xl bg-sky-50">
            <div className="h-7 w-7 rounded-full bg-sky-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-sky-800 truncate leading-tight">
                {user.displayName}
              </p>
              <p className="text-[10px] text-sky-500 uppercase tracking-wider">
                {user.role}
              </p>
            </div>
          </div>
        )}

        <NavItem {...settingsItem} />

        <button
          onClick={() => { logout(); onClose?.(); }}
          className="relative flex items-center gap-3 w-full px-4 py-2.5 text-[13.5px] font-medium rounded-2xl transition-[background-color,color] duration-150 text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-50 group"
        >
          <LogOut
            strokeWidth={1.5}
            className="h-[17px] w-[17px] shrink-0 transition-colors duration-150 group-hover:text-red-500"
          />
          <span className="flex-1 leading-none pl-1 text-left">{t.nav_logout}</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:flex shrink-0">
        {sidebarContent}
      </div>

      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={onClose}
            />
            <motion.div
              className="relative flex-shrink-0"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.9 }}
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
