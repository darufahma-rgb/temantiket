/**
 * Shared helper for attaching Supabase Bearer JWT to server API calls.
 *
 * Strategy:
 *  1. Fast path  — read synchronously from localStorage via getAccessToken()
 *  2. Fallback   — ask Supabase SDK for the active session (authoritative, handles
 *                  token refresh and key-format variations across SDK versions)
 *
 * Usage:
 *   const authH = await getBearer();
 *   const res = await fetch("/api/...", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json", ...authH },
 *     body: JSON.stringify(payload),
 *   });
 */

import { getAccessToken } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

/**
 * Returns `{ Authorization: "Bearer <token>" }` when a session exists,
 * or `{}` when the user is not authenticated.
 */
export async function getBearer(): Promise<Record<string, string>> {
  let token = getAccessToken();

  if (!token && supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? null;
    } catch {
      /* ignore — caller will proceed without auth header */
    }
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}
