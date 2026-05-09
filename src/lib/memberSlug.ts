/**
 * Helper untuk Member Card Public Page (/m/[slug]).
 *
 * Slug format: `[lowercase-firstname]-[memberIndex 4-digit pad]`
 *   - Contoh: "Danang Pratama" + memberIndex 10 → "danang-0010"
 *   - Personal (mengandung nama klien) tapi 4-digit pad bikin susah ditebak random.
 *   - Hanya alfanumerik (non-ASCII / spasi / tanda baca dibuang dari name).
 *   - Server-side parsing identik di RPC `get_member_card(p_slug)`.
 */

export function buildMemberSlug(name: string, memberIndex: number): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const safe = first
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
  const fallback = safe.length > 0 ? safe : "member";
  const idx = Math.max(1, Math.floor(memberIndex));
  return `${fallback}-${String(idx).padStart(4, "0")}`;
}

/** Absolute URL ke halaman publik. SSR-safe (return relative kalau no window). */
export function buildPublicMemberUrl(slug: string): string {
  if (typeof window === "undefined") return `/m/${slug}`;
  return `${window.location.origin}/m/${slug}`;
}

/** URL referral — sama dengan public URL tapi ada ?ref=slug untuk tracking. */
export function buildReferralUrl(slug: string): string {
  if (typeof window === "undefined") return `/m/${slug}?ref=${slug}`;
  return `${window.location.origin}/m/${slug}?ref=${slug}`;
}

/** Normalisasi nomor HP Indonesia ke format wa.me (62xxxx, tanpa +). */
export function normalizePhoneForWa(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0"))  return "62" + digits.slice(1);
  if (digits.startsWith("8"))  return "62" + digits;
  return digits;
}

/** Bangun teks share WhatsApp standar Temantiket Member Card. */
export function buildWhatsAppShareText(opts: { clientName: string; publicUrl: string }): string {
  const firstName = (opts.clientName ?? "").trim().split(/\s+/)[0] || "Sahabat";
  return (
    `Halo ${firstName}, ini kartu member Temantiket lo! ` +
    `Cek poin dan riwayat transaksi lo di sini: ${opts.publicUrl} | ` +
    `Pantau terus stamp-nya sampai penuh ya! ✈️`
  );
}

/** Bangun URL wa.me — pakai recipient kalau phone valid, kalau gak yg public chooser. */
export function buildWhatsAppShareUrl(opts: { phone?: string | null; text: string }): string {
  const recipient = normalizePhoneForWa(opts.phone);
  const encoded = encodeURIComponent(opts.text);
  return recipient
    ? `https://wa.me/${recipient}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}
