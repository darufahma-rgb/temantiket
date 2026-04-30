import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, useAuthStore } from "@/store/authStore";

/**
 * Reward Catalog — daftar hadiah yg bisa ditukar pakai poin agent.
 *
 * Sengaja hardcoded di code (bukan DB) supaya:
 *   - Owner bisa lihat preview tanpa setup tabel tambahan.
 *   - Konsisten antar tenant (semua agency dpt katalog yg sama dulu).
 *   - Mudah di-update via deploy biasa.
 *
 * Future: bisa di-mirror ke tabel `reward_catalog` per-agency kalau owner
 * butuh customize (mis. agency tertentu mau merch sendiri). Untuk MVP, ini
 * cukup banget.
 *
 * Redemption request → masuk ke `reward_redemptions` (status=pending).
 * Admin (owner) approve manual via UI Reports.
 */

export type RewardKey =
  | "pulsa_50k"
  | "pulsa_100k"
  | "voucher_gofood_100k"
  | "voucher_grab_100k"
  | "tshirt_mitra"
  | "bonus_komisi_5pct"
  | "free_umrah_voucher";

export interface RewardItem {
  key: RewardKey;
  label: string;
  emoji: string;
  description: string;
  costPoints: number;
  /** Tier minimum yg bisa redeem (utk gating reward premium) */
  minTier: "bronze" | "silver" | "gold" | "platinum";
  category: "voucher" | "merchandise" | "bonus" | "exclusive";
}

export const REWARD_CATALOG: RewardItem[] = [
  {
    key: "pulsa_50k",
    label: "Pulsa Rp 50.000",
    emoji: "📱",
    description: "Pulsa untuk semua operator. Diproses 1×24 jam setelah disetujui admin.",
    costPoints: 50,
    minTier: "bronze",
    category: "voucher",
  },
  {
    key: "pulsa_100k",
    label: "Pulsa Rp 100.000",
    emoji: "📱",
    description: "Pulsa untuk semua operator. Diproses 1×24 jam setelah disetujui admin.",
    costPoints: 100,
    minTier: "bronze",
    category: "voucher",
  },
  {
    key: "voucher_gofood_100k",
    label: "Voucher GoFood Rp 100.000",
    emoji: "🍔",
    description: "Voucher GoFood, dikirim via WhatsApp dalam bentuk kode digital.",
    costPoints: 120,
    minTier: "bronze",
    category: "voucher",
  },
  {
    key: "voucher_grab_100k",
    label: "Voucher Grab Rp 100.000",
    emoji: "🚗",
    description: "Voucher Grab transport / GrabFood, kode dikirim via WhatsApp.",
    costPoints: 120,
    minTier: "bronze",
    category: "voucher",
  },
  {
    key: "tshirt_mitra",
    label: "Kaos Resmi Mitra",
    emoji: "👕",
    description: "Kaos eksklusif Mitra Temantiket, dikirim ke alamat lo.",
    costPoints: 200,
    minTier: "silver",
    category: "merchandise",
  },
  {
    key: "bonus_komisi_5pct",
    label: "Bonus Komisi +5% (1 bulan)",
    emoji: "💰",
    description: "Top-up komisi sementara +5% untuk semua order Completed bulan depan.",
    costPoints: 400,
    minTier: "silver",
    category: "bonus",
  },
  {
    key: "free_umrah_voucher",
    label: "Voucher Umrah Gratis",
    emoji: "🕋",
    description: "Voucher 1 seat umrah reguler, valid 1 tahun. Premium reward.",
    costPoints: 2500,
    minTier: "gold",
    category: "exclusive",
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

/** List redemptions — RLS bakal batesin: agent cuma lihat sendiri, owner lihat semua. */
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

/** Submit reward request. agent_id auto = current user. status = 'pending'. */
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

/** Owner: update status request (approve/reject/fulfill). */
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

/** Hitung sisa poin = lifetime points - sum(costPoints redeemed yg approved/fulfilled). */
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
