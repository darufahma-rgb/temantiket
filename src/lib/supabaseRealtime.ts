/**
 * Realtime sync — subscribe ke perubahan tabel dari device lain.
 *
 * OPTIMISASI (vs versi lama):
 *   1. Setiap subscription sekarang pakai filter `agency_id=eq.<id>` sehingga
 *      Supabase hanya memproses baris milik agency ini — bukan semua agency.
 *      Ini yang menyebabkan realtime.list_changes() mendominasi query cost.
 *   2. event: '*' dipecah ke event spesifik (INSERT/UPDATE/DELETE) di semua
 *      tabel yang memungkinkan — mengurangi payload WAL yang dikirim server.
 *   3. agent_points hanya pakai event: 'INSERT' karena poin di-award via
 *      trigger dan tidak pernah di-UPDATE/DELETE secara langsung.
 *   4. mission_submissions pakai INSERT + UPDATE (bukan '*') — DELETE tidak
 *      relevan karena submissions tidak pernah dihapus.
 *   5. Pola surgical update dipertahankan — tidak ada full refetch di listener.
 *   6. Single channel + removeChannel cleanup di return function.
 *
 * startRealtimeSync(agencyId) sekarang menerima agencyId sebagai parameter.
 * Dipanggil dari App.tsx setelah user authenticated dengan user.agencyId.
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

/**
 * startRealtimeSync — buka satu channel dengan semua subscription yang difilter
 * by agency_id. Harus dipanggil setelah user authenticated.
 *
 * @param agencyId  — UUID agency dari user yang login (user.agencyId)
 * @returns cleanup function — panggil saat komponen/app unmount
 */
export function startRealtimeSync(agencyId: string): () => void {
  if (!isSupabaseConfigured() || !agencyId || channel) return () => undefined;

  // Filter string yang sama dipakai di semua tabel — satu tempat untuk ganti.
  const agencyFilter = `agency_id=eq.${agencyId}`;

  channel = supabase!
    .channel("igh-tour-sync")

    // ── TRIPS ─────────────────────────────────────────────────────────────────
    // Filter: hanya trips milik agency ini.
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
    // INSERT: tambahkan hanya kalau trip-nya sudah ada di store (user sedang lihat trip itu).
    // UPDATE/DELETE: cukup cocokkan by id — kalau tidak ada, setState adalah no-op.
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "jamaah",
      filter: agencyFilter,
    }, (payload) => {
      const row = payload.new as Record<string, unknown>;
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
        items: s.items.filter((p) => p.id !== id),
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
    // Hanya INSERT — poin di-award via database trigger, tidak pernah di-UPDATE
    // atau di-DELETE secara langsung dari aplikasi.
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "agent_points",
      filter: agencyFilter,
    }, () => {
      for (const fn of agentPointsListeners) fn();
    })

    // ── MISSION SUBMISSIONS ───────────────────────────────────────────────────
    // INSERT: agent submit bukti baru.
    // UPDATE: owner approve/reject (status berubah).
    // DELETE tidak dipakai — submissions tidak pernah dihapus.
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
    // INSERT (misi baru), UPDATE (edit misi), DELETE (hapus misi) semua relevan
    // bagi agent yang sedang lihat daftar misi.
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "daily_missions",
      filter: agencyFilter,
    }, () => {
      for (const fn of missionListeners) fn();
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
    // INSERT/UPDATE/DELETE semua relevan — preset bisa dibuat, diedit, dihapus.
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
