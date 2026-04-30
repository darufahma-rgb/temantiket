import { create } from "zustand";
import { getExchangeRates, applyMarkup, type Currency, type Rates } from "@/lib/exchangeRates";

const MARKUP_KEY = "igh.rates.markup.v1";
const MODE_KEY = "igh.rates.mode.v1";
const MANUAL_RATES_KEY = "igh.rates.manual.v1";
const DEFAULT_RATES: Rates = { USD: 16000, SAR: 4250, IDR: 1 };

type RateMode = "live" | "manual";

function loadMarkup(): number {
  try {
    const v = localStorage.getItem(MARKUP_KEY);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function loadMode(): RateMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "manual" ? "manual" : "live";
  } catch {
    return "live";
  }
}

function loadManualRates(): Rates {
  try {
    const raw = localStorage.getItem(MANUAL_RATES_KEY);
    if (!raw) return DEFAULT_RATES;
    const parsed = JSON.parse(raw) as Partial<Rates>;
    return {
      IDR: 1,
      USD: Number(parsed.USD) > 0 ? Math.round(Number(parsed.USD)) : DEFAULT_RATES.USD,
      SAR: Number(parsed.SAR) > 0 ? Math.round(Number(parsed.SAR)) : DEFAULT_RATES.SAR,
    };
  } catch {
    return DEFAULT_RATES;
  }
}

function getActiveRates(mode: RateMode, rawRates: Rates, manualRates: Rates, markupPct: number): Rates {
  return applyMarkup(mode === "manual" ? manualRates : rawRates, markupPct);
}

interface RatesState {
  rates: Rates;
  rawRates: Rates;
  manualRates: Rates;
  mode: RateMode;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  markupPct: number;
  setMarkup: (pct: number) => void;
  setMode: (mode: RateMode) => void;
  setManualRate: (currency: Exclude<Currency, "IDR">, value: number) => void;
  refresh: () => Promise<void>;
}

export const useRatesStore = create<RatesState>((set, get) => ({
  rates: getActiveRates(loadMode(), DEFAULT_RATES, loadManualRates(), loadMarkup()),
  rawRates: DEFAULT_RATES,
  manualRates: loadManualRates(),
  mode: loadMode(),
  lastUpdated: null,
  loading: false,
  error: null,
  markupPct: loadMarkup(),

  setMarkup: (pct: number) => {
    localStorage.setItem(MARKUP_KEY, String(pct));
    const { mode, rawRates, manualRates } = get();
    set({ markupPct: pct, rates: getActiveRates(mode, rawRates, manualRates, pct) });
  },

  setMode: (mode: RateMode) => {
    localStorage.setItem(MODE_KEY, mode);
    const { rawRates, manualRates, markupPct } = get();
    set({ mode, rates: getActiveRates(mode, rawRates, manualRates, markupPct) });
  },

  setManualRate: (currency, value) => {
    const nextManualRates = {
      ...get().manualRates,
      IDR: 1,
      [currency]: Math.max(1, Math.round(value || 0)),
    };
    localStorage.setItem(MANUAL_RATES_KEY, JSON.stringify(nextManualRates));
    const { mode, rawRates, markupPct } = get();
    set({
      manualRates: nextManualRates,
      rates: getActiveRates(mode, rawRates, nextManualRates, markupPct),
    });
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await getExchangeRates();
      const { mode, manualRates, markupPct } = get();
      set({
        rawRates: raw,
        rates: getActiveRates(mode, raw, manualRates, markupPct),
        lastUpdated: new Date(),
        loading: false,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Gagal memuat kurs",
        loading: false,
      });
    }
  },
}));
