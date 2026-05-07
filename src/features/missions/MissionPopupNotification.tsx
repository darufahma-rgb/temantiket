import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Star, Clock, X, Wallet, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export interface PopupMission {
  id: string;
  title: string;
  description: string;
  rewardPoints: number;
  feeIDR: number;
  deadline: string;
  targetLabel: string;
}

interface Props {
  mission: PopupMission | null;
  onClose: () => void;
  onViewMission: () => void;
}

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

export function MissionPopupNotification({ mission, onClose, onViewMission }: Props) {
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (!mission) return;
    setCountdown(60);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); onClose(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mission?.id, onClose]);

  return (
    <AnimatePresence>
      {mission && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 80, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.96 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="fixed inset-x-4 bottom-6 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[420px] z-50"
          >
            <div className="rounded-2xl border border-sky-200 bg-white shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Target className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-sky-100 leading-none uppercase tracking-wide">
                    ⚡ Side Job Baru — {mission.targetLabel}
                  </p>
                  <p className="text-[15px] font-black text-white truncate mt-0.5">{mission.title}</p>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {mission.description && (
                  <p className="text-sm text-slate-600 leading-relaxed">{mission.description}</p>
                )}

                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    <Star className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-[10px] text-amber-600 font-semibold leading-none">Reward Poin</p>
                      <p className="text-sm font-extrabold text-amber-800 mt-0.5">+{mission.rewardPoints} poin</p>
                    </div>
                  </div>
                  {mission.feeIDR > 0 && (
                    <div className="flex-1 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                      <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-emerald-600 font-semibold leading-none">Fee IDR</p>
                        <p className="text-sm font-extrabold text-emerald-800 mt-0.5">{fmtIDR(mission.feeIDR)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span>
                    Deadline:{" "}
                    {formatDistanceToNow(new Date(mission.deadline), { locale: idLocale, addSuffix: true })}
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-slate-500 text-xs"
                    onClick={onClose}
                  >
                    Nanti ({countdown}s)
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white gap-1 text-xs"
                    onClick={() => { onViewMission(); onClose(); }}
                  >
                    Lihat Misi <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
