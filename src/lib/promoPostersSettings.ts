/**
 * Promo Posters — kelola poster/iklan Temantiket yang tampil di halaman publik member card.
 *
 * Admin (owner) simpan poster via Settings → Promo.
 * Disimpan di agency_settings key "promo_posters" (array JSON).
 * Halaman publik fetch via RPC get_public_promo_posters(p_slug) — SECURITY DEFINER, anon-safe.
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface PromoPost {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  active: boolean;
  order: number;
}

const STORAGE_KEY = "igh:promo-posters";
const CLOUD_KEY = "promo_posters";

export function loadPromoPosters(): PromoPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PromoPost[];
  } catch {
    return [];
  }
}

export function savePromoPosters(posts: PromoPost[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    window.dispatchEvent(new CustomEvent("igh:promo-posters-changed", { detail: posts }));
  } catch { /* noop */ }
  void pushAgencySetting(CLOUD_KEY, posts);
}

export async function pullPromoPosters(): Promise<PromoPost[] | null> {
  const remote = await pullAgencySetting<PromoPost[]>(CLOUD_KEY);
  if (!remote) return null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    window.dispatchEvent(new CustomEvent("igh:promo-posters-changed", { detail: remote }));
  } catch { /* noop */ }
  return remote;
}

/** Fetch poster publik untuk halaman member card (anon-safe via RPC). */
export async function fetchPublicPromoPosters(slug: string): Promise<PromoPost[]> {
  if (!isSupabaseConfigured() || !slug) return [];
  try {
    const { data, error } = await supabase!.rpc("get_public_promo_posters", { p_slug: slug });
    if (error) {
      console.warn("[promoPosters] fetch failed:", error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data as PromoPost[];
  } catch (e) {
    console.warn("[promoPosters] fetch exception:", e);
    return [];
  }
}

export function makeNewPost(order: number): PromoPost {
  return {
    id: `poster_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    caption: "",
    imageUrl: "",
    ctaLabel: "Info Lebih Lanjut",
    ctaUrl: "",
    active: true,
    order,
  };
}
