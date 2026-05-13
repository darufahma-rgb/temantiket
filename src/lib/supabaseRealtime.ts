/**
 * supabaseRealtime.ts — Realtime sync (D — Stability upgrade).
 *
 * OPTIMISASI vs versi lama:
 *   1. Filter `agency_id=eq.<id>` di semua subscription — hemat WAL
 *   2. Event spesifik (INSERT/UPDATE/DELETE) — bukan '*'
 *   3. Surgical state update — tidak ada full refetch di listener
 *   4. Single channel + removeChannel cleanup di return function
 *
 * BARU (D — Realtime Stability):
 *   5. Callback hooks: onConnected, onError, onDisconnected
 *      dipakai oleh realtimeManager.ts untuk auto-reconnect
 *   6. Duplicate subscription guard: channel === null check
 *   7. subscribe() status → callback sehingga manager bisa tahu
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { useTripsStore, useJamaahStore } from "@/store/tripsStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useClientsStore } from "@/store/clientsStore";
import { useOrdersStore } from "@/store/ordersStore";
import { pullPdfLayoutPresets } from "./cloudSync";
import { useSyncStatusStore } from "@/store/syncStatusStore";
import { mapClientListRow } from "@/features/clients/clientsRepo";
import { mapOrderRow } from "@/features/orders/ordersRepo";
import { mapPackageRow } from "@/features/packages/packagesRepo";
import { mapTripRow, mapJamaahListRow } from "@/features/trips/tripsRepo";
import type { RealtimeChannel } from "@supabase/supabase-js";

let channel: RealtimeChannel | null = null;

/** Listeners untuk preset Tuner — komponen tuner subscribe biar UI auto-refresh. */
type PresetListener = () => void;
const presetListeners = new Set<PresetListener>();

export function onPdfPresetsChanged(fn: PresetListener): () => void {
  presetListeners.add(fn);
  return () => presetListeners.delete(fn);
}

/** Listeners untuk agent_points — Leaderboard subscribe biar auto-refresh. */
type AgentPointsListener = () => void;
const agentPointsListeners = new Set<AgentPointsListener>();

export function onAgentPointsChanged(fn: AgentPointsListener): () => void {
  agentPointsListeners.add(fn);
  return () => agentPointsListeners.delete(fn);
}

/**
 * Listeners untuk mission_submissions + daily_missions.
 */
type MissionListener = () => void;
const missionListeners = new Set<MissionListener>();

export function onMissionsChanged(fn: MissionListener): () => void {
  missionListeners.add(fn);
  return () => missionListeners.delete(fn);
}

/**
 * Listeners khusus untuk INSERT baru ke daily_missions.
 */
type NewMissionListener = (row: Record<string, unknown>) => void;
const newMissionListeners = new Set<NewMissionListener>();

export function onNewMissionInserted(fn: NewMissionListener): () => void {
  newMissionListeners.add(fn);
  return () => newMissionListeners.delete(fn);
}

/** Helper: ambil id dari payload.old (hanya PK yang dijamin ada di DELETE). */
function oldId(payload: { old: Record<string, unknown> }): string {
  return String(payload.old.id);
}

// ─── Lifecycle callback types ─────────────────────────────────────────────────

export interface RealtimeSyncCallbacks {
  /** Called when channel is fully subscribed and live. */
  onConnected?:    () => void;
  /** Called when a CHANNEL_ERROR or TIMED_OUT status is received. */
  onError?:        (reason: string) => void;
  /** Called when the channel is closed (CLOSED status). */
  onDisconnected?: () => void;
}

/**
 * startRealtimeSync — buka satu channel dengan semua subscription yang difilter
 * by agency_id. Harus dipanggil setelah user authenticated.
 *
 * @param agencyId   — UUID agency dari user yang login (user.agencyId)
 * @param callbacks  — optional lifecycle callbacks (used by realtimeManager)
 * @returns cleanup function — panggil saat komponen/app unmount
 */
