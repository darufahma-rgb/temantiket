import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { OfflineBar } from "@/components/OfflineBar";
import { PageLoadingFallback, PublicPageLoadingFallback } from "@/components/PageLoadingFallback";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { useRatesStore } from "@/store/ratesStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useTripsStore } from "@/store/tripsStore";
import { useClientsStore } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useTicketPricesStore } from "@/store/ticketPricesStore";
import { useAuthStore } from "@/store/authStore";
import { useRegionalStore } from "@/store/regionalStore";
import { applyAppearanceSettings, loadAppearanceSettings, pullAppearanceSettings } from "@/lib/appearance";
import { startManagedRealtime, onRealtimeStatusChange } from "@/lib/realtimeManager";
import { initSyncStatusListeners } from "@/store/syncStatusStore";
import { toast } from "sonner";
import { pullIghAdminSettings } from "@/lib/ighSettings";
import { pullBannerTheme } from "@/lib/bannerTheme";
import { pullProductCommissions } from "@/lib/productCommissions";
import { pullMarkup } from "@/features/ticketPrices/ticketPricesRepo";

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────
// Semua halaman dimuat on-demand saat pertama kali dikunjungi.
// Ini memecah bundle 6.6 MB menjadi chunk kecil per-halaman.
const Index               = lazy(() => import("./pages/Index"));
const Calculator          = lazy(() => import("./pages/Calculator"));
const Packages            = lazy(() => import("./pages/Packages"));
const PackageDetail       = lazy(() => import("./pages/PackageDetail"));
const TripDetail          = lazy(() => import("./pages/TripDetail"));
const JamaahProfile       = lazy(() => import("./pages/JamaahProfile"));
const Settings            = lazy(() => import("./pages/Settings"));
const Login               = lazy(() => import("./pages/Login"));
const PublicCheck         = lazy(() => import("./pages/PublicCheck"));
const PublicLeaderboard   = lazy(() => import("./pages/PublicLeaderboard"));
const PublicMemberCard    = lazy(() => import("./pages/PublicMemberCard"));
const Auth                = lazy(() => import("./pages/Auth"));
const NotFound            = lazy(() => import("./pages/NotFound"));
const Notes               = lazy(() => import("./pages/Notes"));
const ExportCenter        = lazy(() => import("./pages/ExportCenter"));
const Clients             = lazy(() => import("./pages/Clients"));
const Orders              = lazy(() => import("./pages/Orders"));
const OrderDetail         = lazy(() => import("./pages/OrderDetail"));
const Reports             = lazy(() => import("./pages/Reports"));
const AgentCommandCenter  = lazy(() => import("./pages/AgentCommandCenter"));
const AgentDashboard      = lazy(() => import("./pages/AgentDashboard"));
const AgentProfile        = lazy(() => import("./pages/AgentProfile"));
const AgentProfileOwnerView = lazy(() => import("./pages/AgentProfileOwnerView"));
const AgentLeaderboard    = lazy(() => import("./pages/AgentLeaderboard"));
const AgentMarketingKit   = lazy(() => import("./pages/AgentMarketingKit"));
const BCTemplates         = lazy(() => import("./pages/BCTemplates"));
const ItineraryGenerator  = lazy(() => import("./pages/ItineraryGenerator"));
const DemoSeed            = lazy(() => import("./pages/DemoSeed"));
const TicketPrices        = lazy(() => import("./pages/TicketPrices"));
const PublicTicketPrices  = lazy(() => import("./pages/PublicTicketPrices"));
const StaffVisaDashboard  = lazy(() => import("./pages/StaffVisaDashboard"));
const StaffDashboardPage  = lazy(() => import("./pages/StaffDashboardPage"));
const StaffCommissionPage = lazy(() => import("./pages/StaffCommissionPage"));
const StaffProfile        = lazy(() => import("./pages/StaffProfile"));
const StaffManagementCenter = lazy(() => import("./pages/StaffManagementCenter"));
const OwnerVisaTrackerPage  = lazy(() => import("./pages/OwnerVisaTrackerPage"));
const StaffProfileOwnerView = lazy(() => import("./pages/StaffProfileOwnerView"));
const AuditCenterPage     = lazy(() => import("./pages/AuditCenterPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function StoreBootstrap() {
  const refreshRates          = useRatesStore((s) => s.refresh);
  const pullRates             = useRatesStore((s) => s.pullFromCloud);
  const refreshPackages       = usePackagesStore((s) => s.refresh);
  const fetchTrips            = useTripsStore((s) => s.fetchTrips);
  const fetchClients          = useClientsStore((s) => s.fetchClients);
  const fetchOrders           = useOrdersStore((s) => s.fetchOrders);
  const refreshTicketPrices   = useTicketPricesStore((s) => s.refresh);
  const isAuthenticated       = useAuthStore((s) => s.isAuthenticated);
  const user                  = useAuthStore((s) => s.user);

  useEffect(() => {
    refreshRates();
    if (!isAuthenticated) return;
    void Promise.all([
      refreshPackages(),
      fetchTrips(),
      fetchClients(),
      fetchOrders(),
      refreshTicketPrices(),
      pullIghAdminSettings(),
      pullBannerTheme(),
      pullProductCommissions(),
      pullMarkup(),
      pullRates(),
      user?.id ? pullAppearanceSettings(user.id) : Promise.resolve(),
    ]);
  }, [refreshRates, refreshPackages, fetchTrips, fetchClients, fetchOrders, refreshTicketPrices, isAuthenticated, user?.id, pullRates]);

  useEffect(() => {
    if (!isAuthenticated || !user?.agencyId) return;
    const unsubscribe = startManagedRealtime(user.agencyId);
    return unsubscribe;
  }, [isAuthenticated, user?.agencyId]);

  useEffect(() => {
    let prevStatus = "offline";
    const unsub = onRealtimeStatusChange((status) => {
      if (prevStatus !== "live" && status === "live" && prevStatus !== "offline") {
        toast.success("Data baru saja diperbarui", { duration: 2000, id: "rt-update" });
      }
      prevStatus = status;
    });
    return unsub;
  }, []);

  return null;
}

function LoginAlertNotifier() {
  const newLoginAt = useAuthStore((s) => s.newLoginAt);
  const clearNewLogin = useAuthStore((s) => s.clearNewLogin);
  useEffect(() => {
    if (newLoginAt) {
      const formatted = new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(newLoginAt));
      toast.warning("Login baru terdeteksi", {
        description: `Sesi login sebelumnya: ${formatted}`,
        duration: 6000,
      });
      clearNewLogin();
    }
  }, [newLoginAt, clearNewLogin]);
  return null;
}

