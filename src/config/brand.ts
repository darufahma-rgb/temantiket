/**
 * brand.ts — Centralized brand configuration for Temantiket.
 *
 * ALL pages and components must import brand assets from this file.
 * Never hardcode logo paths, brand colors, or brand names inline.
 *
 * White-label: override BRAND at runtime by calling setBrand() before app mount.
 * Multi-brand: use getBrand() to get the current active brand config.
 */

export interface BrandConfig {
  /** Human-readable brand name */
  name: string;
  /** Short tagline shown in public-facing pages */
  tagline: string;
  /** SVG icon path (relative to /public) — sharp on retina */
  logoIcon: string;
  /** Full horizontal logo — light background variant */
  logoLight: string;
  /** Full horizontal logo — dark background variant */
  logoDark: string;
  /** Favicon path (relative to /public) */
  favicon: string;
  /** Primary brand color (hex) — matches Tailwind primary */
  brandColor: string;
  /** Secondary accent color (hex) */
  accentColor: string;
  /** WhatsApp contact number for admin (without +) */
  adminWhatsApp?: string;
  /** Support email */
  supportEmail?: string;
}

/** Default brand — Temantiket */
const DEFAULT_BRAND: BrandConfig = {
  name:          "Temantiket",
  tagline:       "Mitra Perjalanan Umrah & Haji Terpercaya",
  logoIcon:      "/temantiket-icon.svg",
  logoLight:     "/temantiket-logo.svg",
  logoDark:      "/temantiket-logo.svg",
  favicon:       "/favicon.ico",
  brandColor:    "#1a44d4",
  accentColor:   "#3b82f6",
  adminWhatsApp: undefined,
  supportEmail:  undefined,
};

let _activeBrand: BrandConfig = { ...DEFAULT_BRAND };

/** Get the currently active brand config. */
export function getBrand(): Readonly<BrandConfig> {
  return _activeBrand;
}

/** Override brand config (white-label support). Deep-merges with defaults. */
export function setBrand(overrides: Partial<BrandConfig>): void {
  _activeBrand = { ...DEFAULT_BRAND, ...overrides };
}

/** Reset to Temantiket defaults. */
export function resetBrand(): void {
  _activeBrand = { ...DEFAULT_BRAND };
}

/** Convenience: get the brand icon src (with PNG fallback if SVG unsupported). */
export function getBrandIconSrc(preferPng = false): string {
  if (preferPng) return "/temantiket-icon.png";
  return _activeBrand.logoIcon;
}

/** Convenience: get the full logo for light backgrounds. */
export function getBrandLogoSrc(variant: "light" | "dark" = "light"): string {
  return variant === "dark" ? _activeBrand.logoDark : _activeBrand.logoLight;
}

export const BRAND = DEFAULT_BRAND;
