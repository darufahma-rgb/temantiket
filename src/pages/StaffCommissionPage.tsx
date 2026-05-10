import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet, TrendingUp, BadgeCheck, Loader2, Zap, ArrowUpRight,
  Clock, CheckCircle2,
} from "lucide-react";
import { useStaffData } from "@/hooks/useStaffData";
import { fmtIDR } from "@/lib/profit";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 },
  }),
};

function fmtDate(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy", { locale: idLocale }); } catch { return iso; }
}

export default function StaffCommissionPage() {
  const navigate = useNavigate();
  const {
    walletBal, komisiTxs, walletTxs,
    feeByOrder, pendingFeeTotal, totalAssignedFee,
    stats, loading, clientMap,
  } = useStaffData();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Memuat data komisi…</span>
      </div>
    );
  }

  const pendingOrders = feeByOrder.filter((f) => !f.credited);
  const creditedOrders = feeByOrder.filter((f) => f.credited);

  return (
    <div className="pb-8 md:p-6 max-w-[1400px] md:mx-auto space-y-4 md:space-y-5">

      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl md:rounded-3xl bg-white border border-slate-100 shadow-sm p-4 md:p-6"
      >
        <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1">
          Komisi Saya
        </p>
        <h1 className="text-[18px] md:text-[24px] font-extrabold leading-tight text-slate-900 tracking-tight">
          Fee Pelaksana Visa
        </h1>
        <p className="text-[11px] md:text-[12.5px] text-slate-400 mt-1">
          Fee langsung dihitung setelah berkas didelegasikan.
        </p>
      </motion.div>

      {/* ── Fee Summary Card ── */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Wallet className="h-3.5 w-3.5 text-emerald-600 stroke-[1.75]" />
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-slate-700">Fee Pelaksana Visa</p>
                <p className="text-[10px] text-slate-400">Terpisah dari komisi agen penjual</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/staff/profile")}
              className="flex items-center gap-0.5 text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Profil <ArrowUpRight className="h-3 w-3 stroke-[2]" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {/* Total earned (all assigned) */}
            <div className="text-center py-1">
              <div className="text-[24px] md:text-[30px] font-extrabold font-mono text-slate-800 leading-tight">
                {fmtIDR(totalAssignedFee)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                total fee dari {feeByOrder.length} berkas ditugaskan
              </div>
            </div>

            {/* 4-column breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-xl bg-white border border-blue-200 px-3 py-2.5">
                <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Dikreditkan</div>
                <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{fmtIDR(walletBal.totalCreditIDR)}</div>
                <div className="text-[9px] text-slate-400">{creditedOrders.length} berkas</div>
              </div>
              <div className="rounded-xl bg-white border border-blue-200 px-3 py-2.5">
                <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Menunggu Kredit</div>
                <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{fmtIDR(pendingFeeTotal)}</div>
                <div className="text-[9px] text-slate-400">{pendingOrders.length} berkas</div>
              </div>
              <div className="rounded-xl bg-white border border-blue-200 px-3 py-2.5">
                <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Dicairkan</div>
                <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{fmtIDR(walletBal.totalDebitIDR)}</div>
                <div className="text-[9px] text-slate-400">{walletTxs.filter((t) => t.type === "payout").length} pencairan</div>
              </div>
              <div className="rounded-xl bg-white border border-blue-200 px-3 py-2.5">
                <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Saldo Wallet</div>
                <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{fmtIDR(walletBal.netIDR)}</div>
                <div className="text-[9px] text-slate-400">{stats.selesai} selesai</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Pending Fee List (menunggu kredit dari owner) ── */}
      {pendingOrders.length > 0 && (
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <div className="rounded-2xl border border-amber-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-amber-100 flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5 text-amber-600 stroke-[1.75]" />
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-slate-700">Menunggu Kredit Owner</p>
                <p className="text-[10px] text-slate-400">{pendingOrders.length} berkas · belum dikreditkan ke wallet</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {pendingOrders
                .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt))
                .map(({ order, fee }) => {
                  const client = clientMap.get(order.clientId ?? "");
                  return (
                    <div key={order.id} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/40 transition-colors">
                      <div className="h-8 w-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-slate-700 truncate">
                          {client?.name ?? order.title ?? `Order #${order.id.slice(0, 8)}`}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Ditugaskan {fmtDate(order.createdAt)} · menunggu kredit owner
                        </p>
                      </div>
                      <span className="text-[12px] font-extrabold font-mono text-amber-700 shrink-0">
                        +{fmtIDR(fee)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Credited Fee History ── */}
      <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
        {komisiTxs.length > 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 stroke-[1.75]" />
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-slate-700">Riwayat Fee Dikreditkan</p>
                <p className="text-[10px] text-slate-400">{komisiTxs.length} entri tercatat</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {komisiTxs.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-semibold text-slate-700 truncate">{tx.description}</p>
                    <p className="text-[10px] text-slate-400">{fmtDate(tx.createdAt)}</p>
                  </div>
                  <span className="text-[12px] font-extrabold font-mono text-emerald-700 shrink-0">
                    +{fmtIDR(tx.amountIDR)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-300 stroke-[1.25]" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-slate-600">Belum ada fee dikreditkan</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[260px] leading-relaxed">
                  Fee akan dikreditkan ke wallet oleh owner setelah berkas selesai diproses.
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Info Note ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-[11px] text-slate-500 leading-relaxed">
        <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="h-3.5 w-3.5 text-blue-500 stroke-[1.75]" />
        </div>
        <p>
          <strong className="text-slate-700">Tentang Fee Pelaksana Visa:</strong>{" "}
          Fee langsung dihitung setelah berkas didelegasikan ke kamu. Status{" "}
          <strong className="text-amber-600">Menunggu Kredit</strong> artinya fee sudah terhitung
          tapi belum dikreditkan ke wallet — owner akan mengkreditkannya setelah berkas selesai.
          Label resmi: <strong className="text-blue-700">Fee Pelaksana Visa</strong>.
        </p>
      </div>
    </div>
  );
}
