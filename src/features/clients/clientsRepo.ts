import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, getCurrentAgencyId, useAuthStore } from "@/store/authStore";
import { makePersistedCache } from "@/lib/persistedCache";
import { withTimeout } from "@/lib/supabaseTimeout";
import { isDataUrl, uploadClientPhoto } from "@/lib/supabaseStorage";

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
  birthPlace?: string;
  passportNumber?: string;
  passportExpiry?: string;
  passportIssueDate?: string;
  passportIssuingOffice?: string;
  gender?: "L" | "P" | "";
  photoDataUrl?: string;
  notes?: string;
  legacyJamaahId?: string;
  /** UID agent yg input client ini (null/undef = ditambahkan oleh owner/staff).
   *  Auto-injected client-side oleh createClient() kalau user role 'agent'. */
  createdByAgent?: string | null;
  /** ID klien lain yg mereferensikan klien ini.
   *  Saat order klien ini sukses, referrer dapat +1 referral_stamp otomatis via trigger DB. */
  referredByClientId?: string | null;
  /** Jumlah bonus stamp dari referral — diincrement otomatis via trigger DB. */
  referralStamps?: number;
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

/** Full mapper — dipakai untuk detail view (getClient), insert, dan update. */
const fromRow = (r: Record<string, unknown>): Client => ({
  id: String(r.id),
  name: String(r.name ?? ""),
  phone: String(r.phone ?? ""),
  email: (r.email as string) ?? undefined,
  birthDate: (r.birth_date as string) ?? undefined,
  birthPlace: (r.birth_place as string) ?? undefined,
  passportNumber: (r.passport_number as string) ?? undefined,
  passportExpiry: (r.passport_expiry as string) ?? undefined,
  passportIssueDate: (r.passport_issue_date as string) ?? undefined,
  passportIssuingOffice: (r.passport_issuing_office as string) ?? undefined,
  gender: ((r.gender as string) ?? "") as Client["gender"],
  photoDataUrl: (r.photo_data_url as string) ?? undefined,
  notes: (r.notes as string) ?? undefined,
  legacyJamaahId: (r.legacy_jamaah_id as string) ?? undefined,
  createdByAgent: (r.created_by_agent as string) ?? null,
  referredByClientId: (r.referred_by_client_id as string) ?? null,
  referralStamps: Number(r.referral_stamps ?? 0),
  createdAt: String(r.created_at ?? new Date().toISOString()),
  updatedAt: String(r.updated_at ?? r.created_at ?? new Date().toISOString()),
});

/**
 * Lean mapper untuk list query — sama seperti fromRow tapi strip base64 photos.
 *
 * Kenapa: photo_data_url bisa ratusan KB per klien. Kalau 50 klien × 500KB =
 * 25MB hanya untuk list yang bahkan tidak menampilkan foto! Storage URL (~100
 * chars) tetap disimpan — hanya base64 yang dibuang.
 *
 * After migration (migrateClientsToStorage), semua foto sudah jadi URL,
 * sehingga tidak ada data yang dibuang. Fungsi ini menjadi no-op.
 */
const fromRowList = (r: Record<string, unknown>): Client => {
  const c = fromRow(r);
  if (isDataUrl(c.photoDataUrl)) {
    return { ...c, photoDataUrl: undefined };
  }
  return c;
};

const toRow = (c: Partial<Client>, agencyId?: string) => ({
  ...(c.id ? { id: c.id } : {}),
  ...(c.name !== undefined ? { name: c.name } : {}),
  ...(c.phone !== undefined ? { phone: c.phone } : {}),
  ...(c.email !== undefined ? { email: c.email || null } : {}),
  ...(c.birthDate !== undefined ? { birth_date: c.birthDate || null } : {}),
  ...(c.birthPlace !== undefined ? { birth_place: c.birthPlace || null } : {}),
  ...(c.passportNumber !== undefined ? { passport_number: c.passportNumber || null } : {}),
  ...(c.passportExpiry !== undefined ? { passport_expiry: c.passportExpiry || null } : {}),
  ...(c.passportIssueDate !== undefined ? { passport_issue_date: c.passportIssueDate || null } : {}),
  ...(c.passportIssuingOffice !== undefined ? { passport_issuing_office: c.passportIssuingOffice || null } : {}),
  ...(c.gender !== undefined ? { gender: c.gender || null } : {}),
  ...(c.photoDataUrl !== undefined ? { photo_data_url: c.photoDataUrl || null } : {}),
  ...(c.notes !== undefined ? { notes: c.notes || null } : {}),
  ...(c.legacyJamaahId !== undefined ? { legacy_jamaah_id: c.legacyJamaahId || null } : {}),
  ...(c.createdByAgent !== undefined ? { created_by_agent: c.createdByAgent } : {}),
  ...(c.referredByClientId !== undefined ? { referred_by_client_id: c.referredByClientId ?? null } : {}),
  ...(agencyId ? { agency_id: agencyId } : {}),
});

