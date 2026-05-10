/**
 * cardBackStorage — Upload & load gambar belakang kartu staff/owner/agent.
 *
 * Storage path: card-backs/{role}/{userId}/card-back.jpg
 * DB field:     agency_members.card_back_image_url  (canonical public URL)
 *
 * Upload flow (no base64, direct-to-storage):
 *   1. Resize image client-side (canvas, JPEG 0.92)
 *   2. POST /api/card-back-signed-url → { signedUrl, storagePath }
 *      Server: validates auth + auto-creates bucket + generates signed upload URL
 *   3. PUT blob directly to signedUrl (browser → Supabase Storage, no proxy)
 *   4. POST /api/save-card-back-url → server updates agency_members.card_back_image_url
 *   5. Return fresh signed URL (7 days) for immediate display
 *
 * Load flow:
 *   1. Read card_back_image_url from agency_members (anon client, RLS applies)
 *   2. Extract storage path from canonical URL
 *   3. Generate fresh signed URL (7-day) from storage path
 *   4. Fallback: use stored public URL with cache-buster
 */
import { supabase } from "@/lib/supabase";

const BUCKET = "card-backs";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export type CardRole = "agent" | "staff" | "owner";

async function resizeToBlob(file: File, maxW = 1600, maxH = 2000, quality = 0.92): Promise<Blob> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal memuat gambar."));
      el.src = blobUrl;
    });
    const ratio = Math.min(1, maxW / img.width, maxH / img.height);
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(img.width  * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak didukung.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Gagal encode gambar."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Extract storage path from a canonical Supabase Storage public URL. */
function extractStoragePath(canonicalUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = canonicalUrl.indexOf(marker);
  if (idx === -1) return null;
  return canonicalUrl.slice(idx + marker.length).split("?")[0];
}

/** Build a 7-day signed URL for display. Returns null on any failure. */
async function buildSignedUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    return `${data.signedUrl}&cb=${Math.floor(Date.now() / 60000)}`;
  } catch {
    return null;
  }
}

/**
 * Upload gambar belakang kartu ke Supabase Storage.
 *
 * Uses signed upload URL flow (no base64, no timeout issues):
 *   - Server issues a signed URL (bypasses storage RLS, auto-creates bucket)
 *   - Browser PUTs blob directly to Supabase Storage
 *   - Server updates DB record via service-role key
 *
 * @param userId      Supabase auth UUID of the card owner
 * @param file        Image file selected by user
 * @param agencyId    Agency UUID
 * @param targetRole  Role of the card owner ('agent' | 'staff' | 'owner')
 * @returns           Signed display URL (7 days) or canonical public URL
 */
