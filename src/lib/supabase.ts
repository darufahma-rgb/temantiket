import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: typeof window !== "undefined" ? window.localStorage : undefined,
          storageKey: "igh.supabase.auth",
        },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
