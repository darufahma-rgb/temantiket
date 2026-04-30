import { create } from "zustand";
import {
  createPackage,
  deletePackage,
  listPackages,
  updatePackage,
  type Package,
  type PackageDraft,
} from "@/features/packages/packagesRepo";

/**
 * Global packages store.
 * Wraps the repository so all pages share the same in-memory snapshot
 * and stay in sync after mutations. Swap the repo for a real backend
 * (or TanStack Query) without changing consumers.
 */
interface PackagesState {
  items: Package[];
  loading: boolean;
  error: string | null;
  currentId: string | null;
  loaded: boolean;

  refresh: () => Promise<void>;
  create: (draft: PackageDraft) => Promise<Package>;
  update: (id: string, patch: Partial<PackageDraft>) => Promise<Package>;
  remove: (id: string) => Promise<void>;
  setCurrent: (id: string | null) => void;
}

export const usePackagesStore = create<PackagesState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  currentId: null,
  loaded: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await listPackages();
      set({ items: data, loading: false, loaded: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load packages",
        loading: false,
      });
    }
  },

  create: async (draft) => {
    const preId = `p-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: Package = { ...draft, id: preId, createdAt: now, updatedAt: now };
    set((s) => ({ items: [optimistic, ...s.items] }));
    try {
      const created = await createPackage(draft, preId);
      set((s) => ({ items: s.items.map((p) => (p.id === preId ? created : p)) }));
      return created;
    } catch (err) {
      set((s) => ({ items: s.items.filter((p) => p.id !== preId) }));
      throw err;
    }
  },

  update: async (id, patch) => {
    const updated = await updatePackage(id, patch);
    set((s) => ({ items: s.items.map((p) => (p.id === id ? updated : p)) }));
    return updated;
  },

  remove: async (id) => {
    await deletePackage(id);
    set((s) => ({
      items: s.items.filter((p) => p.id !== id),
      currentId: s.currentId === id ? null : s.currentId,
    }));
  },

  setCurrent: (id) => set({ currentId: id }),
}));

/** Selector helper — returns the currently focused package (or null). */
export const useCurrentPackage = () =>
  usePackagesStore((s) => s.items.find((p) => p.id === s.currentId) ?? null);
