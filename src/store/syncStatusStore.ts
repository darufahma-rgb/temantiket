/**
 * Sync status store — tracks koneksi ke Supabase + waktu sync terakhir.
 *
 * Logika status:
 *   ok      → online + supabase configured + last operation success
 *   syncing → operasi sedang berjalan
 *   offline → navigator.onLine === false ATAU supabase belum dikonfigurasi
 *   error   → operasi terakhir gagal (fetch error, RLS, dll)
 *
 * Dipanggil dari cloudSync.ts, supabaseRealtime.ts, dan store domain
 * (trips/jamaah/packages) lewat helper `markSyncOk()` / `markSyncError()`.
 */
import { create } from "zustand";
import { isSupabaseConfigured } from "@/lib/supabase";

export type SyncStatus = "ok" | "syncing" | "offline" | "error";

interface SyncStatusState {
  status: SyncStatus;
  lastSync: Date | null;
  lastError: string | null;
  isOnline: boolean;
  markSyncing: () => void;
  markSyncOk: () => void;
  markSyncError: (msg?: string) => void;
  setOnline: (online: boolean) => void;
}

const computeIdleStatus = (online: boolean): SyncStatus => {
  if (!isSupabaseConfigured()) return "offline";
  if (!online) return "offline";
  return "ok";
};

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  status: computeIdleStatus(typeof navigator === "undefined" ? true : navigator.onLine),
  lastSync: null,
  lastError: null,
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,

  markSyncing: () => {
    if (!get().isOnline || !isSupabaseConfigured()) return;
    set({ status: "syncing" });
  },

  markSyncOk: () => {
    set({ status: computeIdleStatus(get().isOnline), lastSync: new Date(), lastError: null });
  },

  markSyncError: (msg) => {
    set({ status: "error", lastError: msg ?? "Sync gagal" });
  },

  setOnline: (online) => {
    const prev = get();
    const nextStatus: SyncStatus = !online
      ? "offline"
      : prev.status === "error"
        ? "error"
        : computeIdleStatus(online);
    set({ isOnline: online, status: nextStatus });
  },
}));

/** Pasang listener `online`/`offline` browser. Dipanggil sekali di App init. */
export function initSyncStatusListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onOnline = () => useSyncStatusStore.getState().setOnline(true);
  const onOffline = () => useSyncStatusStore.getState().setOnline(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  // Sinkron ulang state pada saat dipasang (kalau ada race condition).
  useSyncStatusStore.getState().setOnline(navigator.onLine);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

/** Helper convenience — wrap async cloud op with auto status tracking. */
export async function trackSync<T>(op: () => Promise<T>): Promise<T> {
  const s = useSyncStatusStore.getState();
  s.markSyncing();
  try {
    const out = await op();
    useSyncStatusStore.getState().markSyncOk();
    return out;
  } catch (e) {
    useSyncStatusStore.getState().markSyncError((e as Error).message);
    throw e;
  }
}