export function startRealtimeSync(
  agencyId: string,
  callbacks?: RealtimeSyncCallbacks,
): () => void {
  // ── Duplicate subscription guard ─────────────────────────────────────────
  if (!isSupabaseConfigured() || !agencyId) return () => undefined;
  if (channel) {
    // Already connected — teardown before re-subscribing (idempotent)
    void supabase!.removeChannel(channel);
    channel = null;
  }

  const agencyFilter = `agency_id=eq.${agencyId}`;

  channel = supabase!
    .channel("igh-tour-sync")

    // ── TRIPS ─────────────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "trips",
      filter: agencyFilter,
    }, (payload) => {
      const trip = mapTripRow(payload.new as Record<string, unknown>);
      useTripsStore.setState((s) => ({ trips: [trip, ...s.trips] }));
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "trips",
      filter: agencyFilter,
    }, (payload) => {
      const trip = mapTripRow(payload.new as Record<string, unknown>);
      useTripsStore.setState((s) => ({
        trips: s.trips.map((t) => (t.id === trip.id ? trip : t)),
      }));
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "trips",
      filter: agencyFilter,
    }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useTripsStore.setState((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
    })

    // ── JAMAAH ────────────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "jamaah",
      filter: agencyFilter,
    }, (payload) => {
      const row    = payload.new as Record<string, unknown>;
      const tripId = String(row.trip_id ?? "");
      const current = useJamaahStore.getState().jamaah;
      if (tripId && current.some((j) => j.tripId === tripId)) {
        useJamaahStore.setState((s) => ({
          jamaah: [...s.jamaah, mapJamaahListRow(row)],
        }));
      }
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "jamaah",
      filter: agencyFilter,
    }, (payload) => {
      const updated = mapJamaahListRow(payload.new as Record<string, unknown>);
      useJamaahStore.setState((s) => ({
        jamaah: s.jamaah.map((j) => (j.id === updated.id ? updated : j)),
      }));
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "jamaah",
      filter: agencyFilter,
    }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useJamaahStore.setState((s) => ({ jamaah: s.jamaah.filter((j) => j.id !== id) }));
    })

    // ── PACKAGES ──────────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "packages",
      filter: agencyFilter,
    }, (payload) => {
      const pkg = mapPackageRow(payload.new as Record<string, unknown>);
      usePackagesStore.setState((s) => ({ items: [pkg, ...s.items] }));
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "packages",
      filter: agencyFilter,
    }, (payload) => {
      const pkg = mapPackageRow(payload.new as Record<string, unknown>);
      usePackagesStore.setState((s) => ({
        items: s.items.map((p) => (p.id === pkg.id ? pkg : p)),
      }));
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "packages",
      filter: agencyFilter,
    }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      usePackagesStore.setState((s) => ({
        items:     s.items.filter((p) => p.id !== id),
        currentId: s.currentId === id ? null : s.currentId,
      }));
    })

    // ── CLIENTS ───────────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "clients",
      filter: agencyFilter,
    }, (payload) => {
      const client = mapClientListRow(payload.new as Record<string, unknown>);
      useClientsStore.setState((s) => ({ clients: [client, ...s.clients] }));
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "clients",
      filter: agencyFilter,
    }, (payload) => {
      const client = mapClientListRow(payload.new as Record<string, unknown>);
      useClientsStore.setState((s) => ({
        clients: s.clients.map((c) => (c.id === client.id ? client : c)),
      }));
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "clients",
      filter: agencyFilter,
    }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useClientsStore.setState((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));
    })

    // ── ORDERS ────────────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "orders",
      filter: agencyFilter,
    }, (payload) => {
      const order = mapOrderRow(payload.new as Record<string, unknown>);
      useOrdersStore.setState((s) => ({ orders: [order, ...s.orders] }));
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "orders",
      filter: agencyFilter,
    }, (payload) => {
      const order = mapOrderRow(payload.new as Record<string, unknown>);
      useOrdersStore.setState((s) => ({
        orders: s.orders.map((o) => (o.id === order.id ? order : o)),
      }));
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "orders",
      filter: agencyFilter,
    }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useOrdersStore.setState((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
    })

    // ── AGENT POINTS ──────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "agent_points",
      filter: agencyFilter,
    }, () => {
      for (const fn of agentPointsListeners) fn();
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "agent_points",
      filter: agencyFilter,
    }, () => {
      for (const fn of agentPointsListeners) fn();
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "agent_points",
      filter: agencyFilter,
    }, () => {
      for (const fn of agentPointsListeners) fn();
    })

    // ── MISSION SUBMISSIONS ───────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "mission_submissions",
      filter: agencyFilter,
    }, () => {
      for (const fn of missionListeners) fn();
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "mission_submissions",
      filter: agencyFilter,
    }, () => {
      for (const fn of missionListeners) fn();
    })

    // ── DAILY MISSIONS ────────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "daily_missions",
      filter: agencyFilter,
    }, (payload) => {
      for (const fn of missionListeners) fn();
      for (const fn of newMissionListeners) fn(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "daily_missions",
      filter: agencyFilter,
    }, () => {
      for (const fn of missionListeners) fn();
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "daily_missions",
      filter: agencyFilter,
    }, () => {
      for (const fn of missionListeners) fn();
    })

    // ── PDF LAYOUT PRESETS ────────────────────────────────────────────────────
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "pdf_layout_presets",
      filter: agencyFilter,
    }, () => {
      void pullPdfLayoutPresets().then(() => {
        for (const fn of presetListeners) fn();
      });
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "pdf_layout_presets",
      filter: agencyFilter,
    }, () => {
      void pullPdfLayoutPresets().then(() => {
        for (const fn of presetListeners) fn();
      });
    })
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "pdf_layout_presets",
      filter: agencyFilter,
    }, () => {
      void pullPdfLayoutPresets().then(() => {
        for (const fn of presetListeners) fn();
      });
    })

    // ── Subscribe + lifecycle callbacks ──────────────────────────────────────
    .subscribe((status) => {
      const sync = useSyncStatusStore.getState();

      if (status === "SUBSCRIBED") {
        sync.markSyncOk();
        callbacks?.onConnected?.();

      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        sync.markSyncError(`Realtime: ${status}`);
        callbacks?.onError?.(status);

      } else if (status === "CLOSED") {
        sync.setOnline(navigator.onLine);
        callbacks?.onDisconnected?.();
      }
    });

  return () => {
    if (channel) {
      void supabase!.removeChannel(channel);
      channel = null;
    }
  };
}
