import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Gift, Lock, Check, Hourglass, X as XIcon, Zap, ShoppingBag,
  Banknote, Wifi, Shirt, Flame, Star, Package,
} from "lucide-react";
import type { RewardKey } from "@/features/rewards/rewardsRepo";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  REWARD_CATALOG,
  listRedemptions,
  requestRedemption,
  remainingPoints,
  type RewardItem,
  type RewardRedemption,
} from "@/features/rewards/rewardsRepo";
import { TIERS, type AgentTier, getTierInfo } from "@/features/agentPoints/agentTiers";
import { useAuthStore } from "@/store/authStore";

const CATEGORY_COLOR: Record<RewardItem["category"], string> = {
  cash:        "bg-blue-50 text-blue-600",
  digital:     "bg-blue-50 text-blue-500",
  booster:     "bg-blue-50 text-blue-700",
  merchandise: "bg-blue-50 text-blue-600",
};

const CATEGORY_ICON: Record<RewardItem["category"], LucideIcon> = {
  cash:        Banknote,
  digital:     Wifi,
  booster:     Zap,
  merchandise: Shirt,
};

const REWARD_ICON: Partial<Record<RewardKey, LucideIcon>> = {
  bonus_cash_75k:        Banknote,
  paket_data_20gb:       Wifi,
  fee_booster_1_5x_7d:   Zap,
  merchandise_temantiket: Shirt,
  fee_booster_2x_7d:     Flame,
  fee_booster_3x_7d:     Star,
};

const CATEGORY_LABEL: Record<RewardItem["category"], string> = {
  cash:        "Cash",
  digital:     "Digital",
  booster:     "Booster",
  merchandise: "Merch",
};