function AppearanceBootstrap() {
  useEffect(() => {
    const applySavedAppearance = () => applyAppearanceSettings(loadAppearanceSettings());
    applySavedAppearance();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", applySavedAppearance);
    window.addEventListener("storage", applySavedAppearance);
    return () => {
      mediaQuery.removeEventListener("change", applySavedAppearance);
      window.removeEventListener("storage", applySavedAppearance);
    };
  }, []);
  return null;
}

function LangDirectionBootstrap() {
  const language = useRegionalStore((s) => s.language);
  useEffect(() => {
    const isAr = language === "ar";
    document.documentElement.dir = isAr ? "rtl" : "ltr";
    document.documentElement.lang = language === "ar" ? "ar" : language === "en" ? "en" : "id";
  }, [language]);
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized   = useAuthStore((s) => s.isInitialized);
  const needsBootstrap  = useAuthStore((s) => s.needsBootstrap);
  const location = useLocation();
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white/60 text-sm">
        Memuat sesi…
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (needsBootstrap) {
    return <Navigate to="/bootstrap" replace />;
  }
  return <>{children}</>;
}

function RequireRole({
  roles,
  children,
}: {
  roles: ReadonlyArray<"owner" | "staff" | "agent">;
  children: React.ReactNode;
}) {
  const user          = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white/60 text-sm">
        Memuat sesi…
      </div>
    );
  }
  if (!user || !roles.includes(user.role)) {
    const fallback =
      user?.role === "agent" ? "/agent" :
      user?.role === "staff" ? "/staff/dashboard" : "/";
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === "agent") return <Navigate to="/agent" replace />;
  if (user?.role === "staff") return <Navigate to="/staff/dashboard" replace />;
  return <Index />;
}

