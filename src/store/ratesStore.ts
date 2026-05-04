import { create } from "zustand";
import { getExchangeRates, applyMarkup, type Currency, type Rates } from "@/lib/exchangeRates";
import { pullAgencySetting, pushAgencySetting } from "@/lib/settingsSync";

const MARKUP_KEY      = "igh.rates.markup.v1";
const MODE_KEY        = "igh.rates.mode.v1";
const MANUAL_RATES_KEY = "igh.rates.manual.v1";
const CLOUD_KEY       = "rates_config";
const DEFAULT_RATES: Rates = { USD: 16000, SAR: 4250, IDR: 1, EGP: 515 };

type RateMode = "live" | "manual";

interface RatesConfig {
  mode:        RateMode;
  markupPct:   number;
  manualRates: Rates;
}

function loadMarkup(): number {
  try {
    const v = localStorage.getItem(MARKUP_KEY);
    return v ? Number(v) : 0;
  } catch { return 0; }
}

function loadMode(): RateMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "manual" ? "manual" : "live";
  } catch { return "live"; }
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
      EGP: Number(parsed.EGP) > 0 ? Math.round(Number(parsed.EGP)) : DEFAULT_RATES.EGP,
    };
  } catch { return DEFAULT_RATES; }
}

function persistConfig(mode: RateMode, markupPct: number, manualRates: Rates) {
  localStorage.setItem(MARKUP_KEY, String(markupPct));
  localStorage.setItem(MODE_KEY, mode);
  localStorage.setItem(MANUAL_RATES_KEY, JSON.stringify(manualRates));
  void pushAgencySetting(CLOUD_KEY, { mode, markupPct, manualRates });
}

function getActiveRates(mode: RateMode, rawRates: Rates, manualRates: Rates, markupPct: number): Rates {
  return applyMarkup(mode === "manual" ? manualRates : rawRates, markupPct);
}

interface RatesState {
  rates:       Rates;
  rawRates:    Rates;
  manualRates: Rates;
  mode:        RateMode;
  lastUpdated: Date | null;
  loading:     boolean;
  error:       string | null;
  markupPct:   number;
  setMarkup:    (pct: number) => void;
  setMode:      (mode: RateMode) => void;
  setManualRate:(currency: Exclude<Currency, "IDR">, value: number) => void;
  refresh:      () => Promise<void>;
  /** Pull konfigurasi kurs dari Supabase → hydrate localStorage & store. */
  pullFromCloud: () => Promise<void>;
}

export const useRatesStore = create<RatesState>((set, get) => ({
  rates:       getActiveRates(loadMode(), DEFAULT_RATES, loadManualRates(), loadMarkup()),
  rawRates:    DEFAULT_RATES,
  manualRates: loadManualRates(),
  mode:        loadMode(),
  lastUpdated: null,
  loading:     false,
  error:       null,
  markupPct:   loadMarkup(),

  setMarkup: (pct: number) => {
    const { mode, rawRates, manualRates } = get();
    persistConfig(mode, pct, manualRates);
    set({ markupPct: pct, rates: getActiveRates(mode, rawRates, manualRates, pct) });
  },

  setMode: (mode: RateMode) => {
    const { rawRates, manualRates, markupPct } = get();
    persistConfig(mode, markupPct, manualRates);
    set({ mode, rates: getActiveRates(mode, rawRates, manualRates, markupPct) });
  },

  setManualRate: (currency, value) => {
    const { mode, rawRates, markupPct } = get();
    const nextManualRates = {
      ...get().manualRates,
      IDR: 1,
      [currency]: Math.max(1, Math.round(value || 0)),
    };
    persistConfig(mode, markupPct, nextManualRates);
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
        rawRates:    raw,
        rates:       getActiveRates(mode, raw, manualRates, markupPct),
        lastUpdated: new Date(),
        loading:     false,
      });
    } catch (e) {
      set({
        error:   e instanceof Error ? e.message : "Gagal memuat kurs",
        loading: false,
      });
    }
  },

  pullFromCloud: async () => {
    const remote = await pullAgencySetting<RatesConfig>(CLOUD_KEY);
    if (!remote) return;
    const mode        = remote.mode        ?? loadMode();
    const markupPct   = remote.markupPct   ?? loadMarkup();
    const manualRates = remote.manualRates
      ? { IDR: 1, ...remote.manualRates }
      : loadManualRates();
    localStorage.setItem(MARKUP_KEY, String(markupPct));
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(MANUAL_RATES_KEY, JSON.stringify(manualRates));
    const { rawRates } = get();
    set({ mode, markupPct, manualRates, rates: getActiveRates(mode, rawRates, manualRates, markupPct) });
  },
}));
