/**
 * productCommissions — fee komisi nominal (IDR) per jenis produk.
 * Disimpan di localStorage oleh owner lewat Settings → Tim/Agen.
 * Dibaca otomatis saat order baru dibuat.
 */

export interface ProductCommissions {
  umrah: number;
  haji: number;
  tiket_pesawat: number;
  visa: number;
  paket: number;
}

export const PRODUCT_COMMISSION_KEY = "temantiket.product_commissions.v1";

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
}

/**
 * Ambil fee komisi untuk OrderType tertentu.
 * umrah/haji → rata-rata antara umrah & haji (user bisa set beda).
 * flight → tiket_pesawat
 * visa_voa / visa_student → visa
 */
export function getCommissionForOrderType(
  type: "umrah" | "flight" | "visa_voa" | "visa_student",
  commissions?: ProductCommissions,
): number {
  const pc = commissions ?? loadProductCommissions();
  switch (type) {
    case "umrah":       return pc.umrah;
    case "flight":      return pc.tiket_pesawat;
    case "visa_voa":    return pc.visa;
    case "visa_student":return pc.visa;
    default:            return 0;
  }
}
