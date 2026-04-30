import { useEffect, useMemo, useState } from "react";
import { Gift, Lock, Check, Hourglass, X as XIcon, Sparkles } from "lucide-react";
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

/**
 * RewardCatalog — komponen untuk Mitra Dashboard:
 *   - Tampilkan daftar hadiah yg bisa ditukar
 *   - Disabled / "locked" kalau poin kurang ATAU tier kurang
 *   - Klik "Tukar" → confirm dialog → submit ke reward_redemptions
 *   - Tampilkan riwayat redemption (max 3 terakhir)
 */
export function RewardCatalog({ totalPoints }: { totalPoints: number }) {
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

  useEffect(() => {
    void refresh();
  }, []);

  const myTier: AgentTier = useMemo(() => {
    return getTierInfo(totalPoints).current.key;
  }, [totalPoints]);

  const myRedemptions = useMemo(
    () => redemptions.filter((r) => r.agentId === me?.id),
    [redemptions, me?.id],
  );

  const remaining = useMemo(
    () => remainingPoints(totalPoints, myRedemptions),
    [totalPoints, myRedemptions],
  );

  const tierRank = (key: AgentTier) => TIERS.findIndex((t) => t.key === key);

  const canRedeem = (reward: RewardItem) => {
    return (
      remaining >= reward.costPoints &&
      tierRank(myTier) >= tierRank(reward.minTier)
    );
  };

  const handleRedeem = async () => {
    if (!confirmTarget) return;
    setSubmitting(true);
    try {
      await requestRedemption(confirmTarget);
      toast.success(`Permintaan tukar "${confirmTarget.label}" terkirim!`, {
        description: "Admin akan memproses dalam 1×24 jam. Cek status di bawah.",
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
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 md:p-5 bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-90 flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5" />
              Katalog Hadiah
            </p>
            <h3 className="text-lg md:text-xl font-extrabold mt-0.5">
              Tukar poin lo jadi reward 🎁
            </h3>
          </div>
          <div className="bg-white/25 backdrop-blur rounded-2xl px-3 py-2 border border-white/30 text-right shrink-0">
            <p className="text-[10px] font-semibold opacity-90">Sisa Poin</p>
            <p className="text-xl font-extrabold font-mono leading-tight">⭐ {remaining}</p>
          </div>
        </div>
      </div>

      {/* Catalog grid */}
      <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {REWARD_CATALOG.map((reward) => {
          const enough = remaining >= reward.costPoints;
          const tierOk = tierRank(myTier) >= tierRank(reward.minTier);
          const locked = !enough || !tierOk;
          const tierMeta = TIERS.find((t) => t.key === reward.minTier)!;

          return (
            <motion.div
              key={reward.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-xl border p-3 transition-all",
                locked
                  ? "bg-muted/30 border-muted opacity-75"
                  : "bg-white border-border hover:border-pink-300 hover:shadow-md",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0",
                    locked ? "bg-muted" : "bg-gradient-to-br from-pink-100 to-fuchsia-100",
                  )}
                >
                  {reward.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold leading-tight">{reward.label}</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                    {reward.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5 gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-mono font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    ⭐ {reward.costPoints}
                  </span>
                  {reward.minTier !== "bronze" && (
                    <span
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                        tierMeta.softBg,
                        tierMeta.softText,
                        tierMeta.borderColor,
                      )}
                    >
                      {tierMeta.emoji} {tierMeta.label}+
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={locked ? "outline" : "default"}
                  disabled={locked}
                  onClick={() => setConfirmTarget(reward)}
                  className={cn(
                    "h-7 px-2.5 text-[11px]",
                    !locked && "bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700",
                  )}
                >
                  {!enough ? (
                    <>
                      <Lock className="h-3 w-3 mr-1" />
                      Kurang {reward.costPoints - remaining}
                    </>
                  ) : !tierOk ? (
                    <>
                      <Lock className="h-3 w-3 mr-1" />
                      Locked
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" />
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
        <div className="px-4 pb-4 pt-1 border-t border-border/60 mt-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-2 mt-3">
            Riwayat Tukar Poin
          </p>
          {loading ? (
            <div className="text-[11px] text-muted-foreground italic">Memuat…</div>
          ) : (
            <div className="space-y-1.5">
              {myRedemptions.slice(0, 4).map((r) => (
                <RedemptionRow key={r.id} r={r} />
              ))}
              {myRedemptions.length > 4 && (
                <p className="text-[10.5px] text-muted-foreground italic mt-1">
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
              <span className="text-2xl">{confirmTarget?.emoji}</span>
              Tukar {confirmTarget?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{confirmTarget?.description}</span>
              <span className="block bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900 text-[12.5px]">
                Lo bakal kepotong <strong>⭐ {confirmTarget?.costPoints} poin</strong>.
                Sisa poin lo setelah tukar: <strong>{remaining - (confirmTarget?.costPoints ?? 0)}</strong>.
              </span>
              <span className="block text-[11.5px] text-muted-foreground italic">
                Status awal: <strong>pending</strong>. Admin proses 1×24 jam, lo dapet
                notifikasi via WhatsApp begitu disetujui.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRedeem();
              }}
              disabled={submitting}
              className="bg-gradient-to-r from-pink-500 to-fuchsia-600"
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
    pending: { label: "Menunggu", icon: Hourglass, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "Disetujui", icon: Check, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    fulfilled: { label: "Selesai", icon: Check, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Ditolak", icon: XIcon, cls: "bg-red-50 text-red-700 border-red-200" },
  }[r.status];
  const Icon = statusMeta.icon;
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px] py-1.5 border-b last:border-b-0 border-dashed border-border/60">
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{r.rewardLabel}</p>
        <p className="text-[10px] text-muted-foreground">
          {new Date(r.requestedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
          {" · "}⭐ {r.costPoints}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
          statusMeta.cls,
        )}
      >
        <Icon className="h-2.5 w-2.5" />
        {statusMeta.label}
      </span>
    </div>
  );
}
