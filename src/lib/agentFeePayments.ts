/**
 * Menyimpan nomor WA agen dan riwayat pembayaran fee komisi per-agency
 * ke localStorage. Tidak disinkronkan ke cloud — data operasional owner.
 */

export interface FeePaymentRecord {
  id: string;
  agentId: string;
  amount: number;
  paidAt: string;
  note: string;
}

const PHONES_KEY = "igh:agent-phones";
const PAYMENTS_KEY = "igh:fee-payments";

// ── Nomor WA agen ──────────────────────────────────────────────────────────

export function loadAgentPhones(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PHONES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveAgentPhone(agentId: string, phone: string): void {
  const all = loadAgentPhones();
  all[agentId] = phone.trim();
  try {
    localStorage.setItem(PHONES_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

export function getAgentPhone(agentId: string): string {
  return loadAgentPhones()[agentId] ?? "";
}

// ── Riwayat Pembayaran Fee ─────────────────────────────────────────────────

export function loadFeePayments(): FeePaymentRecord[] {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    return raw ? (JSON.parse(raw) as FeePaymentRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordFeePayment(agentId: string, amount: number, note = ""): FeePaymentRecord {
  const record: FeePaymentRecord = {
    id: `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    agentId,
    amount,
    paidAt: new Date().toISOString(),
    note,
  };
  const all = loadFeePayments();
  all.unshift(record);
  try {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(all.slice(0, 500)));
  } catch { /* noop */ }
  return record;
}

export function getFeePaymentsForAgent(agentId: string): FeePaymentRecord[] {
  return loadFeePayments().filter((r) => r.agentId === agentId);
}

export function getTotalPaidForAgent(agentId: string): number {
  return getFeePaymentsForAgent(agentId).reduce((s, r) => s + r.amount, 0);
}

/** Format untuk URL wa.me: strip non-digit, konversi 08xx → 628xx */
export function toWaDigits(raw: string): string {
  const digits = raw.replace(/\D+/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits;
}

/** Buka WhatsApp dengan pesan pre-filled. */
export function openWaMessage(phone: string, message: string): void {
  const digits = toWaDigits(phone);
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
