/**
 * One-shot migration: scan tabel jamaah, jamaah_docs, dan clients — upload
 * semua kolom yang masih `data:` (base64) ke Storage, terus update DB pakai
 * URL public.
 *
 * Idempotent — yang sudah berupa URL di-skip.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { uploadJamaahPhoto, uploadJamaahDoc, uploadClientPhoto, isDataUrl } from "./supabaseStorage";

export interface MigrateProgress {
  phase: "photos" | "docs" | "clients" | "done";
  total: number;
  done: number;
  current?: string;
  failed: number;
}

export interface MigrateResult {
  photosMigrated: number;
  photosFailed: number;
  docsMigrated: number;
  docsFailed: number;
  clientsMigrated: number;
  clientsFailed: number;
  errors: string[];
}

export async function migrateBase64ToStorage(
  onProgress?: (p: MigrateProgress) => void,
): Promise<MigrateResult> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase belum dikonfigurasi.");
  }
  const result: MigrateResult = {
    photosMigrated: 0, photosFailed: 0,
    docsMigrated: 0, docsFailed: 0,
    clientsMigrated: 0, clientsFailed: 0,
    errors: [],
  };

  // ── Phase 1: photos di tabel jamaah ─────────────────────────────────────
  const { data: jamaahRows, error: jErr } = await supabase!
    .from("jamaah")
    .select("id, passport_number, photo_data_url")
    .like("photo_data_url", "data:%");
  if (jErr) throw jErr;

  const photos = jamaahRows ?? [];
  let i = 0;
  for (const j of photos) {
    onProgress?.({ phase: "photos", total: photos.length, done: i, current: j.id, failed: result.photosFailed });
    try {
      if (!isDataUrl(j.photo_data_url as string)) { i++; continue; }
      const url = await uploadJamaahPhoto(
        String(j.id), String(j.passport_number ?? ""), String(j.photo_data_url),
      );
      if (url === j.photo_data_url) {
        result.photosFailed++;
        result.errors.push(`Photo ${j.id}: upload returned same URL`);
      } else {
        const { error: upErr } = await supabase!
          .from("jamaah").update({ photo_data_url: url }).eq("id", j.id);
        if (upErr) {
          result.photosFailed++;
          result.errors.push(`Photo ${j.id} DB update: ${upErr.message}`);
        } else {
          result.photosMigrated++;
        }
      }
    } catch (e) {
      result.photosFailed++;
      result.errors.push(`Photo ${j.id}: ${(e as Error).message}`);
    }
    i++;
  }

  // ── Phase 2: docs di tabel jamaah_docs ──────────────────────────────────
  const { data: docRows, error: dErr } = await supabase!
    .from("jamaah_docs")
    .select("id, jamaah_id, category, file_name, data_url")
    .like("data_url", "data:%");
  if (dErr) throw dErr;

  const docs = docRows ?? [];
  let k = 0;
  for (const d of docs) {
    onProgress?.({ phase: "docs", total: docs.length, done: k, current: d.id, failed: result.docsFailed });
    try {
      if (!isDataUrl(d.data_url as string)) { k++; continue; }
      const url = await uploadJamaahDoc(
        String(d.jamaah_id), String(d.category ?? "other"),
        String(d.file_name ?? "doc"), String(d.data_url),
      );
      if (url === d.data_url) {
        result.docsFailed++;
        result.errors.push(`Doc ${d.id}: upload returned same URL`);
      } else {
        const { error: upErr } = await supabase!
          .from("jamaah_docs").update({ data_url: url }).eq("id", d.id);
        if (upErr) {
          result.docsFailed++;
          result.errors.push(`Doc ${d.id} DB update: ${upErr.message}`);
        } else {
          result.docsMigrated++;
        }
      }
    } catch (e) {
      result.docsFailed++;
      result.errors.push(`Doc ${d.id}: ${(e as Error).message}`);
    }
    k++;
  }

  // ── Phase 3: foto di tabel clients ──────────────────────────────────────
  const { data: clientRows, error: cErr } = await supabase!
    .from("clients")
    .select("id, passport_number, photo_data_url")
    .like("photo_data_url", "data:%");
  if (cErr) throw cErr;

  const clientPhotos = clientRows ?? [];
  let m = 0;
  for (const c of clientPhotos) {
    onProgress?.({ phase: "clients", total: clientPhotos.length, done: m, current: c.id, failed: result.clientsFailed });
    try {
      if (!isDataUrl(c.photo_data_url as string)) { m++; continue; }
      const url = await uploadClientPhoto(
        String(c.id), String(c.passport_number ?? ""), String(c.photo_data_url),
      );
      if (url === c.photo_data_url) {
        result.clientsFailed++;
        result.errors.push(`Client photo ${c.id}: upload returned same URL`);
      } else {
        const { error: upErr } = await supabase!
          .from("clients").update({ photo_data_url: url }).eq("id", c.id);
        if (upErr) {
          result.clientsFailed++;
          result.errors.push(`Client photo ${c.id} DB update: ${upErr.message}`);
        } else {
          result.clientsMigrated++;
        }
      }
    } catch (e) {
      result.clientsFailed++;
      result.errors.push(`Client photo ${c.id}: ${(e as Error).message}`);
    }
    m++;
  }

  onProgress?.({ phase: "done", total: 0, done: 0, failed: result.photosFailed + result.docsFailed + result.clientsFailed });
  return result;
}
