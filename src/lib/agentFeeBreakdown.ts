/**
 * agentFeeBreakdown — single source of truth for agent commission breakdown.
 *
 * Uses wallet transactions as the authoritative ledger (what has actually been
 * credited), not order metadata (which includes pending/uncredited amounts).
 *
 * WalletTxType → Breakdown category:
 *   order_bonus        → salesCommission   (fee dari order yang agen buat)
 *   voa_agent_fee      → fieldAgentFee     (fee agent lapangan VOA)
 *   field_agent_fee    → fieldAgentFee     (fee agent lapangan generik)
 *   pelaksana_fee      → pelaksanaFee      (fee pelaksana visa pelajar)
 *   kurir_fee          → kurirFee          (fee kurir setoran uang)
 *   operational_fee    → kurirFee          (fee operasional lapangan)
 *   mission_conversion │
 *   mission_fee        ├─→ bonusManual     (konversi poin, side job, koreksi)
 *   adjustment         │
 *   payout             → totalPaidOut      (pencairan — debit, tidak masuk kredit)
 *
 * NOTE: All negative amounts (payout + negative adjustments) are counted in
 * totalPaidOut so that netBalance ≡ walletBalance.netIDR (both deduplicated).
 */
import type { WalletTransaction } from "./agentWallet";
import { deduplicateTxs } from "./agentWallet";

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
      totalPaidOut += Math.abs(tx.amountIDR);
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
