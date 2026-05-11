import type { Order } from "@/features/orders/ordersRepo";

/**
 * Fallback EGP → IDR rate untuk normalisasi profit di Laporan Keuangan.
 * Rate dinamis di-inject lewat parameter egpRate di tiap fungsi.
 * 1 EGP ≈ 515 IDR (update May 2026).
 */
export const EGP_TO_IDR = 515;

/**
 * Effective cost price utk hitung profit.
 *
 * Untuk umrah orders yg dibuat sebelum kolom `cost_price` ada, kita coba
 * fallback ke `metadata.hpp` (snapshot dari Calculator). Ini bikin Reports
 * page tetep nampilin angka masuk akal utk data lama tanpa harus backfill.
 */
export function effectiveCostPrice(order: Order): number {
  if (order.costPrice > 0) return order.costPrice;
  if (order.type === "umrah") {
    const hpp = (order.metadata as Record<string, unknown>)?.hpp;
    if (typeof hpp === "number" && hpp > 0) return hpp;
    if (typeof hpp === "string") {
      const n = Number(hpp);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

/** Gross profit = totalPrice - effectiveCostPrice (currency-native, blm di-normalize). */
export function rawProfit(order: Order): number {
  return Number(order.totalPrice ?? 0) - effectiveCostPrice(order);
}

/**
 * Normalize ke IDR. Currency selain IDR/EGP di-anggap IDR (data quirk).
 * Dipake di Reports page biar grafik & total bisa di-aggregate single-unit.
 * @param egpRate - kurs EGP saat ini dari ratesStore (default: EGP_TO_IDR)
 */
export function toIDR(amount: number, currency: string, egpRate = EGP_TO_IDR): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "EGP") return Math.round(amount * egpRate);
  return Math.round(amount);
}

/** Gross profit dalam IDR (revenue - modal, belum dikurangi fee/opex apapun). */
export function profitIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(rawProfit(order), order.currency, egpRate);
}

export function revenueIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(Number(order.totalPrice ?? 0), order.currency, egpRate);
}

export function costIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(effectiveCostPrice(order), order.currency, egpRate);
}

/**
 * Jumlah yang sudah diterima dari klien, dalam IDR.
 * Gunakan ini untuk menghitung "Pendapatan Cair" (kas masuk nyata).
 */
export function paidAmountIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return toIDR(Number(order.paidAmount ?? 0), order.currency, egpRate);
}

/**
 * Sisa tagihan klien (piutang) dalam IDR.
 * = totalPrice − paidAmount, minimum 0.
 * Hanya relevan untuk order UNPAID dan DP.
 */
export function receivableIDR(order: Order, egpRate = EGP_TO_IDR): number {
  const total = Number(order.totalPrice ?? 0);
  const paid  = Number(order.paidAmount ?? 0);
  return toIDR(Math.max(0, total - paid), order.currency, egpRate);
}

export const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

/**
 * Fee agen penjual dari metadata order (IDR).
 * Dibaca langsung dari meta.agentFee — nilai ini hanya terisi saat order
 * dibuat via agen berole "agent" (divalidasi di OrderDetail saat save).
 * Direct order (owner/admin) → meta.agentFee absent/0 → return 0.
 */
export function agentFeeFromMeta(order: Order): number {
  if (!order.createdByAgent) return 0;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  return Number(meta.agentFee ?? 0);
}

/**
 * Fee pelaksana visa student dari metadata order (IDR).
 * Hanya berlaku untuk visa_student yang sudah punya pelaksanaId di metadata.
 * Default 200.000 jika pelaksanaFee belum di-set secara eksplisit.
 */
export function pelaksanaFeeFromMeta(order: Order): number {
  if (order.type !== "visa_student") return 0;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  if (!meta.pelaksanaId) return 0;
  return Number(meta.pelaksanaFee ?? 200_000);
}

/**
 * Total biaya operasional lapangan VOA.
 * Disimpan dalam IDR di metadata: voaAgentFee + voaTransportFee + voaOtherFee.
 * Bukan komisi sales — ini biaya operasional agent lapangan di bandara (Mesir).
 */
