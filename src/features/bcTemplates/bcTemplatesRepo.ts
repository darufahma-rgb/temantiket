/**
 * bcTemplatesRepo — CRUD template BC (Broadcast) WhatsApp.
 *
 * Template disimpan di Supabase table `bc_templates`.
 * Fallback ke localStorage kalau Supabase belum dikonfigurasi.
 *
 * Variabel dinamis di body template menggunakan format {{NAMA_VARIABEL}}.
 * Contoh: "Halo {{NAMA_KLIEN}}, visa {{JENIS_VISA}} lo sudah {{STATUS}}!"
 * UI bakal auto-detect variabel dan kasih form isian sebelum copy.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, getCurrentAgencyId, useAuthStore } from "@/store/authStore";
import { withTimeout } from "@/lib/supabaseTimeout";
import { makePersistedCache } from "@/lib/persistedCache";

export type BCCategory =
  | "visa_on_arrival"
  | "visa_pelajar"
  | "tiket_pesawat"
  | "umrah"
  | "haji"
  | "general";

export const BC_CATEGORIES: { key: BCCategory; label: string; emoji: string; color: string }[] = [
  { key: "umrah",           label: "Umrah",           emoji: "🕋", color: "bg-sky-100 text-sky-800 border-sky-200" },
  { key: "haji",            label: "Haji",             emoji: "🌙", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { key: "visa_on_arrival", label: "Visa on Arrival",  emoji: "🛂", color: "bg-violet-100 text-violet-800 border-violet-200" },
  { key: "visa_pelajar",    label: "Visa Pelajar",     emoji: "📚", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  { key: "tiket_pesawat",   label: "Tiket Pesawat",    emoji: "✈️", color: "bg-orange-100 text-orange-800 border-orange-200" },
  { key: "general",         label: "Umum",             emoji: "💬", color: "bg-slate-100 text-slate-700 border-slate-200" },
];

export interface BCTemplate {
  id: string;
  agencyId: string;
  title: string;
  category: BCCategory;
  body: string;
  sortOrder: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BCTemplateDraft {
  title: string;
  category: BCCategory;
  body: string;
  sortOrder?: number;
}

/** Extract semua nama variabel {{VAR}} dari body template. */
export function extractVariables(body: string): string[] {
  const matches = body.matchAll(/\{\{([A-Z0-9_]+)\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return Array.from(seen);
}

/** Ganti semua {{VAR}} di body dgn nilai dari map. */
export function applyVariables(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

// ── Cache per-agency (scoped seperti packages/trips/clients) ───────────────
// Sebelumnya pakai flat key "bc_templates_cache" yang tidak di-scope per
// agency — menyebabkan data bocor antar akun di browser yang sama.
const _persistedCache = makePersistedCache<BCTemplate>("bc_templates");
const _mem: { items?: BCTemplate[] } = {};

function loadCache(): BCTemplate[] {
  if (_mem.items === undefined) {
    _mem.items = _persistedCache.read(getCurrentAgencyId());
  }
  return _mem.items!.slice();
}
function saveCache(list: BCTemplate[]) {
  _mem.items = list.slice();
  _persistedCache.write(getCurrentAgencyId(), list);
}

function fromRow(r: Record<string, unknown>): BCTemplate {
  return {
    id:         String(r.id),
    agencyId:   String(r.agency_id),
    title:      String(r.title ?? ""),
    category:   String(r.category ?? "general") as BCCategory,
    body:       String(r.body ?? ""),
    sortOrder:  Number(r.sort_order ?? 0),
    createdBy:  (r.created_by as string) ?? null,
    createdAt:  String(r.created_at ?? new Date().toISOString()),
    updatedAt:  String(r.updated_at ?? new Date().toISOString()),
  };
}

function toRow(d: Partial<BCTemplateDraft> & { agency_id?: string; created_by?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.agency_id  !== undefined) out.agency_id   = d.agency_id;
  if (d.created_by !== undefined) out.created_by  = d.created_by;
  if (d.title      !== undefined) out.title        = d.title;
  if (d.category   !== undefined) out.category     = d.category;
  if (d.body       !== undefined) out.body         = d.body;
  if (d.sortOrder  !== undefined) out.sort_order   = d.sortOrder;
  return out;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<BCTemplate[]> {
  if (isSupabaseConfigured()) {
    try {
      const agencyId = requireAgencyId();
      const { data, error } = await withTimeout(
        supabase!
          .from("bc_templates")
          .select("*")
          // Filter eksplisit per-agency — tidak hanya mengandalkan RLS.
          // Ini mencegah bug "template hilang" saat RLS dikonfigurasi longgar
          // atau saat query lintas-tenant.
          .eq("agency_id", agencyId)
          .order("category")
          .order("sort_order")
          .order("created_at"),
        10000,
      );
      if (error) throw error;
      const list = (data ?? []).map(fromRow);
      // BUG FIX: Sebelumnya saveCache(list) selalu dipanggil meski list=[].
      // Kalau Supabase return [] karena RLS block (bukan karena memang kosong),
      // cache lokal ikut terhapus → data hilang setelah pindah halaman.
      //
      // Sekarang: hanya overwrite cache kalau ada data yang kembali.
      // Kalau result kosong, tampilkan cache lokal sebagai fallback.
      if (list.length > 0) {
        saveCache(list);
        return list;
      }
      const cached = loadCache();
      if (cached.length > 0) {
        console.warn("[bcTemplates] Supabase return kosong tapi ada cache lokal — pakai cache. Cek RLS policy tabel bc_templates.");
        return cached;
      }
      // Genuinely empty (user belum buat template apapun).
      saveCache([]);
      return [];
    } catch (err) {
      console.warn("[bcTemplates] fetch gagal, pakai cache:", err);
      return loadCache();
    }
  }
  return loadCache();
}

export async function createTemplate(draft: BCTemplateDraft): Promise<BCTemplate> {
  const me = useAuthStore.getState().user;
  if (isSupabaseConfigured()) {
    const agencyId = requireAgencyId();
    const { data, error } = await withTimeout(
      supabase!
        .from("bc_templates")
        .insert({
          ...toRow(draft),
          agency_id:  agencyId,
          created_by: me?.id ?? null,
        })
        .select("*")
        .single(),
    );
    if (error) throw error;
    const t = fromRow(data);
    saveCache([t, ...loadCache()]);
    return t;
  }
  const now = new Date().toISOString();
  const t: BCTemplate = {
    ...draft,
    id:         `bct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    agencyId:   "local",
    sortOrder:  draft.sortOrder ?? 0,
    createdBy:  me?.id ?? null,
    createdAt:  now,
    updatedAt:  now,
  };
  saveCache([t, ...loadCache()]);
  return t;
}

export async function updateTemplate(id: string, patch: Partial<BCTemplateDraft>): Promise<BCTemplate> {
  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("bc_templates")
        .update(toRow(patch))
        .eq("id", id)
        .select("*")
        .single(),
    );
    if (error) throw error;
    const t = fromRow(data);
    saveCache(loadCache().map((x) => (x.id === id ? t : x)));
    return t;
  }
  const all = loadCache();
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Template tidak ditemukan");
  const t = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = t;
  saveCache(all);
  return t;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("bc_templates")
        .delete()
        .eq("id", id)
        .select("id"),
    );
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Hapus template gagal — kemungkinan RLS block DELETE. Cek policy bc_templates_delete di Supabase.");
    }
  }
  saveCache(loadCache().filter((x) => x.id !== id));
}
