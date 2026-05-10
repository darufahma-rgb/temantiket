/**
 * Ledger Sync — Fase 29
 * Connects orders to the financial Buku Besar (General Ledger).
 *
 * When order status → "Paid" | "Completed", a snapshot of current EGP/SAR
 * rates is frozen in order.metadata so profit calculations in the Ledger tab
 * always use the historically-correct rate, not today's live rate.
 */

import type { Order } from "@/features/orders/ordersRepo";
import type { ProductCommissions } from "./productCommissions";
import { voaOpCost, kurirOpCost, agentFeeFromMeta } from "./profit";

export interface LedgerEntry {
  orderId: string;
  orderTitle: string;
  orderType: string;
  clientName: string;
  clientId: string | null;
  paidAt: string;
  revenue: number;
  cost: number;
  profit: number;
  currency: string;
  egpRateSnapshot: number;
  sarRateSnapshot: number;
  revenueIDR: number;
  costIDR: number;
  profitIDR: number;
  marginPct: number;
  /** Running balance up to and including this entry (IDR). Filled by buildLedgerEntries. */
  runningBalance: number;
  /** True kalau ini entri komisi agen (debit), bukan entri order biasa. */
  isCommission?: boolean;
  /** True kalau ini entri biaya operasional VOA (debit). */
  isVoaOpex?: boolean;
  /** True kalau ini entri biaya kurir setoran uang (debit). */
  isKurirOpex?: boolean;
  /** True kalau ini entri fee pelaksana visa student (debit). */
  isPelaksanaFee?: boolean;
  /** UID agen — hanya terisi kalau isCommission = true. */
  agentId?: string;
  /** Nama agen — hanya terisi kalau isCommission = true. */
  agentName?: string;
  /** Persentase komisi yang digunakan. */
  commissionPct?: number;
}

/** Minimal info member yang dibutuhkan untuk hitung komisi. */
export interface AgentCommissionInfo {
  role: string;
  displayName: string;
  commissionPct: number;
}

const DEFAULT_EGP = 515;
const DEFAULT_SAR = 4250;

function toIDR(amount: number, currency: string, egpRate: number, sarRate: number): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "EGP") return Math.round(amount * egpRate);
  if (currency === "SAR") return Math.round(amount * sarRate);
  return Math.round(amount);
}

/**
 * Build the metadata patch that freezes current EGP/SAR rates at payment time.
 * Call this BEFORE patchOrder when status transitions to Paid/Completed.
 * Idempotent: won't overwrite a snapshot that already exists.
 */
export function buildRateSnapshotPatch(
  currentMeta: Record<string, unknown>,
  egpRate: number,
  sarRate: number,
): Record<string, unknown> {
  if (currentMeta.egpRateSnapshot) return currentMeta;
  return {
    ...currentMeta,
    egpRateSnapshot: egpRate,
    sarRateSnapshot: sarRate,
    paidAt: new Date().toISOString(),
  };
}

/**
 * Build ledger entries from all Paid/Completed orders, sorted by paidAt desc.
 * Includes running balance (profit cumulative, oldest → newest then reversed).
 *
 * Setiap order menghasilkan entri utama (revenue + gross profit), lalu
 * baris-baris debit terpisah untuk setiap biaya yang memotong profit bersih:
 *   - Komisi agen penjual (meta.agentFee) — hanya jika role === "agent"
 *   - Biaya operasional VOA (voaAgentFee + voaTransportFee + voaOtherFee)
 *   - Biaya kurir setoran uang (kurirFee + kurirTransportFee + kurirOtherFee)
 *   - Fee pelaksana visa student (meta.pelaksanaFee) — hanya jika ada pelaksanaId
 *
 * PENTING: Semua biaya di atas dibaca dari metadata order (bukan dari
 * pengaturan global productCommissions) agar konsisten dengan OrderDetail.
 */
