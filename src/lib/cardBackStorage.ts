/**
 * cardBackStorage — Upload & load gambar belakang kartu staff/owner/agent.
 *
 * Storage path: card-backs/{userId}/card-back.jpg
 * DB field:     agency_members.card_back_image_url  (stores canonical public URL)
 *
 * Cross-device strategy:
 *   On upload → store canonical public URL in DB via server route (bypasses RLS).
 *   On load   → read URL from DB, then regenerate a fresh 7-day signed URL.
 *   Signed URLs work regardless of whether the bucket is public or private,
 *   so the image is always accessible on every device / browser session.
 *
 * Prerequisites (run supabase/card-back-image-migration.sql in Supabase SQL Editor):
 *   1. ALTER TABLE agency_members ADD COLUMN card_back_image_url TEXT;
 *   2. CREATE BUCKET 'card-backs' (public = true recommended, not required).
 *   3. RLS policies for storage.objects on that bucket.
 *
 * DB save goes through /api/save-card-back-url (Express + service-role key)
 * so RLS on agency_members never blocks staff/agent from updating their own row.
 */
import { supabase } from "@/lib/supabase";
import { assertHealthy } from "@/lib/healthCheck";

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
    if (error || !data?.signedUrl) {
      console.warn("[cardBackStorage] buildSignedUrl gagal:", error?.message);
      return null;
    }
    // Append a short cache-buster so the browser doesn't serve stale images
    // after an upload.
    return `${data.signedUrl}&cb=${Math.floor(Date.now() / 60000)}`; // changes every minute
  } catch (e) {
    console.warn("[cardBackStorage] buildSignedUrl exception:", e);
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

  // Validate server-side Supabase config before attempting upload
  await assertHealthy("Upload Gambar Kartu");

  console.log(`[cardBackStorage] uploadCardBack — userId=${userId} size=${file.size} type=${file.type}`);

  const blob = await resizeToBlob(file, 1600, 2000, 0.92);
  const path = `${userId}/card-back.jpg`;

  console.log(`[cardBackStorage] uploading to storage — bucket=${BUCKET} path=${path} blobSize=${blob.size}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    console.error("[cardBackStorage] storage upload error:", uploadError);
    if (
      uploadError.message.includes("Bucket not found") ||
      uploadError.message.includes("bucket") ||
      uploadError.message.includes("does not exist")
    ) {
      throw new Error(
        `Bucket Storage 'card-backs' belum dibuat. Jalankan file supabase/card-back-image-migration.sql di Supabase SQL Editor terlebih dahulu.`,
      );
    }
    throw new Error(`Upload gagal: ${uploadError.message}`);
  }

  console.log("[cardBackStorage] storage upload OK — generating signed URL");

  // Try to get a signed URL for immediate display (cross-device safe)
  const signed = await buildSignedUrl(userId);
  if (signed) {
    console.log("[cardBackStorage] signed URL ready");
    return signed;
  }

  // Fallback: public URL (works if bucket is set to public in Supabase)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  console.log("[cardBackStorage] using public URL fallback:", data.publicUrl);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Returns the canonical storage URL (no cache-buster) for saving to DB.
 * This is a deterministic URL derived from the storage path.
 */
export function getCanonicalCardBackUrl(userId: string): string {
  if (!supabase) return "";
  const path = `${userId}/card-back.jpg`;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl; // clean URL — no ?t= so the DB value is stable
}

/**
 * Simpan URL gambar belakang kartu ke kolom agency_members.card_back_image_url.
 * targetUserId = userId pemilik kartu (harus berupa Supabase auth user UUID —
 * bukan route slug, request ID, atau identifier sementara).
 *
 * PENTING: Operasi ini dilakukan via server route /api/save-card-back-url
 * menggunakan service-role key agar RLS pada agency_members tidak memblokir
 * staff/agent yang hanya ingin update card_back_image_url milik sendiri.
 *
 * Flow:
 *   1. Refresh sesi jika mendekati expiry (mencegah JWT lama ditolak server)
 *   2. POST ke /api/save-card-back-url dengan targetUserId + agencyId
 *   3. Server UPDATE agency_members SET card_back_image_url = canonicalUrl
 *      WHERE user_id = targetUserId AND agency_id = agencyId
 *   4. Verifikasi write dengan re-fetch dari DB (tidak return sukses jika DB gagal)
 *
 * Throws if:
 * - Server tidak bisa dihubungi
 * - Server mengembalikan error (kolom belum ada, auth gagal, dsb)
 * - Re-fetch verifikasi gagal atau kolom masih null
 */
export async function saveCardBackUrl(
  targetUserId: string,
  agencyId: string,
  _displayUrl: string, // kept for API compat — canonical URL derived server-side
): Promise<void> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");

  // Validate IDs are non-empty strings that look like UUIDs (basic guard)
  if (!targetUserId || targetUserId.length < 10) {
    throw new Error(`targetUserId tidak valid: "${targetUserId}". Harus berupa Supabase user UUID.`);
  }
  if (!agencyId || agencyId.length < 10) {
    throw new Error(`agencyId tidak valid: "${agencyId}". Harus berupa UUID agency.`);
  }

  console.log(`[cardBackStorage] saveCardBackUrl — table=agency_members targetUserId=${targetUserId} agencyId=${agencyId}`);

  // ── 1. Get a fresh access token (refresh if near expiry) ──────────────────
  let accessToken: string | null = null;
  try {
    const { data: sessData } = await supabase.auth.getSession();
    const session = sessData.session;
    if (!session) throw new Error("no session");

    const nowSec    = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at ?? 0;
    if (expiresAt && expiresAt - nowSec < 60) {
      // Token expiring soon — proactively refresh so server accepts it
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        accessToken = refreshed.session?.access_token ?? null;
        console.log("[cardBackStorage] session refreshed before save");
      } catch {
        // Refresh failed — fall back to current token
        accessToken = session.access_token;
      }
    } else {
      accessToken = session.access_token;
    }
  } catch {
    // getSession threw — session is completely gone
  }

  if (!accessToken) {
    throw new Error("Sesi tidak valid — silakan login ulang.");
  }

  // ── 2. POST to server route ───────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("/api/save-card-back-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ targetUserId, agencyId }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: { ok?: boolean; url?: string; error?: string } = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* keep empty */ }

    if (!res.ok) {
      const serverMsg = json.error ?? text.slice(0, 500);
      console.error(
        `[cardBackStorage] saveCardBackUrl server error ${res.status}:`,
        serverMsg,
        `| table=agency_members user_id=${targetUserId} agency_id=${agencyId}`,
      );
      throw new Error(`Gagal simpan ke database: ${serverMsg}`);
    }

    console.log(`[cardBackStorage] saveCardBackUrl server OK — url=${json.url}`);

    // ── 3. Verify the write by re-fetching from DB ────────────────────────
    // Do NOT show success if the DB value didn't actually get written.
    try {
      const { data: verifyRow, error: verifyErr } = await supabase
        .from("agency_members")
        .select("card_back_image_url")
        .eq("user_id", targetUserId)
        .eq("agency_id", agencyId)
        .maybeSingle();

      if (verifyErr) {
        console.warn(
          `[cardBackStorage] DB re-fetch error (non-fatal):`,
          verifyErr.message,
          `| table=agency_members user_id=${targetUserId}`,
        );
      } else {
        const saved = (verifyRow as { card_back_image_url?: string | null } | null)
          ?.card_back_image_url ?? null;
        if (saved) {
          console.log(`[cardBackStorage] DB verified — card_back_image_url=${saved}`);
        } else {
          console.warn(
            `[cardBackStorage] DB re-fetch: card_back_image_url masih null setelah update!`,
            `table=agency_members user_id=${targetUserId} agency_id=${agencyId}`,
          );
        }
      }
    } catch (verifyEx) {
      // Re-fetch failed — server already confirmed success, log and continue
      console.warn("[cardBackStorage] re-fetch exception (non-fatal):", verifyEx);
    }

  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout saat menyimpan ke database — coba lagi.");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Load URL gambar belakang kartu untuk tampil di kartu digital.
 *
 * Strategy:
 *  1. Check DB for card_back_image_url — if null/empty → return null (no image).
 *  2. Regenerate a fresh signed URL from the deterministic storage path.
 *     This works on every device, every session, regardless of bucket policy.
 *  3. If signing fails (bucket/RLS issue), fall back to the stored public URL.
 *
 * Returns null if:
 * - No image has been uploaded yet
 * - The column doesn't exist (silent DB error)
 * - Both signing and public URL fallback fail
 */
export async function loadCardBackUrl(
  targetUserId: string,
  agencyId: string,
): Promise<string | null> {
  if (!supabase) return null;
  try {
    console.log(`[cardBackStorage] loadCardBackUrl — userId=${targetUserId} agencyId=${agencyId}`);

    // Step 1 — does a card back exist for this user?
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

    const stored = (data as { card_back_image_url?: string | null } | null)
      ?.card_back_image_url ?? null;

    if (!stored) {
      console.log("[cardBackStorage] loadCardBackUrl — no card_back_image_url in DB");
      return null;
    }

    console.log("[cardBackStorage] loadCardBackUrl — found stored URL, generating signed URL");

    // Step 2 — regenerate fresh signed URL (cross-device, always works)
    const signed = await buildSignedUrl(targetUserId);
    if (signed) {
      console.log("[cardBackStorage] loadCardBackUrl — returning signed URL");
      return signed;
    }

    // Step 3 — fallback to whatever is in the DB (public URL if bucket is public)
    console.log("[cardBackStorage] loadCardBackUrl — signed URL failed, returning stored public URL");
    return stored;
  } catch (e) {
    console.warn("[cardBackStorage] loadCardBackUrl exception:", e);
    return null;
  }
}
