import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface LeaderboardEntry {
  firstName: string;
  memberIndex: number;
  totalStamps: number;
  orderStamps: number;
  referralStamps: number;
}

export type LeaderboardResult =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; error: string };

/** Ambil top N members by stamp count — public, anon-safe via RPC SECURITY DEFINER. */
export async function fetchTopMembers(limit = 10): Promise<LeaderboardResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase belum dikonfigurasi" };
  try {
    const { data, error } = await supabase!.rpc("get_top_members", { p_limit: limit });
    if (error) {
      console.error("[leaderboardRepo]", error);
      return { ok: false, error: error.message };
    }
    if (!Array.isArray(data)) return { ok: true, entries: [] };
    return {
      ok: true,
      entries: (data as LeaderboardEntry[]).filter(
        (e) => typeof e.firstName === "string" && typeof e.totalStamps === "number",
      ),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Admin: award +1 referral stamp ke klien (harus authenticated). */
export async function incrementReferralStamp(
  clientId: string,
): Promise<{ ok: boolean; referralStamps?: number; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase belum dikonfigurasi" };
  try {
    const { data, error } = await supabase!.rpc("increment_referral_stamp", {
      p_client_id: clientId,
    });
    if (error) return { ok: false, error: error.message };
    const res = data as { ok: boolean; referralStamps?: number; error?: string };
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
