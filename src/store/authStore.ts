import { create } from "zustand";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Local-only security settings (PIN/2FA + login history) ──────────────────

export interface SecuritySettings {
  twoFactor: boolean;
  loginAlert: boolean;
  pinHash?: string;
}
export interface LoginEvent { at: string; }

const securityKey = (uid: string) => `igh.auth.security.${uid}`;
const loginsKey = (uid: string) => `igh.auth.logins.${uid}`;

async function sha(salt: string, val: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ":" + val);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashPin = (pin: string) => sha("igh-tour-pin-salt-2024", pin);

function loadSecuritySettings(uid: string): SecuritySettings {
  try { const raw = localStorage.getItem(securityKey(uid));
    return raw ? JSON.parse(raw) : { twoFactor: false, loginAlert: false };
  } catch { return { twoFactor: false, loginAlert: false }; }
}
function saveSecuritySettings(uid: string, s: SecuritySettings) {
  localStorage.setItem(securityKey(uid), JSON.stringify(s));
}
function loadLoginHistory(uid: string): LoginEvent[] {
  try { const raw = localStorage.getItem(loginsKey(uid));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function recordLoginEvent(uid: string) {
  const updated = [{ at: new Date().toISOString() }, ...loadLoginHistory(uid)].slice(0, 10);
  localStorage.setItem(loginsKey(uid), JSON.stringify(updated));
}

// ── Auth types ──────────────────────────────────────────────────────────────

export type UserRole = "owner" | "staff" | "agent";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  agencyId: string;
  agencyName: string;
  commissionPct: number;
  profileImageUrl?: string | null;
}

export interface MemberInfo {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  commissionPct: number;
  createdAt: string;
  photoUrl?: string;
  phoneWa?: string | null;
  agentNotes?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  pendingLoginUser: AuthUser | null;
  newLoginAt: string | null;
  needsBootstrap: boolean;

  init: () => Promise<void>;
  login: (email?: string, password?: string) => Promise<"ok" | "needs_pin" | false>;
  completePinLogin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearNewLogin: () => void;

  inviteMember: (
    email: string,
    password: string,
    displayName: string,
    role?: UserRole,
    extra?: { commissionPct?: number; whatsappNumber?: string; agentStatus?: "active" | "inactive"; agentNotes?: string },
  ) => Promise<{ userId: string }>;
  removeMember: (userId: string) => Promise<void>;
  listMembers: () => Promise<MemberInfo[]>;
  setMemberCommission: (userId: string, pct: number) => Promise<void>;

  changePassword: (currentPw: string, newPw: string) => Promise<void>;
  getSecuritySettings: () => SecuritySettings;
  updateSecuritySettings: (partial: Partial<SecuritySettings>) => void;
  setupPin: (pin: string) => Promise<void>;
  getLoginHistory: () => LoginEvent[];
}

// ── Module-level token cache (kept in sync with Supabase session) ────────────

let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

// Subscribe to Supabase auth state changes to keep token fresh
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    _accessToken = session?.access_token ?? null;
  });
}

// ── API helpers ─────────────────────────────────────────────────────────────

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return headers;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: buildHeaders((options?.headers ?? {}) as Record<string, string>),
    ...options,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ok */ }
  if (!res.ok) {
    throw new Error((json.error as string) ?? (json.message as string) ?? text.slice(0, 300) ?? `HTTP ${res.status}`);
  }
  return json as T;
}

// ── fetchCurrentUser via /api/auth/user ──────────────────────────────────────
//
// Selalu memanggil /api/auth/user dengan Bearer token Supabase.
// Server-side handler melakukan safe-linking akun lama berdasarkan email
// bila user_id di agency_members berbeda dengan Supabase JWT sub.
// Ini menghindari query langsung ke tabel Supabase dari frontend yang
// berpotensi gagal karena RLS atau user_id lama (dari Replit bootstrap).

