import { create } from "zustand";
import { computeQuote, type CostInput, type Quote } from "@/features/calculator/pricing";
import type { Currency } from "@/lib/exchangeRates";
import { useRatesStore } from "./ratesStore";

/**
 * Global calculator store.
 * Holds the in-progress trip configuration so it can be shared between
 * the Calculator page, PDF preview, and any "save as package" flow
 * without prop drilling.
 */
export interface CalculatorState {
  packageName: string;
  destination: string;
  people: number;
  currency: Currency;
  costs: CostInput[];
  marginPercent: number;

  setField: <K extends keyof Omit<CalculatorState,
    | "setField" | "setCosts" | "addCost" | "removeCost"
    | "updateCostAmount" | "updateCostLabel" | "reset" | "getQuote">>(
    key: K,
    value: CalculatorState[K],
  ) => void;
  setCosts: (updater: (prev: CostInput[]) => CostInput[]) => void;
  addCost: (cost: CostInput) => void;
  removeCost: (id: string) => void;
  updateCostAmount: (id: string, amount: number) => void;
  updateCostLabel: (id: string, label: string) => void;
  reset: (initial?: Partial<CalculatorState>) => void;
  getQuote: () => Quote;
}

const defaults = {
  packageName: "",
  destination: "",
  people: 1,
  currency: "USD" as Currency,
  costs: [] as CostInput[],
  marginPercent: 15,
};

export const useCalculatorStore = create<CalculatorState>((set, get) => ({
  ...defaults,

  setField: (key, value) => set({ [key]: value } as Partial<CalculatorState>),

  setCosts: (updater) => set((s) => ({ costs: updater(s.costs) })),

  addCost: (cost) => set((s) => ({ costs: [...s.costs, cost] })),

  removeCost: (id) => set((s) => ({ costs: s.costs.filter((c) => c.id !== id) })),

  updateCostAmount: (id, amount) =>
    set((s) => ({ costs: s.costs.map((c) => (c.id === id ? { ...c, amount } : c)) })),

  updateCostLabel: (id, label) =>
    set((s) => ({ costs: s.costs.map((c) => (c.id === id ? { ...c, label } : c)) })),

  reset: (initial) => set({ ...defaults, ...initial }),

  getQuote: () => {
    const s = get();
    const rates = useRatesStore.getState().rates;
    return computeQuote({
      costs: s.costs,
      people: s.people,
      currency: s.currency,
      marginPercent: s.marginPercent,
      rates,
    });
  },
}));
