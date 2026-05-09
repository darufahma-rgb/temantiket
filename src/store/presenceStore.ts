/**
 * Presence Store — Supabase Realtime Presence
 * Tracks which agency members are currently online.
 * Owner dapat melihat siapa yang sedang aktif di halaman Pengaturan → Tim.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface OnlineUser {
  userId: string;
  displayName: string;
  role: string;
  joinedAt: number;
}

interface PresenceState {
  onlineUsers: Map<string, OnlineUser>;
  channel: RealtimeChannel | null;

  join: (agencyId: string, userId: string, displayName: string, role: string) => void;
  leave: () => void;
  isOnline: (userId: string) => boolean;
  getOnlineList: () => OnlineUser[];
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Map(),
  channel: null,

  join: (agencyId, userId, displayName, role) => {
    if (!supabase) return;

    const existing = get().channel;
    if (existing) { existing.unsubscribe(); }

    const channel = supabase.channel(`presence:agency:${agencyId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const newMap = new Map<string, OnlineUser>();
        for (const [key, presences] of Object.entries(state)) {
          const arr = presences as unknown as OnlineUser[];
          if (arr.length > 0) {
            newMap.set(key, arr[0]);
          }
        }
        set({ onlineUsers: newMap });
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const arr = newPresences as unknown as OnlineUser[];
        if (arr.length > 0) {
          set((s) => {
            const m = new Map(s.onlineUsers);
            m.set(key, arr[0]);
            return { onlineUsers: m };
          });
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        set((s) => {
          const m = new Map(s.onlineUsers);
          m.delete(key);
          return { onlineUsers: m };
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId, displayName, role, joinedAt: Date.now() });
        }
      });

    set({ channel });
  },

  leave: () => {
    const { channel } = get();
    if (channel) {
      channel.unsubscribe();
      set({ channel: null, onlineUsers: new Map() });
    }
  },

  isOnline: (userId) => get().onlineUsers.has(userId),

  getOnlineList: () => Array.from(get().onlineUsers.values()),
}));
