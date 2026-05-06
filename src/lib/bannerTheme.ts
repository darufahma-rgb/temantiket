/**
 * bannerTheme — tema visual hero banner halaman publik /harga-tiket.
 * localStorage = instant cache; setiap save juga di-push ke Supabase agency_settings.
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";

export type BannerPreset = "aurora" | "midnight" | "ocean" | "sunset" | "galaxy" | "forest" | "custom";

export interface BannerTheme {
  preset: BannerPreset;
  customBase?: string;
  customBlob1?: string;
  customBlob2?: string;
}

export interface BannerCss {
  base: string;
  blob1Color: string;
  blob2Color: string;
  blob3Color: string;
  accentColor: string;
}

export interface PresetMeta {
  label: string;
  gradient: string;
  css: BannerCss;
}

export const PRESET_SWATCHES: Record<Exclude<BannerPreset, "custom">, PresetMeta> = {
  aurora: {
    label: "Aurora",
    gradient: "linear-gradient(135deg,#03061a 0%,#0d1a40 50%,#1a0a3a 100%)",
    css: {
      base: "#03061a",
      blob1Color: "rgba(34,211,238,0.28)",
      blob2Color: "rgba(167,139,250,0.30)",
      blob3Color: "rgba(99,102,241,0.22)",
      accentColor: "rgba(34,211,238,0.5)",
    },
  },
  midnight: {
    label: "Midnight",
    gradient: "linear-gradient(135deg,#04040f 0%,#0a0a2e 50%,#0e0e3a 100%)",
    css: {
      base: "#04040f",
      blob1Color: "rgba(96,165,250,0.26)",
      blob2Color: "rgba(67,56,202,0.28)",
      blob3Color: "rgba(30,27,75,0.30)",
      accentColor: "rgba(96,165,250,0.52)",
    },
  },
  ocean: {
    label: "Ocean",
    gradient: "linear-gradient(135deg,#021920 0%,#023548 50%,#03404a 100%)",
    css: {
      base: "#021920",
      blob1Color: "rgba(6,182,212,0.30)",
      blob2Color: "rgba(20,184,166,0.24)",
      blob3Color: "rgba(14,116,144,0.20)",
      accentColor: "rgba(6,182,212,0.55)",
    },
  },
  sunset: {
    label: "Sunset",
    gradient: "linear-gradient(135deg,#120300 0%,#3d0f00 50%,#1a0b00 100%)",
    css: {
      base: "#120300",
      blob1Color: "rgba(251,146,60,0.30)",
      blob2Color: "rgba(239,68,68,0.22)",
      blob3Color: "rgba(217,119,6,0.18)",
      accentColor: "rgba(251,146,60,0.55)",
    },
  },
  galaxy: {
    label: "Galaxy",
    gradient: "linear-gradient(135deg,#0f0520 0%,#200836 50%,#1a053a 100%)",
    css: {
      base: "#0f0520",
      blob1Color: "rgba(192,132,252,0.30)",
      blob2Color: "rgba(244,114,182,0.24)",
      blob3Color: "rgba(139,92,246,0.24)",
      accentColor: "rgba(192,132,252,0.55)",
    },
  },
  forest: {
    label: "Forest",
    gradient: "linear-gradient(135deg,#010f0a 0%,#022e1a 50%,#041e0f 100%)",
    css: {
      base: "#010f0a",
      blob1Color: "rgba(52,211,153,0.28)",
      blob2Color: "rgba(16,185,129,0.22)",
      blob3Color: "rgba(6,78,59,0.28)",
      accentColor: "rgba(52,211,153,0.55)",
    },
  },
};

const STORAGE_KEY = "igh:banner-theme";
const CLOUD_KEY = "banner_theme";

export const DEFAULT_BANNER_THEME: BannerTheme = { preset: "aurora" };

export function loadBannerTheme(): BannerTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BANNER_THEME };
    return { ...DEFAULT_BANNER_THEME, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BANNER_THEME };
  }
}

export function saveBannerTheme(theme: BannerTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    window.dispatchEvent(new CustomEvent("banner-theme-changed", { detail: theme }));
  } catch { /* noop */ }
  void pushAgencySetting(CLOUD_KEY, theme);
}

export async function pullBannerTheme(): Promise<BannerTheme | null> {
  const remote = await pullAgencySetting<BannerTheme>(CLOUD_KEY);
  if (!remote) return null;
  const merged: BannerTheme = { ...DEFAULT_BANNER_THEME, ...remote };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("banner-theme-changed", { detail: merged }));
  } catch { /* noop */ }
  return merged;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || "").replace("#", "").trim();
  if (clean.length < 6) return `rgba(100,100,200,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,200,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function resolveBannerCss(theme: BannerTheme): BannerCss {
  if (theme.preset !== "custom") {
    return PRESET_SWATCHES[theme.preset]?.css ?? PRESET_SWATCHES.aurora.css;
  }
  const base = theme.customBase || "#1a1a2e";
  const c1   = theme.customBlob1 || "#22d3ee";
  const c2   = theme.customBlob2 || "#a78bfa";
  return {
    base,
    blob1Color: hexToRgba(c1, 0.28),
    blob2Color: hexToRgba(c2, 0.28),
    blob3Color: hexToRgba(c1, 0.16),
    accentColor: hexToRgba(c1, 0.5),
  };
}
