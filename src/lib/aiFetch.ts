import { getAccessToken } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

/**
 * Returns base headers for /api/ai/chat and other AI routes.
 * Includes Supabase Bearer JWT so routes that require isAuthenticatedOrBearer pass.
 *
 * Strategy:
 * 1. Fast path — synchronous localStorage read via getAccessToken()
 * 2. Reliable fallback — supabase.auth.getSession() if the fast path returns null
 *    (handles cases where the SDK stores the session under a different key format)
 */
export async function getAIHeaders(): Promise<Record<string, string>> {
  let token = getAccessToken();

  if (!token && supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch { /* ignore — will proceed without auth header */ }
  }

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Central AI caller ─────────────────────────────────────────────────────────

export interface CallAIOptions {
  /** AbortSignal from the caller — combined with the internal timeout. */
  signal?: AbortSignal;
  /** Request timeout in ms before aborting. Default: 60 000 (60 s). */
  timeoutMs?: number;
  /**
   * Max automatic retries on transient errors (network failure, 5xx from server).
   * 4xx errors are never retried. Default: 2.
   */
  retries?: number;
}

/**
 * callAI — helper untuk /api/ai/chat (Caption Generator, OpenRouter).
 * Gunakan callAIAssistant() untuk AITEM yang menggunakan OpenAI.
 */
export async function callAI(
  body: Record<string, unknown>,
  options: CallAIOptions = {},
): Promise<Response> {
  return _callEndpoint("/api/ai/chat", body, options);
}

/**
 * callAIAssistant — helper untuk /api/ai/assistant (AITEM).
 * Menggunakan OpenRouter untuk semua AI features.
 */
export async function callAIAssistant(
  body: Record<string, unknown>,
  options: CallAIOptions = {},
): Promise<Response> {
  return _callEndpoint("/api/ai/assistant", body, options);
}

/**
 * _callEndpoint — implementasi generik dengan retry, timeout, dan token cache.
 * Dipakai oleh callAI() dan callAIAssistant().
 */
async function _callEndpoint(
  endpoint: string,
  body: Record<string, unknown>,
  options: CallAIOptions = {},
): Promise<Response> {
  const { signal: callerSignal, timeoutMs = 60_000, retries = 2 } = options;

  const headers = await getAIHeaders();

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (callerSignal?.aborted) throw new DOMException("Dibatalkan", "AbortError");

    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return res;

      // 4xx — do NOT retry
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => "");
        const msg = parseErrBody(text, res.status);
        throw new Error(msg);
      }

      // 5xx — retry if attempts remain
      if (attempt > retries) {
        const text = await res.text().catch(() => "");
        const msg = parseErrBody(text, res.status);
        throw new Error(msg);
      }
    } catch (e: unknown) {
      if (isAbortError(e)) {
        throw new Error("AI request timeout — coba lagi beberapa saat");
      }
      if (attempt > retries || !isRetryable(e)) throw e;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }

    // Exponential backoff: 500 ms, 1 000 ms, …
    await sleep(500 * attempt);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAbortError(e: unknown): boolean {
  return (
    e instanceof DOMException && e.name === "AbortError" ||
    e instanceof Error && e.name === "AbortError"
  );
}

function isRetryable(e: unknown): boolean {
  // Retry on network errors (TypeError: Failed to fetch) but not on known API errors
  return e instanceof TypeError;
}

function parseErrBody(text: string, status: number): string {
  try {
    const json = JSON.parse(text);
    const e = json?.error;
    if (e !== undefined && e !== null) {
      if (typeof e === "string") return e;
      if (typeof e === "object") {
        return (
          e.message ||
          e.msg ||
          e.detail ||
          (e.metadata?.raw) ||
          JSON.stringify(e).slice(0, 300)
        );
      }
    }
    if (json?.message && typeof json.message === "string") return json.message;
  } catch { /* ignore */ }
  return `AI error ${status}: ${text.slice(0, 200)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