export async function uploadCardBack(
  userId: string,
  file: File,
  agencyId: string,
  targetRole: CardRole = "agent",
): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran maksimum 10 MB.");
  if (!userId || userId.length < 10)
    throw new Error(`userId tidak valid: "${userId}". Harus berupa Supabase auth UUID.`);
  if (!agencyId || agencyId.length < 10)
    throw new Error(`agencyId tidak valid: "${agencyId}".`);

  const role: CardRole = ["agent", "staff", "owner"].includes(targetRole)
    ? targetRole
    : "agent";

  console.log(
    `[cardBackStorage] uploadCardBack — userId=${userId} role=${role} agencyId=${agencyId} size=${file.size}`,
  );

  // ── 1. Refresh session if near expiry ──────────────────────────────────────
  const { data: sessData } = await supabase.auth.getSession();
  const session = sessData.session;
  if (!session?.access_token) throw new Error("Sesi tidak valid — silakan login ulang.");
  let accessToken = session.access_token;
  const nowSec = Math.floor(Date.now() / 1000);
  if ((session.expires_at ?? 0) - nowSec < 60) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session?.access_token) {
        accessToken = refreshed.session.access_token;
        console.log("[cardBackStorage] session refreshed before upload");
      }
    } catch { /* ignore */ }
  }

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // ── 2. Resize image → JPEG blob ────────────────────────────────────────────
  console.log("[cardBackStorage] resizing image…");
  const blob = await resizeToBlob(file, 1600, 2000, 0.92);
  console.log(`[cardBackStorage] resize done — blobSize=${blob.size}`);

  // ── 3. Get signed upload URL from server ───────────────────────────────────
  console.log("[cardBackStorage] requesting signed upload URL — endpoint=/api/card-back-signed-url");
  const signedRes = await fetch("/api/card-back-signed-url", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ targetUserId: userId, agencyId, role }),
  });
  const signedText = await signedRes.text();
  let signedJson: { signedUrl?: string; storagePath?: string; error?: string } = {};
  try { signedJson = signedText ? JSON.parse(signedText) : {}; } catch { /* empty */ }

  console.log(
    `[cardBackStorage] signed-url response: status=${signedRes.status}` +
    ` role=${role} userId=${userId} storagePath=${signedJson.storagePath ?? "—"}`,
  );

  if (!signedRes.ok) {
    const msg = signedJson.error ?? signedText.slice(0, 400);
    console.error(`[cardBackStorage] signed-url FAILED ${signedRes.status}:`, msg);
    throw new Error(`Gagal mendapatkan upload URL (${signedRes.status}): ${msg}`);
  }
  if (!signedJson.signedUrl || !signedJson.storagePath) {
    throw new Error("Server tidak mengembalikan signedUrl atau storagePath.");
  }

  const { signedUrl, storagePath } = signedJson;
  console.log(`[cardBackStorage] signed URL OK — storagePath=${storagePath}`);

  // ── 4. PUT blob directly to Supabase Storage ───────────────────────────────
  console.log(`[cardBackStorage] PUT blob to Supabase Storage — storagePath=${storagePath}`);
  const uploadCtrl = new AbortController();
  const uploadTimer = setTimeout(() => uploadCtrl.abort(), 45_000);
  try {
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
      body: blob,
      signal: uploadCtrl.signal,
    });
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => "");
      console.error(
        `[cardBackStorage] PUT FAILED status=${putRes.status} storagePath=${storagePath}:`,
        errText.slice(0, 300),
      );
      throw new Error(`Upload ke Storage gagal (${putRes.status}): ${errText.slice(0, 200)}`);
    }
    console.log(`[cardBackStorage] PUT OK — status=${putRes.status} storagePath=${storagePath}`);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError")
      throw new Error("Timeout saat upload ke Storage — coba lagi.");
    throw e;
  } finally {
    clearTimeout(uploadTimer);
  }

  // ── 5. Update DB via server ────────────────────────────────────────────────
  console.log(
    `[cardBackStorage] updating DB — endpoint=/api/save-card-back-url storagePath=${storagePath}`,
  );
  const saveRes = await fetch("/api/save-card-back-url", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ targetUserId: userId, agencyId, storagePath }),
  });
  const saveText = await saveRes.text();
  let saveJson: { ok?: boolean; url?: string; error?: string } = {};
  try { saveJson = saveText ? JSON.parse(saveText) : {}; } catch { /* empty */ }

  console.log(
    `[cardBackStorage] save-card-back-url response: status=${saveRes.status}` +
    ` storagePath=${storagePath} dbUrl=${saveJson.url ?? "—"}`,
  );

  if (!saveRes.ok) {
    const msg = saveJson.error ?? saveText.slice(0, 400);
    console.error(`[cardBackStorage] save-card-back-url FAILED ${saveRes.status}:`, msg);
    throw new Error(`Upload berhasil tapi gagal simpan ke database (${saveRes.status}): ${msg}`);
  }
  console.log(`[cardBackStorage] DB updated OK — url=${saveJson.url}`);

  // ── 6. Return signed display URL ──────────────────────────────────────────
  const signed = await buildSignedUrl(storagePath);
  if (signed) {
    console.log("[cardBackStorage] signed display URL ready");
    return signed;
  }
  const canonical =
    saveJson.url ??
    `${(supabase as unknown as { supabaseUrl?: string }).supabaseUrl ?? ""}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  return `${canonical}?t=${Date.now()}`;
}

/**
 * No-op: DB is now updated by the server inside /api/save-card-back-url.
 * Kept for API compatibility with existing callers.
 */
export async function saveCardBackUrl(
  _targetUserId: string,
  _agencyId: string,
  _displayUrl: string,
): Promise<void> {
  // DB update is handled server-side in /api/save-card-back-url.
}

/**
 * Load URL gambar belakang kartu untuk ditampilkan di kartu digital.
 *
 * Reads card_back_image_url from DB, extracts the storage path from the
 * canonical URL, then generates a fresh 7-day signed URL for display.
 *
 * @param targetUserId  Supabase auth UUID of the card owner
 * @param agencyId      Agency UUID
 * @param targetRole    Role of the card owner (used as path fallback only)
 */
export async function loadCardBackUrl(
  targetUserId: string,
  agencyId: string,
  targetRole: CardRole = "agent",
): Promise<string | null> {
  if (!supabase) return null;
  try {
    console.log(
      `[cardBackStorage] loadCardBackUrl — userId=${targetUserId} role=${targetRole}`,
    );
    const { data, error } = await supabase
      .from("agency_members")
      .select("card_back_image_url")
      .eq("user_id", targetUserId)
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (error) {
      console.warn("[cardBackStorage] loadCardBackUrl DB error:", error.message, error.code);
      return null;
    }

    const stored =
      (data as { card_back_image_url?: string | null } | null)?.card_back_image_url ?? null;
    if (!stored) {
      console.log("[cardBackStorage] loadCardBackUrl — no image stored in DB");
      return null;
    }

    // Extract storage path from canonical URL, fall back to role-based path
    const storagePath =
      extractStoragePath(stored) ??
      `${targetRole}/${targetUserId}/card-back.jpg`;

    console.log(`[cardBackStorage] loadCardBackUrl — storagePath=${storagePath}`);

    const signed = await buildSignedUrl(storagePath);
    if (signed) return signed;

    // Fallback: stored canonical URL with cache-buster
    return `${stored}?cb=${Math.floor(Date.now() / 60000)}`;
  } catch (e) {
    console.warn("[cardBackStorage] loadCardBackUrl exception:", e);
    return null;
  }
}

/** Canonical public URL for a user's card-back, organized by role. */
export function getCanonicalCardBackUrl(userId: string, role: CardRole = "agent"): string {
  if (!supabase) return "";
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(`${role}/${userId}/card-back.jpg`);
  return data.publicUrl;
}
