import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// ── Local-only security settings (PIN/2FA + login history) ──────────────────

export interface SecuritySettings {
  twoFactor: boolean;
  loginAlert: boolean;
  pinHash?: string;
}
export interface LoginEvent { at: string; }

const securityKey = (uid: string) => `igh.auth.security.${uid}`;
const loginsKey   = (uid: string) => `igh.auth.logins.${uid}`;

async function sha(salt: string, val: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ":" + val);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashPin = (pin: string) => sha("igh-tour-pin-salt-2024", pin);

function loadSecuritySettings(uid: string): SecuritySettings {
  try {
    const raw = localStorage.getItem(securityKey(uid));
    return raw ? JSON.parse(raw) : { twoFactor: false, loginAlert: false };
  } catch { return { twoFactor: false, loginAlert: false }; }
}
function saveSecuritySettings(uid: string, s: SecuritySettings) {
  localStorage.setItem(securityKey(uid), JSON.stringify(s));
}
function loadLoginHistory(uid: string): LoginEvent[] {
  try {
    const raw = localStorage.getItem(loginsKey(uid));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function recordLoginEvent(uid: string) {
  const updated = [{ at: new Date().toISOString() }, ...loadLoginHistory(uid)].slice(0, 10);
  localStorage.setItem(loginsKey(uid), JSON.stringify(updated));
}

// ── Auth types ───────────────────────────────────────────────────────────────

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

// ── Supabase token helpers ───────────────────────────────────────────────────

export function getAccessToken(): string | null {
  // Supabase persists session in localStorage — retrieve it synchronously
  try {
    const raw = localStorage.getItem(
      `sb-${import.meta.env.VITE_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1]}-auth-token`,
    );
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Fetch agency membership via Supabase REST ────────────────────────────────

async function fetchAgencyMembership(userId: string, _accessToken: string): Promise<{
  role: UserRole; agencyId: string; agencyName: string; commissionPct: number;
} | null> {
  if (!supabase) return null;
  try {
    const { data: memberData, error: memberError } = await supabase
      .from("agency_members")
      .select("role, agency_id, commission_pct")
      .eq("user_id", userId)
      .limit(1)
      .single();
    if (memberError || !memberData) return null;

    let agencyName = "Agency";
    try {
      const { data: agencyData } = await supabase
        .from("agencies")
        .select("name")
        .eq("id", memberData.agency_id)
        .maybeSingle();
      if (agencyData?.name) agencyName = String(agencyData.name);
    } catch { /* use default name if agencies query fails */ }

    return {
      role:          memberData.role as UserRole,
      agencyId:      memberData.agency_id,
      agencyName,
      commissionPct: Number(memberData.commission_pct ?? 0),
    };
  } catch { return null; }
}

// ── Build AuthUser from Supabase session ─────────────────────────────────────

async function buildAuthUser(session: { access_token: string; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } }): Promise<AuthUser | null> {
  const sbUser = session.user;
  const meta   = sbUser.user_metadata ?? {};
  const displayName =
    (meta.full_name as string | undefined)?.trim() ||
    (meta.display_name as string | undefined)?.trim() ||
    sbUser.email?.split("@")[0] ||
    "User";

  const membership = await fetchAgencyMembership(sbUser.id, session.access_token);
  if (!membership) return null;

  return {
    id:              sbUser.id,
    email:           sbUser.email ?? "",
    displayName,
    role:            membership.role,
    agencyId:        membership.agencyId,
    agencyName:      membership.agencyName,
    commissionPct:   membership.commissionPct,
    profileImageUrl: (meta.avatar_url as string | undefined) ?? null,
  };
}

// ── API helpers (for invite/remove/list — still go through Express server) ───

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers ?? {}) as Record<string, string>),
  };
  const res  = await fetch(path, { credentials: "include", headers, ...options });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ok */ }
  if (!res.ok) {
    throw new Error((json.error as string) ?? (json.message as string) ?? text.slice(0, 300) ?? `HTTP ${res.status}`);
  }
  return json as T;
}

