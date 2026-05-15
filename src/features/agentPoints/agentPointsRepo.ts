import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getCurrentAgencyId } from "@/store/authStore";
import { getBearer } from "@/lib/authFetch";

/**
 * agent_points = log poin gamification yg di-award otomatis lewat trigger
 * Postgres `tr_award_points_on_completion` (10 pts fallback) dan/atau via
 * server endpoint `/api/award-completion-points` (10 pts, upsert override).
 *
 * Sistem poin:
 *  - Closing/complete order → 10 poin (masuk agent_points, idempotent per order_id)
 *  - Tugas kurir / agent lapangan / pelaksana → 5 poin (masuk pointsDelta wallet tx)
 *  - Menyelesaikan misi biasa → 1 poin (via mission submission approval)
 *  - Misi event → sesuai rewardPoints yang diatur owner di DailyMission
 */
export interface AgentPoint {
  id: string;
  agencyId: string;
  agentId: string;
  orderId: string;
  points: number;
  reason: string;
  awardedAt: string;
  /** Judul order — diisi via join saat menggunakan listAgentPointsWithOrders() */
  orderTitle?: string;
  /** Tipe order (umrah/flight/visa_voa/visa_student) — via join */
  orderType?: string;
}

export const REASON_LABEL: Record<string, string> = {
  order_completed:    "Order Closing (+10 poin)",
  commission_received: "Komisi Diterima",
  mission_reward:     "Reward Misi",
  kurir_task:         "Tugas Kurir (+5 poin)",
  lapangan_task:      "Tugas Agent Lapangan (+5 poin)",
  bonus:              "Bonus Khusus",
};

const fromRow = (r: Record<string, unknown>): AgentPoint => {
  const order = r.orders as Record<string, unknown> | null | undefined;
  return {
    id:        String(r.id),
    agencyId:  String(r.agency_id),
    agentId:   String(r.agent_id),
    orderId:   String(r.order_id),
    points:    Number(r.points ?? 0),
    reason:    String(r.reason ?? "order_completed"),
    awardedAt: String(r.awarded_at ?? new Date().toISOString()),
    orderTitle: order?.title ? String(order.title) : undefined,
    orderType:  order?.type  ? String(order.type)  : undefined,
  };
};

/** Fetch semua poin agency (tanpa join order — ringan, untuk aggregate). */
export async function listAgentPoints(): Promise<AgentPoint[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("agent_points")
      .select("*")
      .order("awarded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(fromRow);
  } catch (err) {
    console.warn("[agent_points] fetch gagal:", err);
    return [];
  }
}

/**
 * Fetch poin DENGAN detail order (title + type) via foreign-key join.
 * Gunakan ini untuk menampilkan riwayat/ledger poin yang readable.
 */
export async function listAgentPointsWithOrders(): Promise<AgentPoint[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("agent_points")
      .select("*, orders(title, type)")
      .order("awarded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(fromRow);
  } catch (err) {
    console.warn("[agent_points] fetch with orders gagal — fallback ke basic:", err);
    return listAgentPoints();
  }
}

/** Aggregate: { agentId → total points }. */
export function sumPointsByAgent(rows: AgentPoint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.agentId, (m.get(r.agentId) ?? 0) + r.points);
  }
  return m;
}

// ── Shared write helpers ──────────────────────────────────────────────────────

/**
 * Award 10 poin ke agent penjual saat order → Completed.
 * Idempotent: server uses ON CONFLICT (order_id) DO NOTHING — safe to call
 * multiple times for the same order.
 * Note: kurir/lapangan +5 poin diberikan via pointsDelta pada wallet transaction.
 */
export async function awardOrderCompletionPoints(
  agentId: string,
  orderId: string,
): Promise<void> {
  try {
    const agencyId = getCurrentAgencyId();
    const authH = await getBearer();
    const res = await fetch("/api/award-completion-points", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authH },
      body: JSON.stringify({ agentId, orderId, agencyId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.warn("[agentPoints] award failed:", j?.error ?? res.status);
    }
  } catch (e) {
    console.warn("[agentPoints] awardOrderCompletionPoints exception:", e);
  }
}

/**
 * Cabut poin agen jika order dihapus atau dikembalikan dari Completed.
 * Idempotent: server deletes by order_id — safe to call even if no row exists.
 */
export async function revokeOrderPoints(orderId: string): Promise<void> {
  try {
    const authH = await getBearer();
    const res = await fetch("/api/revoke-order-points", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authH },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.warn("[agentPoints] revoke failed:", j?.error ?? res.status);
    }
  } catch (e) {
    console.warn("[agentPoints] revokeOrderPoints exception:", e);
  }
}
