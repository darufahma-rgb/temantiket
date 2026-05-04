/**
 * settingsSync — cloud sync helpers for key-value settings.
 *
 * Tables used:
 *   public.agency_settings  (agency_id, key, value jsonb)
 *   public.user_settings    (user_id,   key, value jsonb)
 *
 * Pattern: localStorage is always the instant cache; every save also
 * fires a fire-and-forget upsert to Supabase.  On app startup, call
 * pullAgencySettings / pullUserSettings to hydrate localStorage from cloud.
 *
 * Each push/pull updates the per-feature sync status via featureSyncStore
 * so UI components can show a live dot next to each save button.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { requireAgencyId, getCurrentAgencyId } from "@/store/authStore";
import { beginFeatureSync, resolveFeatureSync } from "@/store/featureSyncStore";

// ── Agency-scoped settings ─────────────────────────────────────────────────

export async function pullAgencySetting<T>(key: string): Promise<T | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const agencyId = getCurrentAgencyId();
    if (!agencyId) return null;
    const { data, error } = await supabase!
      .from("agency_settings")
      .select("value")
      .eq("agency_id", agencyId)
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.warn(`[settingsSync] pullAgencySetting(${key}) gagal:`, error.message);
      return null;
    }
    return (data?.value ?? null) as T | null;
  } catch (e) {
    console.warn(`[settingsSync] pullAgencySetting(${key}) exception:`, e);
    return null;
  }
}

export async function pushAgencySetting(key: string, value: unknown): Promise<void> {
  const canSync = beginFeatureSync(key);
  if (!canSync) return;
  try {
    const agencyId = requireAgencyId();
    const { error } = await supabase!
      .from("agency_settings")
      .upsert({ agency_id: agencyId, key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.warn(`[settingsSync] pushAgencySetting(${key}) gagal:`, error.message);
      resolveFeatureSync(key, error.message);
    } else {
      resolveFeatureSync(key);
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.warn(`[settingsSync] pushAgencySetting(${key}) exception:`, e);
    resolveFeatureSync(key, msg);
  }
}

// ── User-scoped settings ───────────────────────────────────────────────────

export async function pullUserSetting<T>(userId: string, key: string): Promise<T | null> {
  if (!isSupabaseConfigured() || !userId) return null;
  try {
    const { data, error } = await supabase!
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.warn(`[settingsSync] pullUserSetting(${key}) gagal:`, error.message);
      return null;
    }
    return (data?.value ?? null) as T | null;
  } catch (e) {
    console.warn(`[settingsSync] pullUserSetting(${key}) exception:`, e);
    return null;
  }
}

export async function pushUserSetting(userId: string, key: string, value: unknown): Promise<void> {
  const canSync = beginFeatureSync(key);
  if (!canSync) return;
  try {
    const { error } = await supabase!
      .from("user_settings")
      .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.warn(`[settingsSync] pushUserSetting(${key}) gagal:`, error.message);
      resolveFeatureSync(key, error.message);
    } else {
      resolveFeatureSync(key);
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.warn(`[settingsSync] pushUserSetting(${key}) exception:`, e);
    resolveFeatureSync(key, msg);
  }
}
