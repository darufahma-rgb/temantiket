import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  try {
    return (
      Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) &&
      (SUPABASE_URL.startsWith("https://") || SUPABASE_URL.startsWith("http://"))
    );
  } catch {
    return false;
  }
}

function buildClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (e) {
    console.warn("[supabase] Failed to initialise client:", e);
    return null;
  }
}

export const supabase: SupabaseClient | null = buildClient();

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase belum dikonfigurasi. Pastikan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY sudah diset.",
    );
  }
  return supabase;
}
