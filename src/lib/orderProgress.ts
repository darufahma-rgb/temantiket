/**
 * orderProgress.ts — Single source of truth for order progress step definitions.
 *
 * ALL admin and public pages MUST import step definitions from this file.
 * This ensures metadata.processStep means the same thing everywhere — admin,
 * public member page, visa tracker, staff dashboard, client profile.
 *
 * Unified steps per product type (identical for admin AND public):
 *   visa_student : 6 steps  order_created → payment_dp → document_received
 *                            → document_checked → submission_process → visa_issued
 *   visa_voa     : 5 steps  order_created → payment → data_passenger
 *                            → ok_to_board → done
 *   flight       : 5 steps  request → confirm_price → payment → issued → done
 *   umrah        : 6 steps  register → pay_dp → docs_complete → full_payment
 *                            → departure → done
 */

export interface OrderStep {
  key:      string;
  label:    string;
  emoji:    string;
  sublabel: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified step definitions
// ─────────────────────────────────────────────────────────────────────────────

export const UNIFIED_ORDER_STEPS: Record<string, OrderStep[]> = {
  visa_student: [
    { key: "order_created",      label: "Order Dibuat",     emoji: "📋", sublabel: "Pesanan terdaftar" },
    { key: "payment_dp",         label: "Pembayaran / DP",  emoji: "💳", sublabel: "DP / lunas diterima" },
    { key: "document_received",  label: "Dokumen Diterima", emoji: "📥", sublabel: "Berkas dikirim ke kami" },
    { key: "document_checked",   label: "Dokumen Dicek",    emoji: "✅", sublabel: "Verifikasi dokumen" },
    { key: "submission_process", label: "Proses Pengajuan", emoji: "🏛️", sublabel: "Masuk kedutaan / proses visa" },
    { key: "visa_issued",        label: "Visa Terbit",      emoji: "🎉", sublabel: "Visa siap" },
  ],

  visa_voa: [
    { key: "order_created",  label: "Order Dibuat",    emoji: "📋", sublabel: "Pesanan terdaftar" },
    { key: "payment",        label: "Pembayaran",      emoji: "💳", sublabel: "Pembayaran diterima" },
    { key: "data_passenger", label: "Data Penumpang",  emoji: "👤", sublabel: "Data dicek & diverifikasi" },
    { key: "ok_to_board",    label: "OK to Board",     emoji: "🟢", sublabel: "Siap keberangkatan" },
    { key: "done",           label: "Selesai",         emoji: "✅", sublabel: "Proses selesai" },
  ],

  flight: [
    { key: "request",       label: "Request Tiket",    emoji: "📋", sublabel: "Pesanan diterima" },
    { key: "confirm_price", label: "Konfirmasi Harga", emoji: "💰", sublabel: "Harga & jadwal dikonfirmasi" },
    { key: "payment",       label: "Pembayaran",       emoji: "💳", sublabel: "Pembayaran selesai" },
    { key: "issued",        label: "Tiket Diterbitkan",emoji: "🎫", sublabel: "E-tiket dikirim" },
    { key: "done",          label: "Selesai",          emoji: "✅", sublabel: "Proses selesai" },
  ],

  umrah: [
    { key: "register",      label: "Pendaftaran",        emoji: "📝", sublabel: "Pendaftaran berhasil" },
    { key: "pay_dp",        label: "Bayar DP",           emoji: "💳", sublabel: "Down payment diterima" },
    { key: "docs_complete", label: "Kelengkapan Berkas", emoji: "📁", sublabel: "Dokumen dilengkapi" },
    { key: "full_payment",  label: "Pelunasan",          emoji: "💰", sublabel: "Pembayaran penuh selesai" },
    { key: "departure",     label: "Keberangkatan",      emoji: "✈️", sublabel: "Siap berangkat" },
    { key: "done",          label: "Selesai",            emoji: "🕋", sublabel: "Alhamdulillah selesai" },
  ],
};

/** Get steps for an order type, falling back to umrah if unknown. */
export function getStepsForType(type: string): OrderStep[] {
  return UNIFIED_ORDER_STEPS[type] ?? UNIFIED_ORDER_STEPS.umrah;
}

/** Get the processStep index from an order object (reads metadata.processStep). */
export function getOrderProgressStep(order: { metadata?: unknown }): number {
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  return Number(meta.processStep ?? 0);
}

/** Get the label for a given type + step index. */
export function getOrderProgressLabel(type: string, step: number): string {
  const steps = getStepsForType(type);
  const clamped = Math.min(Math.max(0, step), steps.length - 1);
  return steps[clamped]?.label ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration maps: old per-component step index → new unified index
// Used by server/migrate-progress-steps endpoint.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * visa_student: old admin 5-step (Berkas Dikirim=0 … Visa Terbit=4)
 *            → new unified 6-step (Order Dibuat=0 … Visa Terbit=5)
 */
export const VISA_STUDENT_MIGRATION: Record<number, number> = {
  0: 2,  // Berkas Dikirim   → Dokumen Diterima
  1: 3,  // Berkas Lengkap   → Dokumen Dicek
  2: 4,  // Masuk Kedutaan   → Proses Pengajuan
  3: 4,  // Proses Visa      → Proses Pengajuan
  4: 5,  // Visa Terbit      → Visa Terbit
};

/**
 * flight: old admin 3-step (Booking=0, Tiket Issued=1, Selesai=2)
 *       → new unified 5-step (Request Tiket=0 … Selesai=4)
 */
export const FLIGHT_MIGRATION: Record<number, number> = {
  0: 0,  // Booking      → Request Tiket
  1: 3,  // Tiket Issued → Tiket Diterbitkan
  2: 4,  // Selesai      → Selesai
};

/**
 * visa_voa: old admin 4-step (Berkas Masuk=0, OK to Board=1, Mendekati Berangkat=2, Selesai=3)
 *         → new unified 5-step (Order Dibuat=0 … Selesai=4)
 */
export const VOA_MIGRATION: Record<number, number> = {
  0: 2,  // Berkas Masuk       → Data Penumpang
  1: 3,  // OK to Board        → OK to Board
  2: 3,  // Mendekati Berangkat→ OK to Board (nearest)
  3: 4,  // Selesai            → Selesai
};

/**
 * umrah: old admin 5-step (Pendaftaran=0, Dok. Lengkap=1, Pelunasan=2, Keberangkatan=3, Selesai=4)
 *      → new unified 6-step (Pendaftaran=0, Bayar DP=1, Kelengkapan Berkas=2 … Selesai=5)
 */
export const UMRAH_MIGRATION: Record<number, number> = {
  0: 0,  // Pendaftaran   → Pendaftaran
  1: 2,  // Dok. Lengkap  → Kelengkapan Berkas
  2: 3,  // Pelunasan     → Pelunasan
  3: 4,  // Keberangkatan → Keberangkatan
  4: 5,  // Selesai       → Selesai
};

export const ALL_MIGRATIONS: Record<string, Record<number, number>> = {
  visa_student: VISA_STUDENT_MIGRATION,
  flight:       FLIGHT_MIGRATION,
  visa_voa:     VOA_MIGRATION,
  umrah:        UMRAH_MIGRATION,
};
