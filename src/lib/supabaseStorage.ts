/**
 * Helpers buat upload foto/dokumen ke Supabase Storage, agency-scoped.
 * Path convention: `{agency_id}/{file}` (RLS storage policy enforce).
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { requireAgencyId } from "@/store/authStore";
import { compressIfImage } from "./imageCompress";

const PHOTO_BUCKET = "jamaah-photos";
const DOC_BUCKET = "jamaah-docs";
const PDF_TEMPLATE_BUCKET = "pdf-templates";

function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: contentType }), contentType };
}

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("pdf")) return "pdf";
  return "bin";
}

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "file";
}

/** Upload foto jamaah ke bucket, return public URL. Skip jika input udah URL. */
export async function uploadJamaahPhoto(
  jamaahId: string,
  passportNumber: string,
  dataUrl: string,
): Promise<string> {
  const r = await uploadJamaahPhotoWithPath(jamaahId, passportNumber, dataUrl);
  return r.url;
}

/** Versi upload foto yang return URL + storage path (buat rollback orphan). */
export async function uploadJamaahPhotoWithPath(
  jamaahId: string,
  passportNumber: string,
  dataUrl: string,
): Promise<{ url: string; path: string | null }> {
  if (!isSupabaseConfigured()) return { url: dataUrl, path: null };
  if (!dataUrl.startsWith("data:")) return { url: dataUrl, path: null };
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) return { url: dataUrl, path: null };
  const agencyId = requireAgencyId();
  const compressed = await compressIfImage(parsed.blob, parsed.contentType);
  const finalContentType = compressed.type || parsed.contentType;
  const ext = extFromContentType(finalContentType);
  const base = passportNumber ? safeName(passportNumber) : safeName(jamaahId);
  const path = `${agencyId}/${base}_${Date.now()}.${ext}`;
  const { error } = await supabase!.storage.from(PHOTO_BUCKET).upload(path, compressed, {
    upsert: true, contentType: finalContentType,
  });
  if (error) {
    console.error("[storage] upload photo failed", error);
    return { url: dataUrl, path: null };
  }
  const { data } = supabase!.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/** Hapus daftar object foto jamaah (cleanup orphan saat insert DB gagal). */
export async function removeJamaahPhotos(paths: string[]): Promise<void> {
  if (!isSupabaseConfigured() || paths.length === 0) return;
  const cleaned = paths.filter((p): p is string => typeof p === "string" && p.length > 0);
  if (cleaned.length === 0) return;
  const { error } = await supabase!.storage.from(PHOTO_BUCKET).remove(cleaned);
  if (error) console.warn("[storage] cleanup orphan photos failed", error, cleaned);
}

/** Upload dokumen jamaah ke bucket, return public URL. */
export async function uploadJamaahDoc(
  jamaahId: string,
  category: string,
  fileName: string,
  dataUrl: string,
): Promise<string> {
  if (!isSupabaseConfigured()) return dataUrl;
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) return dataUrl;
  const agencyId = requireAgencyId();
  const compressed = await compressIfImage(parsed.blob, parsed.contentType);
  const finalContentType = compressed.type || parsed.contentType;
  const ext = extFromContentType(finalContentType);
  const base = `${safeName(jamaahId)}_${safeName(category)}_${safeName(fileName.replace(/\.[^.]+$/, ""))}`;
  const path = `${agencyId}/${base}_${Date.now()}.${ext}`;
  const { error } = await supabase!.storage.from(DOC_BUCKET).upload(path, compressed, {
    upsert: true, contentType: finalContentType,
  });
  if (error) {
    console.error("[storage] upload doc failed", error);
    return dataUrl;
  }
  const { data } = supabase!.storage.from(DOC_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Cek string adalah base64 data URL. */
export function isDataUrl(s: string | undefined | null): boolean {
  return typeof s === "string" && s.startsWith("data:");
}

/** Upload file template PDF (background) ke bucket `pdf-templates`, agency-scoped.
 *  Return public URL + storage path. Path format: `{agency_id}/{mode}_{timestamp}.{ext}`.
 *  Mode dipake biar private vs group ga overwrite satu sama lain. */
export async function uploadPdfTemplate(
  file: File,
  mode: "private" | "group",
): Promise<{ url: string; path: string; type: "pdf" | "image" }> {
  if (!isSupabaseConfigured()) throw new Error("Supabase belum dikonfigurasi");
  const agencyId = requireAgencyId();
  const ct = file.type || "application/octet-stream";
  const isPdf = ct.includes("pdf") || /\.pdf$/i.test(file.name);
  const isImage = ct.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!isPdf && !isImage) {
    throw new Error("Format file tidak didukung. Pakai PDF, PNG, atau JPG.");
  }
  const ext = isPdf ? "pdf" : extFromContentType(ct);
  const path = `${agencyId}/${mode}_${Date.now()}.${ext}`;
  // Compress kalau image; PDF di-upload as-is.
  const payload: Blob = isImage ? await compressIfImage(file, ct) : file;
  const finalContentType = isPdf ? "application/pdf" : (payload.type || ct);
  const { error } = await supabase!.storage.from(PDF_TEMPLATE_BUCKET).upload(path, payload, {
    upsert: true,
    contentType: finalContentType,
  });
  if (error) {
    console.error("[storage] upload pdf template failed", error);
    throw new Error(`Upload gagal: ${error.message}`);
  }
  const { data } = supabase!.storage.from(PDF_TEMPLATE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, type: isPdf ? "pdf" : "image" };
}

/** Hapus file template PDF custom (cleanup saat reset/replace). Aman dipanggil
 *  walau path udah gak ada (warning aja, ga throw). */
export async function removePdfTemplate(storagePath: string): Promise<void> {
  if (!isSupabaseConfigured() || !storagePath) return;
  const { error } = await supabase!.storage.from(PDF_TEMPLATE_BUCKET).remove([storagePath]);
  if (error) console.warn("[storage] cleanup pdf template failed", error, storagePath);
}