function AuthInitBootstrap() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return null;
}

function SyncStatusBootstrap() {
  useEffect(() => initSyncStatusListeners(), []);
  return null;
}

// ─── Suspense wrappers ─────────────────────────────────────────────────────────
// Semua halaman autentikasi menggunakan PageLoadingFallback (skeleton).
// Halaman publik menggunakan PublicPageLoadingFallback (spinner sederhana).

function Auth_() {
  return (
    <RouteErrorBoundary pageName="Bootstrap">
      <Suspense fallback={<PublicPageLoadingFallback />}><Auth /></Suspense>
    </RouteErrorBoundary>
  );
}
function Login_() {
  return (
    <RouteErrorBoundary pageName="Login">
      <Suspense fallback={<PublicPageLoadingFallback />}><Login /></Suspense>
    </RouteErrorBoundary>
  );
}
function PublicCheck_() {
  return (
    <RouteErrorBoundary pageName="Cek Tiket">
      <Suspense fallback={<PublicPageLoadingFallback />}><PublicCheck /></Suspense>
    </RouteErrorBoundary>
  );
}
function PublicLeaderboard_() {
  return (
    <RouteErrorBoundary pageName="Leaderboard Publik">
      <Suspense fallback={<PublicPageLoadingFallback />}><PublicLeaderboard /></Suspense>
    </RouteErrorBoundary>
  );
}
function PublicMemberCard_() {
  return (
    <RouteErrorBoundary pageName="Kartu Member">
      <Suspense fallback={<PublicPageLoadingFallback />}><PublicMemberCard /></Suspense>
    </RouteErrorBoundary>
  );
}
function PublicTicketPrices_() {
  return (
    <RouteErrorBoundary pageName="Harga Tiket">
      <Suspense fallback={<PublicPageLoadingFallback />}><PublicTicketPrices /></Suspense>
    </RouteErrorBoundary>
  );
}
function NotFound_() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PublicPageLoadingFallback />}><NotFound /></Suspense>
    </RouteErrorBoundary>
  );
}

/**
 * Membungkus halaman autentikasi dengan Suspense + RouteErrorBoundary.
 * Skeleton-nya muncul sementara chunk JS halaman diunduh.
 */
