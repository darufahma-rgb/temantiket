/**
 * featureSyncStore — tracks per-feature cloud sync status.
 *
 * Different from the global syncStatusStore which reflects the overall
 * Supabase connection. This one tracks each individual setting key so
 * Settings.tsx can show a green/amber/gray dot next to each save button.
 *
 * Status lifecycle:
 *   idle    → default (no dot shown)
 *   syncing → amber pulsing (push in flight)
 *   ok      → green (auto-resets to idle after 4 s)
 *   error   → red  (stays until next successful push)
 *   offline → gray (Supabase not configured or device offline)
 */
import { create } from "zustand";
import { isSupabaseConfigured } from "@/lib/supabase";

export type FeatureSyncStatus = "idle" | "syncing" | "ok" | "error" | "offline";

interface FeatureSyncState {
  statuses: Record<string, FeatureSyncStatus>;
  errors:   Record<string, string>;
  lastOk:   Record<string, number>;
  setFeatureStatus: (key: string, status: FeatureSyncStatus, error?: string) => void;
  getFeatureStatus: (key: string) => FeatureSyncStatus;
}

const resetTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useFeatureSyncStore = create<FeatureSyncState>((set, get) => ({
  statuses: {},
  errors:   {},
  lastOk:   {},

  setFeatureStatus: (key, status, error) => {
    // Cancel pending auto-reset if any
    if (resetTimers[key]) {
      clearTimeout(resetTimers[key]);
      delete resetTimers[key];
    }

    set((s) => ({
      statuses: { ...s.statuses, [key]: status },
      errors:   error != null ? { ...s.errors, [key]: error } : s.errors,
      lastOk:   status === "ok" ? { ...s.lastOk, [key]: Date.now() } : s.lastOk,
    }));

    // Auto-reset ok → idle after 4 s so the dot fades away cleanly
    if (status === "ok") {
      resetTimers[key] = setTimeout(() => {
        set((s) => ({ statuses: { ...s.statuses, [key]: "idle" } }));
        delete resetTimers[key];
      }, 4000);
    }
  },

  getFeatureStatus: (key) => get().statuses[key] ?? "idle",
}));

/** Call before a cloud push. If Supabase not configured, mark offline. */
export function beginFeatureSync(key: string): boolean {
  if (!isSupabaseConfigured() || !navigator.onLine) {
    useFeatureSyncStore.getState().setFeatureStatus(key, "offline");
    return false;
  }
  useFeatureSyncStore.getState().setFeatureStatus(key, "syncing");
  return true;
}

export function resolveFeatureSync(key: string, err?: string): void {
  if (err) {
    useFeatureSyncStore.getState().setFeatureStatus(key, "error", err);
  } else {
    useFeatureSyncStore.getState().setFeatureStatus(key, "ok");
  }
}
