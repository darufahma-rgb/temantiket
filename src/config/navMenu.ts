/**
 * navMenu.ts — Single source of truth for all navigation items.
 *
 * Both AppSidebar (desktop) and DashboardLayout (mobile) import from here.
 * Edit this file to add, remove, or reorder routes for both platforms at once.
 *
 * Role access is enforced by App.tsx <RequireRole> guards — menus here should
 * only show items the role can actually reach.
 */
import type { ElementType } from "react";
import {
  LayoutDashboard, Calculator, Package, Settings,
  StickyNote, FileSpreadsheet, Users, ShoppingBag,
  MessageSquare, Sparkles, Ticket, SearchCheck,
  Trophy, BookUser, Megaphone, BarChart3, Landmark, Wallet, Activity, ShieldCheck,
  MoreHorizontal,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single navigation destination shared between sidebar and mobile. */
export interface NavItemConfig {
  icon: ElementType;
  /** Full label — shown in desktop sidebar */
  title: string;
  /** Short label — shown in mobile grid. Falls back to `title` when omitted. */
  label?: string;
  url: string;
  end?: boolean;        // exact-match for active-state detection
  badge?: string;       // sidebar badge text, e.g. "AI"
  ownerOnly?: boolean;  // hide from non-owner roles in sidebar
}

/** Sidebar section (optional label + grouped items) */
export interface SidebarSectionConfig {
  key: string;
  label: string;
  /** Small emoji shown before the section label */
  emoji?: string;
  items: NavItemConfig[];
}

/** Mobile nav item shape (bottom bar + "Menu Lengkap" sheet) */
export interface MobileNavItem {
  icon: ElementType;
  label: string;
  path: string | null;  // null = "Lainnya" trigger
  exact?: boolean;
  navigateTo?: string;
  isActiveFn?: (pathname: string, search: string) => boolean;
}

/** Convert a NavItemConfig → MobileNavItem */
function m(item: NavItemConfig): MobileNavItem {
  return { icon: item.icon, label: item.label ?? item.title, path: item.url, exact: item.end };
}

// ── Canonical route definitions (each route defined exactly once) ─────────────

const DASHBOARD_OWNER: NavItemConfig = { icon: LayoutDashboard, title: "Dashboard",        url: "/",                end: true };
const DASHBOARD_AGENT: NavItemConfig = { icon: Trophy,          title: "Mitra Dashboard",  url: "/agent",           end: true };
const DASHBOARD_STAFF: NavItemConfig = { icon: LayoutDashboard, title: "Dashboard",        url: "/staff/dashboard", end: true };

const CLIENTS:       NavItemConfig = { icon: Users,           title: "Klien & Jamaah",     label: "Klien",         url: "/clients"           };
const ORDERS:        NavItemConfig = { icon: ShoppingBag,     title: "Order Hub",          label: "Order",         url: "/orders"            };
const PACKAGES:      NavItemConfig = { icon: Package,         title: "Paket & Trip",       label: "Paket",         url: "/packages"          };
const TICKETS:       NavItemConfig = { icon: Ticket,          title: "Harga Tiket",                                url: "/ticket-prices"     };
const FLIGHT_SEARCH: NavItemConfig = { icon: SearchCheck,     title: "Cari Harga Tiket", label: "Cari Tiket",     url: "/flight-search",    badge: "NEW", ownerOnly: true };
const ITINERARY:     NavItemConfig = { icon: Sparkles,        title: "Itinerary",          label: "Itinerary AI",  url: "/itinerary",        badge: "AI" };
const CALC:          NavItemConfig = { icon: Calculator,      title: "Kalkulator & Kurs",  label: "Kalkulator",    url: "/calculator"        };
const BC:            NavItemConfig = { icon: MessageSquare,   title: "Template Broadcast", label: "Broadcast",     url: "/bc-templates"      };
const CAPTION:       NavItemConfig = { icon: Megaphone,       title: "Caption Generator",  label: "Caption Gen",   url: "/caption-generator", badge: "AI" };
const NOTES:         NavItemConfig = { icon: StickyNote,      title: "Catatan",                                    url: "/notes"             };
const REPORTS:       NavItemConfig = { icon: BarChart3,       title: "Laporan Keuangan",   label: "Laporan",       url: "/reports"           };
const EXPORTS:       NavItemConfig = { icon: FileSpreadsheet, title: "Export Center",      label: "Export",        url: "/exports"           };
const VISA_TRACKER:  NavItemConfig = { icon: Landmark,        title: "Visa Tracker",                               url: "/visa-tracker"      };
const AGENT_CENTER:  NavItemConfig = { icon: BookUser,        title: "Manajemen Agen",     label: "Mgt. Agen",     url: "/agent-center"      };
const LEADERBOARD:   NavItemConfig = { icon: Trophy,          title: "Leaderboard",                                url: "/agent/leaderboard" };
const STAFF_MGMT:    NavItemConfig = { icon: Activity,        title: "Manajemen Staff",    label: "Mgmt. Staff",   url: "/staff-performance", ownerOnly: true };
const AUDIT:         NavItemConfig = { icon: ShieldCheck,     title: "Audit & Log",        label: "Audit",         url: "/audit",             ownerOnly: true };
const SETTINGS:      NavItemConfig = { icon: Settings,        title: "Pengaturan",                                 url: "/settings"          };

// Staff-specific pages
const STAFF_PROFILE:    NavItemConfig = { icon: BookUser, title: "Profil Staff",  url: "/staff/profile",     end: true };
const STAFF_VISA:       NavItemConfig = { icon: Landmark, title: "Visa Saya",     url: "/staff/visa",        end: true };
const STAFF_COMMISSION: NavItemConfig = { icon: Wallet,   title: "Komisi Saya",   label: "Komisi",           url: "/staff/commission",  end: true };

// ── Owner sidebar sections ─────────────────────────────────────────────────────

export const OWNER_SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
  { key: "home",       label: "",            items: [DASHBOARD_OWNER]                                        },
  { key: "bisnis",     label: "Bisnis",      items: [CLIENTS, ORDERS, PACKAGES]                             },
  { key: "alat-bantu", label: "Alat Bantu",  items: [TICKETS, FLIGHT_SEARCH, ITINERARY, CALC]               },
  { key: "pemasaran",  label: "Pemasaran",   items: [BC, CAPTION, NOTES]                                    },
  { key: "keuangan",   label: "Keuangan",    items: [REPORTS, EXPORTS]                                      },
  { key: "tim-agen",   label: "Tim & Agen",  items: [VISA_TRACKER, AGENT_CENTER, LEADERBOARD, STAFF_MGMT, AUDIT] },
  { key: "settings",   label: "",            items: [SETTINGS]                                               },
];

