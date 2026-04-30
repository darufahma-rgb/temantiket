import { useEffect } from "react";
import { usePackagesStore } from "@/store/packagesStore";

/**
 * Thin React hook over the global packages store.
 * Triggers an initial load on mount (idempotent) and re-exports
 * the store's CRUD actions so callers don't need to know about Zustand.
 */
export function usePackages() {
  const items = usePackagesStore((s) => s.items);
  const loading = usePackagesStore((s) => s.loading);
  const error = usePackagesStore((s) => s.error);
  const loaded = usePackagesStore((s) => s.loaded);
  const refresh = usePackagesStore((s) => s.refresh);
  const create = usePackagesStore((s) => s.create);
  const update = usePackagesStore((s) => s.update);
  const remove = usePackagesStore((s) => s.remove);

  useEffect(() => {
    if (!loaded && !loading) refresh();
  }, [loaded, loading, refresh]);

  return { items, loading, error, refresh, create, update, remove };
}
