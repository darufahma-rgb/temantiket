import { supabase } from "@/lib/supabase";

// ── Token cache ───────────────────────────────────────────────────────────────
// Reuse the JWT for up to 50 s to avoid a Supabase network roundtrip before
// every single AI call. Tokens are valid for ~1 hour so 50 s is safe.
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;
  try {
    const { data } = await supabase.auth.getSession();
    _cachedToken = data.session?.access_token ?? null;
    _tokenExpiry = now + 50_000;
  } catch {
    _cachedToken = null;
  }
  return _cachedToken;
}

/**
 * Returns headers for /api/ai/chat (and other authenticated AI routes).
 * Uses a 50-second in-memory token cache so Supabase is not called before
 * every single AI request.
 */
export async function getAIHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
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
 * callAIAssistant — helper untuk /api/ai/assistant (AITEM, OpenAI).
 * Endpoint ini hanya menggunakan OpenAI — tidak pernah ke OpenRouter.
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
