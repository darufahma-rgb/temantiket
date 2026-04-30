import { useRegionalStore, type RegionalCurrency, type RegionalDateFormat, type RegionalTimezone } from "@/store/regionalStore";
import { useRatesStore } from "@/store/ratesStore";
import { getT, type Translations } from "@/lib/i18n";

export function getLocale(lang: string): string {
  switch (lang) {
    case "id": return "id-ID";
    case "ar": return "ar-SA";
    default: return "en-US";
  }
}

function currencySymbol(currency: RegionalCurrency): string {
  switch (currency) {
    case "IDR": return "Rp ";
    case "USD": return "$ ";
    case "SAR": return "SAR ";
  }
}

/**
 * Format an IDR-based amount in the user's preferred display currency.
 * Conversion is done using the active exchange rates from ratesStore.
 */
export function formatCurrencyAmount(
  amountIDR: number,
  currency: RegionalCurrency,
  rates: { USD: number; SAR: number },
  locale: string
): string {
  let amount: number;
  if (currency === "IDR") {
    amount = amountIDR;
  } else if (currency === "USD") {
    amount = rates.USD > 0 ? amountIDR / rates.USD : 0;
  } else {
    amount = rates.SAR > 0 ? amountIDR / rates.SAR : 0;
  }

  const fractionDigits = currency === "IDR" ? 0 : 2;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);

  return currencySymbol(currency) + formatted;
}

/**
 * Format a date string (YYYY-MM-DD or ISO) with the given regional settings.
 * style="full"  → "3 Januari 2025" (full month name)
 * style="short" → "3 Jan 2025" (abbreviated month)
 * style="numeric" → based on dateFormat setting
 */
export function formatDateStr(
  iso: string,
  dateFormat: RegionalDateFormat,
  timezone: RegionalTimezone,
  locale: string,
  style: "full" | "short" | "numeric" = "short"
): string {
  if (!iso) return "—";
  const date = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (isNaN(date.getTime())) return iso;

  if (style === "full") {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    }).format(date);
  }

  if (style === "short") {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(date);
  }

  // numeric — follow dateFormat setting
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "??";
  const d = get("day");
  const m = get("month");
  const y = get("year");

  switch (dateFormat) {
    case "mm/dd/yyyy": return `${m}/${d}/${y}`;
    case "yyyy-mm-dd": return `${y}-${m}-${d}`;
    default: return `${d}/${m}/${y}`;
  }
}

/**
 * React hook that returns regional-aware formatters bound to the current
 * language, timezone, currency, and dateFormat settings.
 */
export function useRegional() {
  const { language, timezone, currency, dateFormat } = useRegionalStore();
  const { rates } = useRatesStore();
  const locale = getLocale(language);

  return {
    language,
    timezone,
    currency,
    dateFormat,
    locale,
    /** Format an IDR-based amount in the user's preferred currency */
    formatCurrency: (amountIDR: number) =>
      formatCurrencyAmount(amountIDR, currency, rates, locale),
    /** Format a date (YYYY-MM-DD or ISO) — default short (e.g. "3 Jan 2025") */
    formatDate: (iso: string, style: "full" | "short" | "numeric" = "short") =>
      formatDateStr(iso, dateFormat, timezone, locale, style),
  };
}

/**
 * Hook that returns the translation dictionary for the current language.
 * Usage: const t = useT();  then use t.nav_dashboard, t.btn_save, etc.
 */
export function useT(): Translations {
  const { language } = useRegionalStore();
  return getT(language);
}
