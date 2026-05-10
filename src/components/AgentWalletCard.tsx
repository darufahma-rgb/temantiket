/**
 * AgentWalletCard — Fase 29
 * Shows an agent's mission-point wallet:
 * — Available (not-yet-converted) mission points
 * — IDR value at current conversion rate
 * — Convert button → mission points become komisi credit
 * — Payout recording → admin marks wallet as paid out
 * — Transaction history
 */
import { useEffect, useMemo, useState } from "react";
import { Wallet, ArrowDownToLine, History, ChevronDown, ChevronUp, Coins, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CloudSyncBadge } from "@/components/CloudSyncBadge";
import {
  listWalletTxs, walletBalance, convertMissionPointsAsync, recordPayoutAsync,
  pullWalletTxs, walletSyncKey,
  POINT_TO_IDR_RATE, type WalletTransaction,
} from "@/lib/agentWallet";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return iso; }
}

const TX_COLOR: Record<WalletTransaction["type"], string> = {
  mission_conversion: "text-emerald-700",
  mission_fee:        "text-emerald-600",
  order_bonus:        "text-sky-700",
  pelaksana_fee:      "text-purple-700",
  voa_agent_fee:      "text-indigo-700",
  kurir_fee:          "text-amber-700",
  payout:             "text-red-600",
  adjustment:         "text-violet-700",
};

const TX_LABEL: Record<WalletTransaction["type"], string> = {
  mission_conversion: "Konversi Poin",
  mission_fee:        "Fee Side Job",
  order_bonus:        "Komisi Sales",
  pelaksana_fee:      "Fee Pelaksana Visa",
  voa_agent_fee:      "Fee Agent Lapangan VOA",
  kurir_fee:          "Fee Kurir",
  payout:             "Pencairan",
  adjustment:         "Koreksi",
};

interface Props {
  agentId:      string;
  agentName:    string;
  /** Total approved mission points for this agent (from missionsRepo). */
  missionPoints: number;
  /** userId of the owner/admin performing actions. */
  reviewedBy:   string;
}

