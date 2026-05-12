/**
 * agentFeeBreakdown — single source of truth for agent commission breakdown.
 *
 * Uses wallet transactions as the authoritative ledger (what has actually been
 * credited), not order metadata (which includes pending/uncredited amounts).
 *
 * WalletTxType → Breakdown category:
 *   order_bonus        → salesCommission   (fee dari order yang agen buat)
 *   voa_agent_fee      → fieldAgentFee     (fee agent lapangan VOA)
 *   pelaksana_fee      → pelaksanaFee      (fee pelaksana visa pelajar)
 *   kurir_fee          → kurirFee          (fee kurir setoran uang)
 *   mission_conversion │
 *   mission_fee        ├─→ bonusManual     (konversi poin, side job, koreksi)
 *   adjustment         │
 *   payout             → totalPaidOut      (pencairan — debit, tidak masuk kredit)
 */
import type { WalletTransaction } from "./agentWallet";

export interface FeeBreakdown {
  salesCommission: number;
  fieldAgentFee:   number;
  pelaksanaFee:    number;
  kurirFee:        number;
  bonusManual:     number;
  totalCredit:     number;
  totalPaidOut:    number;
  netBalance:      number;
}

const ORDER_FEE_TYPES: WalletTxType[] = [
  "order_bonus", "voa_agent_fee", "field_agent_fee",
  "pelaksana_fee", "kurir_fee", "operational_fee",
];

/**
 * Deduplicate wallet transactions by (type, orderId) — keeps the oldest entry.
 * Transactions without an orderId are never deduplicated.
 * This is a UI-level safety net; the DB unique index is the primary guard.
 */
function deduplicateTxs(txs: WalletTransaction[]): WalletTransaction[] {
  const seen = new Map<string, true>();
  const result: WalletTransaction[] = [];
  for (const tx of [...txs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (tx.orderId && ORDER_FEE_TYPES.includes(tx.type)) {
      const key = `${tx.type}:${tx.orderId}`;
      if (seen.has(key)) continue;
      seen.set(key, true);
    }
    result.push(tx);
  }
  return result;
}

export function computeFeeBreakdown(txs: WalletTransaction[]): FeeBreakdown {
  const dedupedTxs = deduplicateTxs(txs);

  let salesCommission = 0;
  let fieldAgentFee   = 0;
  let pelaksanaFee    = 0;
  let kurirFee        = 0;
  let bonusManual     = 0;
  let totalPaidOut    = 0;

  for (const tx of dedupedTxs) {
    if (tx.amountIDR < 0) {
      if (tx.type === "payout") totalPaidOut += Math.abs(tx.amountIDR);
      continue;
    }
    switch (tx.type) {
      case "order_bonus":
        salesCommission += tx.amountIDR;
        break;
      case "voa_agent_fee":
      case "field_agent_fee":
        fieldAgentFee += tx.amountIDR;
        break;
      case "pelaksana_fee":
        pelaksanaFee += tx.amountIDR;
        break;
      case "kurir_fee":
        kurirFee += tx.amountIDR;
        break;
      case "operational_fee":
        kurirFee += tx.amountIDR;
        break;
      case "mission_conversion":
      case "mission_fee":
      case "adjustment":
        bonusManual += tx.amountIDR;
        break;
    }
  }

  const totalCredit = salesCommission + fieldAgentFee + pelaksanaFee + kurirFee + bonusManual;
  return {
    salesCommission,
    fieldAgentFee,
    pelaksanaFee,
    kurirFee,
    bonusManual,
    totalCredit,
    totalPaidOut,
    netBalance: totalCredit - totalPaidOut,
  };
}
