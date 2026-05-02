import type { Order } from "@/features/orders/ordersRepo";

/**
 * Fallback EGP → IDR rate untuk normalisasi profit di Laporan Keuangan.
 * Rate dinamis di-inject lewat parameter egpRate di tiap fungsi.
 * 1 EGP ≈ 515 IDR (update May 2026).
 */
export const EGP_TO_IDR = 515;

/**
 * Effective cost price utk hitung profit.
 *
 * Untuk umrah orders yg dibuat sebelum kolom `cost_price` ada, kita coba
 * fallback ke `metadata.hpp` (snapshot dari Calculator). Ini bikin Reports
 * page tetep nampilin angka masuk akal utk data lama tanpa harus backfill.
 */
export function effectiveCostPrice(order: Order): number {
  if (order.costPrice > 0) return order.costPrice;
  if (order.type === "umrah") {
    const hpp = (order.metadata as Record<string, unknown>)?.hpp;
    if (typeof hpp === "number" && hpp > 0) return hpp;
    if (typeof hpp === "string") {
      const n = Number(hpp);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

/** profit = totalPrice - effectiveCostPrice (currency-native, blm di-normalize). */
export function rawProfit(order: Order): number {
  return Number(order.totalPrice ?? 0) - effectiveCostPrice(order);
}

/**
 * Normalize ke IDR. Currency selain IDR/EGP di-anggap IDR (data quirk).
 * Dipake di Reports page biar grafik & total bisa di-aggregate single-unit.
 * @param egpRate - kurs EGP saat ini dari ratesStore (default: EGP_TO_IDR)
 */
export function toIDR(amount: number, currency: string, egpRate = EGP_TO_IDR): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "EGP") return Math.round(amount * egpRate);
  return Math.round(amount);
}

export function profitIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(rawProfit(order), order.currency, egpRate);
}

export function revenueIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(Number(order.totalPrice ?? 0), order.currency, egpRate);
}

export function costIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(effectiveCostPrice(order), order.currency, egpRate);
}

export const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
