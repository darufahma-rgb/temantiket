/**
 * Global state — Zustand stores.
 *
 * Keep concerns isolated:
 *  - ratesStore       → exchange rates (mock today, API later)
 *  - packagesStore    → package list + current selection (CRUD)
 *  - calculatorStore  → in-progress trip configuration
 *
 * Components should import the specific hook they need to keep
 * re-renders narrow.
 */
export { useRatesStore } from "./ratesStore";
export { usePackagesStore, useCurrentPackage } from "./packagesStore";
export { useCalculatorStore } from "./calculatorStore";