async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!_accessToken) return null;
  try {
    const data = await apiFetch<{
      id: string; email: string; displayName: string;
      role: UserRole | null; agencyId: string | null; agencyName: string | null;
      commissionPct: number; profileImageUrl?: string | null;
      code?: string;
    }>("/api/auth/user");
    if (!data.agencyId || !data.role) return null;
    return {
      id: data.id,
      email: data.email ?? "",
      displayName: data.displayName ?? data.email?.split("@")[0] ?? "User",
      role: data.role,
      agencyId: data.agencyId,
      agencyName: data.agencyName ?? "Agency",
      commissionPct: data.commissionPct ?? 0,
      profileImageUrl: data.profileImageUrl ?? null,
    };
  } catch {
    return null;
  }
}

async function callApi(path: string, body: unknown): Promise<unknown> {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

// ── Friendly error messages ─────────────────────────────────────────────────

function translateSupabaseError(msg: string): string {
  if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Email atau password salah. Silakan periksa kembali.";
  }
  if (msg.includes("Email not confirmed")) {
    return "Email belum dikonfirmasi. Cek inbox Anda dan klik link verifikasi.";
  }
  if (msg.includes("Too many requests") || msg.includes("rate limit")) {
    return "Terlalu banyak percobaan login. Coba lagi beberapa saat.";
  }
  if (msg.includes("User not found")) {
    return "Akun tidak ditemukan. Periksa kembali email Anda.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.";
  }
  return msg;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,
  pendingLoginUser: null,
  newLoginAt: null,
  needsBootstrap: false,

  init: async () => {
    set({ isLoading: true });
    try {
      if (isSupabaseConfigured() && supabase) {
        // Restore existing Supabase session from localStorage
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          _accessToken = session.access_token;
          const user = await fetchCurrentUser();
          if (user) {
            recordLoginEvent(user.id);
            set({ user, isAuthenticated: true, needsBootstrap: false, isInitialized: true, isLoading: false });
            return;
          } else {
            // Logged in to Supabase but no agency/membership — needs bootstrap
            set({ user: null, isAuthenticated: false, needsBootstrap: true, isInitialized: true, isLoading: false });
            return;
          }
        }
      }
      // No session or Supabase not configured — go to login page
      set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
    }
  },

  login: async (email?: string, password?: string) => {
    if (!email?.trim() || !password?.trim()) {
      set({ error: "Email dan password wajib diisi.", isLoading: false });
      return false;
    }

    if (!isSupabaseConfigured() || !supabase) {
      set({ error: "Supabase belum dikonfigurasi. Hubungi administrator.", isLoading: false });
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        set({ isLoading: false, error: translateSupabaseError(authError.message) });
        return false;
      }

      _accessToken = authData.session?.access_token ?? null;

      const user = await fetchCurrentUser();

      if (!user) {
        // Authenticated with Supabase but no agency membership
        set({ isLoading: false, isInitialized: true, needsBootstrap: true, isAuthenticated: false });
        return false;
      }

      // Check local 2FA / PIN
      const sec = loadSecuritySettings(user.id);
      if (sec.twoFactor && sec.pinHash) {
        set({ pendingLoginUser: user, isLoading: false, error: null });
        return "needs_pin";
      }

      const previous = loadLoginHistory(user.id);
      recordLoginEvent(user.id);
      const newLoginAt = sec.loginAlert && previous.length > 0 ? previous[0].at : null;
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        newLoginAt,
        needsBootstrap: false,
      });
      return "ok";
    } catch (e) {
      set({ isLoading: false, error: translateSupabaseError((e as Error).message) });
      return false;
    }
  },

  completePinLogin: async (pin) => {
    const { pendingLoginUser } = get();
    if (!pendingLoginUser) return false;
    set({ isLoading: true, error: null });
    const sec = loadSecuritySettings(pendingLoginUser.id);
    const pinHash = await hashPin(pin);
    if (pinHash !== sec.pinHash) {
      set({ isLoading: false, error: "PIN salah." });
      return false;
    }
    const previous = loadLoginHistory(pendingLoginUser.id);
    recordLoginEvent(pendingLoginUser.id);
    const newLoginAt = sec.loginAlert && previous.length > 0 ? previous[0].at : null;
    set({
      user: pendingLoginUser, isAuthenticated: true,
      isLoading: false, pendingLoginUser: null, newLoginAt, needsBootstrap: false,
    });
    return true;
  },

  logout: async () => {
    _accessToken = null;
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut().catch(() => { /* ignore errors */ });
    }
    set({
      user: null,
      isAuthenticated: false,
      pendingLoginUser: null,
      newLoginAt: null,
      needsBootstrap: false,
    });
  },

  clearError: () => set({ error: null }),
  clearNewLogin: () => set({ newLoginAt: null }),

  inviteMember: async (email, password, displayName, role = "staff", extra = {}) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa invite.");
    const result = await callApi("/api/invite-member", {
      email, password, displayName, role, ...extra,
    }) as { userId: string };
    return { userId: result.userId };
  },

  removeMember: async (userId) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa hapus.");
    await callApi("/api/remove-member", { userId });
  },

  listMembers: async () => {
    const { user } = get();
    if (!user) return [];
    try {
      const rows = await apiFetch<Array<{
        user_id: string; role: string; commission_pct: number; created_at: string;
        email: string | null; first_name: string | null; last_name: string | null;
        profile_image_url: string | null; phone_wa: string | null; agent_notes: string | null;
      }>>("/api/agency-members");
      return rows.map((m) => {
        const isMe = m.user_id === user.id;
        const displayName =
          [m.first_name, m.last_name].filter(Boolean).join(" ") ||
          (isMe ? user.displayName : `User ${m.user_id.slice(0, 8)}`);
        return {
          userId: m.user_id,
          email: m.email || (isMe ? user.email : "—"),
          displayName,
          role: m.role as UserRole,
          commissionPct: Number(m.commission_pct ?? 0) || 0,
          createdAt: m.created_at,
          photoUrl: m.profile_image_url ?? undefined,
          phoneWa: m.phone_wa ?? null,
          agentNotes: m.agent_notes ?? null,
        };
      });
    } catch { return []; }
  },

  setMemberCommission: async (userId: string, pct: number) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa atur komisi.");
    const clamped = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
    await apiFetch(`/api/agency-members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ commission_pct: clamped }),
    });
  },

  changePassword: async (_currentPw, newPw) => {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error("Ganti password tidak tersedia karena Supabase belum dikonfigurasi.");
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) throw new Error(translateSupabaseError(error.message));
  },

  getSecuritySettings: () => {
    const { user } = get();
    if (!user) return { twoFactor: false, loginAlert: false };
    return loadSecuritySettings(user.id);
  },

  updateSecuritySettings: (partial) => {
    const { user } = get();
    if (!user) return;
    saveSecuritySettings(user.id, { ...loadSecuritySettings(user.id), ...partial });
  },

  setupPin: async (pin) => {
    const { user } = get();
    if (!user) throw new Error("Tidak ada pengguna yang login.");
    const pinHash = await hashPin(pin);
    saveSecuritySettings(user.id, { ...loadSecuritySettings(user.id), pinHash });
  },

  getLoginHistory: () => {
    const { user } = get();
    if (!user) return [];
    return loadLoginHistory(user.id);
  },
}));

// ── Helpers buat dipanggil di repo layer ─────────────────────────────────────

export function getCurrentAgencyId(): string | null {
  return useAuthStore.getState().user?.agencyId ?? null;
}

export function requireAgencyId(): string {
  const id = getCurrentAgencyId();
  if (!id) throw new Error("Tidak ada agency aktif. Silakan login ulang.");
  return id;
}

// Bootstrap helper — creates agency + membership for a new user.
export async function bootstrapFirstOwner(input: {
  agencyName: string; displayName?: string; email?: string; password?: string;
}): Promise<void> {
  // If Supabase configured and email/password provided, sign up first
  if (isSupabaseConfigured() && supabase && input.email && input.password) {
    const { error: signUpError } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { display_name: input.displayName } },
    });
    if (signUpError && !signUpError.message.includes("already registered")) {
      throw new Error(signUpError.message);
    }
    // Sign in to get token
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signInError) throw new Error(signInError.message);
    _accessToken = signInData.session?.access_token ?? null;
  }

  const res = await fetch("/api/bootstrap", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(_accessToken ? { "Authorization": `Bearer ${_accessToken}` } : {}),
    },
    body: JSON.stringify({ agencyName: input.agencyName, displayName: input.displayName }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Bootstrap gagal");
}
