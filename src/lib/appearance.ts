/**
 * Appearance settings (theme, font size, compact mode).
 * localStorage = instant cache; setiap save juga di-push ke Supabase user_settings.
 */

import { pullUserSetting, pushUserSetting } from "./settingsSync";

export type AppearanceTheme    = "light" | "dark" | "auto";
export type AppearanceFontSize = "small" | "medium" | "large";

export type AppearanceSettings = {
  theme:       AppearanceTheme;
  fontSize:    AppearanceFontSize;
  compactMode: boolean;
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme:       "light",
  fontSize:    "medium",
  compactMode: false,
};

const STORAGE_KEY = "igh-tour-appearance";
const CLOUD_KEY   = "appearance";

export function loadAppearanceSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearanceSettings(settings: AppearanceSettings, userId?: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  if (userId) {
    void pushUserSetting(userId, CLOUD_KEY, settings);
  }
}

/** Pull dari Supabase → tulis ke localStorage. Dipanggil setelah login. */
export async function pullAppearanceSettings(userId: string): Promise<AppearanceSettings | null> {
  if (!userId) return null;
  const remote = await pullUserSetting<AppearanceSettings>(userId, CLOUD_KEY);
  if (!remote) return null;
  const merged = { ...DEFAULT_APPEARANCE, ...remote };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* noop */ }
  return merged;
}

export function applyAppearanceSettings(settings: AppearanceSettings) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = settings.theme === "auto" ? (prefersDark ? "dark" : "light") : settings.theme;

  root.dataset.theme    = resolvedTheme;
  root.dataset.themeMode = settings.theme;
  root.dataset.fontSize  = settings.fontSize;
  root.dataset.compact   = String(settings.compactMode);
}
