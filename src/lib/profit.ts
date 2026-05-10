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
 * ══════════════════════════════════════════════════════════════════════════════
 * RUMUS PROFIT BERSIH — SATU-SATUNYA SUMBER KEBENARAN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Profit Bersih = Pendapatan Kotor − Modal − Fee Agen Penjual − Fee Pelaksana
 *                − Biaya Operasional VOA − Biaya Kurir
 *
 * Semua halaman (OrderDetail, Reports, Ledger, Dashboard) wajib pakai fungsi
 * ini agar angka profit tidak berbeda-beda antar halaman.
 *
 * Catatan validasi:
 * - agentFeeFromMeta: hanya non-0 jika createdByAgent ada di metadata
 *   (divalidasi saat save di OrderDetail — direct order tidak punya agentFee)
 * - pelaksanaFeeFromMeta: hanya non-0 jika visa_student + pelaksanaId ada
 * - voaOpCost: hanya non-0 untuk visa_voa
 * - kurirOpCost: berlaku semua jenis order
 *
 * @param order   - order object dari ordersRepo
 * @param egpRate - kurs EGP→IDR live (default EGP_TO_IDR = 515)
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
 * Gunakan ini di halaman laporan agar tabel bisa menampilkan rincian setiap biaya
 * dengan angka yang persis sama dengan profitIDR / netProfitIDR.
 *
 * CATATAN: agentFee di sini selalu dibaca dari meta.agentFee (trust metadata).
 * Jika Reports page perlu validasi role, lakukan override nilai agentFee dari luar.
 */
export function profitBreakdown(order: Order, egpRate = EGP_TO_IDR, overrideAgentFee?: number) {
  const gross    = profitIDR(order, egpRate);       // revenue - cost in IDR
  const agentFee = overrideAgentFee !== undefined ? overrideAgentFee : agentFeeFromMeta(order);
  const pelFee   = pelaksanaFeeFromMeta(order);
  const voaOp    = voaOpCost(order);
  const kurirOp  = kurirOpCost(order);
  const net      = gross - agentFee - pelFee - voaOp - kurirOp;
  const hasDeductions = agentFee > 0 || pelFee > 0 || voaOp > 0 || kurirOp > 0;
  return { gross, agentFee, pelFee, voaOp, kurirOp, net, hasDeductions };
}
