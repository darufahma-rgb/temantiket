/**
 * Per-agency localStorage write-through cache.
 *
 * Tujuan: bikin data domain (trips, packages, jamaah, dll) **tetap muncul**
 * setelah page refresh — meskipun Supabase lagi error, network putus, atau
 * env vars belum di-set di production. Tanpa ini, in-memory `_cache` di repo
 * file akan ke-wipe setiap reload → user lihat list kosong → "data hilang".
 *
 * Pola pakai:
 *   const cache = makePersistedCache<Trip>("trips");
 *   cache.read(agencyId);            // baca cache lokal
 *   cache.write(agencyId, items);    // tulis ke cache (write-through)
 *
 * Key format: `igh:cache:{name}:{agencyId|"anon"}` — scoped per-agency biar
 * gak bocor antar tenant kalau user logout-login pakai akun lain di browser
 * yang sama.
 */

const PREFIX = "igh:cache:";

function keyFor(name: string, agencyId: string | null | undefined): string {
  return `${PREFIX}${name}:${agencyId || "anon"}`;
}

export interface PersistedCache<T> {
  /** Baca cache. Return [] kalau kosong/parse error. */
  read(agencyId: string | null | undefined): T[];
  /** Tulis cache (overwrite). Silent kalau quota exceeded. */
  write(agencyId: string | null | undefined, items: T[]): void;
  /** Hapus cache untuk agency tertentu. */
  clear(agencyId: string | null | undefined): void;
  /** Hapus SEMUA cache untuk nama ini (semua agency) — dipakai saat logout. */
  clearAll(): void;
}

export function makePersistedCache<T>(name: string): PersistedCache<T> {
  return {
    read(agencyId) {
      if (typeof localStorage === "undefined") return [];
      try {
        const raw = localStorage.getItem(keyFor(name, agencyId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    },
    write(agencyId, items) {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(keyFor(name, agencyId), JSON.stringify(items));
      } catch (e) {
        // Quota exceeded / private mode — best-effort, gak block UI.
        console.warn(`[persistedCache:${name}] write failed`, e);
      }
    },
    clear(agencyId) {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.removeItem(keyFor(name, agencyId));
      } catch {
        /* noop */
      }
    },
    clearAll() {
      if (typeof localStorage === "undefined") return;
      try {
        const prefix = `${PREFIX}${name}:`;
        const toDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) toDelete.push(k);
        }
        toDelete.forEach((k) => localStorage.removeItem(k));
      } catch {
        /* noop */
      }
    },
  };
}
