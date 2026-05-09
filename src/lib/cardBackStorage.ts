/**
 * cardBackStorage — Upload & load gambar belakang kartu staff/owner/agent.
 * Storage path: card-backs/{userId}/card-back.jpg
 * URL disimpan di agency_members.card_back_image_url
 */
import { supabase } from "@/lib/supabase";

const BUCKET = "card-backs";

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
 * Upload gambar belakang kartu ke Supabase Storage.
 * Returns public URL dengan cache-buster.
 */
export async function uploadCardBack(userId: string, file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran maksimum 10 MB.");

  const blob = await resizeToBlob(file, 1600, 2000, 0.92);
  const path = `${userId}/card-back.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });

  if (error) throw new Error(`Upload gagal: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Simpan URL gambar belakang kartu ke kolom agency_members.card_back_image_url.
 * targetUserId = userId pemilik kartu (bisa berbeda dari yang mengupload / owner)
 */
export async function saveCardBackUrl(
  targetUserId: string,
  agencyId: string,
  url: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("agency_members")
    .update({ card_back_image_url: url })
    .eq("user_id", targetUserId)
    .eq("agency_id", agencyId);
  if (error) throw new Error(`Gagal simpan URL: ${error.message}`);
}

/**
 * Load URL gambar belakang kartu dari agency_members.
 */
export async function loadCardBackUrl(
  targetUserId: string,
  agencyId: string,
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("agency_members")
      .select("card_back_image_url")
      .eq("user_id", targetUserId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    return (data as { card_back_image_url?: string | null } | null)?.card_back_image_url ?? null;
  } catch {
    return null;
  }
}
