import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, getCurrentAgencyId, useAuthStore } from "@/store/authStore";
import { makePersistedCache } from "@/lib/persistedCache";
import { withTimeout } from "@/lib/supabaseTimeout";

/**
 * Client = kontak independen per-agency. Tidak terikat ke trip atau package
 * tertentu — satu client bisa punya banyak Order (umrah, flight, visa, …).
 *
 * Backwards compat: backfill SQL meng-mirror tiap row `jamaah` lama jadi
 * `clients` row dengan `legacyJamaahId` = jamaah.id, jadi data jamaah lama
 * tetap aman & bisa ditelusuri balik.
 */
export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  birthDate?: string;
  passportNumber?: string;
  passportExpiry?: string;
  gender?: "L" | "P" | "";
  photoDataUrl?: string;
  notes?: string;
  legacyJamaahId?: string;
  /** UID agent yg input client ini (null/undef = ditambahkan oleh owner/staff).
   *  Auto-injected client-side oleh createClient() kalau user role 'agent'. */
  createdByAgent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClientDraft = Omit<Client, "id" | "createdAt" | "updatedAt">;

const CLIENTS_KEY = "clients";
const cache = makePersistedCache<Client>(CLIENTS_KEY);

const _mem: { clients?: Client[] } = {};
function loadCache(): Client[] {
  if (_mem.clients === undefined) _mem.clients = cache.read(getCurrentAgencyId()) as Client[];
  return _mem.clients!.slice();
}
function saveCache(items: Client[]) {
  _mem.clients = items.slice();
  cache.write(getCurrentAgencyId(), items);
}

const fromRow = (r: Record<string, unknown>): Client => ({
  id: String(r.id),
  name: String(r.name ?? ""),
  phone: String(r.phone ?? ""),
  email: (r.email as string) ?? undefined,
  birthDate: (r.birth_date as string) ?? undefined,
  passportNumber: (r.passport_number as string) ?? undefined,
  passportExpiry: (r.passport_expiry as string) ?? undefined,
  gender: ((r.gender as string) ?? "") as Client["gender"],
  photoDataUrl: (r.photo_data_url as string) ?? undefined,
  notes: (r.notes as string) ?? undefined,
  legacyJamaahId: (r.legacy_jamaah_id as string) ?? undefined,
  createdByAgent: (r.created_by_agent as string) ?? null,
  createdAt: String(r.created_at ?? new Date().toISOString()),
  updatedAt: String(r.updated_at ?? r.created_at ?? new Date().toISOString()),
});

const toRow = (c: Partial<Client>, agencyId?: string) => ({
  ...(c.id ? { id: c.id } : {}),
  ...(c.name !== undefined ? { name: c.name } : {}),
  ...(c.phone !== undefined ? { phone: c.phone } : {}),
  ...(c.email !== undefined ? { email: c.email || null } : {}),
  ...(c.birthDate !== undefined ? { birth_date: c.birthDate || null } : {}),
  ...(c.passportNumber !== undefined ? { passport_number: c.passportNumber || null } : {}),
  ...(c.passportExpiry !== undefined ? { passport_expiry: c.passportExpiry || null } : {}),
  ...(c.gender !== undefined ? { gender: c.gender || null } : {}),
  ...(c.photoDataUrl !== undefined ? { photo_data_url: c.photoDataUrl || null } : {}),
  ...(c.notes !== undefined ? { notes: c.notes || null } : {}),
  ...(c.legacyJamaahId !== undefined ? { legacy_jamaah_id: c.legacyJamaahId || null } : {}),
  ...(c.createdByAgent !== undefined ? { created_by_agent: c.createdByAgent } : {}),
  ...(agencyId ? { agency_id: agencyId } : {}),
});

export async function listClients(): Promise<Client[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await withTimeout(
        supabase!
          .from("clients")
          .select("*")
          .order("created_at", { ascending: false }),
        10000,
      );
      if (error) throw error;
      const items = (data ?? []).map(fromRow);
      saveCache(items);
      return items;
    } catch (err) {
      const cached = loadCache();
      console.warn(`[clients] list dari Supabase gagal, pakai cache lokal (${cached.length} item):`, err);
      return cached;
    }
  }
  return loadCache();
}

export async function getClient(id: string): Promise<Client | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase!.from("clients").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }
  return loadCache().find((c) => c.id === id) ?? null;
}

export async function createClient(draft: ClientDraft): Promise<Client> {
  const now = new Date().toISOString();
  // Auto-attribute klien ke agent (kalau current user agent & belum di-set).
  const me = useAuthStore.getState().user;
  const enriched: ClientDraft =
    me?.role === "agent" && draft.createdByAgent == null
      ? { ...draft, createdByAgent: me.id }
      : draft;

  if (isSupabaseConfigured()) {
    const agencyId = requireAgencyId();
    const { data, error } = await withTimeout(
      supabase!
        .from("clients")
        .insert(toRow(enriched, agencyId))
        .select("*")
        .single(),
    );
    if (error) throw error;
    const c = fromRow(data);
    saveCache([c, ...loadCache()]);
    return c;
  }
  const c: Client = {
    ...enriched,
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  saveCache([c, ...loadCache()]);
  return c;
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<Client> {
  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("clients")
        .update(toRow(patch))
        .eq("id", id)
        .select("*")
        .single(),
    );
    if (error) throw error;
    const c = fromRow(data);
    saveCache(loadCache().map((x) => (x.id === id ? c : x)));
    return c;
  }
  const all = loadCache();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Client not found");
  const updated = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  saveCache(all);
  return updated;
}

export async function deleteClient(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("clients")
        .delete()
        .eq("id", id)
        .select("id"),
    );
    if (error) {
      console.error(`[clients] DELETE id=${id} gagal:`, error);
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error(
        `Hapus client gagal — server tidak menghapus baris (kemungkinan RLS DELETE policy nge-blok). Cek policy "clients_delete" di Supabase.`,
      );
    }
  }
  saveCache(loadCache().filter((c) => c.id !== id));
}

/** Reset cache — biasanya dipanggil saat ganti agency. */
export function resetClientsCache() {
  _mem.clients = undefined;
}
