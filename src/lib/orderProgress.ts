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
 *
 * Storage: metadata.processStep is stored as a NUMERIC INDEX (integer).
 * The step key is derived on-demand from the index using getStepKeyFromIndex().
 * No schema change required.
 *
 * A — Upgrade (2025):
 *   + color per step (hex) for consistent UI theming across all pages
 *   + roleVisibility: which roles can see this step ([] = all roles)
 *   + ETA helper: slaHours already serves as the ETA default
 */

export interface OrderStep {
  key:      string;
  label:    string;
  emoji:    string;
  sublabel: string;
  /** Hex color for this step — used in step indicator dots, progress bars, badges */
  color:    string;
  /** Roles that can SEE this step in detail. Empty array = visible to all roles. */
  roleVisibility: Array<"owner" | "staff" | "agent" | "public">;
  /** Default SLA warning threshold in hours. 0 = no SLA warning. */
  slaHours?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified step definitions (A — color + roleVisibility added)
// ─────────────────────────────────────────────────────────────────────────────

export const UNIFIED_ORDER_STEPS: Record<string, OrderStep[]> = {
  visa_student: [
    { key: "order_created",      label: "Order Dibuat",     emoji: "📋", sublabel: "Pesanan terdaftar",                color: "#6366f1", roleVisibility: [],                              slaHours: 0 },
    { key: "payment_dp",         label: "Pembayaran / DP",  emoji: "💳", sublabel: "DP / lunas diterima",              color: "#f59e0b", roleVisibility: [],                              slaHours: 72 },
    { key: "document_received",  label: "Dokumen Diterima", emoji: "📥", sublabel: "Berkas dikirim ke kami",           color: "#3b82f6", roleVisibility: [],                              slaHours: 48 },
    { key: "document_checked",   label: "Dokumen Dicek",    emoji: "✅", sublabel: "Verifikasi dokumen",               color: "#8b5cf6", roleVisibility: [],                              slaHours: 48 },
    { key: "submission_process", label: "Proses Pengajuan", emoji: "🏛️", sublabel: "Masuk kedutaan / proses visa",   color: "#f97316", roleVisibility: [],                              slaHours: 240 },
    { key: "visa_issued",        label: "Visa Terbit",      emoji: "🎉", sublabel: "Visa siap",                        color: "#10b981", roleVisibility: [],                              slaHours: 0 },
  ],

  visa_voa: [
    { key: "order_created",  label: "Order Dibuat",    emoji: "📋", sublabel: "Pesanan terdaftar",              color: "#6366f1", roleVisibility: [], slaHours: 0 },
    { key: "payment",        label: "Pembayaran",      emoji: "💳", sublabel: "Pembayaran diterima",            color: "#f59e0b", roleVisibility: [], slaHours: 48 },
    { key: "data_passenger", label: "Data Penumpang",  emoji: "👤", sublabel: "Data dicek & diverifikasi",      color: "#3b82f6", roleVisibility: [], slaHours: 24 },
    { key: "ok_to_board",    label: "OK to Board",     emoji: "🟢", sublabel: "Siap keberangkatan",             color: "#10b981", roleVisibility: [], slaHours: 0 },
    { key: "done",           label: "Selesai",         emoji: "✅", sublabel: "Proses selesai",                  color: "#10b981", roleVisibility: [], slaHours: 0 },
  ],

  flight: [
    { key: "request",       label: "Request Tiket",    emoji: "📋", sublabel: "Pesanan diterima",              color: "#6366f1", roleVisibility: [], slaHours: 0 },
    { key: "confirm_price", label: "Konfirmasi Harga", emoji: "💰", sublabel: "Harga & jadwal dikonfirmasi",   color: "#f59e0b", roleVisibility: [], slaHours: 24 },
    { key: "payment",       label: "Pembayaran",       emoji: "💳", sublabel: "Pembayaran selesai",            color: "#3b82f6", roleVisibility: [], slaHours: 48 },
    { key: "issued",        label: "Tiket Diterbitkan",emoji: "🎫", sublabel: "E-tiket dikirim",              color: "#10b981", roleVisibility: [], slaHours: 24 },
    { key: "done",          label: "Selesai",          emoji: "✅", sublabel: "Proses selesai",                color: "#10b981", roleVisibility: [], slaHours: 0 },
  ],

  umrah: [
    { key: "register",      label: "Pendaftaran",        emoji: "📝", sublabel: "Pendaftaran berhasil",        color: "#6366f1", roleVisibility: [], slaHours: 0 },
    { key: "pay_dp",        label: "Bayar DP",           emoji: "💳", sublabel: "Down payment diterima",       color: "#f59e0b", roleVisibility: [], slaHours: 72 },
    { key: "docs_complete", label: "Kelengkapan Berkas", emoji: "📁", sublabel: "Dokumen dilengkapi",          color: "#3b82f6", roleVisibility: [], slaHours: 168 },
    { key: "full_payment",  label: "Pelunasan",          emoji: "💰", sublabel: "Pembayaran penuh selesai",    color: "#8b5cf6", roleVisibility: [], slaHours: 168 },
    { key: "departure",     label: "Keberangkatan",      emoji: "✈️", sublabel: "Siap berangkat",             color: "#f97316", roleVisibility: [], slaHours: 0 },
    { key: "done",          label: "Selesai",            emoji: "🕋", sublabel: "Alhamdulillah selesai",       color: "#10b981", roleVisibility: [], slaHours: 0 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Core getters
// ─────────────────────────────────────────────────────────────────────────────

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

/** Get the color for a given type + step index. */
export function getOrderProgressColor(type: string, step: number): string {
  const steps = getStepsForType(type);
  const clamped = Math.min(Math.max(0, step), steps.length - 1);
  return steps[clamped]?.color ?? "#6366f1";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper suite (A — required helpers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the numeric index for a given step key within an order type.
 * Returns -1 if the key is not found (unknown step).
 */
export function getStepIndexFromKey(type: string, key: string): number {
  const steps = getStepsForType(type);
  return steps.findIndex((s) => s.key === key);
}

/**
 * Get the string key for a given step index within an order type.
 * Returns null if out of bounds (corrupted/unknown index).
 */
export function getStepKeyFromIndex(type: string, index: number): string | null {
  const steps = getStepsForType(type);
  return steps[index]?.key ?? null;
}

/**
 * Get the next step definition after the current index.
 * Returns null if already at the last step or out of bounds.
 */
export function getNextStep(type: string, currentIndex: number): OrderStep | null {
  const steps = getStepsForType(type);
  if (currentIndex < 0 || currentIndex >= steps.length - 1) return null;
  return steps[currentIndex + 1] ?? null;
}

/**
 * Get progress as a percentage (0–100).
 * 0% = first step active, 100% = last step active.
 */
export function getProgressPercent(type: string, currentIndex: number): number {
  const steps = getStepsForType(type);
  if (steps.length <= 1) return 100;
  const clamped = Math.min(Math.max(0, currentIndex), steps.length - 1);
  return Math.round((clamped / (steps.length - 1)) * 100);
}

/**
 * Clamp a raw processStep index to valid range for the given type.
 * Unknown/corrupted values are clamped to 0 (safe fallback).
 */
export function clampStep(type: string, raw: unknown): number {
  const steps = getStepsForType(type);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), steps.length - 1);
}

/**
 * Validate a step index for a given type.
 * Returns true if the index is valid (in-range integer).
 */
export function isValidStep(type: string, index: number): boolean {
  const steps = getStepsForType(type);
  return Number.isInteger(index) && index >= 0 && index < steps.length;
}

/**
 * Auto-repair a metadata object with a corrupted or unknown processStep.
 * If processStep is valid, returns the original metadata unchanged.
 * If corrupted/unknown, resets processStep to 0 and sets _stepRepaired=true.
 *
 * Safe to call on every render — pure function, no side effects.
 */
export function repairMetadata(
  type: string,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const raw = metadata.processStep;
  const n = Number(raw);
  const steps = getStepsForType(type);
  if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n < steps.length) {
    return metadata; // valid — no repair needed
  }
  return { ...metadata, processStep: 0, _stepRepaired: true, _stepRepairPrev: raw };
}

/**
 * Check if an order's current step has exceeded its SLA threshold.
 *
 * @param type          - order type (visa_student, flight, etc.)
 * @param stepIndex     - current processStep index
 * @param stepChangedAt - ISO timestamp when the step was last changed (from metadata.stepChangedAt)
 * @returns null if no SLA defined for this step, otherwise { exceeded, hoursElapsed, slaHours }
 */
export function checkSla(
  type: string,
  stepIndex: number,
  stepChangedAt?: string | null,
): { exceeded: boolean; hoursElapsed: number; slaHours: number } | null {
  const steps = getStepsForType(type);
  const step = steps[stepIndex];
  if (!step || !step.slaHours || step.slaHours <= 0) return null;
  if (!stepChangedAt) return null;
  try {
    const changedMs = new Date(stepChangedAt).getTime();
    if (!Number.isFinite(changedMs)) return null;
    const hoursElapsed = (Date.now() - changedMs) / (1000 * 60 * 60);
    return {
      exceeded:     hoursElapsed > step.slaHours,
      hoursElapsed: Math.round(hoursElapsed),
      slaHours:     step.slaHours,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A — Migration engine types
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationPreview {
  orderId:   string;
  type:      string;
  oldStep:   number;
  newStep:   number;
  oldKey:    string | null;
  newKey:    string | null;
  needsMigration: boolean;
}

export interface MigrationReport {
  total:      number;
  migrated:   number;
  skipped:    number;
  errors:     number;
  previews:   MigrationPreview[];
  simulatedAt: string;
  mode:       "preview" | "simulate" | "live";
}

/**
 * Build a migration preview for a list of orders without touching the DB.
 * mode="preview" → just show what would change
 * mode="simulate" → same as preview but marks simulation=true in report
 * mode="live" → caller should apply changes to DB
 */
export function buildMigrationReport(
  orders: Array<{ id: string; type: string; metadata?: unknown }>,
  mode: "preview" | "simulate" | "live" = "preview",
): MigrationReport {
  const previews: MigrationPreview[] = [];
  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const order of orders) {
    try {
      const meta = (order.metadata ?? {}) as Record<string, unknown>;
      const oldStep = Number(meta.processStep ?? 0);
      const steps = getStepsForType(order.type);
      const oldKey = steps[oldStep]?.key ?? null;
      const repairedMeta = repairMetadata(order.type, meta);
      const newStep = Number(repairedMeta.processStep ?? 0);
      const newKey = steps[newStep]?.key ?? null;
      const needsMigration = repairedMeta._stepRepaired === true;

      previews.push({ orderId: order.id, type: order.type, oldStep, newStep, oldKey, newKey, needsMigration });
      if (needsMigration) migrated++;
      else skipped++;
    } catch {
      errors++;
    }
  }

  return {
    total:      orders.length,
    migrated,
    skipped,
    errors,
    previews,
    simulatedAt: new Date().toISOString(),
    mode,
  };
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
