import { create } from "zustand";

const LS_KEY = "igh.regional.v1";

export type RegionalLanguage = "id" | "en" | "ar";
export type RegionalTimezone = "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";
export type RegionalCurrency = "IDR" | "USD" | "SAR";
export type RegionalDateFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";

export interface RegionalSettings {
  language: RegionalLanguage;
  timezone: RegionalTimezone;
  currency: RegionalCurrency;
  dateFormat: RegionalDateFormat;
}

interface RegionalState extends RegionalSettings {
  setRegional: (s: Partial<RegionalSettings>) => void;
}

const defaults: RegionalSettings = {
  language: "id",
  timezone: "Asia/Jakarta",
  currency: "IDR",
  dateFormat: "dd/mm/yyyy",
};

function load(): RegionalSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<RegionalSettings>) };
  } catch {
    return defaults;
  }
}

export const useRegionalStore = create<RegionalState>((set) => ({
  ...load(),
  setRegional: (s) => {
    set((prev) => {
      const next = { ...prev, ...s };
      try {
        const { language, timezone, currency, dateFormat } = next;
        localStorage.setItem(LS_KEY, JSON.stringify({ language, timezone, currency, dateFormat }));
      } catch {}
      return next;
    });
  },
}));
