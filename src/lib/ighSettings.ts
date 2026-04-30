/**
 * IGH-wide admin settings (kontak admin yang muncul di footer PDF & UI).
 * Disimpan ke localStorage; tidak disinkronkan ke cloud — ini setting per-device
 * untuk operasional admin (mis. WhatsApp Syamil IGH yang muncul di penawaran).
 */

export interface IghAdminSettings {
  /** Nomor WhatsApp admin (international format dengan/atau tanpa +). */
  adminWhatsapp: string;
  /** Handle Instagram tanpa @, mis. "igh.tour". */
  adminInstagram: string;
}

const STORAGE_KEY = "igh:admin-settings";

export const DEFAULT_IGH_ADMIN_SETTINGS: IghAdminSettings = {
  adminWhatsapp: "+6282245193615", // Syamil IGH
  adminInstagram: "igh.tour",
};

export function loadIghAdminSettings(): IghAdminSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IGH_ADMIN_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<IghAdminSettings>;
    return {
      adminWhatsapp: (parsed.adminWhatsapp ?? DEFAULT_IGH_ADMIN_SETTINGS.adminWhatsapp).trim(),
      adminInstagram: (parsed.adminInstagram ?? DEFAULT_IGH_ADMIN_SETTINGS.adminInstagram).trim(),
    };
  } catch {
    return { ...DEFAULT_IGH_ADMIN_SETTINGS };
  }
}

export function saveIghAdminSettings(patch: Partial<IghAdminSettings>): IghAdminSettings {
  const next = { ...loadIghAdminSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("igh:admin-settings-changed", { detail: next }));
  } catch {
    /* noop */
  }
  return next;
}

/** Strip non-digits — siap dipakai untuk URL `https://wa.me/{digits}`. */
export function whatsappDigits(raw: string): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/** Format display: "+62 822-4519-3615" dari "+6282245193615". */
export function formatWhatsappDisplay(raw: string): string {
  const d = whatsappDigits(raw);
  if (!d) return "";
  // Indonesian-style chunking: +CC AAAA-BBBB-CCCC (best effort).
  if (d.startsWith("62")) {
    const rest = d.slice(2);
    const a = rest.slice(0, 3);
    const b = rest.slice(3, 7);
    const c = rest.slice(7);
    return `+62 ${a}${b ? `-${b}` : ""}${c ? `-${c}` : ""}`.trim();
  }
  return `+${d}`;
}

/** URL klik-untuk-chat. */
export function whatsappUrl(raw: string): string {
  return `https://wa.me/${whatsappDigits(raw)}`;
}
