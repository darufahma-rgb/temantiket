/**
 * cardBackStorage v2 — Direct Supabase Storage, zero custom API.
 *
 * Bucket : card-back-images  (must be set PUBLIC in Supabase Storage dashboard)
 * Path   : {role_type}/{owner_uuid}/back.webp
 * Table  : card_back_images
 *          (id, owner_uuid, role_type, image_path, image_url, created_at, updated_at)
 *
 * Upload flow:
 *   1. Frontend resize/compress → WebP max 1200px (JPEG fallback)
 *   2. supabase.storage.from(BUCKET).upload() — direct to Supabase, no proxy
 *   3. supabase.from("card_back_images").upsert()
 *   4. If DB upsert fails → remove uploaded file (orphan cleanup)
 *   5. Return permanent public URL
 *
 * Load flow:
 *   1. SELECT image_url FROM card_back_images WHERE owner_uuid + role_type
 *   2. Return URL with 5-min cache-bust suffix
 *
 * Setup: run supabase/card-back-images-setup.sql in Supabase SQL Editor,
 *        then create bucket 'card-back-images' (public) in Supabase Storage dashboard.
 */

import { supabase } from "@/lib/supabase";

const BUCKET = "card-back-images";

export type CardRole = "agent" | "staff" | "owner" | "member";

const VALID_ROLES: CardRole[] = ["agent", "staff", "owner", "member"];

function safeRole(role: CardRole): CardRole {
  return VALID_ROLES.includes(role) ? role : "agent";
}

/**
 * Resize image and compress to WebP (JPEG fallback if WebP unsupported).
 * Max dimension capped at maxPx on either side; aspect ratio preserved.
 */
async function resizeToWebP(
  file: File,
  maxPx = 1200,
  quality = 0.85,
): Promise<{ blob: Blob; mimeType: string }> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal memuat gambar — pastikan file tidak rusak."));
      el.src = blobUrl;
    });

    const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(img.width  * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D tidak didukung di browser ini.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const encodeAs = (mime: string) =>
      new Promise<Blob>((res, rej) =>
        canvas.toBlob(
          (b) => (b ? res(b) : rej(new Error(`Gagal encode sebagai ${mime}.`))),
          mime,
          quality,
        ),
      );

    try {
      const blob = await encodeAs("image/webp");
      return { blob, mimeType: "image/webp" };
    } catch {
      const blob = await encodeAs("image/jpeg");
      return { blob, mimeType: "image/jpeg" };
    }
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Upload gambar belakang kartu langsung ke Supabase Storage.
 *
 * Storage path always `{role}/{userId}/back.webp` — upsert overwrites old file.
 * If DB upsert fails the storage file is deleted automatically (no orphans).
 *
 * @param userId      Supabase auth UUID of card owner
 * @param file        Image file selected by user
 * @param _agencyId   Unused (kept for API compatibility)
 * @param targetRole  Role of card owner ('agent' | 'staff' | 'owner' | 'member')
 * @returns           Permanent public URL with cache-buster
 */
export async function uploadCardBack(
  userId: string,
  file: File,
  _agencyId: string,
  targetRole: CardRole = "agent",
): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar (JPG/PNG/WebP).");
  if (file.size > 15 * 1024 * 1024) throw new Error("Ukuran file maksimum 15 MB.");
  if (!userId || userId.length < 8) throw new Error(`userId tidak valid: "${userId}".`);

  const role = safeRole(targetRole);
  const storagePath = `${role}/${userId}/back.webp`;

  console.log(`[cardBackStorage] upload start — role=${role} userId=${userId} file=${file.name} (${file.size}B)`);

  const { blob, mimeType } = await resizeToWebP(file, 1200, 0.85);
  console.log(`[cardBackStorage] resize OK — ${blob.size}B ${mimeType}`);

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: mimeType, upsert: true });

  if (uploadErr) {
    console.error("[cardBackStorage] storage error:", uploadErr.message);
    const msg = uploadErr.message ?? "";
    if (msg.includes("Bucket not found") || msg.includes("not found") || msg.includes("does not exist")) {
      throw new Error(
        `Bucket '${BUCKET}' belum ada. Buat bucket '${BUCKET}' di Supabase Storage dashboard ` +
        `(set ke Public), lalu jalankan supabase/card-back-images-setup.sql.`,
      );
    }
    if (msg.toLowerCase().includes("policy") || msg.includes("403") || msg.includes("Unauthorized")) {
      throw new Error(
        `Storage policy belum dikonfigurasi untuk bucket '${BUCKET}'. ` +
        `Jalankan supabase/card-back-images-setup.sql di Supabase SQL Editor.`,
      );
    }
    throw new Error(`Upload gambar gagal: ${msg}`);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const imageUrl = urlData.publicUrl;
  console.log(`[cardBackStorage] storage OK — url=${imageUrl}`);

  const { error: dbErr } = await supabase.from("card_back_images").upsert(
    {
      owner_uuid: userId,
      role_type:  role,
      image_path: storagePath,
      image_url:  imageUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_uuid,role_type" },
  );

  if (dbErr) {
    console.error("[cardBackStorage] DB upsert error:", dbErr.code, dbErr.message);
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    if (dbErr.code === "42P01" || dbErr.message?.includes("does not exist")) {
      throw new Error(
        `Tabel card_back_images belum ada. ` +
        `Jalankan supabase/card-back-images-setup.sql di Supabase SQL Editor.`,
      );
    }
    throw new Error(
      `Gambar terupload tapi gagal disimpan ke database: ${dbErr.message}. ` +
      `File storage sudah dihapus otomatis untuk menghindari orphan.`,
    );
  }

  console.log(`[cardBackStorage] DB upsert OK — ${role}/${userId}`);
  return `${imageUrl}?t=${Date.now()}`;
}

/**
 * No-op — DB is updated inside uploadCardBack.
 * Kept for API compatibility with existing callers.
 */
export async function saveCardBackUrl(
  _userId: string,
  _agencyId: string,
  _displayUrl: string,
): Promise<void> {}

/**
 * Load URL gambar belakang kartu dari tabel card_back_images.
 *
 * @param targetUserId  Supabase auth UUID of card owner
 * @param _agencyId     Unused (kept for API compatibility)
 * @param targetRole    Role of card owner
 * @returns             Image URL with cache-bust suffix, or null if not set
 */
export async function loadCardBackUrl(
  targetUserId: string,
  _agencyId: string,
  targetRole: CardRole = "agent",
): Promise<string | null> {
  if (!supabase || !targetUserId) return null;
  try {
    const { data, error } = await supabase
      .from("card_back_images")
      .select("image_url")
      .eq("owner_uuid", targetUserId)
      .eq("role_type", targetRole)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        console.warn("[cardBackStorage] tabel card_back_images belum ada — jalankan migration SQL.");
      } else {
        console.warn("[cardBackStorage] loadCardBackUrl error:", error.message);
      }
      return null;
    }

    const url = (data as { image_url?: string | null } | null)?.image_url ?? null;
    if (!url) return null;

    const cacheBust = Math.floor(Date.now() / 300_000);
    return `${url}?cb=${cacheBust}`;
  } catch (e) {
    console.warn("[cardBackStorage] loadCardBackUrl exception:", e);
    return null;
  }
}

/** Canonical public URL without cache-buster (for SSR/static references). */
export function getCanonicalCardBackUrl(userId: string, role: CardRole = "agent"): string {
  if (!supabase) return "";
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(`${role}/${userId}/back.webp`);
  return data.publicUrl;
}
