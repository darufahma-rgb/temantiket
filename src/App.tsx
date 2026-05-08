import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { OfflineBar } from "@/components/OfflineBar";
import { useRatesStore } from "@/store/ratesStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useTripsStore } from "@/store/tripsStore";
import { useClientsStore } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useAuthStore } from "@/store/authStore";
import { useRegionalStore } from "@/store/regionalStore";
import { applyAppearanceSettings, loadAppearanceSettings, pullAppearanceSettings } from "@/lib/appearance";
import { isSupabaseConfigured } from "@/lib/supabase";
import { startRealtimeSync } from "@/lib/supabaseRealtime";
import { initSyncStatusListeners } from "@/store/syncStatusStore";
import { toast } from "sonner";
import { pullIghAdminSettings } from "@/lib/ighSettings";
import { pullBannerTheme } from "@/lib/bannerTheme";
import { pullProductCommissions } from "@/lib/productCommissions";
import { pullMarkup } from "@/features/ticketPrices/ticketPricesRepo";

import Index from "./pages/Index";
import Calculator from "./pages/Calculator";
import Packages from "./pages/Packages";
import PackageDetail from "./pages/PackageDetail";
import TripDetail from "./pages/TripDetail";
import JamaahProfile from "./pages/JamaahProfile";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import PublicCheck from "./pages/PublicCheck";
import PublicLeaderboard from "./pages/PublicLeaderboard";
import PublicMemberCard from "./pages/PublicMemberCard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Notes from "./pages/Notes";
import ExportCenter from "./pages/ExportCenter";
import Clients from "./pages/Clients";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Reports from "./pages/Reports";
import AgentCommandCenter from "./pages/AgentCommandCenter";
import AgentDashboard from "./pages/AgentDashboard";
import AgentProfile from "./pages/AgentProfile";
import AgentProfileOwnerView from "./pages/AgentProfileOwnerView";
import AgentLeaderboard from "./pages/AgentLeaderboard";
import AgentMarketingKit from "./pages/AgentMarketingKit";
import BCTemplates from "./pages/BCTemplates";
import ItineraryGenerator from "./pages/ItineraryGenerator";
import DemoSeed from "./pages/DemoSeed";
import TicketPrices from "./pages/TicketPrices";
import PublicTicketPrices from "./pages/PublicTicketPrices";
import StaffVisaDashboard from "./pages/StaffVisaDashboard";
import OwnerVisaTrackerPage from "./pages/OwnerVisaTrackerPage";
import StaffProfileOwnerView from "./pages/StaffProfileOwnerView";

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
  const refreshRates   = useRatesStore((s) => s.refresh);
  const pullRates      = useRatesStore((s) => s.pullFromCloud);
  const refreshPackages = usePackagesStore((s) => s.refresh);
  const fetchTrips     = useTripsStore((s) => s.fetchTrips);
  const fetchClients   = useClientsStore((s) => s.fetchClients);
  const fetchOrders    = useOrdersStore((s) => s.fetchOrders);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user           = useAuthStore((s) => s.user);

  useEffect(() => {
    refreshRates();
    if (!isAuthenticated || !isSupabaseConfigured()) return;
    void Promise.all([
      refreshPackages(),
      fetchTrips(),
      fetchClients(),
      fetchOrders(),
      pullIghAdminSettings(),
      pullBannerTheme(),
      pullProductCommissions(),
      pullMarkup(),
      pullRates(),
      user?.id ? pullAppearanceSettings(user.id) : Promise.resolve(),
    ]);
  }, [refreshRates, refreshPackages, fetchTrips, fetchClients, fetchOrders, isAuthenticated, user?.id, pullRates]);

  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured() || !user?.agencyId) return;
    const unsubscribe = startRealtimeSync(user.agencyId);
    return unsubscribe;
  }, [isAuthenticated, user?.agencyId]);

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
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const needsBootstrap = useAuthStore((s) => s.needsBootstrap);
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
  const user = useAuthStore((s) => s.user);
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
      user?.role === "staff" ? "/staff/visa" : "/";
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === "agent") return <Navigate to="/agent" replace />;
  if (user?.role === "staff") return <Navigate to="/staff/visa" replace />;
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

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <Routes location={location}>
        <Route path="/login" element={<Login />} />
        <Route path="/bootstrap" element={<Auth />} />
        <Route path="/cek" element={<PublicCheck />} />
        <Route path="/cek/:code" element={<PublicCheck />} />
        <Route path="/m/:slug" element={<PublicMemberCard />} />
        <Route path="/leaderboard" element={<PublicLeaderboard />} />
        <Route path="/harga-tiket" element={<PublicTicketPrices />} />
        <Route path="/promo" element={<PublicTicketPrices />} />
        <Route path="/prices" element={<PublicTicketPrices />} />

        <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
        <Route path="/calculator" element={<RequireAuth><DashboardLayout><Calculator /></DashboardLayout></RequireAuth>} />
        <Route path="/packages" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><Packages /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/packages/:id" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><PackageDetail /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/progress" element={<Navigate to="/packages?tab=progress" replace />} />
        <Route path="/trips/:id" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><TripDetail /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/trips/:id/jamaah/:jamaahId" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><JamaahProfile /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/paket/:id" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><TripDetail /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/paket/:id/jamaah/:jamaahId" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><JamaahProfile /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/notes" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><Notes /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/exports" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><ExportCenter /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/clients" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><Clients /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/clients/:id" element={<RequireAuth><RequireRole roles={["owner", "agent", "staff"]}><DashboardLayout><Clients /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><Orders /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/orders/detail/:id" element={<RequireAuth><DashboardLayout><OrderDetail /></DashboardLayout></RequireAuth>} />
        <Route path="/orders/:type" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><Orders /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route
          path="/agent"
          element={
            <RequireAuth>
              <RequireRole roles={["agent"]}>
                <DashboardLayout><AgentDashboard /></DashboardLayout>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/agent/profile"
          element={
            <RequireAuth>
              <RequireRole roles={["agent"]}>
                <DashboardLayout><AgentProfile /></DashboardLayout>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/agent/leaderboard"
          element={
            <RequireAuth>
              <DashboardLayout><AgentLeaderboard /></DashboardLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/agent/marketing"
          element={
            <RequireAuth>
              <DashboardLayout><AgentMarketingKit /></DashboardLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <RequireRole roles={["owner"]}>
                <DashboardLayout><Reports /></DashboardLayout>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/agent-directory" element={<Navigate to="/agent-center" replace />} />
        <Route
          path="/agent-center"
          element={
            <RequireAuth>
              <RequireRole roles={["owner"]}>
                <DashboardLayout><AgentCommandCenter /></DashboardLayout>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/agents/:agentId"
          element={
            <RequireAuth>
              <RequireRole roles={["owner"]}>
                <DashboardLayout><AgentProfileOwnerView /></DashboardLayout>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/bc-templates" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><BCTemplates /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/itinerary" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><ItineraryGenerator /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/demo-seed" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><DemoSeed /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/ticket-prices" element={<RequireAuth><RequireRole roles={["owner", "agent"]}><DashboardLayout><TicketPrices /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/visa-tracker" element={<RequireAuth><RequireRole roles={["owner"]}><DashboardLayout><OwnerVisaTrackerPage /></DashboardLayout></RequireRole></RequireAuth>} />
        <Route path="/staff/visa" element={<RequireAuth><DashboardLayout><StaffVisaDashboard /></DashboardLayout></RequireAuth>} />
        <Route
          path="/staff/:staffId"
          element={
            <RequireAuth>
              <RequireRole roles={["owner"]}>
                <DashboardLayout><StaffProfileOwnerView /></DashboardLayout>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/settings" element={<RequireAuth><DashboardLayout><Settings /></DashboardLayout></RequireAuth>} />
        <Route path="/auth" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
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
