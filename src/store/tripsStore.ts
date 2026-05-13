import { create } from "zustand";
import {
  listTrips, createTrip, updateTrip, deleteTrip,
  listJamaah, createJamaah, createJamaahBulk, updateJamaah, deleteJamaah, getJamaah,
  listDocs, addDoc, deleteDoc,
  type Trip, type Jamaah, type JamaahDoc, type DocCategory,
} from "@/features/trips/tripsRepo";
import { syncBus } from "@/lib/syncBus";
import { toast } from "sonner";

const FETCH_TIMEOUT = 25_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Waktu koneksi habis. Periksa jaringan Anda.")), FETCH_TIMEOUT),
    ),
  ]);
}

interface TripsState {
  trips: Trip[];
  loadingTrips: boolean;
  /** True setelah fetch pertama berhasil. Selanjutnya fetch berjalan di background tanpa loading state. */
  loaded: boolean;
  fetchTrips: () => Promise<void>;
  addTrip: (draft: Omit<Trip, "id" | "createdAt">) => Promise<Trip>;
  patchTrip: (id: string, patch: Partial<Trip>) => Promise<void>;
  removeTrip: (id: string) => Promise<void>;
}

export const useTripsStore = create<TripsState>((set, get) => ({
  trips: [],
  loadingTrips: false,
  loaded: false,

  fetchTrips: async () => {
    const { loaded } = get();
    // Hanya tampilkan loading spinner saat fetch pertama kali
    if (!loaded) set({ loadingTrips: true });
    try {
      const data = await withTimeout(listTrips());
      set({ trips: data, loadingTrips: false, loaded: true });
    } catch (err) {
      // Jangan timpa trips jadi [] — biar UI tetap nampilin data lama (kalau ada)
      console.error("[tripsStore] fetchTrips failed:", err);
      set((s) => ({ trips: s.trips, loadingTrips: false }));
      if (!get().loaded) {
        const msg = err instanceof Error ? err.message : "Gagal memuat paket trip.";
        toast.error("Gagal memuat paket trip", { description: msg, duration: 4000, id: "trips-fetch-err" });
      }
    }
  },

  addTrip: async (draft) => {
    const t = await createTrip(draft);
    set((s) => ({ trips: [t, ...s.trips] }));
    syncBus.emit({ type: "trips", action: "create", id: t.id });
    return t;
  },

  patchTrip: async (id, patch) => {
    const updated = await updateTrip(id, patch);
    set((s) => ({ trips: s.trips.map((t) => (t.id === id ? updated : t)) }));
    syncBus.emit({ type: "trips", action: "update", id });
  },

  removeTrip: async (id) => {
    await deleteTrip(id);
    set((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
    syncBus.emit({ type: "trips", action: "delete", id });
  },
}));

interface JamaahState {
  jamaah: Jamaah[];
  loadingJamaah: boolean;
  fetchJamaah: (tripId: string) => Promise<void>;
  addJamaah: (draft: Omit<Jamaah, "id" | "createdAt">) => Promise<Jamaah>;
  addJamaahBulk: (
    drafts: Omit<Jamaah, "id" | "createdAt">[],
    onProgress?: (uploaded: number, total: number) => void,
  ) => Promise<Jamaah[]>;
  patchJamaah: (id: string, patch: Partial<Jamaah>) => Promise<void>;
  removeJamaah: (id: string) => Promise<void>;
  getOne: (id: string) => Promise<Jamaah | null>;
}

export const useJamaahStore = create<JamaahState>((set) => ({
  jamaah: [],
  loadingJamaah: false,

  fetchJamaah: async (tripId) => {
    set({ loadingJamaah: true });
    try {
      const data = await listJamaah(tripId);
      set({ jamaah: data, loadingJamaah: false });
    } catch (err) {
      console.error("[jamaahStore] fetchJamaah failed:", err);
      set((s) => ({ jamaah: s.jamaah, loadingJamaah: false }));
    }
  },

  addJamaah: async (draft) => {
    const j = await createJamaah(draft);
    set((s) => ({ jamaah: [...s.jamaah, j] }));
    return j;
  },

  addJamaahBulk: async (drafts, onProgress) => {
    const results = await createJamaahBulk(drafts, onProgress);
    set((s) => ({ jamaah: [...s.jamaah, ...results] }));
    return results;
  },

  patchJamaah: async (id, patch) => {
    const updated = await updateJamaah(id, patch);
    set((s) => ({ jamaah: s.jamaah.map((j) => (j.id === id ? updated : j)) }));
  },

  removeJamaah: async (id) => {
    await deleteJamaah(id);
    set((s) => ({ jamaah: s.jamaah.filter((j) => j.id !== id) }));
  },

  getOne: getJamaah,
}));

interface DocsState {
  docs: JamaahDoc[];
  loadingDocs: boolean;
  fetchDocs: (jamaahId: string) => Promise<void>;
  addJamaahDoc: (jamaahId: string, doc: Omit<JamaahDoc, "id" | "jamaahId" | "createdAt">) => Promise<JamaahDoc>;
  removeDoc: (jamaahId: string, docId: string) => Promise<void>;
}

export const useDocsStore = create<DocsState>((set) => ({
  docs: [],
  loadingDocs: false,

  fetchDocs: async (jamaahId) => {
    set({ loadingDocs: true });
    try {
      const data = await listDocs(jamaahId);
      set({ docs: data, loadingDocs: false });
    } catch (err) {
      console.error("[docsStore] fetchDocs failed:", err);
      set((s) => ({ docs: s.docs, loadingDocs: false }));
    }
  },

  addJamaahDoc: async (jamaahId, doc) => {
    const d = await addDoc(jamaahId, doc);
    set((s) => ({ docs: [...s.docs, d] }));
    return d;
  },

  removeDoc: async (jamaahId, docId) => {
    await deleteDoc(jamaahId, docId);
    set((s) => ({ docs: s.docs.filter((d) => d.id !== docId) }));
  },
}));

export type { Trip, Jamaah, JamaahDoc, DocCategory };
