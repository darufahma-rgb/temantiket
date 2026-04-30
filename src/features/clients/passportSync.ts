import type { PassportData } from "@/lib/ocrPassport";
import type { Client, ClientDraft } from "./clientsRepo";

/**
 * Hasil sync paspor → clients.
 *
 * - `match`: ada client lama dengan passport_number sama → update field yg
 *   masih kosong (non-destructive merge).
 * - `create`: belum ada → caller harus bikin client baru dgn `draft`.
 * - `noop`: data paspor terlalu kosong (gak ada nomor & gak ada nama) → skip.
 */
export type PassportSyncDecision =
  | { kind: "match"; client: Client; patch: Partial<Client> }
  | { kind: "create"; draft: ClientDraft }
  | { kind: "noop"; reason: string };

/**
 * Cari client berdasarkan passport number (case-insensitive, strip spasi).
 * Return null kalau gak ketemu.
 */
export function findClientByPassport(
  clients: Client[],
  passportNumber: string,
): Client | null {
  const norm = passportNumber.replace(/\s+/g, "").toUpperCase();
  if (!norm) return null;
  return clients.find(
    (c) => (c.passportNumber ?? "").replace(/\s+/g, "").toUpperCase() === norm,
  ) ?? null;
}

/**
 * Cari client berdasarkan nama (fuzzy: case-insensitive, ignore extra spaces).
 * Return semua kandidat yang nama-nya sama persis (bisa lebih dari satu kalo
 * ada duplikat), prioritized by oldest (createdAt asc).
 */
export function findClientsByName(clients: Client[], name: string): Client[] {
  const target = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!target) return [];
  return clients
    .filter((c) => c.name.trim().toLowerCase().replace(/\s+/g, " ") === target)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Build patch buat update client lama. Strategi non-destructive:
 *   - Hanya isi field yang **kosong** di client (jangan overwrite data lama).
 *   - Selalu refresh photo_data_url & expiry kalau yang baru lebih lengkap.
 */
export function buildPatchFromPassport(
  existing: Client,
  passport: PassportData,
  photoDataUrl?: string,
): Partial<Client> {
  const patch: Partial<Client> = {};
  if (!existing.passportNumber && passport.passportNumber) {
    patch.passportNumber = passport.passportNumber.toUpperCase();
  }
  if (!existing.passportExpiry && passport.expiryDate) {
    patch.passportExpiry = passport.expiryDate;
  }
  if (!existing.birthDate && passport.birthDate) {
    patch.birthDate = passport.birthDate;
  }
  if (!existing.gender && passport.gender) {
    patch.gender = passport.gender;
  }
  // Foto: kalo client lama belum ada foto, isi.
  if (!existing.photoDataUrl && photoDataUrl) {
    patch.photoDataUrl = photoDataUrl;
  }
  // Update name kalau yg lama hasil placeholder dari backfill jamaah
  // ("Jamaah xxxxxxxx") dan paspor punya nama beneran.
  if (passport.name && /^Jamaah [a-f0-9]{4,}$/i.test(existing.name)) {
    patch.name = passport.name;
  }
  return patch;
}

/**
 * Build draft buat client BARU dari hasil paspor.
 * Untuk dipake kalo gak ada match.
 */
export function buildDraftFromPassport(
  passport: PassportData,
  extras?: { phone?: string; email?: string; photoDataUrl?: string },
): ClientDraft {
  return {
    name: passport.name?.trim() || "Klien Baru",
    phone: extras?.phone ?? "",
    email: extras?.email,
    passportNumber: passport.passportNumber?.toUpperCase(),
    passportExpiry: passport.expiryDate,
    birthDate: passport.birthDate,
    gender: passport.gender,
    photoDataUrl: extras?.photoDataUrl,
  };
}

/**
 * Top-level decision helper. Kombinasi find + build.
 *
 * Caller cuma perlu pass list semua client + hasil OCR + (opsional) foto;
 * fungsi ini balikin instruksi: update client mana, atau bikin baru pakai
 * draft mana, atau skip.
 */
export function decidePassportSync(
  clients: Client[],
  passport: PassportData,
  opts?: { photoDataUrl?: string; phone?: string; email?: string },
): PassportSyncDecision {
  // 1. Validasi: minimum harus ada nomor paspor ATAU nama.
  if (!passport.passportNumber && !passport.name) {
    return { kind: "noop", reason: "Hasil OCR tidak punya nama atau nomor paspor." };
  }

  // 2. Coba match by passport number dulu (paling reliable).
  if (passport.passportNumber) {
    const byPassport = findClientByPassport(clients, passport.passportNumber);
    if (byPassport) {
      const patch = buildPatchFromPassport(byPassport, passport, opts?.photoDataUrl);
      return { kind: "match", client: byPassport, patch };
    }
  }

  // 3. Fallback: match by name (kasus client lama dibuat tanpa paspor, lalu
  //    paspor di-scan belakangan). Ambil 1 kandidat saja — kalo ada duplikat,
  //    user bisa pilih manual di UI.
  if (passport.name) {
    const byName = findClientsByName(clients, passport.name);
    if (byName.length > 0) {
      const target = byName[0];
      const patch = buildPatchFromPassport(target, passport, opts?.photoDataUrl);
      return { kind: "match", client: target, patch };
    }
  }

  // 4. Belum ada → bikin baru.
  return {
    kind: "create",
    draft: buildDraftFromPassport(passport, opts),
  };
}
