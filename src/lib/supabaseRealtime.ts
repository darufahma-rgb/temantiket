/**
 * Realtime sync — subscribe ke perubahan tabel dari device lain.
 *
 * Pola: surgical update per-event (INSERT / UPDATE / DELETE) langsung ke
 * Zustand store, tanpa full refetch. Setiap event hanya menyentuh satu baris:
 *   INSERT → prepend ke array
 *   UPDATE → replace in-place by id
 *   DELETE → filter out by id
 *
 * Ini menggantikan pola lama: event: "*" → fetchAll() yang download seluruh
 * tabel setiap ada perubahan apapun dari siapapun.
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
 * AgentMissionWidget & AgentProfile subscribe biar status misi auto-refresh
 * tanpa reload saat admin approve / reject bukti.
 */
type MissionListener = () => void;
const missionListeners = new Set<MissionListener>();

export function onMissionsChanged(fn: MissionListener): () => void {
  missionListeners.add(fn);
  return () => missionListeners.delete(fn);
}

/** Helper: ambil id dari payload.old (hanya PK yang dijamin ada di DELETE). */
function oldId(payload: { old: Record<string, unknown> }): string {
  return String(payload.old.id);
}

export function startRealtimeSync(): () => void {
  if (!isSupabaseConfigured() || channel) return () => undefined;

  channel = supabase!
    .channel("igh-tour-sync")

    // ── TRIPS ─────────────────────────────────────────────────────────────────
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "trips" }, (payload) => {
      const trip = mapTripRow(payload.new as Record<string, unknown>);
      useTripsStore.setState((s) => ({ trips: [trip, ...s.trips] }));
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips" }, (payload) => {
      const trip = mapTripRow(payload.new as Record<string, unknown>);
      useTripsStore.setState((s) => ({
        trips: s.trips.map((t) => (t.id === trip.id ? trip : t)),
      }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "trips" }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useTripsStore.setState((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
    })

    // ── JAMAAH ────────────────────────────────────────────────────────────────
    // Jamaah store hanya menyimpan jamaah dari trip yang sedang dibuka.
    // INSERT: tambahkan hanya kalau trip-nya sudah ada di store (user sedang lihat trip itu).
    // UPDATE/DELETE: cukup cocokkan by id — kalau tidak ada, setState adalah no-op.
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "jamaah" }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      const tripId = String(row.trip_id ?? "");
      const current = useJamaahStore.getState().jamaah;
      if (tripId && current.some((j) => j.tripId === tripId)) {
        useJamaahStore.setState((s) => ({
          jamaah: [...s.jamaah, mapJamaahListRow(row)],
        }));
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jamaah" }, (payload) => {
      const updated = mapJamaahListRow(payload.new as Record<string, unknown>);
      useJamaahStore.setState((s) => ({
        jamaah: s.jamaah.map((j) => (j.id === updated.id ? updated : j)),
      }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "jamaah" }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useJamaahStore.setState((s) => ({ jamaah: s.jamaah.filter((j) => j.id !== id) }));
    })

    // ── PACKAGES ──────────────────────────────────────────────────────────────
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "packages" }, (payload) => {
      const pkg = mapPackageRow(payload.new as Record<string, unknown>);
      usePackagesStore.setState((s) => ({ items: [pkg, ...s.items] }));
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "packages" }, (payload) => {
      const pkg = mapPackageRow(payload.new as Record<string, unknown>);
      usePackagesStore.setState((s) => ({
        items: s.items.map((p) => (p.id === pkg.id ? pkg : p)),
      }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "packages" }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      usePackagesStore.setState((s) => ({
        items: s.items.filter((p) => p.id !== id),
        currentId: s.currentId === id ? null : s.currentId,
      }));
    })

    // ── CLIENTS ───────────────────────────────────────────────────────────────
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "clients" }, (payload) => {
      const client = mapClientListRow(payload.new as Record<string, unknown>);
      useClientsStore.setState((s) => ({ clients: [client, ...s.clients] }));
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clients" }, (payload) => {
      const client = mapClientListRow(payload.new as Record<string, unknown>);
      useClientsStore.setState((s) => ({
        clients: s.clients.map((c) => (c.id === client.id ? client : c)),
      }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "clients" }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useClientsStore.setState((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));
    })

    // ── ORDERS ────────────────────────────────────────────────────────────────
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
      const order = mapOrderRow(payload.new as Record<string, unknown>);
      useOrdersStore.setState((s) => ({ orders: [order, ...s.orders] }));
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
      const order = mapOrderRow(payload.new as Record<string, unknown>);
      useOrdersStore.setState((s) => ({
        orders: s.orders.map((o) => (o.id === order.id ? order : o)),
      }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, (payload) => {
      const id = oldId(payload as { old: Record<string, unknown> });
      useOrdersStore.setState((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
    })

    // ── AGENT POINTS, MISSIONS, PDF PRESETS ───────────────────────────────────
    // Tabel-tabel ini tidak punya store global — pakai listener pattern instead.
    .on("postgres_changes", { event: "*", schema: "public", table: "agent_points" }, () => {
      for (const fn of agentPointsListeners) fn();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "mission_submissions" }, () => {
      for (const fn of missionListeners) fn();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "daily_missions" }, () => {
      for (const fn of missionListeners) fn();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "pdf_layout_presets" }, () => {
      void pullPdfLayoutPresets().then(() => {
        for (const fn of presetListeners) fn();
      });
    })

    .subscribe((status) => {
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