export function buildLedgerEntries(
  orders: Order[],
  clientNameById: Map<string, string>,
  fallbackEgpRate = DEFAULT_EGP,
  fallbackSarRate = DEFAULT_SAR,
  memberById?: Map<string, AgentCommissionInfo>,
  _productCommissions?: ProductCommissions, // kept for API compat, unused
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const o of orders) {
    if (o.status !== "Paid" && o.status !== "Completed") continue;

    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    const egpRate = Number(meta.egpRateSnapshot ?? fallbackEgpRate);
    const sarRate = Number(meta.sarRateSnapshot ?? fallbackSarRate);
    const paidAt  = (meta.paidAt as string | undefined) ?? o.updatedAt ?? o.createdAt;

    const rev    = Number(o.totalPrice ?? 0);
    const cost   = Number(o.costPrice ?? 0);
    const revIDR  = toIDR(rev,  o.currency, egpRate, sarRate);
    const costIDR = toIDR(cost, o.currency, egpRate, sarRate);
    const profIDR = revIDR - costIDR;

    // ── Entri utama order (gross profit) ──────────────────────────────────
    entries.push({
      orderId:          o.id,
      orderTitle:       o.title ?? o.type,
      orderType:        o.type,
      clientName:       o.clientId ? (clientNameById.get(o.clientId) ?? "—") : "—",
      clientId:         o.clientId,
      paidAt,
      revenue:          rev,
      cost,
      profit:           rev - cost,
      currency:         o.currency,
      egpRateSnapshot:  egpRate,
      sarRateSnapshot:  sarRate,
      revenueIDR:       revIDR,
      costIDR,
      profitIDR:        profIDR,
      marginPct:        revIDR > 0 ? (profIDR / revIDR) * 100 : 0,
      runningBalance:   0, // filled below
    });

    // ── Entri biaya operasional VOA ────────────────────────────────────────
    if (o.type === "visa_voa") {
      const opexIDR = voaOpCost(o); // always IDR
      if (opexIDR > 0) {
        entries.push({
          orderId:         `voa_opex_${o.id}`,
          orderTitle:      `Biaya Operasional VOA · ${o.title ?? o.id.slice(0, 8)}`,
          orderType:       o.type,
          clientName:      o.clientId ? (clientNameById.get(o.clientId) ?? "—") : "—",
          clientId:        o.clientId,
          paidAt,
          revenue:         0,
          cost:            opexIDR,
          profit:          -opexIDR,
          currency:        "IDR",
          egpRateSnapshot: egpRate,
          sarRateSnapshot: sarRate,
          revenueIDR:      0,
          costIDR:         opexIDR,
          profitIDR:       -opexIDR,
          marginPct:       0,
          runningBalance:  0,
          isVoaOpex:       true,
        });
      }
    }

    // ── Entri biaya kurir setoran uang ─────────────────────────────────────
    {
      const kurirIDR = kurirOpCost(o); // always IDR
      if (kurirIDR > 0) {
        entries.push({
          orderId:         `kurir_opex_${o.id}`,
          orderTitle:      `Biaya Kurir Setoran · ${o.title ?? o.id.slice(0, 8)}`,
          orderType:       o.type,
          clientName:      o.clientId ? (clientNameById.get(o.clientId) ?? "—") : "—",
          clientId:        o.clientId,
          paidAt,
          revenue:         0,
          cost:            kurirIDR,
          profit:          -kurirIDR,
          currency:        "IDR",
          egpRateSnapshot: egpRate,
          sarRateSnapshot: sarRate,
          revenueIDR:      0,
          costIDR:         kurirIDR,
          profitIDR:       -kurirIDR,
          marginPct:       0,
          runningBalance:  0,
          isKurirOpex:     true,
        });
      }
    }

    // ── Entri fee pelaksana visa student ──────────────────────────────────
    // Dibaca dari meta.pelaksanaFee (per-order) — selalu IDR.
    // Hanya muncul jika visa_student DAN pelaksanaId ada.
    if (o.type === "visa_student" && meta.pelaksanaId) {
      const pelFeeIDR = Number(meta.pelaksanaFee ?? 200_000);
      if (pelFeeIDR > 0) {
        entries.push({
          orderId:         `pelaksana_fee_${o.id}`,
          orderTitle:      `Fee Pelaksana Visa · ${o.title ?? o.id.slice(0, 8)}`,
          orderType:       o.type,
          clientName:      o.clientId ? (clientNameById.get(o.clientId) ?? "—") : "—",
          clientId:        o.clientId,
          paidAt,
          revenue:         0,
          cost:            pelFeeIDR,
          profit:          -pelFeeIDR,
          currency:        "IDR",
          egpRateSnapshot: egpRate,
          sarRateSnapshot: sarRate,
          revenueIDR:      0,
          costIDR:         pelFeeIDR,
          profitIDR:       -pelFeeIDR,
          marginPct:       0,
          runningBalance:  0,
          isPelaksanaFee:  true,
        });
      }
    }

    // ── Entri komisi agen penjual ──────────────────────────────────────────
    // Dibaca via agentFeeFromMeta() — satu-satunya sumber kebenaran fee agen.
    // Hanya muncul jika createdByAgent ada DAN member berole "agent".
    // Ini memastikan direct orders (owner/staff closing ref) tidak kena debit komisi.
    if (memberById && o.createdByAgent) {
      const member = memberById.get(o.createdByAgent);
      if (member && member.role === "agent") {
        // agentFeeFromMeta() = canonical helper, konsisten dengan Reports/Ledger/Wallet
        const commissionIDR = agentFeeFromMeta(o);
        if (commissionIDR > 0) {
          entries.push({
            orderId:         `commission_${o.id}`,
            orderTitle:      `Fee Agen ${member.displayName} · ${o.type}`,
            orderType:       o.type,
            clientName:      o.clientId ? (clientNameById.get(o.clientId) ?? "—") : "—",
            clientId:        o.clientId,
            paidAt,
            revenue:         0,
            cost:            commissionIDR,
            profit:          -commissionIDR,
            currency:        "IDR",
            egpRateSnapshot: egpRate,
            sarRateSnapshot: sarRate,
            revenueIDR:      0,
            costIDR:         commissionIDR,
            profitIDR:       -commissionIDR,
            marginPct:       0,
            runningBalance:  0,
            isCommission:    true,
            agentId:         o.createdByAgent,
            agentName:       member.displayName,
            commissionPct:   0,
          });
        }
      }
    }
  }

  // Sort ascending by paidAt so running balance is chronological.
  entries.sort((a, b) => a.paidAt.localeCompare(b.paidAt));

  // Compute running balance
  let balance = 0;
  for (const e of entries) {
    balance += e.profitIDR;
    e.runningBalance = balance;
  }

  // Reverse to show newest first in UI
  entries.reverse();
  return entries;
}

