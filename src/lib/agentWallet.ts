/**
 * Agent Wallet — Fase 29
 * Converts approved mission points → commission IDR credit.
 * localStorage = instant cache; setiap mutasi juga di-push ke Supabase.
 *
 * Tabel Supabase: public.agent_wallet_transactions
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { requireAgencyId, getCurrentAgencyId } from "@/store/authStore";
import { beginFeatureSync, resolveFeatureSync } from "@/store/featureSyncStore";

export const POINT_TO_IDR_RATE = 1_000;

export type WalletTxType =
  | "mission_conversion"
  | "mission_fee"
  | "order_bonus"
  | "payout"
  | "adjustment";

export interface WalletTransaction {
  id:          string;
  agentId:     string;
  type:        WalletTxType;
  pointsDelta: number;
  amountIDR:   number;
  description: string;
  createdAt:   string;
  createdBy:   string;
}

const walletKey = (agentId: string) => `igh.agent_wallet.v2.${agentId}`;

/** Feature key used for CloudSyncBadge — per-agent. */
export const walletSyncKey = (agentId: string) => `wallet_${agentId}`;

export function listWalletTxs(agentId: string): WalletTransaction[] {
  try {
    const raw = localStorage.getItem(walletKey(agentId));
    return raw ? (JSON.parse(raw) as WalletTransaction[]) : [];
  } catch {
    return [];
  }
}

function saveTxsCache(agentId: string, txs: WalletTransaction[]): void {
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
  saveTxsCache(agentId, [full, ...listWalletTxs(agentId)]);

  const syncKey = walletSyncKey(agentId);
  const canSync = beginFeatureSync(syncKey);

  if (canSync) {
    void (async () => {
      try {
        const agencyId = requireAgencyId();
        const { error } = await supabase!.from("agent_wallet_transactions").insert({
          id:           full.id,
          agency_id:    agencyId,
          agent_id:     full.agentId,
          type:         full.type,
          points_delta: full.pointsDelta,
          amount_idr:   full.amountIDR,
          description:  full.description,
          created_by:   full.createdBy,
          created_at:   full.createdAt,
        });
        if (error) {
          console.warn("[agentWallet] insert cloud gagal:", error.message);
          resolveFeatureSync(syncKey, error.message);
        } else {
          resolveFeatureSync(syncKey);
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.warn("[agentWallet] cloud insert exception:", e);
        resolveFeatureSync(syncKey, msg);
      }
    })();
  }

  return full;
}

/** Pull wallet txs dari Supabase → update localStorage cache → return list. */
export async function pullWalletTxs(agentId: string): Promise<WalletTransaction[]> {
  if (!isSupabaseConfigured()) return listWalletTxs(agentId);
  try {
    const agencyId = getCurrentAgencyId();
    if (!agencyId) return listWalletTxs(agentId);
    const { data, error } = await supabase!
      .from("agent_wallet_transactions")
      .select("*")
      .eq("agency_id", agencyId)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[agentWallet] pull gagal:", error.message);
      return listWalletTxs(agentId);
    }
    const txs: WalletTransaction[] = (data ?? []).map((r) => ({
      id:          String(r.id),
      agentId:     String(r.agent_id),
      type:        r.type as WalletTxType,
      pointsDelta: Number(r.points_delta),
      amountIDR:   Number(r.amount_idr),
      description: String(r.description ?? ""),
      createdAt:   String(r.created_at),
      createdBy:   String(r.created_by ?? ""),
    }));
    saveTxsCache(agentId, txs);
    return txs;
  } catch (e) {
    console.warn("[agentWallet] pull exception:", e);
    return listWalletTxs(agentId);
  }
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
  agentId:   string,
  amountIDR: number,
  paidBy:    string,
  notes?:    string,
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