// ── Agent sidebar sections ─────────────────────────────────────────────────────

export const AGENT_SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
  { key: "home",       label: "",            items: [DASHBOARD_AGENT]                     },
  { key: "bisnis",     label: "Bisnis",      items: [CLIENTS, ORDERS, PACKAGES]           },
  { key: "alat-bantu", label: "Alat Bantu",  items: [TICKETS, ITINERARY, CALC]            },
  { key: "pemasaran",  label: "Pemasaran",   items: [BC, CAPTION, NOTES]                  },
  { key: "agen",       label: "Agen Saya",   items: [LEADERBOARD, AGENT_CENTER]           },
  { key: "settings",   label: "",            items: [SETTINGS]                            },
];

// ── Staff sidebar sections ─────────────────────────────────────────────────────

export const STAFF_SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
  { key: "home",        label: "",              items: [DASHBOARD_STAFF, STAFF_PROFILE]     },
  { key: "tugas",       label: "Tugas Saya",    items: [STAFF_VISA, STAFF_COMMISSION]       },
  { key: "operasional", label: "Operasional",   items: [CALC, AGENT_CENTER]                 },
  { key: "settings",    label: "",              items: [SETTINGS]                           },
];

// ── Owner mobile nav ───────────────────────────────────────────────────────────

export const OWNER_BOTTOM_NAV: MobileNavItem[] = [
  { icon: LayoutDashboard, label: "Home",    path: "/",        exact: true },
  { icon: ShoppingBag,     label: "Order",   path: "/orders"              },
  { icon: Users,           label: "Klien",   path: "/clients"             },
  { icon: Package,         label: "Paket",   path: "/packages"            },
  { icon: MoreHorizontal,  label: "Lainnya", path: null                   },
];

export const OWNER_MORE_ITEMS: MobileNavItem[] = [
  m(CALC), m(ITINERARY), m(TICKETS), m(FLIGHT_SEARCH),
  m(REPORTS), m(EXPORTS),
  m(BC), m(CAPTION), m(NOTES),
  m(VISA_TRACKER), m(AGENT_CENTER), m(LEADERBOARD),
  m(STAFF_MGMT), m(AUDIT),
  m(SETTINGS),
];

/** Grouped version of OWNER_MORE_ITEMS for mobile "Menu Lengkap" sheet */
export const OWNER_MORE_GROUPS: { label: string; items: MobileNavItem[] }[] = [
  { label: "Alat Bantu", items: [m(CALC), m(ITINERARY), m(TICKETS), m(FLIGHT_SEARCH)] },
  { label: "Keuangan",   items: [m(REPORTS), m(EXPORTS)] },
  { label: "Pemasaran",  items: [m(BC), m(CAPTION), m(NOTES)] },
  { label: "Tim & Agen", items: [m(VISA_TRACKER), m(AGENT_CENTER), m(LEADERBOARD), m(STAFF_MGMT), m(AUDIT)] },
  { label: "Lainnya",    items: [m(SETTINGS)] },
];

// ── Agent mobile nav ───────────────────────────────────────────────────────────

export const AGENT_BOTTOM_NAV: MobileNavItem[] = [
  { icon: Trophy,         label: "Home",    path: "/agent",   exact: true },
  { icon: Package,        label: "Paket",   path: "/packages"             },
  { icon: ShoppingBag,    label: "Order",   path: "/orders"               },
  { icon: Users,          label: "Klien",   path: "/clients"              },
  { icon: MoreHorizontal, label: "Lainnya", path: null                    },
];

export const AGENT_MORE_ITEMS: MobileNavItem[] = [
  m(TICKETS), m(ITINERARY), m(CALC),
  m(BC), m(CAPTION), m(NOTES),
  m(AGENT_CENTER), m(LEADERBOARD),
  m(SETTINGS),
];

// ── Staff mobile nav ───────────────────────────────────────────────────────────

export const STAFF_BOTTOM_NAV: MobileNavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/staff/dashboard",  exact: true },
  { icon: Landmark,        label: "Visa",      path: "/staff/visa",       exact: true },
  { icon: Wallet,          label: "Komisi",    path: "/staff/commission", exact: true },
  { icon: BookUser,        label: "Profil",    path: "/staff/profile"                 },
  { icon: MoreHorizontal,  label: "Lainnya",   path: null                             },
];

export const STAFF_MORE_ITEMS: MobileNavItem[] = [
  m(CALC), m(AGENT_CENTER), m(SETTINGS),
];
