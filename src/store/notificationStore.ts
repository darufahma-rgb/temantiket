/**
 * notificationStore — Sistem notifikasi internal realtime Temantiket.
 *
 * Features:
 * - Fetch notifikasi dari tabel `notifications`
 * - Realtime INSERT listener per-user via Supabase channel
 * - Mark read (single & all), delete (single & all)
 * - Notification settings (trip_reminder, new_message, dll) persisted ke DB
 * - sendBroadcast: owner insert notif ke multiple users dalam satu panggilan
 *
 * Graceful degradation: jika tabel belum ada (42P01), store tetap berfungsi
 * dengan state kosong tanpa crash.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type NotifType     = "info" | "success" | "warning" | "urgent";
export type NotifCategory =
  | "trip_reminder" | "new_message" | "payment" | "weekly_report"
  | "promo" | "task" | "broadcast" | "system";
export type NotifPriority = "normal" | "important" | "urgent";

export interface AppNotification {
  id:          string;
  user_id:     string;
  agency_id:   string;
  title:       string;
  message:     string;
  type:        NotifType;
  category:    NotifCategory;
  priority:    NotifPriority;
  is_read:     boolean;
  action_url?: string | null;
  created_by?: string | null;
  created_at:  string;
}

export interface NotifSettings {
  trip_reminder:        boolean;
  new_message:          boolean;
  payment_confirmation: boolean;
  weekly_report:        boolean;
  promo_info:           boolean;
}

const DEFAULT_SETTINGS: NotifSettings = {
  trip_reminder:        true,
  new_message:          true,
  payment_confirmation: true,
  weekly_report:        false,
  promo_info:           false,
};

export interface BroadcastParams {
  agencyId:     string;
  senderId:     string;
  targetIds:    string[];
  title:        string;
  message:      string;
  category:     NotifCategory;
  priority:     NotifPriority;
  actionUrl?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

interface NotifState {
  notifications: AppNotification[];
  settings:      NotifSettings;
  isLoading:     boolean;
  _channel:      RealtimeChannel | null;

  fetch:              (userId: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markAsRead:         (id: string) => Promise<void>;
  markAllAsRead:      (userId: string) => Promise<void>;
  deleteNotif:        (id: string) => Promise<void>;
  clearAll:           (userId: string) => Promise<void>;
  _addNotif:          (n: AppNotification) => void;
  fetchSettings:      (userId: string) => Promise<NotifSettings>;
  saveSettings:       (userId: string, agencyId: string, patch: Partial<NotifSettings>) => Promise<void>;
  subscribeRealtime:  (userId: string, onNew: (n: AppNotification) => void) => () => void;
  sendBroadcast:      (params: BroadcastParams) => Promise<number>;
}

export const useNotificationStore = create<NotifState>((set, get) => ({
  notifications: [],
  settings:      { ...DEFAULT_SETTINGS },
  isLoading:     false,
  _channel:      null,

  // ── Fetch latest 60 notifications for this user ───────────────────────────
  fetch: async (userId) => {
    if (!supabase) return;
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (!error) {
        set({ notifications: (data ?? []) as AppNotification[] });
      } else if ((error.code as string) !== "42P01") {
        console.warn("[notifStore] fetch error:", error.message);
      }
    } catch {
      /* graceful fallback */
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Convenience wrapper: fetch using currently logged-in user ─────────────
  fetchNotifications: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    return get().fetch(userId);
  },

  // ── Mark single notification as read ─────────────────────────────────────
  markAsRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
    }));
    if (!supabase) return;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id).catch(() => {});
  },

  // ── Mark all notifications for user as read ───────────────────────────────
  markAllAsRead: async (userId) => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
    }));
    if (!supabase) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .catch(() => {});
  },

  // ── Delete single notification ─────────────────────────────────────────────
  deleteNotif: async (id) => {
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
    if (!supabase) return;
    await supabase.from("notifications").delete().eq("id", id).catch(() => {});
  },

  // ── Clear all notifications for user ──────────────────────────────────────
  clearAll: async (userId) => {
    set({ notifications: [] });
    if (!supabase) return;
    await supabase.from("notifications").delete().eq("user_id", userId).catch(() => {});
  },

  // ── Internal: prepend new notif (called by realtime listener) ────────────
  _addNotif: (n) => {
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 60),
    }));
  },

  // ── Fetch user's notification preferences ─────────────────────────────────
  fetchSettings: async (userId) => {
    if (!supabase) return { ...DEFAULT_SETTINGS };
    try {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!error && data) {
        const s: NotifSettings = {
          trip_reminder:        Boolean(data.trip_reminder        ?? true),
          new_message:          Boolean(data.new_message          ?? true),
          payment_confirmation: Boolean(data.payment_confirmation ?? true),
          weekly_report:        Boolean(data.weekly_report        ?? false),
          promo_info:           Boolean(data.promo_info           ?? false),
        };
        set({ settings: s });
        return s;
      }
    } catch {
      /* graceful */
    }
    return get().settings;
  },

  // ── Save (upsert) user's notification preferences ─────────────────────────
  saveSettings: async (userId, agencyId, patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    if (!supabase) return;
    await supabase
      .from("notification_settings")
      .upsert(
        { user_id: userId, agency_id: agencyId, ...next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .catch(() => {});
  },

  // ── Realtime subscription (INSERT on notifications for this user) ─────────
  subscribeRealtime: (userId, onNew) => {
    if (!supabase) return () => {};
    const existing = get()._channel;
    if (existing) {
      existing.unsubscribe();
      set({ _channel: null });
    }
    const ch = supabase
      .channel(`notif:user:${userId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          get()._addNotif(n);
          onNew(n);
        }
      )
      .subscribe();
    set({ _channel: ch });
    return () => {
      ch.unsubscribe();
      set({ _channel: null });
    };
  },

  // ── Send broadcast: insert notifications for multiple target users ─────────
  sendBroadcast: async ({ agencyId, senderId, targetIds, title, message, category, priority, actionUrl }) => {
    if (!supabase || targetIds.length === 0) return 0;
    const notifType: NotifType =
      priority === "urgent"    ? "urgent"  :
      priority === "important" ? "warning" : "info";
    const rows = targetIds.map((uid) => ({
      user_id:    uid,
      agency_id:  agencyId,
      title,
      message,
      type:       notifType,
      category,
      priority,
      is_read:    false,
      action_url: actionUrl ?? null,
      created_by: senderId,
    }));
    const { data, error } = await supabase
      .from("notifications")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  },
}));

// ── Convenience selector ───────────────────────────────────────────────────────
export const selectUnreadCount = (s: NotifState) =>
  s.notifications.filter((n) => !n.is_read).length;
