import { supabase } from "@/lib/supabase";

const BUCKET = "avatars";

async function resizeToBlob(file: File, maxSize = 480, quality = 0.88): Promise<Blob> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal memuat gambar."));
      el.src = blobUrl;
    });
    const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
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

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Ukuran maksimum 8 MB.");

  const blob = await resizeToBlob(file, 480, 0.88);
  const path = `${userId}/profile.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });

  if (error) throw new Error(`Upload gagal: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function savePhotoUrl(userId: string, url: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from("profiles")
      .upsert({ id: userId, photo_url: url }, { onConflict: "id" });
  } catch {
  }
}

export async function deleteAvatar(userId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.storage.from(BUCKET).remove([`${userId}/profile.jpg`]);
  } catch {
  }
}

export async function loadPhotoUrl(userId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("photo_url")
      .eq("id", userId)
      .maybeSingle();
    return (data as { photo_url?: string | null } | null)?.photo_url ?? null;
  } catch {
    return null;
  }
}
