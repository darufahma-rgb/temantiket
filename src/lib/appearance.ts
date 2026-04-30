export type AppearanceTheme = "light" | "dark" | "auto";
export type AppearanceFontSize = "small" | "medium" | "large";

export type AppearanceSettings = {
  theme: AppearanceTheme;
  fontSize: AppearanceFontSize;
  compactMode: boolean;
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "light",
  fontSize: "medium",
  compactMode: false,
};

const STORAGE_KEY = "igh-tour-appearance";

export function loadAppearanceSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearanceSettings(settings: AppearanceSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applyAppearanceSettings(settings: AppearanceSettings) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = settings.theme === "auto" ? (prefersDark ? "dark" : "light") : settings.theme;

  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = settings.theme;
  root.dataset.fontSize = settings.fontSize;
  root.dataset.compact = String(settings.compactMode);
}