export function AgentWalletCard({ agentId, agentName, missionPoints, reviewedBy }: Props) {
  const [txs, setTxs]                   = useState<WalletTransaction[]>(() => listWalletTxs(agentId));
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [payoutMode, setPayoutMode]     = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote]     = useState("");
  const [loading, setLoading]           = useState(false);

  const syncKey = walletSyncKey(agentId);

  // Pull latest wallet txs from Supabase on mount
  useEffect(() => {
    void pullWalletTxs(agentId).then(setTxs);
  }, [agentId]);

  const balance = useMemo(() => walletBalance(txs), [txs]);

  // Remaining convertible points = total approved - already converted
  const convertedPoints = txs
    .filter((t) => t.type === "mission_conversion")
    .reduce((s, t) => s + Math.abs(t.pointsDelta), 0);
  const availablePoints = Math.max(0, missionPoints - convertedPoints);
  const availableIDR    = availablePoints * POINT_TO_IDR_RATE;

  const handleConvert = async () => {
    if (availablePoints <= 0) {
      toast.error("Tidak ada poin misi yang bisa dikonversi.");
      return;
    }
    setLoading(true);
    try {
      const { persisted, error } = await convertMissionPointsAsync(agentId, availablePoints, reviewedBy);
      const freshTxs = await pullWalletTxs(agentId);
      setTxs(freshTxs);
      if (persisted) {
        toast.success(`${availablePoints} poin → ${fmtIDR(availablePoints * POINT_TO_IDR_RATE)} komisi`, {
          description: `Wallet ${agentName} diperbarui.`,
          duration: 4000,
        });
      } else {
        toast.warning(`Konversi dicatat lokal, sinkronisasi cloud gagal: ${error ?? "coba lagi"}`, {
          duration: 5000,
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayout = async () => {
    const amount = Number(payoutAmount.replace(/\D/g, "")) || 0;
    if (amount <= 0) { toast.error("Masukkan jumlah pencairan."); return; }
    if (amount > balance.netIDR) {
      toast.error(`Jumlah melebihi saldo wallet (${fmtIDR(balance.netIDR)}).`);
      return;
    }
    setLoading(true);
    try {
      const { persisted, error } = await recordPayoutAsync(agentId, amount, reviewedBy, payoutNote || undefined);
      const freshTxs = await pullWalletTxs(agentId);
      setTxs(freshTxs);
      setPayoutMode(false);
      setPayoutAmount("");
      setPayoutNote("");
      if (persisted) {
        toast.success(`Pencairan ${fmtIDR(amount)} untuk ${agentName} dicatat.`);
      } else {
        toast.warning(`Pencairan dicatat lokal, sinkronisasi cloud gagal: ${error ?? "coba lagi"}`, {
          duration: 5000,
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-4 space-y-3 mt-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Wallet className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-[hsl(var(--foreground))]">Wallet Agen — {agentName}</p>
            <p className="text-[10.5px] text-[hsl(var(--muted-foreground))]">
              Poin Misi → Komisi IDR · 1 poin = {fmtIDR(POINT_TO_IDR_RATE)}
            </p>
          </div>
        </div>
        {/* Cloud sync status for this agent's wallet */}
        <CloudSyncBadge featureKey={syncKey} className="shrink-0" />
      </div>

      {/* Balance row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Saldo Wallet", value: fmtIDR(balance.netIDR), color: balance.netIDR >= 0 ? "text-emerald-700" : "text-red-600" },
          { label: "Total Kredit", value: fmtIDR(balance.totalCreditIDR), color: "text-sky-700" },
          { label: "Total Cair",   value: fmtIDR(balance.totalDebitIDR),  color: "text-orange-700" },
        ].map((r) => (
          <div key={r.label} className="rounded-xl bg-white border border-[hsl(var(--border))] p-2.5">
            <p className="text-[9.5px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">{r.label}</p>
            <p className={cn("text-[13px] font-extrabold font-mono mt-0.5", r.color)}>{r.value}</p>
          </div>
        ))}
      </div>

      {/* Conversion available */}
      {availablePoints > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Coins className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-emerald-800">
                {availablePoints} poin misi tersedia → {fmtIDR(availableIDR)}
              </p>
              <p className="text-[10px] text-emerald-700">Belum dikonversi ke wallet</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleConvert}
            disabled={loading}
            className="shrink-0 h-8 text-[11.5px] font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-0"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Konversi
          </Button>
        </div>
      )}

      {availablePoints === 0 && missionPoints === 0 && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center py-1">
          Belum ada poin misi yang di-approve untuk mitra ini.
        </p>
      )}

      {/* Payout section */}
      <div>
        {!payoutMode ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPayoutMode(true)}
            disabled={balance.netIDR <= 0}
            className="h-8 text-[11.5px] border-orange-200 text-orange-700 hover:bg-orange-50 rounded-xl w-full"
          >
            <ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" />
            Catat Pencairan Komisi
          </Button>
        ) : (
          <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
            <p className="text-[11px] font-semibold text-orange-800">Catat Pencairan</p>
            <div className="flex gap-2">
              <Input
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="Jumlah IDR"
                className="h-8 text-[12px] flex-1"
              />
              <Input
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                placeholder="Catatan (opsional)"
                className="h-8 text-[12px] flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePayout} disabled={loading}
                className="flex-1 h-8 text-[11.5px] bg-orange-600 hover:bg-orange-700 text-white border-0 rounded-xl">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simpan Pencairan"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPayoutMode(false)}
                className="h-8 text-[11.5px] rounded-xl">
                Batal
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction history toggle */}
      {txs.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-1 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Riwayat ({txs.length})
            </span>
            {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {historyOpen && (
            <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">
              {txs.map((tx) => (
                <div key={tx.id} className="flex items-start justify-between gap-2 rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[hsl(var(--foreground))] truncate">{tx.description}</p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      {TX_LABEL[tx.type]} · {fmtDate(tx.createdAt)}
                    </p>
                  </div>
                  <span className={cn("text-[12px] font-extrabold font-mono shrink-0", TX_COLOR[tx.type])}>
                    {tx.amountIDR >= 0 ? "+" : ""}{fmtIDR(tx.amountIDR)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
