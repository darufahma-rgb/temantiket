import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * agent_points = log poin gamification yg di-award otomatis lewat trigger
 * Postgres `tr_award_points_on_completion`. Tabel di-INSERT-only dari trigger
 * (security definer), client cuma read.
 */
export interface AgentPoint {
  id: string;
  agencyId: string;
  agentId: string;
  orderId: string;
  points: number;
  reason: string;
  awardedAt: string;
}

const fromRow = (r: Record<string, unknown>): AgentPoint => ({
  id: String(r.id),
  agencyId: String(r.agency_id),
  agentId: String(r.agent_id),
  orderId: String(r.order_id),
  points: Number(r.points ?? 0),
  reason: String(r.reason ?? "order_completed"),
  awardedAt: String(r.awarded_at ?? new Date().toISOString()),
});

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

/** Aggregate: { agentId → total points }. */
export function sumPointsByAgent(rows: AgentPoint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.agentId, (m.get(r.agentId) ?? 0) + r.points);
  }
  return m;
}
