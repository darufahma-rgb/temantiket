import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { pullWalletTxs, walletBalance, type WalletTransaction } from "@/lib/agentWallet";
import { ORDER_PROCESS_STEPS } from "@/components/OrderProgressTracker";

const VISA_STEPS = ORDER_PROCESS_STEPS["visa_student"];
export const DEFAULT_PELAKSANA_FEE = 200_000;

export function useStaffData() {
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders, patchOrder } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const staffId = user?.id ?? "";

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchClients()]);
      if (staffId) {
        const txs = await pullWalletTxs(staffId);
        setWalletTxs(txs);
      }
      setLoading(false);
    })();
  }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  const myOrders = useMemo(
    () => orders.filter(
      (o) => o.type === "visa_student" &&
        (o.metadata as Record<string, unknown>)?.pelaksanaId === staffId,
    ),
    [orders, staffId],
  );

  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  const walletBal = useMemo(() => {
    const pelaksanaTxs = walletTxs.filter((t) => t.type === "pelaksana_fee" || t.type === "payout");
    return walletBalance(pelaksanaTxs);
  }, [walletTxs]);

  const komisiTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "pelaksana_fee"),
    [walletTxs],
  );

  const feeByOrder = useMemo(() => {
    return myOrders.map((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const fee = Number(meta.pelaksanaFee ?? DEFAULT_PELAKSANA_FEE);
      const credited = !!(meta.pelaksanaFeeCredited as boolean | null);
      return { order: o, fee, credited };
    });
  }, [myOrders]);

  const pendingFeeTotal = useMemo(
    () => feeByOrder.filter((f) => !f.credited).reduce((sum, f) => sum + f.fee, 0),
    [feeByOrder],
  );

  const totalAssignedFee = useMemo(
    () => feeByOrder.reduce((sum, f) => sum + f.fee, 0),
    [feeByOrder],
  );

  const stats = useMemo(() => {
    const total   = myOrders.length;
    const selesai = myOrders.filter(
      (o) => Number((o.metadata as Record<string, unknown>)?.processStep ?? 0) >= VISA_STEPS.length - 1,
    ).length;
    const kendala = myOrders.filter(
      (o) => (o.metadata as Record<string, unknown>)?.visaKendala,
    ).length;
    const proses = Math.max(0, total - selesai - kendala);
    return { total, selesai, kendala, proses };
  }, [myOrders]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchOrders();
    const txs = await pullWalletTxs(staffId);
    setWalletTxs(txs);
    setRefreshing(false);
  }

  return {
    user, orders, patchOrder,
    myOrders, clientMap,
    walletTxs, walletBal, komisiTxs,
    feeByOrder, pendingFeeTotal, totalAssignedFee,
    stats, loading, refreshing, handleRefresh,
    VISA_STEPS,
  };
}
