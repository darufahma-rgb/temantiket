/**
 * featureFlags.ts — H. Safety & Observability
 *
 * Centralized feature flag system for Temantiket.
 * Flags are read from localStorage (runtime override) with compile-time defaults.
 *
 * Usage:
 *   import { isEnabled } from "@/lib/featureFlags";
 *   if (isEnabled("audit_center")) { ... }
 */

export type FeatureFlag =
  | "audit_center"          // Show Audit Center in sidebar
  | "realtime_indicator"    // Show realtime connection indicator
  | "cashflow_accuracy"     // Show cashflow accuracy card in Reports
  | "sla_warnings"          // Show SLA exceeded warnings on order cards
  | "migration_engine"      // Show migration engine panel in settings
  | "debug_panels"          // Show dev debug panels in public pages
  | "seasonal_branding"     // Enable seasonal brand overrides
  | "wallet_reconciliation" // Enable wallet reconciliation checker
  | "structured_logging"    // Enable structured server logs (always true in prod)
  | "push_notifications";   // Enable push notification prompts

/** Compile-time defaults — all production-safe */
const DEFAULTS: Record<FeatureFlag, boolean> = {
  audit_center:          true,
  realtime_indicator:    true,
  cashflow_accuracy:     true,
  sla_warnings:          true,
  migration_engine:      true,
  debug_panels:          import.meta.env.DEV,
  seasonal_branding:     true,
  wallet_reconciliation: true,
  structured_logging:    true,
  push_notifications:    false,
};

const STORAGE_KEY = "igh:feature_flags";

function loadOverrides(): Partial<Record<FeatureFlag, boolean>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<FeatureFlag, boolean>>) : {};
  } catch {
    return {};
  }
}

/** Check if a feature flag is enabled. */
export function isEnabled(flag: FeatureFlag): boolean {
  const overrides = loadOverrides();
  if (flag in overrides) return overrides[flag]!;
  return DEFAULTS[flag] ?? false;
}

/** Override a feature flag at runtime. Persisted to localStorage. */
export function setFlag(flag: FeatureFlag, value: boolean): void {
  const overrides = loadOverrides();
  overrides[flag] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch { /* quota */ }
}

/** Reset all flag overrides to compile-time defaults. */
export function resetFlags(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

/** Get all current flag values (defaults + overrides merged). */
export function getAllFlags(): Record<FeatureFlag, boolean> {
  const overrides = loadOverrides();
  return Object.fromEntries(
    (Object.keys(DEFAULTS) as FeatureFlag[]).map((k) => [k, k in overrides ? overrides[k]! : DEFAULTS[k]])
  ) as Record<FeatureFlag, boolean>;
}
