/**
 * cardBackStorage — Upload & load gambar belakang kartu staff/owner/agent.
 *
 * Storage path: card-backs/{userId}/card-back.jpg
 * DB field:     agency_members.card_back_image_url  (stores canonical public URL)
 *
 * Cross-device strategy:
 *   On upload → generate a 7-day signed URL for immediate local display.
 *   On load   → regenerate a fresh 7-day signed URL from the known path.
 *   Signed URLs work regardless of whether the bucket is public or private,
 *   so the image is always accessible on every device / browser session.
 *
 * Prerequisites (run card-back-image-migration.sql in Supabase SQL Editor):
 *   1. ALTER TABLE agency_members ADD COLUMN card_back_image_url TEXT;
 *   2. CREATE BUCKET 'card-backs' (public = true recommended, not required).
 *   3. RLS policies for storage.objects on that bucket.
 */
import { supabase } from "@/lib/supabase";

const BUCKET = "card-backs";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

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
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak didukung.");
    ctx.drawImage(img, 0, 0, w, h);
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

/**
 * Build a signed URL for `{userId}/card-back.jpg`.
 * Returns null if signing fails (e.g. file not yet uploaded, RLS denial).
 */
async function buildSignedUrl(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const path = `${userId}/card-back.jpg`;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    // Append a short cache-buster so the browser doesn't serve stale images
    // after an upload. The signed URL itself is already unique per signing,
    // but some CDNs strip query params — keeping it harmless either way.
    return `${data.signedUrl}&cb=${Math.floor(Date.now() / 60000)}`; // changes every minute
  } catch {
    return null;
  }
}

/**
 * Upload gambar belakang kartu ke Supabase Storage.
 * Returns a signed URL (7 days) for immediate cross-device display.
 * The canonical public URL (no cache-buster) is what gets stored in the DB
 * via saveCardBackUrl — loadCardBackUrl regenerates signed URLs on read.
 */
export async function uploadCardBack(userId: string, file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran maksimum 10 MB.");

  const blob = await resizeToBlob(file, 1600, 2000, 0.92);
  const path = `${userId}/card-back.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });

  if (uploadError) throw new Error(`Upload gagal: ${uploadError.message}`);

  // Try to get a signed URL for immediate display (cross-device safe)
  const signed = await buildSignedUrl(userId);
  if (signed) return signed;

  // Fallback: public URL (works if bucket is set to public in Supabase)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Returns the canonical storage URL (no cache-buster) for saving to DB.
 * Call this after uploadCardBack to get a stable reference for persistence.
 */
export function getCanonicalCardBackUrl(userId: string): string {
  if (!supabase) return "";
  const path = `${userId}/card-back.jpg`;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl; // clean URL — no ?t= so the DB value is stable
}

/**
 * Simpan URL gambar belakang kartu ke kolom agency_members.card_back_image_url.
 * targetUserId = userId pemilik kartu (bisa berbeda dari yang mengupload / owner)
 *
 * Stores the CANONICAL public URL (no cache-buster) so we have a stable
 * path reference. Signed URLs are regenerated at load time.
 */
export async function saveCardBackUrl(
  targetUserId: string,
  agencyId: string,
  _displayUrl: string, // kept for API compat — we derive canonical URL ourselves
): Promise<void> {
  if (!supabase) return;
  const canonicalUrl = getCanonicalCardBackUrl(targetUserId);
  const { error } = await supabase
    .from("agency_members")
    .update({ card_back_image_url: canonicalUrl })
    .eq("user_id", targetUserId)
    .eq("agency_id", agencyId);
  if (error) throw new Error(`Gagal simpan URL: ${error.message}`);
}

/**
 * Load URL gambar belakang kartu untuk tampil di kartu digital.
 *
 * Strategy:
 *  1. Check DB for card_back_image_url — if null/empty → return null (no image).
 *  2. Regenerate a fresh signed URL from the deterministic storage path.
 *     This works on every device, every session, regardless of bucket policy.
 *  3. If signing fails (bucket/RLS issue), fall back to the stored public URL.
 */
export async function loadCardBackUrl(
  targetUserId: string,
  agencyId: string,
): Promise<string | null> {
  if (!supabase) return null;
  try {
    // Step 1 — does a card back exist for this user?
    const { data } = await supabase
      .from("agency_members")
      .select("card_back_image_url")
      .eq("user_id", targetUserId)
      .eq("agency_id", agencyId)
      .maybeSingle();

    const stored = (data as { card_back_image_url?: string | null } | null)
      ?.card_back_image_url ?? null;
    if (!stored) return null; // no image uploaded yet

    // Step 2 — regenerate fresh signed URL (cross-device, always works)
    const signed = await buildSignedUrl(targetUserId);
    if (signed) return signed;

    // Step 3 — fallback to whatever is in the DB (public URL if bucket is public)
    return stored;
  } catch {
    return null;
  }
}
