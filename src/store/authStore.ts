import { create } from "zustand";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

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
  /** Komisi % per-agent (0 utk owner/staff). */
  commissionPct: number;
}

export interface MemberInfo {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  /** Komisi % — dipake utk hitung profit bersih agent di Reports. */
  commissionPct: number;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  pendingLoginUser: AuthUser | null;
  newLoginAt: string | null;
  needsBootstrap: boolean; // session ada tapi belum punya agency

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<"ok" | "needs_pin" | false>;
  completePinLogin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearNewLogin: () => void;

  // Tenant management (owner only)
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

  // Self
  changePassword: (newPassword: string) => Promise<void>;
  getSecuritySettings: () => SecuritySettings;
  updateSecuritySettings: (partial: Partial<SecuritySettings>) => void;
  setupPin: (pin: string) => Promise<void>;
  getLoginHistory: () => LoginEvent[];
}

async function loadCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data: sess } = await supabase.auth.getSession();
  const session = sess.session;
  if (!session) return null;

  // Single round-trip: fetch membership + nested agency via FK relationship.
  // Falls back to a 2-query path if the embedded select fails (e.g. FK belum
  // diset di schema atau hint-nya beda).
  let agencyId: string | null = null;
  let agencyName = "Agency";
  let role: UserRole = "staff";
  let commissionPct = 0;

  const { data: joined, error: joinErr } = await supabase
    .from("agency_members")
    .select("agency_id, role, commission_pct, agencies(id, name)")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!joinErr && joined) {
    agencyId = (joined as { agency_id: string }).agency_id;
    role = ((joined as { role: string }).role as UserRole) ?? "staff";
    commissionPct = Number((joined as { commission_pct?: number }).commission_pct ?? 0) || 0;
    const a = (joined as { agencies?: { id: string; name: string } | { id: string; name: string }[] }).agencies;
    const agencyRow = Array.isArray(a) ? a[0] : a;
    if (agencyRow?.name) agencyName = agencyRow.name;
  } else {
    // Fallback ke 2-query path. `commission_pct` mungkin belum di-migrate.
    const { data: membership } = await supabase
      .from("agency_members").select("agency_id, role, commission_pct").eq("user_id", session.user.id).maybeSingle();
    if (!membership) return null;
    agencyId = membership.agency_id;
    role = (membership.role as UserRole) ?? "staff";
    commissionPct = Number((membership as { commission_pct?: number }).commission_pct ?? 0) || 0;
    const { data: agency } = await supabase
      .from("agencies").select("id, name").eq("id", membership.agency_id).maybeSingle();
    if (agency?.name) agencyName = agency.name;
  }

  if (!agencyId) return null;

  // Resolve displayName dgn priority:
  //   1. public.profiles.full_name (otoritatif, di-update via Settings)
  //   2. auth.users.user_metadata.display_name (di-set saat invite/bootstrap)
  //   3. email prefix sbg fallback terakhir
  const meta = (session.user.user_metadata ?? {}) as { display_name?: string };
  let displayName = meta.display_name?.trim() || session.user.email?.split("@")[0] || "User";
  try {
    const { data: profile } = await supabase
      .from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
    const fn = (profile as { full_name?: string } | null)?.full_name?.trim();
    if (fn) displayName = fn;
  } catch {
    // Profile table mungkin belum di-migrate — fallback ke metadata aja.
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    displayName,
    role,
    agencyId,
    agencyName,
    commissionPct,
  };
}

