/**
 * Agent Wallet — Fase 29
 * Converts approved mission points → commission IDR credit.
 * Persisted in localStorage per agentId (no server table needed for MVP).
 *
 * Conversion: 1 approved mission point = Rp 1.000 komisi kredit.
 */

export const POINT_TO_IDR_RATE = 1_000; // Rp 1.000 per poin misi

export type WalletTxType =
  | "mission_conversion"  // poin misi → IDR kredit
  | "order_bonus"         // bonus manual dari owner
  | "payout"              // pencairan (mengurangi saldo)
  | "adjustment";         // koreksi manual

export interface WalletTransaction {
  id:          string;
  agentId:     string;
  type:        WalletTxType;
  /** Points consumed (negative means debit). 0 for non-point txns. */
  pointsDelta: number;
  /** IDR credited/debited. Negative = debit (payout). */
  amountIDR:   number;
  description: string;
  createdAt:   string;
  createdBy:   string;
}

const walletKey = (agentId: string) => `igh.agent_wallet.v2.${agentId}`;

export function listWalletTxs(agentId: string): WalletTransaction[] {
  try {
    const raw = localStorage.getItem(walletKey(agentId));
    return raw ? (JSON.parse(raw) as WalletTransaction[]) : [];
  } catch {
    return [];
  }
}

function saveTxs(agentId: string, txs: WalletTransaction[]): void {
  try { localStorage.setItem(walletKey(agentId), JSON.stringify(txs)); } catch { /* quota */ }
}

export function walletBalance(txs: WalletTransaction[]): {
  pointsConsumed: number;
  totalCreditIDR: number;
  totalDebitIDR:  number;
  netIDR:         number;
} {
  let pointsConsumed = 0;
  let totalCreditIDR = 0;
  let totalDebitIDR  = 0;
  for (const tx of txs) {
    pointsConsumed += Math.abs(tx.pointsDelta);
    if (tx.amountIDR >= 0) totalCreditIDR += tx.amountIDR;
    else                    totalDebitIDR  += Math.abs(tx.amountIDR);
  }
  return { pointsConsumed, totalCreditIDR, totalDebitIDR, netIDR: totalCreditIDR - totalDebitIDR };
}

export function addWalletTx(
  agentId: string,
  tx: Omit<WalletTransaction, "id" | "createdAt">,
): WalletTransaction {
  const full: WalletTransaction = {
    ...tx,
    id:        `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  saveTxs(agentId, [full, ...listWalletTxs(agentId)]);
  return full;
}

export function convertMissionPoints(
  agentId:     string,
  points:      number,
  convertedBy: string,
): WalletTransaction {
  if (points <= 0) throw new Error("Poin harus > 0");
  const amountIDR = Math.round(points * POINT_TO_IDR_RATE);
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountIDR);
  return addWalletTx(agentId, {
    agentId,
    type:        "mission_conversion",
    pointsDelta: -points,
    amountIDR,
    description: `Konversi ${points} poin misi → ${fmt} komisi`,
    createdBy:   convertedBy,
  });
}

export function recordPayout(
  agentId:  string,
  amountIDR: number,
  paidBy:   string,
  notes?:   string,
): WalletTransaction {
  if (amountIDR <= 0) throw new Error("Jumlah harus > 0");
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountIDR);
  return addWalletTx(agentId, {
    agentId,
    type:        "payout",
    pointsDelta: 0,
    amountIDR:   -amountIDR,
    description: `Pencairan ${fmt}${notes ? ` — ${notes}` : ""}`,
    createdBy:   paidBy,
  });
}
