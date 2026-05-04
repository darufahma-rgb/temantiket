/**
 * Temantiket-wide admin settings (kontak admin yang muncul di footer PDF & UI).
 * localStorage = instant cache; setiap save juga di-push ke Supabase agency_settings.
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";
import { useAuthStore } from "@/store/authStore";

export interface IghAdminSettings {
  adminWhatsapp: string;
  adminInstagram: string;
}

const STORAGE_KEY = "igh:admin-settings";
const CLOUD_KEY   = "admin_settings";

export const DEFAULT_IGH_ADMIN_SETTINGS: IghAdminSettings = {
  adminWhatsapp: "+6281311506025",
  adminInstagram: "temantiket",
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
  } catch { /* noop */ }
  void pushAgencySetting(CLOUD_KEY, next);
  return next;
}

/** Pull dari Supabase → tulis ke localStorage. Dipanggil saat app init. */
export async function pullIghAdminSettings(): Promise<IghAdminSettings | null> {
  const remote = await pullAgencySetting<IghAdminSettings>(CLOUD_KEY);
  if (!remote) return null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    window.dispatchEvent(new CustomEvent("igh:admin-settings-changed", { detail: remote }));
  } catch { /* noop */ }
  return remote;
}

/** Sync on login: pull dari cloud, hydrate localStorage. */
export async function initIghAdminSettings(): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) return;
  await pullIghAdminSettings();
}

/** Strip non-digits — siap dipakai untuk URL `https://wa.me/{digits}`. */
export function whatsappDigits(raw: string): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/** Format display: "+62 813-1150-6025" dari "+6281311506025". */
export function formatWhatsappDisplay(raw: string): string {
  const d = whatsappDigits(raw);
  if (!d) return "";
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
