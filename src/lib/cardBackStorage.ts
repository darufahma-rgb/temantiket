/**
 * cardBackStorage — Upload & load gambar belakang kartu staff/owner/agent.
 *
 * Storage path: card-backs/{userId}/card-back.jpg
 * DB field:     agency_members.card_back_image_url  (stores canonical public URL)
 *
 * Upload flow (server-side, fully admin-controlled):
 *   1. Resize image client-side (canvas, JPEG 0.92)
 *   2. Base64-encode → POST to /api/upload-card-back (auth token + userId + agencyId)
 *   3. Server: validate auth → auto-create bucket → admin upload → admin DB update
 *   4. Server returns canonical public URL
 *   5. Client generates fresh signed URL for immediate display
 *
 * Load flow:
 *   1. Read card_back_image_url from agency_members (anon client, RLS applies)
 *   2. Generate fresh signed URL (7-day) for cross-device display
 *   3. Fallback: use stored public URL if signing fails
 *
 * Prerequisites (run in Supabase SQL Editor if column is missing):
 *   ALTER TABLE public.agency_members ADD COLUMN IF NOT EXISTS card_back_image_url TEXT;
 */
import { supabase } from "@/lib/supabase";

const BUCKET = "card-backs";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

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

/** Build a 7-day signed URL for display. Returns null on any failure. */
async function buildSignedUrl(userId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${userId}/card-back.jpg`, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    return `${data.signedUrl}&cb=${Math.floor(Date.now() / 60000)}`;
  } catch {
    return null;
  }
}

/**
 * Upload gambar belakang kartu ke Supabase Storage via Express server.
 * Server menggunakan service-role key sehingga tidak ada storage RLS yang dibutuhkan.
 * Bucket 'card-backs' dibuat otomatis oleh server jika belum ada.
 * DB agency_members.card_back_image_url diperbarui oleh server dalam satu request.
 *
 * @returns signed URL (7 hari) atau public URL untuk display langsung
 */
export async function uploadCardBack(userId: string, file: File, agencyId: string): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran maksimum 10 MB.");
  if (!userId || userId.length < 10) throw new Error(`userId tidak valid: "${userId}". Harus berupa Supabase auth UUID.`);
  if (!agencyId || agencyId.length < 10) throw new Error(`agencyId tidak valid: "${agencyId}".`);

  console.log(`[cardBackStorage] uploadCardBack — userId=${userId} agencyId=${agencyId} size=${file.size}`);

  // ── 1. Get a fresh access token ────────────────────────────────────────────
  const { data: sessData } = await supabase.auth.getSession();
  const session = sessData.session;
  if (!session?.access_token) throw new Error("Sesi tidak valid — silakan login ulang.");
  let accessToken = session.access_token;
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt && expiresAt - nowSec < 60) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session?.access_token) {
        accessToken = refreshed.session.access_token;
        console.log("[cardBackStorage] session refreshed before upload");
      }
    } catch { /* ignore */ }
  }

  // ── 2. Resize image ────────────────────────────────────────────────────────
  console.log("[cardBackStorage] resizing image…");
  const blob = await resizeToBlob(file, 1600, 2000, 0.92);
  console.log(`[cardBackStorage] resize done — blobSize=${blob.size}`);

  // ── 3. Base64-encode ───────────────────────────────────────────────────────
  const imageBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(blob);
  });

  // ── 4. POST to server (one call: admin upload + DB update) ─────────────────
  console.log("[cardBackStorage] uploading via server (admin client)…");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  let canonicalUrl: string;
  try {
    const res = await fetch("/api/upload-card-back", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ targetUserId: userId, agencyId, imageBase64 }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: { ok?: boolean; url?: string; error?: string } = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* empty */ }
    if (!res.ok) {
      const msg = json.error ?? text.slice(0, 600);
      console.error(`[cardBackStorage] server upload failed ${res.status}:`, msg);
      throw new Error(msg);
    }
    if (!json.url) throw new Error("Server tidak mengembalikan URL gambar.");
    canonicalUrl = json.url;
    console.log(`[cardBackStorage] server upload OK — url=${canonicalUrl}`);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Timeout saat upload — coba lagi.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // ── 5. Return signed URL for display ──────────────────────────────────────
  const signed = await buildSignedUrl(userId);
  if (signed) {
    console.log("[cardBackStorage] signed display URL ready");
    return signed;
  }
  // Fallback: public URL with cache-buster
  console.log("[cardBackStorage] using canonical URL as display fallback");
  return `${canonicalUrl}?t=${Date.now()}`;
}

/**
 * No-op: DB is now updated by the server inside /api/upload-card-back.
 * Kept for API compatibility with existing callers.
 */
export async function saveCardBackUrl(
  _targetUserId: string,
  _agencyId: string,
  _displayUrl: string,
): Promise<void> {
  // DB update is handled server-side in /api/upload-card-back.
  // Nothing to do here.
}

/**
 * Load URL gambar belakang kartu untuk ditampilkan di kartu digital.
 * Reads card_back_image_url from DB, then returns a fresh signed URL.
 */
export async function loadCardBackUrl(
  targetUserId: string,
  agencyId: string,
): Promise<string | null> {
  if (!supabase) return null;
  try {
    console.log(`[cardBackStorage] loadCardBackUrl — userId=${targetUserId}`);
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
    const stored = (data as { card_back_image_url?: string | null } | null)?.card_back_image_url ?? null;
    if (!stored) {
      console.log("[cardBackStorage] loadCardBackUrl — no image stored");
      return null;
    }

    // Try signed URL first (cross-device, any bucket policy)
    const signed = await buildSignedUrl(targetUserId);
    if (signed) return signed;

    // Fallback: stored public URL
    return stored;
  } catch (e) {
    console.warn("[cardBackStorage] loadCardBackUrl exception:", e);
    return null;
  }
}

/** Canonical public URL for a user's card-back. */
export function getCanonicalCardBackUrl(userId: string): string {
  if (!supabase) return "";
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${userId}/card-back.jpg`);
  return data.publicUrl;
}
