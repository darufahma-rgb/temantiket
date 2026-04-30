import { useEffect, useMemo } from "react";
import { useCalculatorStore } from "@/store/calculatorStore";
import { useRatesStore } from "@/store/ratesStore";
import { computeQuote, type CostInput } from "./pricing";
import type { Currency } from "@/lib/exchangeRates";

export interface UseTripCalculatorState {
  packageName: string;
  destination: string;
  people: number;
  currency: Currency;
  costs: CostInput[];
  marginPercent: number;
}

/**
 * Trip calculator hook — thin adapter over the global Zustand store.
 * Keeps the previous API (`setField`, `addCost`, etc.) so existing
 * components continue to work, while state is shared across pages.
 */
export function useTripCalculator(initial?: Partial<UseTripCalculatorState>) {
  const state = useCalculatorStore();
  const rates = useRatesStore((s) => s.rates);
  const ratesLoaded = useRatesStore((s) => s.lastUpdated !== null);
  const refreshRates = useRatesStore((s) => s.refresh);

  // One-time hydration of initial values (only if calculator is still empty).
  useEffect(() => {
    if (!initial) return;
    const isEmpty =
      state.costs.length === 0 && !state.packageName && !state.destination;
    if (isEmpty) state.reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make sure rates are loaded at least once.
  useEffect(() => {
    if (!ratesLoaded) refreshRates();
  }, [ratesLoaded, refreshRates]);

  const quote = useMemo(
    () =>
      computeQuote({
        costs: state.costs,
        people: state.people,
        currency: state.currency,
        marginPercent: state.marginPercent,
        rates,
      }),
    [state.costs, state.people, state.currency, state.marginPercent, rates],
  );

  return {
    packageName: state.packageName,
    destination: state.destination,
    people: state.people,
    currency: state.currency,
    costs: state.costs,
    marginPercent: state.marginPercent,
    rates,
    quote,
    setField: state.setField,
    updateCostAmount: state.updateCostAmount,
    updateCostLabel: state.updateCostLabel,
    addCost: state.addCost,
    removeCost: state.removeCost,
  };
}
