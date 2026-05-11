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

export function computeFeeBreakdown(txs: WalletTransaction[]): FeeBreakdown {
  let salesCommission = 0;
  let fieldAgentFee   = 0;
  let pelaksanaFee    = 0;
  let kurirFee        = 0;
  let bonusManual     = 0;
  let totalPaidOut    = 0;

  for (const tx of txs) {
    if (tx.amountIDR < 0) {
      if (tx.type === "payout") totalPaidOut += Math.abs(tx.amountIDR);
      continue;
    }
    switch (tx.type) {
      case "order_bonus":
        salesCommission += tx.amountIDR;
        break;
      case "voa_agent_fee":
        fieldAgentFee += tx.amountIDR;
        break;
      case "pelaksana_fee":
        pelaksanaFee += tx.amountIDR;
        break;
      case "kurir_fee":
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