async function callEdgeFunction(name: string, body: unknown, accessToken?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`/api/${name}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: { error?: string; message?: string; msg?: string } = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }
  if (!res.ok) {
    const serverMsg = json.error ?? json.message ?? json.msg ?? text.slice(0, 200);
    if (res.status === 401) {
      throw new Error(
        serverMsg
          ? `Sesi expired / token invalid (401): ${serverMsg}. Coba logout lalu login ulang.`
          : `Sesi expired / token invalid (401). Coba logout lalu login ulang.`,
      );
    }
    throw new Error(serverMsg || `Gagal menghubungi server (${res.status})`);
  }
  return json;
}

// Ambil access_token yg fresh — refresh dulu kalo session-nya udah deket
// expiry, supaya Supabase gateway gak nolak 401 di Edge Function call.
async function getFreshAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data: sess } = await supabase.auth.getSession();
  const session = sess.session;
  if (!session) return null;

  // expires_at = unix seconds. Kalau < 60 detik lagi expire, refresh dulu.
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt && expiresAt - nowSec < 60) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) return session.access_token; // fallback ke token lama
    return refreshed.session?.access_token ?? session.access_token;
  }
  return session.access_token;
}

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
    if (!supabase) { set({ isInitialized: true }); return; }
    const user = await loadCurrentUser();
    if (user) {
      set({ user, isAuthenticated: true, needsBootstrap: false, isInitialized: true });
    } else {
      const { data: sess } = await supabase.auth.getSession();
      set({
        user: null,
        isAuthenticated: false,
        needsBootstrap: !!sess.session, // logged in tapi belum di agency
        isInitialized: true,
      });
    }
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        set({ user: null, isAuthenticated: false, needsBootstrap: false });
        return;
      }
      const u = await loadCurrentUser();
      if (u) set({ user: u, isAuthenticated: true, needsBootstrap: false });
      else set({ user: null, isAuthenticated: false, needsBootstrap: true });
    });
  },

  login: async (email, password) => {
    if (!supabase) { set({ error: "Supabase belum dikonfigurasi" }); return false; }
    set({ isLoading: true, error: null });
    // Hard timeout: kalau koneksi hang >10 detik, kasih error biar gak stuck.
    const loginPromise = supabase.auth.signInWithPassword({ email, password });
    const timeout = new Promise<{ data: { session: null }; error: { message: string } }>((res) =>
      setTimeout(() => res({ data: { session: null }, error: { message: "Koneksi lambat — coba lagi." } }), 10000),
    );
    const { data, error } = (await Promise.race([loginPromise, timeout])) as Awaited<typeof loginPromise>;
    if (error || !data.session) {
      set({ isLoading: false, error: error?.message ?? "Email/password salah." });
      return false;
    }
    const user = await loadCurrentUser();
    if (!user) {
      set({ isLoading: false, needsBootstrap: true, isAuthenticated: false, user: null });
      return "ok";
    }
    const sec = loadSecuritySettings(user.id);
    if (sec.twoFactor && sec.pinHash) {
      set({ isLoading: false, pendingLoginUser: user });
      return "needs_pin";
    }
    const previous = loadLoginHistory(user.id);
    recordLoginEvent(user.id);
    const newLoginAt = sec.loginAlert && previous.length > 0 ? previous[0].at : null;
    set({ user, isAuthenticated: true, isLoading: false, newLoginAt, needsBootstrap: false });
    return "ok";
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
    if (supabase) await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false, error: null, pendingLoginUser: null, newLoginAt: null, needsBootstrap: false });
  },

  clearError: () => set({ error: null }),
  clearNewLogin: () => set({ newLoginAt: null }),

  inviteMember: async (email, password, displayName, role = "staff", extra = {}) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa invite.");
    const token = await getFreshAccessToken();
    if (!token) throw new Error("Session tidak valid — login ulang dulu.");
    const result = await callEdgeFunction("invite-member", {
      email, password, displayName, role, ...extra,
    }, token) as { userId: string };
    return { userId: result.userId };
  },

  removeMember: async (userId) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa hapus.");
    const token = await getFreshAccessToken();
    if (!token) throw new Error("Session tidak valid — login ulang dulu.");
    await callEdgeFunction("remove-member", { userId }, token);
  },

  listMembers: async () => {
    const { user } = get();
    if (!user || !supabase) return [];

    // 1. Ambil member rows dari agency_members
    const { data: members, error } = await supabase
      .from("agency_members").select("user_id, role, commission_pct, created_at")
      .eq("agency_id", user.agencyId);
    if (error) throw error;

    const rows = members ?? [];
    if (rows.length === 0) return [];

    // 2. Bulk-fetch profile rows (full_name + email) untuk semua user_id di
    //    agency ini. RLS udah ngebolehin baca profile sesama agency.
    const userIds = rows.map((r) => r.user_id);
    const profilesById = new Map<string, { full_name: string; email: string }>();
    try {
      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name, email").in("id", userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        profilesById.set(p.id, {
          full_name: (p.full_name ?? "").trim(),
          email: (p.email ?? "").trim(),
        });
      }
    } catch {
      // Profile table belum di-migrate — fallback graceful di bawah.
    }

    return rows.map((m) => {
      const prof = profilesById.get(m.user_id);
      const isMe = m.user_id === user.id;
      // Resolve displayName: profile.full_name → (kalau aku) my own displayName
      // → fallback ke "User <prefix>" supaya tetep punya identifier.
      const displayName =
        prof?.full_name ||
        (isMe ? user.displayName : `User ${m.user_id.slice(0, 8)}`);
      const email =
        prof?.email ||
        (isMe ? user.email : "—");
      return {
        userId: m.user_id,
        email,
        displayName,
        role: m.role as UserRole,
        commissionPct: Number((m as { commission_pct?: number }).commission_pct ?? 0) || 0,
        createdAt: m.created_at,
      };
    });
  },

  /** Owner-only: update commission_pct utk seorang agent. */
  setMemberCommission: async (userId: string, pct: number) => {
    const { user } = get();
    if (!user || user.role !== "owner") throw new Error("Hanya owner yang bisa atur komisi.");
    if (!supabase) throw new Error("Supabase belum dikonfigurasi");
    const clamped = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
    const { error } = await supabase
      .from("agency_members")
      .update({ commission_pct: clamped })
      .eq("agency_id", user.agencyId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  changePassword: async (newPassword) => {
    if (!supabase) throw new Error("Supabase belum dikonfigurasi");
    if (newPassword.length < 8) throw new Error("Password minimal 8 karakter.");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
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

// Helper buat dipanggil di repo layer
export function getCurrentAgencyId(): string | null {
  return useAuthStore.getState().user?.agencyId ?? null;
}

export function requireAgencyId(): string {
  const id = getCurrentAgencyId();
  if (!id) throw new Error("Tidak ada agency aktif. Silakan login ulang.");
  return id;
}

// Bootstrap helper (dipanggil dari Auth/Bootstrap page)
export async function bootstrapFirstOwner(input: {
  email: string; password: string; agencyName: string; displayName?: string;
}): Promise<void> {
  await callEdgeFunction("bootstrap", input);
}