export function voaOpCost(order: Order): number {
  if (order.type !== "visa_voa") return 0;
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  return (
    Number(meta.voaAgentFee ?? 0) +
    Number(meta.voaTransportFee ?? 0) +
    Number(meta.voaOtherFee ?? 0)
  );
}

/**
 * Total biaya operasional kurir setoran uang.
 * Berlaku untuk SEMUA jenis order — saat customer bayar tunai via agent/kurir.
 * Disimpan dalam IDR di metadata: kurirFee + kurirTransportFee + kurirOtherFee.
 * Bukan komisi penjualan — ini biaya operasional pengiriman uang ke kantor.
 */
export function kurirOpCost(order: Order): number {
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  return (
    Number(meta.kurirFee ?? 0) +
    Number(meta.kurirTransportFee ?? 0) +
    Number(meta.kurirOtherFee ?? 0)
  );
}

/**
 * Fee agent lapangan (VOA field agent) dari metadata order (IDR).
 * Hanya berlaku untuk order yang menyimpan voaFieldAgentId dan voaAgentFee.
 */
export function voaAgentFeeFromMeta(order: Order): number {
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  if (!meta.voaFieldAgentId) return 0;
  return Number(meta.voaAgentFee ?? 0);
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RUMUS PROFIT BERSIH — SATU-SATUNYA SUMBER KEBENARAN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Profit Bersih = Pendapatan Kotor − Modal − Fee Agen Penjual − Fee Pelaksana
 *                − Biaya Operasional VOA − Biaya Kurir
 *
 * Semua halaman (OrderDetail, Reports, Ledger, Dashboard) wajib pakai fungsi
 * ini agar angka profit tidak berbeda-beda antar halaman.
 */
export function netProfitIDR(order: Order, egpRate = EGP_TO_IDR): number {
  return (
    profitIDR(order, egpRate)
    - agentFeeFromMeta(order)
    - pelaksanaFeeFromMeta(order)
    - voaOpCost(order)
    - kurirOpCost(order)
  );
}

/**
 * Breakdown setiap komponen pemotongan profit untuk keperluan tooltip / audit.
 */
export function profitBreakdown(order: Order, egpRate = EGP_TO_IDR, overrideAgentFee?: number) {
  const gross    = profitIDR(order, egpRate);
  const agentFee = overrideAgentFee !== undefined ? overrideAgentFee : agentFeeFromMeta(order);
  const pelFee   = pelaksanaFeeFromMeta(order);
  const voaOp    = voaOpCost(order);
  const kurirOp  = kurirOpCost(order);
  const net      = gross - agentFee - pelFee - voaOp - kurirOp;
  const hasDeductions = agentFee > 0 || pelFee > 0 || voaOp > 0 || kurirOp > 0;
  return { gross, agentFee, pelFee, voaOp, kurirOp, net, hasDeductions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// G — Financial Accuracy: Cashflow-based revenue helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cashflow-accurate revenue for an order (G — Financial Accuracy).
 *
 * Revenue categories:
 *   PAID    → full revenue recognized (real cashflow)
 *   DP      → partial revenue recognized (only paidAmount counts as cash)
 *   UNPAID  → receivable only, NOT recognized as revenue yet
 *   REFUNDED→ 0 (money returned)
 *
 * Use this in financial reports instead of revenueIDR() for cashflow accuracy.
 */
export function cashflowRevenueIDR(order: Order, egpRate = EGP_TO_IDR): number {
  const status = order.paymentStatus ?? "UNPAID";
  if (status === "PAID")     return revenueIDR(order, egpRate);
  if (status === "DP")       return paidAmountIDR(order, egpRate);
  if (status === "REFUNDED") return 0;
  // UNPAID → receivable, not yet cashflow
  return 0;
}

/**
 * Piutang aktif (outstanding receivable) untuk satu order, dalam IDR.
 * = 0 jika PAID / REFUNDED, full totalPrice jika UNPAID, sisa jika DP.
 */
export function piutangIDR(order: Order, egpRate = EGP_TO_IDR): number {
  const status = order.paymentStatus ?? "UNPAID";
  if (status === "PAID" || status === "REFUNDED") return 0;
  return receivableIDR(order, egpRate);
}

/**
 * Pending profit = profit that will materialize when receivable is collected.
 * For PAID orders: 0 (profit already realized in cashflow).
 * For DP: profit on the uncollected portion (proportional).
 * For UNPAID: full net profit is still pending.
 */
export function pendingProfitIDR(order: Order, egpRate = EGP_TO_IDR): number {
  const status = order.paymentStatus ?? "UNPAID";
  if (status === "PAID" || status === "REFUNDED") return 0;
  const net   = netProfitIDR(order, egpRate);
  const total = revenueIDR(order, egpRate);
  if (status === "UNPAID") return net;
  if (status === "DP") {
    // Pending portion = net * (receivable / total)
    if (total <= 0) return 0;
    const receivable = piutangIDR(order, egpRate);
    return Math.round(net * (receivable / total));
  }
  return 0;
}

/**
 * Aggregate cashflow summary across a list of orders.
 * Returns cashflow-accurate numbers for financial reporting.
 */
export function aggregateCashflow(
  orders: Order[],
  egpRate = EGP_TO_IDR,
): {
  totalRevenue:      number;
  cashflowRevenue:   number;
  piutangTotal:      number;
  netProfit:         number;
  pendingProfit:     number;
  cashflowAccuracy:  number;
  countPaid:         number;
  countDp:           number;
  countUnpaid:       number;
  countRefunded:     number;
} {
  let totalRevenue    = 0;
  let cashflowRevenue = 0;
  let piutangTotal    = 0;
  let netProfit       = 0;
  let pendingProfit   = 0;
  let countPaid       = 0;
  let countDp         = 0;
  let countUnpaid     = 0;
  let countRefunded   = 0;

  for (const o of orders) {
    totalRevenue    += revenueIDR(o, egpRate);
    cashflowRevenue += cashflowRevenueIDR(o, egpRate);
    piutangTotal    += piutangIDR(o, egpRate);
    netProfit       += netProfitIDR(o, egpRate);
    pendingProfit   += pendingProfitIDR(o, egpRate);
    const s = o.paymentStatus ?? "UNPAID";
    if      (s === "PAID")     countPaid++;
    else if (s === "DP")       countDp++;
    else if (s === "REFUNDED") countRefunded++;
    else                       countUnpaid++;
  }

  const cashflowAccuracy = totalRevenue > 0
    ? Math.round((cashflowRevenue / totalRevenue) * 100)
    : 100;

  return {
    totalRevenue,
    cashflowRevenue,
    piutangTotal,
    netProfit,
    pendingProfit,
    cashflowAccuracy,
    countPaid,
    countDp,
    countUnpaid,
    countRefunded,
  };
}

/**
 * Detect ledger vs order mismatches.
 * Compares expected revenue from orders against a provided ledger total.
 *
 * @param orders      - list of orders to cross-check
 * @param ledgerTotal - total from financial ledger (in IDR)
 * @param egpRate     - EGP→IDR rate
 * @returns mismatch amount (positive = ledger > orders, negative = orders > ledger)
 */
export function detectLedgerMismatch(
  orders:      Order[],
  ledgerTotal: number,
  egpRate = EGP_TO_IDR,
): { mismatch: number; ordersTotal: number; ledgerTotal: number; hasGap: boolean } {
  const ordersTotal = orders.reduce((sum, o) => sum + cashflowRevenueIDR(o, egpRate), 0);
  const mismatch    = ledgerTotal - ordersTotal;
  const hasGap      = Math.abs(mismatch) > 1_000; // 1K IDR tolerance
  return { mismatch, ordersTotal, ledgerTotal, hasGap };
}