async function callApi(path: string, body: unknown): Promise<unknown> {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user:            null,
  isAuthenticated: false,
  isInitialized:   false,
  isLoading:       false,
  error:           null,
  pendingLoginUser: null,
  newLoginAt:      null,
  needsBootstrap:  false,

  // ── init: restore session from Supabase on app start ──────────────────────
  init: async () => {
    set({ isLoading: true });
    try {
      if (!supabase) {
        set({ isInitialized: true, isLoading: false });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
        return;
      }
      const user = await buildAuthUser(session);
      if (user) {
        recordLoginEvent(user.id);
        set({ user, isAuthenticated: true, needsBootstrap: false, isInitialized: true, isLoading: false });
      } else {
        // Authenticated in Supabase but no agency membership yet → needs bootstrap
        set({ user: null, isAuthenticated: false, needsBootstrap: true, isInitialized: true, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
    }
  },

  // ── login: Supabase email/password ────────────────────────────────────────
  login: async (email?: string, password?: string) => {
    if (!email || !password) {
      set({ error: "Email dan password wajib diisi." });
      return false;
    }
    if (!supabase) {
      set({ error: "Supabase belum dikonfigurasi." });
      return false;
    }
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        set({ isLoading: false, error: error?.message ?? "Login gagal." });
        return false;
      }
      const user = await buildAuthUser(data.session);
      if (!user) {
        // Logged in but no agency → bootstrap needed
        set({ isLoading: false, needsBootstrap: true });
        return false;
      }
      const sec = loadSecuritySettings(user.id);
      if (sec.twoFactor && sec.pinHash) {
        set({ pendingLoginUser: user, isLoading: false, error: null });
        return "needs_pin";
      }
      const previous  = loadLoginHistory(user.id);
      recordLoginEvent(user.id);
      const newLoginAt = sec.loginAlert && previous.length > 0 ? previous[0].at : null;
      set({ user, isAuthenticated: true, isLoading: false, error: null, newLoginAt, needsBootstrap: false });
      return "ok";
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
      return false;
    }
  },

  // ── completePinLogin ──────────────────────────────────────────────────────
  completePinLogin: async (pin) => {
    const { pendingLoginUser } = get();
    if (!pendingLoginUser) return false;
    set({ isLoading: true, error: null });
    const sec    = loadSecuritySettings(pendingLoginUser.id);
    const pinHash = await hashPin(pin);
    if (pinHash !== sec.pinHash) {
      set({ isLoading: false, error: "PIN salah." });
      return false;
    }
    const previous  = loadLoginHistory(pendingLoginUser.id);
    recordLoginEvent(pendingLoginUser.id);
    const newLoginAt = sec.loginAlert && previous.length > 0 ? previous[0].at : null;
    set({
      user:            pendingLoginUser,
      isAuthenticated: true,
      isLoading:       false,
      pendingLoginUser: null,
      newLoginAt,
      needsBootstrap:  false,
    });
    return true;
  },

  // ── logout: Supabase signOut ──────────────────────────────────────────────
  logout: async () => {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    set({
      user:            null,
      isAuthenticated: false,
      pendingLoginUser: null,
      newLoginAt:      null,
      needsBootstrap:  false,
    });
  },

  clearError:    () => set({ error: null }),
  clearNewLogin: () => set({ newLoginAt: null }),

  // ── inviteMember ─────────────────────────────────────────────────────────
  inviteMember: async (email, password, displayName, role = "staff", extra = {}) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa invite.");
    const result = await callApi("/api/invite-member", {
      email, password, displayName, role, ...extra,
    }) as { userId: string };
    return { userId: result.userId };
  },

  // ── removeMember ─────────────────────────────────────────────────────────
  removeMember: async (userId) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa hapus.");
    await callApi("/api/remove-member", { userId });
  },

  // ── listMembers ───────────────────────────────────────────────────────────
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
          userId:        m.user_id,
          email:         m.email || (isMe ? user.email : "—"),
          displayName,
          role:          m.role as UserRole,
          commissionPct: Number(m.commission_pct ?? 0) || 0,
          createdAt:     m.created_at,
          photoUrl:      m.profile_image_url ?? undefined,
          phoneWa:       m.phone_wa ?? null,
          agentNotes:    m.agent_notes ?? null,
        };
      });
    } catch { return []; }
  },

  // ── setMemberCommission ───────────────────────────────────────────────────
  setMemberCommission: async (userId: string, pct: number) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa atur komisi.");
    const clamped = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
    await apiFetch(`/api/agency-members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ commission_pct: clamped }),
    });
  },

  // ── changePassword: via Supabase ──────────────────────────────────────────
  changePassword: async (_currentPw, newPw) => {
    if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) throw new Error(error.message);
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

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentAgencyId(): string | null {
  return useAuthStore.getState().user?.agencyId ?? null;
}

export function requireAgencyId(): string {
  const id = getCurrentAgencyId();
  if (!id) throw new Error("Tidak ada agency aktif. Silakan login ulang.");
  return id;
}

export async function bootstrapFirstOwner(input: {
  agencyName: string; displayName?: string; email?: string; password?: string;
}): Promise<void> {
  const token = getAccessToken();
  const res = await fetch("/api/bootstrap", {
    method:  "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ agencyName: input.agencyName, displayName: input.displayName }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Bootstrap gagal");
}
