import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, useAuthStore } from "@/store/authStore";

/**
 * Reward Catalog — daftar hadiah yg bisa ditukar pakai poin agent.
 *
 * Semua reward butuh syarat:
 *   1. Poin cukup (costPoints)
 *   2. Tier minimum (minTier)
 *   3. Minimal order Completed (minCompletedOrders) — biar agen beneran produktif
 *
 * Redemption request → masuk ke `reward_redemptions` (status=pending).
 * Admin (owner) approve manual via UI Reports.
 */

export type RewardKey =
  | "bonus_cash_75k"
  | "paket_data_20gb"
  | "fee_booster_1_5x_7d"
  | "merchandise_temantiket"
  | "fee_booster_2x_7d"
  | "fee_booster_3x_7d";

export interface RewardItem {
  key: RewardKey;
  label: string;
  emoji: string;
  description: string;
  costPoints: number;
  /** Tier minimum yg bisa redeem (utk gating reward premium) */
  minTier: "bronze" | "silver" | "gold" | "platinum";
  /** Minimal jumlah order berstatus Completed — syarat produktivitas */
  minCompletedOrders: number;
  category: "cash" | "digital" | "booster" | "merchandise";
}

export const REWARD_CATALOG: RewardItem[] = [
  {
    key: "bonus_cash_75k",
    label: "Bonus Cash Rp 75.000",
    emoji: "💵",
    description: "Ditransfer langsung ke rekening / e-wallet lo. Diproses 1×24 jam setelah disetujui admin.",
    costPoints: 100,
    minTier: "bronze",
    minCompletedOrders: 1,
    category: "cash",
  },
  {
    key: "paket_data_20gb",
    label: "Paket Data 8 GB",
    emoji: "📶",
    description: "Paket data 8GB semua operator Mesir (Vodafone, Orange, Etisalat, WE), berlaku 30 hari. Nomor dikirim ke WhatsApp lo.",
    costPoints: 150,
    minTier: "bronze",
    minCompletedOrders: 1,
    category: "digital",
  },
  {
    key: "fee_booster_1_5x_7d",
    label: "Fee Booster ×1.5 (7 Hari)",
    emoji: "⚡",
    description: "Semua order Completed dalam 7 hari ke depan fee komisi-nya dikali 1.5×. Aktif otomatis setelah approved.",
    costPoints: 250,
    minTier: "silver",
    minCompletedOrders: 5,
    category: "booster",
  },
  {
    key: "merchandise_temantiket",
    label: "Merchandise Temantiket",
    emoji: "👕",
    description: "Paket merchandise eksklusif Temantiket (kaos + totebag + sticker). Dikirim ke alamat lo.",
    costPoints: 300,
    minTier: "silver",
    minCompletedOrders: 5,
    category: "merchandise",
  },
  {
    key: "fee_booster_2x_7d",
    label: "Fee Booster ×2 (7 Hari)",
    emoji: "🚀",
    description: "Fee komisi lo double (×2) untuk semua order Completed dalam 7 hari ke depan. Reward paling populer!",
    costPoints: 500,
    minTier: "gold",
    minCompletedOrders: 10,
    category: "booster",
  },
  {
    key: "fee_booster_3x_7d",
    label: "Fee Booster ×3 (7 Hari)",
    emoji: "🔥",
    description: "Fee komisi lo triple (×3) selama 7 hari penuh. Reward tertinggi — untuk mitra terbaik Temantiket.",
    costPoints: 2000,
    minTier: "platinum",
    minCompletedOrders: 20,
    category: "booster",
  },
];

export interface RewardRedemption {
  id: string;
  agencyId: string;
  agentId: string;
  rewardKey: RewardKey;
  rewardLabel: string;
  costPoints: number;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  notes?: string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const fromRow = (r: Record<string, unknown>): RewardRedemption => ({
  id: String(r.id),
  agencyId: String(r.agency_id),
  agentId: String(r.agent_id),
  rewardKey: String(r.reward_key) as RewardKey,
  rewardLabel: String(r.reward_label),
  costPoints: Number(r.cost_points ?? 0),
  status: String(r.status ?? "pending") as RewardRedemption["status"],
  notes: (r.notes as string) ?? undefined,
  requestedAt: String(r.requested_at ?? new Date().toISOString()),
  resolvedAt: (r.resolved_at as string) ?? undefined,
  resolvedBy: (r.resolved_by as string) ?? undefined,
});

export async function listRedemptions(): Promise<RewardRedemption[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase!
      .from("reward_redemptions")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map(fromRow);
  } catch (err) {
    console.warn("[rewards] list gagal:", err);
    return [];
  }
}

export async function requestRedemption(reward: RewardItem): Promise<RewardRedemption> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase belum dikonfigurasi.");
  }
  const me = useAuthStore.getState().user;
  if (!me) throw new Error("Belum login.");
  const agencyId = requireAgencyId();
  const { data, error } = await supabase!
    .from("reward_redemptions")
    .insert({
      agency_id: agencyId,
      agent_id: me.id,
      reward_key: reward.key,
      reward_label: reward.label,
      cost_points: reward.costPoints,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function resolveRedemption(
  id: string,
  status: "approved" | "rejected" | "fulfilled",
  notes?: string,
): Promise<RewardRedemption> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase belum dikonfigurasi.");
  }
  const me = useAuthStore.getState().user;
  const { data, error } = await supabase!
    .from("reward_redemptions")
    .update({
      status,
      notes: notes ?? null,
      resolved_at: new Date().toISOString(),
      resolved_by: me?.id ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
}

export function remainingPoints(
  lifetimePoints: number,
  redemptions: RewardRedemption[],
): number {
  let spent = 0;
  for (const r of redemptions) {
    if (r.status === "approved" || r.status === "fulfilled") {
      spent += r.costPoints;
    }
  }
  return Math.max(0, lifetimePoints - spent);
}
