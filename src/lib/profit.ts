import type { Order } from "@/features/orders/ordersRepo";

/**
 * Konversi EGP → IDR utk normalisasi profit di Laporan Keuangan.
 * Order EGP (visa_voa, visa_student) jumlahnya kecil dibanding umrah/flight,
 * jadi pakai konstanta sederhana cukup. Bisa di-tune kalau kurs gerak banyak.
 *
 * 1 EGP ≈ 320 IDR (range historis 250–340).
 */
export const EGP_TO_IDR = 320;

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
 */
export function toIDR(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "EGP") return Math.round(amount * EGP_TO_IDR);
  return Math.round(amount);
}

export function profitIDR(order: Order): number {
  return toIDR(rawProfit(order), order.currency);
}

export function revenueIDR(order: Order): number {
  return toIDR(Number(order.totalPrice ?? 0), order.currency);
}

export function costIDR(order: Order): number {
  return toIDR(effectiveCostPrice(order), order.currency);
}

export const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