/** Summary stats from ledger entries. */
export function ledgerSummary(entries: LedgerEntry[]) {
  let totalRevenue    = 0;
  let totalCost       = 0;
  let totalProfit     = 0;
  let totalCommission = 0;
  let totalVoaOpex    = 0;
  let totalKurirOpex  = 0;
  let totalPelaksana  = 0;
  for (const e of entries) {
    if (e.isCommission) {
      totalCommission += Math.abs(e.profitIDR);
    } else if (e.isVoaOpex) {
      totalVoaOpex += Math.abs(e.profitIDR);
    } else if (e.isKurirOpex) {
      totalKurirOpex += Math.abs(e.profitIDR);
    } else if (e.isPelaksanaFee) {
      totalPelaksana += Math.abs(e.profitIDR);
    } else {
      totalRevenue += e.revenueIDR;
      totalCost    += e.costIDR;
      totalProfit  += e.profitIDR;
    }
  }
  const netProfit = totalProfit - totalCommission - totalVoaOpex - totalKurirOpex - totalPelaksana;
  return {
    totalRevenue,
    totalCost,
    totalProfit,
    totalCommission,
    totalVoaOpex,
    totalKurirOpex,
    totalPelaksana,
    netProfit,
    count: entries.filter((e) => !e.isCommission && !e.isVoaOpex && !e.isKurirOpex && !e.isPelaksanaFee).length,
    avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
  };
}
