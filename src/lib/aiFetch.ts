import { supabase } from "@/lib/supabase";

/**
 * Returns headers for /api/ai/chat (and other authenticated AI routes).
 * Automatically injects the current user's Supabase JWT so the server
 * can verify the caller is a logged-in agency member.
 */
export async function getAIHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {
    /* silently continue without token — server will return 401 */
  }
  return headers;
}
