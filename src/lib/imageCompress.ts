/**
 * Compresses image blobs before upload to Supabase Storage.
 * Skips PDFs and very small images (<200 KB).
 */
import imageCompression from "browser-image-compression";

const SKIP_BELOW_BYTES = 150 * 1024; // 150 KB
const DEFAULT_OPTIONS = {
  maxSizeMB: 0.4,           // target ~400 KB (turun dari 0.6)
  maxWidthOrHeight: 1600,   // cukup untuk scan paspor (turun dari 1800)
  useWebWorker: true,
  initialQuality: 0.80,
  fileType: "image/jpeg",
};

export async function compressIfImage(blob: Blob, contentType: string): Promise<Blob> {
  if (!contentType.startsWith("image/")) return blob;
  if (contentType === "image/gif") return blob;
  if (blob.size < SKIP_BELOW_BYTES) return blob;
  try {
    const file = new File([blob], "upload", { type: contentType });
    const compressed = await imageCompression(file, DEFAULT_OPTIONS);
    if (compressed.size < blob.size) return compressed;
    return blob;
  } catch (err) {
    console.warn("[imageCompress] failed, using original", err);
    return blob;
  }
}
