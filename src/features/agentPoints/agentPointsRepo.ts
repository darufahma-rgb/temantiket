import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * agent_points = log poin gamification yg di-award otomatis lewat trigger
 * Postgres `tr_award_points_on_completion` (10 pts fallback) dan/atau via
 * server endpoint `/api/award-completion-points` (20 pts, upsert override).
 *
 * Setiap order agent yang berhasil di-Completed menghasilkan TEPAT 20 poin.
 * unique(order_id) memastikan tidak ada double-point per order.
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
  order_completed:    "Order Selesai",
  commission_received: "Komisi Diterima",
  mission_reward:     "Reward Misi",
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
