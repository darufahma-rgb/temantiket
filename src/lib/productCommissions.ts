/**
 * productCommissions — fee komisi nominal (IDR) per jenis produk.
 * localStorage = instant cache; setiap save juga di-push ke Supabase agency_settings.
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";

export interface ProductCommissions {
  umrah: number;
  haji: number;
  tiket_pesawat: number;
  visa: number;
  paket: number;
}

export const PRODUCT_COMMISSION_KEY = "temantiket.product_commissions.v1";
const CLOUD_KEY = "product_commissions";

export const DEFAULT_PRODUCT_COMMISSIONS: ProductCommissions = {
  umrah: 0,
  haji: 0,
  tiket_pesawat: 0,
  visa: 0,
  paket: 0,
};

export function loadProductCommissions(): ProductCommissions {
  try {
    const raw = localStorage.getItem(PRODUCT_COMMISSION_KEY);
    return { ...DEFAULT_PRODUCT_COMMISSIONS, ...JSON.parse(raw ?? "{}") };
  } catch {
    return { ...DEFAULT_PRODUCT_COMMISSIONS };
  }
}

export function saveProductCommissions(v: ProductCommissions): void {
  localStorage.setItem(PRODUCT_COMMISSION_KEY, JSON.stringify(v));
  void pushAgencySetting(CLOUD_KEY, v);
}

/** Pull dari Supabase → tulis ke localStorage. */
export async function pullProductCommissions(): Promise<ProductCommissions | null> {
  const remote = await pullAgencySetting<ProductCommissions>(CLOUD_KEY);
  if (!remote) return null;
  try {
    localStorage.setItem(PRODUCT_COMMISSION_KEY, JSON.stringify({ ...DEFAULT_PRODUCT_COMMISSIONS, ...remote }));
  } catch { /* noop */ }
  return { ...DEFAULT_PRODUCT_COMMISSIONS, ...remote };
}

export function getCommissionForOrderType(
  type: "umrah" | "flight" | "visa_voa" | "visa_student",
  commissions?: ProductCommissions,
): number {
  const pc = commissions ?? loadProductCommissions();
  switch (type) {
    case "umrah":        return pc.umrah;
    case "flight":       return pc.tiket_pesawat;
    case "visa_voa":     return pc.visa;
    case "visa_student": return pc.visa;
    default:             return 0;
  }
}