/**
 * Auto-upload foto base64 ke Supabase Storage sebelum disimpan ke DB.
 * Idempotent — kalau input sudah berupa URL, langsung return.
 */
async function resolvePhoto(
  photoDataUrl: string | undefined,
  ref: string,
  passportNumber?: string,
): Promise<string | undefined> {
  if (!photoDataUrl) return undefined;
  if (!isDataUrl(photoDataUrl)) return photoDataUrl;
  if (!isSupabaseConfigured()) return photoDataUrl;
  try {
    const url = await uploadClientPhoto(ref, passportNumber, photoDataUrl);
    return url;
  } catch (e) {
    console.warn("[clients] photo upload failed, keeping base64:", e);
    return photoDataUrl;
  }
}

export async function listClients(): Promise<Client[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await withTimeout(
        supabase!
          .from("clients")
          .select("id,name,phone,email,birth_date,birth_place,passport_number,passport_expiry,passport_issue_date,passport_issuing_office,gender,notes,legacy_jamaah_id,created_by_agent,referred_by_client_id,referral_stamps,created_at,updated_at")
          .order("created_at", { ascending: false }),
        10000,
      );
      if (error) throw error;
      // fromRowList: strip base64 photos dari cache list — hemat localStorage
      // dan memory. Storage URL (http...) tetap disimpan.
      const items = (data ?? []).map(fromRowList);
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
    // fromRow penuh — detail view butuh foto
    return data ? fromRow(data) : null;
  }
  return loadCache().find((c) => c.id === id) ?? null;
}

export async function createClient(draft: ClientDraft): Promise<Client> {
  const now = new Date().toISOString();
  const me = useAuthStore.getState().user;
  const enriched: ClientDraft =
    me?.role === "agent" && draft.createdByAgent == null
      ? { ...draft, createdByAgent: me.id }
      : draft;

  // Auto-upload foto base64 → Storage sebelum simpan ke DB
  const resolvedPhoto = await resolvePhoto(
    enriched.photoDataUrl,
    `new-${Date.now()}`,
    enriched.passportNumber,
  );
  const finalDraft = resolvedPhoto !== enriched.photoDataUrl
    ? { ...enriched, photoDataUrl: resolvedPhoto }
    : enriched;

  if (isSupabaseConfigured()) {
    const agencyId = requireAgencyId();
    const { data, error } = await withTimeout(
      supabase!
        .from("clients")
        .insert(toRow(finalDraft, agencyId))
        .select("*")
        .single(),
    );
    if (error) throw error;
    const c = fromRow(data);
    saveCache([c, ...loadCache()]);
    return c;
  }
  const c: Client = {
    ...finalDraft,
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  saveCache([c, ...loadCache()]);
  return c;
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<Client> {
  // Auto-upload foto base64 → Storage sebelum update ke DB
  const resolvedPhoto = await resolvePhoto(
    patch.photoDataUrl,
    id,
    patch.passportNumber,
  );
  const finalPatch = resolvedPhoto !== patch.photoDataUrl
    ? { ...patch, photoDataUrl: resolvedPhoto }
    : patch;

  if (isSupabaseConfigured()) {
    const { data, error } = await withTimeout(
      supabase!
        .from("clients")
        .update(toRow(finalPatch))
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
  const updated = { ...all[idx], ...finalPatch, updatedAt: new Date().toISOString() };
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

/** Row mapper untuk realtime payload — dipakai oleh supabaseRealtime.ts. */
export { fromRowList as mapClientListRow };
