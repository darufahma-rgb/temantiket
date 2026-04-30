/**
 * Realtime sync — subscribe ke perubahan tabel dari device lain & refresh stores.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { useTripsStore, useJamaahStore } from "@/store/tripsStore";
import { usePackagesStore } from "@/store/packagesStore";
import { pullPdfLayoutPresets } from "./cloudSync";
import { useSyncStatusStore } from "@/store/syncStatusStore";
import type { RealtimeChannel } from "@supabase/supabase-js";

let channel: RealtimeChannel | null = null;

/** Listeners untuk preset Tuner — komponen tuner subscribe biar UI auto-refresh. */
type PresetListener = () => void;
const presetListeners = new Set<PresetListener>();

export function onPdfPresetsChanged(fn: PresetListener): () => void {
  presetListeners.add(fn);
  return () => presetListeners.delete(fn);
}

export function startRealtimeSync(): () => void {
  if (!isSupabaseConfigured() || channel) return () => undefined;

  channel = supabase!
    .channel("igh-tour-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
      void useTripsStore.getState().fetchTrips();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "jamaah" }, (payload) => {
      const tripId =
        (payload.new as { trip_id?: string } | null)?.trip_id ??
        (payload.old as { trip_id?: string } | null)?.trip_id;
      if (tripId) void useJamaahStore.getState().fetchJamaah(tripId);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "packages" }, () => {
      void usePackagesStore.getState().refresh();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "pdf_layout_presets" }, () => {
      // Refresh cache lalu broadcast ke semua tuner yang sedang dibuka.
      void pullPdfLayoutPresets().then(() => {
        for (const fn of presetListeners) fn();
      });
    })
    .subscribe((status) => {
      // Map realtime channel status → sync indicator
      const sync = useSyncStatusStore.getState();
      if (status === "SUBSCRIBED") sync.markSyncOk();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") sync.markSyncError(`Realtime: ${status}`);
      else if (status === "CLOSED") sync.setOnline(navigator.onLine);
    });

  return () => {
    if (channel) {
      void supabase!.removeChannel(channel);
      channel = null;
    }
  };
}
