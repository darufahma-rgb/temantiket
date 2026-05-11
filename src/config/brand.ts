/**
 * brand.ts — Centralized brand configuration for Temantiket.
 *
 * ALL pages and components must import brand assets from this file.
 * Never hardcode logo paths, brand colors, or brand names inline.
 *
 * F — Branding System (2025):
 *   + White-label: override BRAND at runtime by calling setBrand() before app mount.
 *   + Multi-brand: use getBrand() to get the current active brand config.
 *   + Seasonal branding: auto-applies date-based theme overrides (Ramadan, Idul Fitri, etc.)
 *   + SVG support with PNG fallback
 *   + Retina optimization via srcSet
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

export interface SeasonalBrandOverride {
  /** Unique key for this season (e.g. "ramadan_2025") */
  key: string;
  /** Month start (1-12) */
  startMonth: number;
  /** Day start (1-31) */
  startDay: number;
  /** Month end (1-12) */
  endMonth: number;
  /** Day end (1-31) */
  endDay: number;
  /** Partial brand config override */
  override: Partial<BrandConfig>;
}

/** Seasonal brand overrides — auto-applied when current date falls in range */
const SEASONAL_OVERRIDES: SeasonalBrandOverride[] = [
  {
    key: "ramadan",
    startMonth: 3, startDay: 1,
    endMonth: 3, endDay: 31,
    override: {
      tagline: "Marhaban ya Ramadan — Umrah & Haji Penuh Berkah",
      accentColor: "#d4a017",
    },
  },
  {
    key: "idul_fitri",
    startMonth: 4, startDay: 1,
    endMonth: 4, endDay: 14,
    override: {
      tagline: "Selamat Idul Fitri — Minal Aidin Wal Faizin",
      accentColor: "#10b981",
    },
  },
  {
    key: "haji_season",
    startMonth: 5, startDay: 15,
    endMonth: 7, endDay: 31,
    override: {
      tagline: "Musim Haji — Layanan Perjalanan Ibadah Terpercaya",
      accentColor: "#1a44d4",
    },
  },
];

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
let _seasonalEnabled = true;

/** Get the currently active brand config (with seasonal overrides if enabled). */
export function getBrand(): Readonly<BrandConfig> {
  if (!_seasonalEnabled) return _activeBrand;
  const season = getCurrentSeason();
  if (!season) return _activeBrand;
  return { ..._activeBrand, ...season.override };
}

/** Override brand config (white-label support). Deep-merges with defaults. */
export function setBrand(overrides: Partial<BrandConfig>): void {
  _activeBrand = { ...DEFAULT_BRAND, ...overrides };
}

/** Reset to Temantiket defaults. */
export function resetBrand(): void {
  _activeBrand = { ...DEFAULT_BRAND };
}

/** Enable or disable seasonal branding overrides. */
export function setSeasonalBranding(enabled: boolean): void {
  _seasonalEnabled = enabled;
}

/**
 * Detect the current active seasonal override (if any).
 * Returns the FIRST matching season, or null if none match.
 */
export function getCurrentSeason(): SeasonalBrandOverride | null {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day   = now.getDate();      // 1-31

  for (const season of SEASONAL_OVERRIDES) {
    const startOk = month > season.startMonth || (month === season.startMonth && day >= season.startDay);
    const endOk   = month < season.endMonth   || (month === season.endMonth   && day <= season.endDay);
    if (startOk && endOk) return season;
  }
  return null;
}

/**
 * Register a custom seasonal override at runtime.
 * Useful for agency-specific custom seasons (e.g., anniversary).
 */
export function addSeasonalOverride(season: SeasonalBrandOverride): void {
  const idx = SEASONAL_OVERRIDES.findIndex((s) => s.key === season.key);
  if (idx >= 0) SEASONAL_OVERRIDES[idx] = season;
  else SEASONAL_OVERRIDES.push(season);
}

/** Convenience: get the brand icon src (with PNG fallback if SVG unsupported). */
export function getBrandIconSrc(preferPng = false): string {
  if (preferPng) return "/temantiket-icon.png";
  return getBrand().logoIcon;
}

/** Convenience: get the full logo for light backgrounds. */
export function getBrandLogoSrc(variant: "light" | "dark" = "light"): string {
  const brand = getBrand();
  return variant === "dark" ? brand.logoDark : brand.logoLight;
}

export const BRAND = DEFAULT_BRAND;