function P({
  name,
  children,
}: {
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <RouteErrorBoundary pageName={name}>
      <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <Routes location={location}>
      {/* ── Halaman Publik ── */}
      <Route path="/login"      element={<Login_ />} />
      <Route path="/bootstrap"  element={<Auth_ />} />
      <Route path="/cek"        element={<PublicCheck_ />} />
      <Route path="/cek/:code"  element={<PublicCheck_ />} />
      <Route path="/m/:slug"    element={<PublicMemberCard_ />} />
      <Route path="/leaderboard" element={<PublicLeaderboard_ />} />
      <Route path="/harga-tiket" element={<PublicTicketPrices_ />} />
      <Route path="/promo"      element={<PublicTicketPrices_ />} />
      <Route path="/prices"     element={<PublicTicketPrices_ />} />

      {/* ── Halaman Autentikasi ── */}
      <Route path="/" element={<RequireAuth><P name="Dashboard"><HomeRedirect /></P></RequireAuth>} />
      <Route path="/calculator" element={<RequireAuth><DashboardLayout><P name="Kalkulator"><Calculator /></P></DashboardLayout></RequireAuth>} />
      <Route path="/packages" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Paket"><Packages /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/packages/:id" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Detail Paket"><PackageDetail /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/progress" element={<Navigate to="/packages?tab=progress" replace />} />
      <Route path="/trips/:id" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Detail Trip"><TripDetail /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/trips/:id/jamaah/:jamaahId" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Profil Jamaah"><JamaahProfile /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/paket/:id" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Detail Trip"><TripDetail /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/paket/:id/jamaah/:jamaahId" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Profil Jamaah"><JamaahProfile /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/notes" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Catatan"><Notes /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/exports" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><P name="Export Center"><ExportCenter /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/clients" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Klien"><Clients /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/clients/:id" element={<RequireAuth><RequireRole roles={["owner", "agent", "staff"]}><DashboardLayout><P name="Klien"><Clients /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Order"><Orders /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/orders/detail/:id" element={<RequireAuth><DashboardLayout><P name="Detail Order"><OrderDetail /></P></DashboardLayout></RequireAuth>} />
      <Route path="/orders/:type" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Order"><Orders /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route
        path="/agent"
        element={
          <RequireAuth>
            <RequireRole roles={["agent"]}>
              <DashboardLayout><P name="Dashboard Agen"><AgentDashboard /></P></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/agent/profile"
        element={
          <RequireAuth>
            <RequireRole roles={["agent"]}>
              <DashboardLayout><P name="Profil Agen"><AgentProfile /></P></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/agent/leaderboard"
        element={
          <RequireAuth>
            <DashboardLayout><P name="Leaderboard"><AgentLeaderboard /></P></DashboardLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/agent/marketing"
        element={
          <RequireAuth>
            <DashboardLayout><P name="Marketing Kit"><AgentMarketingKit /></P></DashboardLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <RequireRole roles={["owner"]}>
              <DashboardLayout><P name="Laporan"><Reports /></P></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/agent-directory" element={<Navigate to="/agent-center" replace />} />
      <Route
        path="/agent-center"
        element={
          <RequireAuth>
            <RequireRole roles={["owner", "staff", "agent"]}>
              <DashboardLayout><P name="Agent Center"><AgentCommandCenter /></P></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/agents/:agentId"
        element={
          <RequireAuth>
            <RequireRole roles={["owner"]}>
              <DashboardLayout><P name="Profil Agen"><AgentProfileOwnerView /></P></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/bc-templates" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Template BC"><BCTemplates /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/itinerary" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Itinerary Generator"><ItineraryGenerator /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/demo-seed" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><P name="Demo Seed"><DemoSeed /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/ticket-prices" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><P name="Harga Tiket"><TicketPrices /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/visa-tracker" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><P name="Visa Tracker"><OwnerVisaTrackerPage /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/staff/dashboard" element={<RequireAuth><RequireRole roles={["staff"]}><DashboardLayout><P name="Dashboard Staff"><StaffDashboardPage /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/staff/visa" element={<RequireAuth><RequireRole roles={["staff"]}><DashboardLayout><P name="Visa Staff"><StaffVisaDashboard /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/staff/commission" element={<RequireAuth><RequireRole roles={["staff"]}><DashboardLayout><P name="Komisi Staff"><StaffCommissionPage /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/staff/profile" element={<RequireAuth><RequireRole roles={["staff"]}><DashboardLayout><P name="Profil Staff"><StaffProfile /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/staff-performance" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><P name="Manajemen Staff"><StaffManagementCenter /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route
        path="/staff/:staffId"
        element={
          <RequireAuth>
            <RequireRole roles={["owner"]}>
              <DashboardLayout><P name="Profil Staff"><StaffProfileOwnerView /></P></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/settings" element={<RequireAuth><DashboardLayout><P name="Pengaturan"><Settings /></P></DashboardLayout></RequireAuth>} />
      <Route path="/audit" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><P name="Audit Center"><AuditCenterPage /></P></DashboardLayout></RequireRole></RequireAuth>} />
      <Route path="/auth" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound_ />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppearanceBootstrap />
      <LangDirectionBootstrap />
      <AuthInitBootstrap />
      <SyncStatusBootstrap />
      <StoreBootstrap />
      <LoginAlertNotifier />
      <OfflineBar />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AnimatedRoutes />
        <PwaInstallPrompt />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
