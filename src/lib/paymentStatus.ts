/**
 * paymentStatus — source of truth for payment badge display + computation.
 *
 * payment_status values: UNPAID | DP | PAID | REFUNDED
 *
 * These are stored in the orders.payment_status column.
 * paid_amount is stored in orders.paid_amount.
 *
 * Derived status rule (for UI display):
 *   paid_amount <= 0              → UNPAID
 *   0 < paid_amount < totalPrice  → DP
 *   paid_amount >= totalPrice     → PAID
 *   explicit REFUNDED             → REFUNDED
 */

export type PaymentStatus = "UNPAID" | "DP" | "PAID" | "REFUNDED";

export const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "DP", "PAID", "REFUNDED"];

export function coercePaymentStatus(v: unknown): PaymentStatus {
  return (PAYMENT_STATUSES as string[]).includes(v as string)
    ? (v as PaymentStatus)
    : "UNPAID";
}

/** Derive payment status from paid_amount vs totalPrice. */
export function derivePaymentStatus(
  paidAmount: number,
  totalPrice: number,
  explicit?: PaymentStatus,
): PaymentStatus {
  if (explicit === "REFUNDED") return "REFUNDED";
  if (totalPrice <= 0) return "UNPAID";
  if (paidAmount >= totalPrice) return "PAID";
  if (paidAmount > 0) return "DP";
  return "UNPAID";
}

/** Human-readable label (Indonesian). */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID:   "Belum Bayar",
  DP:       "DP",
  PAID:     "Lunas",
  REFUNDED: "Refund",
};

/** Emoji for quick scanning. */
export const PAYMENT_STATUS_EMOJI: Record<PaymentStatus, string> = {
  UNPAID:   "🔴",
  DP:       "🟡",
  PAID:     "🟢",
  REFUNDED: "↩️",
};

/** Tailwind class pairs for badge rendering. */
export const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  UNPAID:   "bg-red-100 text-red-700 border-red-200",
  DP:       "bg-amber-100 text-amber-700 border-amber-200",
  PAID:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  REFUNDED: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Same but dot-only color for tiny indicators. */
export const PAYMENT_DOT_COLOR: Record<PaymentStatus, string> = {
  UNPAID:   "bg-red-500",
  DP:       "bg-amber-400",
  PAID:     "bg-emerald-500",
  REFUNDED: "bg-gray-400",
};

/** True when the order has an outstanding receivable (not fully paid, not cancelled). */
export function isReceivable(ps: PaymentStatus): boolean {
  return ps === "UNPAID" || ps === "DP";
}

/** Format a currency amount in IDR shorthand for widgets. */
export function fmtIDRShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} Jt`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)} Rb`;
  return String(Math.round(n));
}

/** Build a WhatsApp URL with a pre-filled payment reminder message. */
export function buildWhatsAppReminderUrl(
  phone: string,
  clientName: string,
  orderTitle: string,
  remaining: number,
  agencyName?: string,
): string {
  const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "62");
  const agency = agencyName ? agencyName : "kami";
  const amount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(remaining);

  const msg = `Halo ${clientName} 👋\n\nIni pengingat dari ${agency} bahwa ada sisa pembayaran untuk *${orderTitle}* sebesar *${amount}*.\n\nMohon segera melunasi agar proses dapat dilanjutkan.\n\nTerima kasih 🙏`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}
