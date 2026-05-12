/**
 * Supabase stub — all database access now goes through the server-side REST API.
 * This file is kept for backward-compatibility with existing imports, but the
 * client is always null so repos fall back to localStorage / API calls.
 */

export const supabase = null;

export function isSupabaseConfigured(): boolean {
  return false;
}

export function requireSupabase(): never {
  throw new Error("Supabase tidak dikonfigurasi — gunakan REST API server");
}

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
