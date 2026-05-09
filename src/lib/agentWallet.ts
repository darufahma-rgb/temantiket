/**
 * Agent Wallet — Fase 29
 * Converts approved mission points → commission IDR credit.
 * localStorage = instant cache; setiap mutasi juga di-push ke Supabase
 * melalui server endpoint /api/credit-wallet-tx (service role key — no RLS).
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
  | "pelaksana_fee"
  | "kurir_fee"
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

/**
 * Async version of addWalletTx that routes the Supabase insert through the
 * server-side /api/credit-wallet-tx endpoint (service role key — bypasses RLS).
 *
 * This is necessary because the frontend anon client is blocked by RLS when an
 * owner tries to credit a different agent's wallet (auth.uid() ≠ agent_id).
 *
 * Falls back to direct anon-client insert only when the server endpoint is
 * unavailable (e.g. dev without server running). In that case it still writes
 * to localStorage so the tx isn't lost, but returns persisted=false.
 *
 * Uses upsert for idempotency: if you pass an `idempotencyKey`, the tx ID is
 * deterministic (`wtx-{key}`) so retrying the same credit won't duplicate.
 */
export async function addWalletTxAsync(
  agentId: string,
  tx: Omit<WalletTransaction, "id" | "createdAt">,
  idempotencyKey?: string,
): Promise<{ tx: WalletTransaction; persisted: boolean; error?: string }> {
  const full: WalletTransaction = {
    ...tx,
    id: idempotencyKey
      ? `wtx-${idempotencyKey}`
      : `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  // Write to localStorage first — instant cache, deduplicating by id
  saveTxsCache(agentId, [full, ...listWalletTxs(agentId).filter((t) => t.id !== full.id)]);

  if (!isSupabaseConfigured()) {
    return { tx: full, persisted: false, error: "Supabase tidak dikonfigurasi" };
  }

  // ── Primary path: server endpoint (service role key — bypasses RLS) ────────
  try {
    const agencyId = requireAgencyId();
    const session = (await supabase!.auth.getSession()).data.session;
    const token = session?.access_token;

    if (!token) {
      const msg = "Tidak ada sesi aktif — login ulang dulu";
      console.error("[agentWallet] credit-wallet-tx: no auth token");
      return { tx: full, persisted: false, error: msg };
    }

    const res = await fetch("/api/credit-wallet-tx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id:          full.id,
        agencyId,
        agentId:     full.agentId,
        type:        full.type,
        pointsDelta: full.pointsDelta,
        amountIDR:   full.amountIDR,
        description: full.description,
        createdBy:   full.createdBy,
        createdAt:   full.createdAt,
      }),
    });

    if (res.ok) {
      console.log(`[agentWallet] credit-wallet-tx OK — id=${full.id} agent=${full.agentId} amount=${full.amountIDR}`);
      const syncKey = walletSyncKey(agentId);
      resolveFeatureSync(syncKey);
      return { tx: full, persisted: true };
    }

    // Server returned an error — extract the real message
    const body = await res.json().catch(() => ({})) as { error?: string };
    const serverError = body?.error ?? `HTTP ${res.status}`;
    console.error(`[agentWallet] credit-wallet-tx server error (${res.status}):`, serverError);

    // ── Fallback: try direct anon-client upsert (may work if RLS allows) ─────
    console.warn("[agentWallet] falling back to anon-client upsert after server error");
    const { error: anonErr } = await supabase!
      .from("agent_wallet_transactions")
      .upsert(
        {
          id:           full.id,
          agency_id:    agencyId,
          agent_id:     full.agentId,
          type:         full.type,
          points_delta: full.pointsDelta,
          amount_idr:   full.amountIDR,
          description:  full.description,
          created_by:   full.createdBy,
          created_at:   full.createdAt,
        },
        { onConflict: "id" },
      );

    if (!anonErr) {
      console.log("[agentWallet] anon-client fallback upsert succeeded");
      const syncKey = walletSyncKey(agentId);
      resolveFeatureSync(syncKey);
      return { tx: full, persisted: true };
    }

    console.error("[agentWallet] anon-client fallback upsert juga gagal:", anonErr.message);
    // Return the original server error (more informative)
    return { tx: full, persisted: false, error: serverError };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[agentWallet] credit-wallet-tx exception:", e);
    return { tx: full, persisted: false, error: msg };
  }
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
