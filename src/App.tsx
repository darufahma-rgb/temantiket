import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { OfflineBar } from "@/components/OfflineBar";
import Index from "./pages/Index.tsx";
import Calculator from "./pages/Calculator";
import Packages from "./pages/Packages";
import PackageDetail from "./pages/PackageDetail";
import ProgressTracker from "./pages/ProgressTracker";
import TripDetail from "./pages/TripDetail";
import JamaahProfile from "./pages/JamaahProfile";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import PublicCheck from "./pages/PublicCheck";
import PublicLeaderboard from "./pages/PublicLeaderboard";
import PublicMemberCard from "./pages/PublicMemberCard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound.tsx";
import Notes from "./pages/Notes";
import ExportCenter from "./pages/ExportCenter";
import Clients from "./pages/Clients";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Reports from "./pages/Reports";
import AgentCommandCenter from "./pages/AgentCommandCenter";
import AgentDashboard from "./pages/AgentDashboard";
import AgentLeaderboard from "./pages/AgentLeaderboard";
import AgentMarketingKit from "./pages/AgentMarketingKit";
import BCTemplates from "./pages/BCTemplates";
import ItineraryGenerator from "./pages/ItineraryGenerator";
import DemoSeed from "./pages/DemoSeed";
import { useRatesStore } from "@/store/ratesStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useTripsStore } from "@/store/tripsStore";
import { useClientsStore } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useAuthStore } from "@/store/authStore";
import { useRegionalStore } from "@/store/regionalStore";
import { applyAppearanceSettings, loadAppearanceSettings } from "@/lib/appearance";
import { isSupabaseConfigured } from "@/lib/supabase";
import { startRealtimeSync } from "@/lib/supabaseRealtime";
import { initSyncStatusListeners } from "@/store/syncStatusStore";
import { toast } from "sonner";

const queryClient = new QueryClient();

function StoreBootstrap() {
  const refreshRates = useRatesStore((s) => s.refresh);
  const refreshPackages = usePackagesStore((s) => s.refresh);
  const fetchTrips = useTripsStore((s) => s.fetchTrips);
  const fetchClients = useClientsStore((s) => s.fetchClients);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    refreshRates();
    if (!isAuthenticated) return;
    void Promise.all([refreshPackages(), fetchTrips(), fetchClients(), fetchOrders()]);
  }, [refreshRates, refreshPackages, fetchTrips, fetchClients, fetchOrders, isAuthenticated]);

  // Realtime sync — subscribe perubahan dari device lain
  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured()) return;
    const unsubscribe = startRealtimeSync();
    return unsubscribe;
  }, [isAuthenticated]);

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

/**
 * Role guard — wajib dipake di luar `RequireAuth`. Kalo user authenticated
 * tapi role-nya bukan owner, redirect ke "/" (Dashboard) supaya halaman
 * sensitif kayak Laporan Keuangan gak bocor lewat link langsung.
 */
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
    // Agent yg coba akses route owner/staff → bounce ke dashboard agent.
    // Owner/staff yg coba akses /agent → bounce ke /.
    const fallback = user?.role === "agent" ? "/agent" : "/";
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

/**
 * Index redirect — kalau user role 'agent' landing di '/', auto-redirect
 * ke '/agent' (Mitra Dashboard). Owner/staff biasa render Index normal.
 */
function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === "agent") return <Navigate to="/agent" replace />;
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

      <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
      <Route path="/calculator" element={<RequireAuth><DashboardLayout><Calculator /></DashboardLayout></RequireAuth>} />
      <Route path="/packages" element={<RequireAuth><DashboardLayout><Packages /></DashboardLayout></RequireAuth>} />
      <Route path="/packages/:id" element={<RequireAuth><DashboardLayout><PackageDetail /></DashboardLayout></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><DashboardLayout><ProgressTracker /></DashboardLayout></RequireAuth>} />
      <Route path="/trips/:id" element={<RequireAuth><DashboardLayout><TripDetail /></DashboardLayout></RequireAuth>} />
      <Route path="/trips/:id/jamaah/:jamaahId" element={<RequireAuth><DashboardLayout><JamaahProfile /></DashboardLayout></RequireAuth>} />
      {/* Alias /paket — terminologi UI sesuai sidebar "Paket Trip" */}
      <Route path="/paket/:id" element={<RequireAuth><DashboardLayout><TripDetail /></DashboardLayout></RequireAuth>} />
      <Route path="/paket/:id/jamaah/:jamaahId" element={<RequireAuth><DashboardLayout><JamaahProfile /></DashboardLayout></RequireAuth>} />
      <Route path="/notes" element={<RequireAuth><DashboardLayout><Notes /></DashboardLayout></RequireAuth>} />
      <Route path="/exports" element={<RequireAuth><DashboardLayout><ExportCenter /></DashboardLayout></RequireAuth>} />
      {/* ── Order Hub ── */}
      <Route path="/clients" element={<RequireAuth><DashboardLayout><Clients /></DashboardLayout></RequireAuth>} />
      <Route path="/clients/:id" element={<RequireAuth><DashboardLayout><Clients /></DashboardLayout></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><DashboardLayout><Orders /></DashboardLayout></RequireAuth>} />
      <Route path="/orders/detail/:id" element={<RequireAuth><DashboardLayout><OrderDetail /></DashboardLayout></RequireAuth>} />
      <Route path="/orders/:type" element={<RequireAuth><DashboardLayout><Orders /></DashboardLayout></RequireAuth>} />
      {/* ── Agent-only: Mitra Dashboard ── */}
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
        path="/agent/leaderboard"
        element={
          <RequireAuth>
            <RequireRole roles={["agent"]}>
              <DashboardLayout><AgentLeaderboard /></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/agent/marketing"
        element={
          <RequireAuth>
            <RequireRole roles={["agent"]}>
              <DashboardLayout><AgentMarketingKit /></DashboardLayout>
            </RequireRole>
          </RequireAuth>
        }
      />
      {/* ── Owner-only: Laporan Keuangan ── */}
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
      {/* ── Owner-only: Agent Command Center ── */}
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
      <Route path="/bc-templates" element={<RequireAuth><DashboardLayout><BCTemplates /></DashboardLayout></RequireAuth>} />
      <Route path="/itinerary" element={<RequireAuth><DashboardLayout><ItineraryGenerator /></DashboardLayout></RequireAuth>} />
      <Route path="/demo-seed" element={<RequireAuth><DashboardLayout><DemoSeed /></DashboardLayout></RequireAuth>} />
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