export function RewardCatalog({
  totalPoints,
  completedOrders = 0,
}: {
  totalPoints: number;
  completedOrders?: number;
}) {
  const me = useAuthStore((s) => s.user);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<RewardItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      const list = await listRedemptions();
      setRedemptions(list);
    } catch (err) {
      console.warn("[RewardCatalog] fetch gagal:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const myTier: AgentTier = useMemo(() => getTierInfo(totalPoints).current.key, [totalPoints]);

  const myRedemptions = useMemo(
    () => redemptions.filter((r) => r.agentId === me?.id),
    [redemptions, me?.id],
  );

  const remaining = useMemo(
    () => remainingPoints(totalPoints, myRedemptions),
    [totalPoints, myRedemptions],
  );

  const tierRank = (key: AgentTier) => TIERS.findIndex((t) => t.key === key);

  const canRedeem = (reward: RewardItem) =>
    remaining >= reward.costPoints &&
    tierRank(myTier) >= tierRank(reward.minTier) &&
    completedOrders >= reward.minCompletedOrders;

  const lockReason = (reward: RewardItem): string | null => {
    if (remaining < reward.costPoints) return `Kurang ${reward.costPoints - remaining} poin`;
    if (tierRank(myTier) < tierRank(reward.minTier)) {
      const needed = TIERS.find((t) => t.key === reward.minTier);
      return `Butuh tier ${needed?.label}`;
    }
    if (completedOrders < reward.minCompletedOrders) {
      return `Min. ${reward.minCompletedOrders} order selesai`;
    }
    return null;
  };

  const handleRedeem = async () => {
    if (!confirmTarget) return;
    setSubmitting(true);
    try {
      await requestRedemption(confirmTarget);
      toast.success(`Permintaan "${confirmTarget.label}" terkirim!`, {
        description: "Admin akan memproses dalam 1×24 jam.",
      });
      setConfirmTarget(null);
      await refresh();
    } catch (err) {
      toast.error(`Gagal tukar poin: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 md:p-5 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200 mb-1 flex items-center gap-1.5">
              <Gift className="h-3 w-3 stroke-[1.75]" />
              Katalog Hadiah
            </p>
            <h3 className="text-[17px] md:text-[19px] font-extrabold leading-snug">
              Tukar poin jadi reward 🎁
            </h3>
          </div>
          <div className="shrink-0 bg-white/15 border border-white/25 backdrop-blur rounded-2xl px-3 py-2.5 text-center min-w-[64px]">
            <p className="text-[9.5px] font-semibold text-blue-200">Sisa Poin</p>
            <p className="text-[18px] font-extrabold font-mono text-white leading-tight">⭐ {remaining}</p>
          </div>
        </div>
      </div>

      {/* Syarat global */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10.5px] font-semibold text-blue-700">
          <ShoppingBag className="h-3 w-3 stroke-[1.75]" />
          {completedOrders} order selesai
        </div>
        <p className="text-[10px] text-slate-400">Syarat minimal order berlaku per reward</p>
      </div>

      {/* Catalog grid */}
      <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {REWARD_CATALOG.map((reward, i) => {
          const reason = lockReason(reward);
          const locked = reason !== null;
          const tierMeta = TIERS.find((t) => t.key === reward.minTier)!;

          return (
            <motion.div
              key={reward.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "rounded-xl border p-3 transition-all",
                locked
                  ? "bg-slate-50/70 border-slate-100 opacity-80"
                  : "bg-white border-blue-100 hover:border-blue-300 hover:shadow-md shadow-sm",
              )}
            >
              <div className="flex items-start gap-2.5">
                {(() => {
                  const RewardIco = REWARD_ICON[reward.key] ?? CATEGORY_ICON[reward.category];
                  return (
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                      locked ? "bg-slate-100 text-slate-400" : CATEGORY_COLOR[reward.category],
                    )}>
                      <RewardIco className="h-5 w-5 stroke-[1.5]" />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-[12px] font-bold text-slate-700 leading-tight">{reward.label}</p>
                    <span className={cn(
                      "shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                      locked ? "bg-slate-100 text-slate-400" : CATEGORY_COLOR[reward.category],
                    )}>
                      {CATEGORY_LABEL[reward.category]}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                    {reward.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2.5 gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {/* Poin cost */}
                  <span className={cn(
                    "text-[10.5px] font-mono font-extrabold px-2 py-0.5 rounded-full border",
                    remaining >= reward.costPoints
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-100 text-slate-500 border-slate-200",
                  )}>
                    ⭐ {reward.costPoints}
                  </span>
                  {/* Tier badge */}
                  {reward.minTier !== "bronze" && (
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {tierMeta.emoji} {tierMeta.label}+
                    </span>
                  )}
                  {/* Min order badge */}
                  {reward.minCompletedOrders > 1 && (
                    <span className={cn(
                      "text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border",
                      completedOrders >= reward.minCompletedOrders
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200",
                    )}>
                      🛍 {reward.minCompletedOrders}+ order
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  variant={locked ? "outline" : "default"}
                  disabled={locked}
                  onClick={() => setConfirmTarget(reward)}
                  className={cn(
                    "shrink-0 h-7 px-2.5 text-[11px] rounded-lg",
                    !locked && "bg-blue-600 hover:bg-blue-700 text-white border-0",
                    locked && "border-slate-200 text-slate-400",
                  )}
                >
                  {locked ? (
                    <>
                      <Lock className="h-3 w-3 mr-1 stroke-[1.75]" />
                      {reason!.length > 16 ? reason!.slice(0, 15) + "…" : reason}
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3 mr-1 stroke-[1.75]" />
                      Tukar
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Redemption history */}
      {(loading || myRedemptions.length > 0) && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5 mt-1">
            Riwayat Tukar Poin
          </p>
          {loading ? (
            <p className="text-[11px] text-slate-400 italic">Memuat…</p>
          ) : (
            <div className="space-y-1.5">
              {myRedemptions.slice(0, 4).map((r) => (
                <RedemptionRow key={r.id} r={r} />
              ))}
              {myRedemptions.length > 4 && (
                <p className="text-[10.5px] text-slate-400 italic mt-1">
                  + {myRedemptions.length - 4} riwayat lainnya
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(v) => !v && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="text-xl">{confirmTarget?.emoji}</span>
              Tukar {confirmTarget?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{confirmTarget?.description}</p>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-900 text-[12.5px]">
                  Lo bakal kepotong{" "}
                  <strong>⭐ {confirmTarget?.costPoints} poin</strong>.
                  Sisa poin setelah tukar:{" "}
                  <strong>{remaining - (confirmTarget?.costPoints ?? 0)}</strong>.
                </div>
                <p className="text-[11.5px] text-slate-500 italic">
                  Status awal: <strong>pending</strong>. Admin proses 1×24 jam, lo dapat notifikasi via WhatsApp begitu disetujui.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleRedeem(); }}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? "Mengirim…" : "Ya, Tukar Sekarang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RedemptionRow({ r }: { r: RewardRedemption }) {
  const statusMeta = {
    pending:   { label: "Menunggu",  icon: Hourglass, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved:  { label: "Disetujui", icon: Check,     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    fulfilled: { label: "Selesai",   icon: Check,     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected:  { label: "Ditolak",   icon: XIcon,     cls: "bg-red-50 text-red-700 border-red-200" },
  }[r.status];
  const Icon = statusMeta.icon;
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px] py-1.5 border-b last:border-b-0 border-dashed border-slate-100">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-700 truncate">{r.rewardLabel}</p>
        <p className="text-[10px] text-slate-400">
          {new Date(r.requestedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
          {" · "}⭐ {r.costPoints}
        </p>
      </div>
      <span className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
        statusMeta.cls,
      )}>
        <Icon className="h-2.5 w-2.5" />
        {statusMeta.label}
      </span>
    </div>
  );
}
