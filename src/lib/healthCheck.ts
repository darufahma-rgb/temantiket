/**
 * healthCheck — Frontend utility untuk memvalidasi konfigurasi Supabase sebelum
 * operasi penting (upload file, update database, wallet ledger, sync data).
 *
 * Memanggil GET /api/health-check (Express backend di Replit, Vercel serverless di production).
 * Hasil di-cache selama 60 detik sehingga upload berurutan tidak membebani server.
 *
 * Provider-agnostic: mendukung Vercel, Replit, Local.
 */

export type HealthProvider = "vercel" | "replit" | "local";

export interface HealthCheckResult {
  ok:           boolean;
  provider?:    HealthProvider;
  serviceRole:  boolean;
  projectUrl:   string | null;
  database:     boolean;
  storage:      boolean;
  bucketStatus: Record<string, "ok" | "missing">;
  errors:       string[];
}

interface CacheEntry {
  result:    HealthCheckResult;
  fetchedAt: number; // epoch ms
}

const CACHE_TTL_MS = 60_000; // 60 seconds
let _cache: CacheEntry | null = null;

/** Flush the cache — useful after fixing configuration or on login. */
export function flushHealthCache(): void {
  _cache = null;
}

/** Human-readable label for the environment provider. */
export function providerLabel(p?: HealthProvider | string): string {
  if (p === "vercel")  return "Vercel Environment Variables";
  if (p === "replit")  return "Replit Secrets";
  if (p === "local")   return "local .env";
  return "environment variables";
}

/**
 * Fetch health status from the backend. Results are cached for 60 s to avoid
 * multiple requests during a sequence of upload/save operations.
 *
 * If the server is unreachable (network error, server not started), returns a
 * failed result instead of throwing — callers decide what to do.
 */
export async function checkHealth(timeoutMs = 12_000): Promise<HealthCheckResult> {
  // Return cached result if still fresh
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("/api/health-check", {
      method:  "GET",
      headers: { "Cache-Control": "no-cache" },
      signal:  controller.signal,
    });

    let data: HealthCheckResult;
    try {
      data = (await res.json()) as HealthCheckResult;
    } catch {
      data = {
        ok:           false,
        provider:     undefined,
        serviceRole:  false,
        projectUrl:   null,
        database:     false,
        storage:      false,
        bucketStatus: {},
        errors:       [`Server mengembalikan respons tidak valid (HTTP ${res.status})`],
      };
    }

    _cache = { result: data, fetchedAt: Date.now() };
    return data;
  } catch (e) {
    const msg = e instanceof Error
      ? (e.name === "AbortError" ? "Health check timeout — server tidak merespons" : e.message)
      : String(e);

    const failed: HealthCheckResult = {
      ok:           false,
      provider:     undefined,
      serviceRole:  false,
      projectUrl:   null,
      database:     false,
      storage:      false,
      bucketStatus: {},
      errors:       [`Tidak bisa menghubungi server: ${msg}`],
    };
    // Don't cache network errors — let the next call retry immediately
    return failed;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Throws a user-friendly Error if the health check fails.
 * Use this before any critical upload or DB write operation.
 *
 * @param context - Short label shown in the error message (e.g. "Upload Gambar Kartu")
 */
export async function assertHealthy(context?: string): Promise<void> {
  const result = await checkHealth();
  if (result.ok) return;

  const label   = context ? `${context}: ` : "";
  const primary = !result.serviceRole
    ? `SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di ${providerLabel(result.provider)}`
    : !result.database
      ? "Database tidak bisa diakses — cek konfigurasi Supabase"
      : !result.storage
        ? "Storage Supabase tidak tersedia — cek bucket di dashboard Supabase"
        : "Konfigurasi Supabase belum valid";

  const details = result.errors.length > 0
    ? result.errors.slice(0, 3).join(" · ")
    : primary;

  throw new Error(`${label}${details}`);
}

/**
 * Returns a short human-readable summary of the health status.
 * Useful for status indicators in the UI.
 */
export function describeHealth(result: HealthCheckResult): {
  label:  string;
  detail: string;
  level:  "ok" | "warn" | "error";
} {
  if (result.ok) {
    return {
      label:  "Supabase OK",
      detail: "Database & storage terkoneksi",
      level:  "ok",
    };
  }
  if (!result.serviceRole) {
    return {
      label:  "Service role key tidak ada",
      detail: `Tambahkan SUPABASE_SERVICE_ROLE_KEY di ${providerLabel(result.provider)}`,
      level:  "error",
    };
  }
  if (!result.database) {
    return {
      label:  "Database tidak bisa diakses",
      detail: result.errors[0] ?? "Cek URL dan service role key Supabase",
      level:  "error",
    };
  }
  const missingBuckets = Object.entries(result.bucketStatus)
    .filter(([, v]) => v === "missing")
    .map(([k]) => k);
  if (missingBuckets.length > 0) {
    return {
      label:  `Bucket hilang: ${missingBuckets.join(", ")}`,
      detail: "Buat bucket yang hilang di Supabase Storage dashboard",
      level:  "warn",
    };
  }
  return {
    label:  "Konfigurasi tidak valid",
    detail: result.errors[0] ?? "Cek konfigurasi Supabase",
    level:  "error",
  };
}
