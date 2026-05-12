/**
 * Agent Wallet — B Hardening (Production-Grade)
 *
 * Converts approved mission points → commission IDR credit.
 * localStorage = instant cache; setiap mutasi juga di-push ke Supabase
 * melalui server endpoint /api/credit-wallet-tx (service role key — no RLS).
 *
 * Tabel Supabase: public.agent_wallet_transactions
 *
 * B — Hardening:
 *  - `field_agent_fee`, `operational_fee` added to WalletTxType
 *  - IDEMPOTENCY_KEYS: deterministic key constants per fee type
 *  - detectDuplicateRoles: find agents appearing in multiple roles
 *  - reconcileWalletTxs: detect orphan/missing/duplicate/mismatch issues
 *  - resolveAssignments: canonical assignment resolver
 *  - translateWalletError: intelligent error translator (C)
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { requireAgencyId, getCurrentAgencyId } from "@/store/authStore";
import { beginFeatureSync, resolveFeatureSync } from "@/store/featureSyncStore";

export const POINT_TO_IDR_RATE = 1_000;

export type WalletTxType =
  | "mission_conversion"
  | "mission_fee"
  | "order_bonus"
  | "pelaksana_fee"      // fee pelaksana visa pelajar (role=staff)
  | "voa_agent_fee"      // fee agent lapangan VOA (role=agent, bertugas di bandara)
  | "field_agent_fee"    // fee agent lapangan generik (bukan VOA-spesifik)
  | "kurir_fee"          // fee kurir setoran uang
  | "operational_fee"    // fee operasional (transport, akomodasi lapangan)
  | "payout"
  | "adjustment";

export interface WalletTransaction {
  id:          string;
  agentId:     string;
  type:        WalletTxType;
  pointsDelta: number;
  amountIDR:   number;
  description: string;
  createdAt:   string;
  createdBy:   string;
}

// ─── Deterministic idempotency key builders (B — idempotency hardening) ───────

/** Idempotency key builders per fee type. Use these consistently everywhere. */
export const IDEMPOTENCY_KEYS = {
  orderBonus:       (orderId: string) => `bonus-${orderId}`,
  voaAgentFee:      (orderId: string) => `voa-${orderId}`,
  fieldAgentFee:    (orderId: string) => `field-${orderId}`,
  pelaksanaFee:     (orderId: string) => `pelaksana-${orderId}`,
  kurirFee:         (orderId: string) => `kurir-${orderId}`,
  operationalFee:   (orderId: string) => `op-${orderId}`,
  salesAgentBonus:  (orderId: string) => `salesagent-${orderId}`,
  assignedAgent:    (orderId: string) => `assigned-${orderId}`,
  handlerAgent:     (orderId: string) => `handler-${orderId}`,
  courierAgent:     (orderId: string) => `courier-${orderId}`,
  executorFee:      (orderId: string) => `executor-${orderId}`,
} as const;

// ─── Priority system for duplicate-role resolution ────────────────────────────

/** Role priority: lower number = higher priority. */
export const ROLE_PRIORITY: Record<string, number> = {
  sales:       1,
  assigned:    2,
  handler:     3,
  field:       4,
  courier:     5,
  pelaksana:   6,
  operational: 7,
};

// ─── B — Assignment resolver ───────────────────────────────────────────────────

export interface OrderAssignments {
  salesAgentId?:       string | null;
  assignedAgentId?:    string | null;
  handlerAgentId?:     string | null;
  courierAgentId?:     string | null;
  fieldAgentId?:       string | null;
  pelaksanaId?:        string | null;
  operationalAgentId?: string | null;
}

export interface ResolvedAssignment {
  agentId:   string;
  role:      string;
  priority:  number;
}

/**
 * Resolve all agent assignments for an order into a flat list.
 * Handles deduplication: if same agent appears in multiple roles, keeps highest-priority role.
 * Returns sorted by priority (lowest number first = highest priority).
 */
export function resolveAssignments(
  assignments: OrderAssignments,
): ResolvedAssignment[] {
  const raw: Array<{ agentId: string; role: string }> = [
    { agentId: assignments.salesAgentId      ?? "", role: "sales" },
    { agentId: assignments.assignedAgentId   ?? "", role: "assigned" },
    { agentId: assignments.handlerAgentId    ?? "", role: "handler" },
    { agentId: assignments.courierAgentId    ?? "", role: "courier" },
    { agentId: assignments.fieldAgentId      ?? "", role: "field" },
    { agentId: assignments.pelaksanaId       ?? "", role: "pelaksana" },
    { agentId: assignments.operationalAgentId ?? "", role: "operational" },
  ].filter((a) => !!a.agentId);

  // Deduplicate: keep highest-priority role per agent
  const byAgent = new Map<string, ResolvedAssignment>();
  for (const { agentId, role } of raw) {
    const priority = ROLE_PRIORITY[role] ?? 99;
    const existing = byAgent.get(agentId);
    if (!existing || priority < existing.priority) {
      byAgent.set(agentId, { agentId, role, priority });
    }
  }

  return [...byAgent.values()].sort((a, b) => a.priority - b.priority);
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const walletKey = (agentId: string) => `igh.agent_wallet.v2.${agentId}`;

/** Feature key used for CloudSyncBadge — per-agent. */
export const walletSyncKey = (agentId: string) => `wallet_${agentId}`;

export function listWalletTxs(agentId: string): WalletTransaction[] {
  try {
    const raw = localStorage.getItem(walletKey(agentId));
    return raw ? (JSON.parse(raw) as WalletTransaction[]) : [];
  } catch {
    return [];
  }
}

function saveTxsCache(agentId: string, txs: WalletTransaction[]): void {
  try { localStorage.setItem(walletKey(agentId), JSON.stringify(txs)); } catch { /* quota */ }
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export function walletBalance(txs: WalletTransaction[]): {
  pointsConsumed: number;
  totalCreditIDR: number;
  totalDebitIDR:  number;
  netIDR:         number;
} {
  let pointsConsumed = 0;
  let totalCreditIDR = 0;
  let totalDebitIDR  = 0;
  for (const tx of txs) {
    pointsConsumed += Math.abs(tx.pointsDelta);
    if (tx.amountIDR >= 0) totalCreditIDR += tx.amountIDR;
    else                    totalDebitIDR  += Math.abs(tx.amountIDR);
  }
  return { pointsConsumed, totalCreditIDR, totalDebitIDR, netIDR: totalCreditIDR - totalDebitIDR };
}

// ─── Add tx (local + cloud) ───────────────────────────────────────────────────

export function addWalletTx(
  agentId: string,
  tx: Omit<WalletTransaction, "id" | "createdAt">,
): WalletTransaction {
  const full: WalletTransaction = {
    ...tx,
    id:        `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  saveTxsCache(agentId, [full, ...listWalletTxs(agentId)]);

  const syncKey = walletSyncKey(agentId);
  const canSync = beginFeatureSync(syncKey);

  if (canSync) {
    void (async () => {
      if (!isSupabaseConfigured()) { resolveFeatureSync(syncKey); return; }
      try {
        const agencyId = requireAgencyId();
        const { error } = await supabase!.from("agent_wallet_transactions").insert({
          id:           full.id,
          agency_id:    agencyId,
          agent_id:     full.agentId,
          type:         full.type,
          points_delta: full.pointsDelta,
          amount_idr:   full.amountIDR,
          description:  full.description,
          created_by:   full.createdBy,
          created_at:   full.createdAt,
        });
        if (error) {
          console.warn("[agentWallet] insert cloud gagal:", error.message);
          resolveFeatureSync(syncKey, error.message);
        } else {
          resolveFeatureSync(syncKey);
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.warn("[agentWallet] cloud insert exception:", e);
        resolveFeatureSync(syncKey, msg);
      }
    })();
  }

  return full;
}

/**
 * Async version of addWalletTx — routes through /api/credit-wallet-tx
 * (service role key — bypasses RLS).
 *
 * Uses upsert for idempotency: if you pass an `idempotencyKey`, the tx ID is
 * deterministic (`wtx-{key}`) so retrying the same credit won't duplicate.
 *
 * ALWAYS check real wallet tx existence — never trust *FeeCredited flags alone.
 */
export async function addWalletTxAsync(
  agentId: string,
  tx: Omit<WalletTransaction, "id" | "createdAt">,
  idempotencyKey?: string,
): Promise<{ tx: WalletTransaction; persisted: boolean; error?: string }> {
  const full: WalletTransaction = {
    ...tx,
    id: idempotencyKey
      ? `wtx-${idempotencyKey}`
      : `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  // Write to localStorage first — instant cache, deduplicating by id
  saveTxsCache(agentId, [full, ...listWalletTxs(agentId).filter((t) => t.id !== full.id)]);

  if (!isSupabaseConfigured()) {
    return { tx: full, persisted: false, error: "Supabase tidak dikonfigurasi" };
  }

  // ── Primary path: server endpoint (service role key — bypasses RLS) ────────
  try {
    const agencyId = requireAgencyId();
    const session = (await supabase!.auth.getSession()).data.session;
    const token = session?.access_token;

    if (!token) {
      const msg = "Tidak ada sesi aktif — login ulang dulu";
      console.error("[agentWallet] credit-wallet-tx: no auth token");
      return { tx: full, persisted: false, error: msg };
    }

    const res = await fetch("/api/credit-wallet-tx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id:          full.id,
        agencyId,
        agentId:     full.agentId,
        type:        full.type,
        pointsDelta: full.pointsDelta,
        amountIDR:   full.amountIDR,
        description: full.description,
        createdBy:   full.createdBy,
        createdAt:   full.createdAt,
      }),
    });

    if (res.ok) {
      console.log(`[agentWallet] credit-wallet-tx OK — id=${full.id} agent=${full.agentId} amount=${full.amountIDR}`);
      const syncKey = walletSyncKey(agentId);
      resolveFeatureSync(syncKey);
      return { tx: full, persisted: true };
    }

    const body = await res.json().catch(() => ({})) as { error?: string };
    const serverError = body?.error ?? `HTTP ${res.status}`;
    console.error(`[agentWallet] credit-wallet-tx server error (${res.status}):`, serverError);

    // ── Fallback: try direct anon-client upsert ────────────────────────────
    console.warn("[agentWallet] falling back to anon-client upsert after server error");
    const { error: anonErr } = await supabase!
      .from("agent_wallet_transactions")
      .upsert(
        {
          id:           full.id,
          agency_id:    agencyId,
          agent_id:     full.agentId,
          type:         full.type,
          points_delta: full.pointsDelta,
          amount_idr:   full.amountIDR,
          description:  full.description,
          created_by:   full.createdBy,
          created_at:   full.createdAt,
        },
        { onConflict: "id" },
      );

    if (!anonErr) {
      console.log("[agentWallet] anon-client fallback upsert succeeded");
      const syncKey = walletSyncKey(agentId);
      resolveFeatureSync(syncKey);
      return { tx: full, persisted: true };
    }

    console.error("[agentWallet] anon-client fallback upsert juga gagal:", anonErr.message);
    const finalError = anonErr.message
      ? `${anonErr.message} (server: ${serverError})`
      : serverError;
    return { tx: full, persisted: false, error: finalError };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[agentWallet] credit-wallet-tx exception:", e);
    return { tx: full, persisted: false, error: msg };
  }
}

/** Pull wallet txs dari Supabase → update localStorage cache → return list. */
export async function pullWalletTxs(agentId: string): Promise<WalletTransaction[]> {
  if (!isSupabaseConfigured()) return listWalletTxs(agentId);
  try {
    const agencyId = getCurrentAgencyId();
    if (!agencyId) return listWalletTxs(agentId);
    const { data, error } = await supabase!
      .from("agent_wallet_transactions")
      .select("*")
      .eq("agency_id", agencyId)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[agentWallet] pull gagal:", error.message);
      return listWalletTxs(agentId);
    }
    const txs: WalletTransaction[] = (data ?? []).map((r) => ({
      id:          String(r.id),
      agentId:     String(r.agent_id),
      type:        r.type as WalletTxType,
      pointsDelta: Number(r.points_delta),
      amountIDR:   Number(r.amount_idr),
      description: String(r.description ?? ""),
      createdAt:   String(r.created_at),
      createdBy:   String(r.created_by ?? ""),
    }));
    saveTxsCache(agentId, txs);
    return txs;
  } catch (e) {
    console.warn("[agentWallet] pull exception:", e);
    return listWalletTxs(agentId);
  }
}

// ─── Mission conversion helpers ───────────────────────────────────────────────

export function convertMissionPoints(
  agentId:     string,
  points:      number,
  convertedBy: string,
): WalletTransaction {
  if (points <= 0) throw new Error("Poin harus > 0");
  const amountIDR = Math.round(points * POINT_TO_IDR_RATE);
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountIDR);
  return addWalletTx(agentId, {
    agentId,
    type:        "mission_conversion",
    pointsDelta: -points,
    amountIDR,
    description: `Konversi ${points} poin misi → ${fmt} komisi`,
    createdBy:   convertedBy,
  });
}

export async function convertMissionPointsAsync(
  agentId:     string,
  points:      number,
  convertedBy: string,
): Promise<{ tx: WalletTransaction; persisted: boolean; error?: string }> {
  if (points <= 0) throw new Error("Poin harus > 0");
  const amountIDR = Math.round(points * POINT_TO_IDR_RATE);
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountIDR);
  return addWalletTxAsync(agentId, {
    agentId,
    type:        "mission_conversion",
    pointsDelta: -points,
    amountIDR,
    description: `Konversi ${points} poin misi → ${fmt} komisi`,
    createdBy:   convertedBy,
  });
}

export function recordPayout(
  agentId:   string,
  amountIDR: number,
  paidBy:    string,
  notes?:    string,
): WalletTransaction {
  if (amountIDR <= 0) throw new Error("Jumlah harus > 0");
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountIDR);
  return addWalletTx(agentId, {
    agentId,
    type:        "payout",
    pointsDelta: 0,
    amountIDR:   -amountIDR,
    description: `Pencairan ${fmt}${notes ? ` — ${notes}` : ""}`,
    createdBy:   paidBy,
  });
}

export async function recordPayoutAsync(
  agentId:   string,
  amountIDR: number,
  paidBy:    string,
  notes?:    string,
): Promise<{ tx: WalletTransaction; persisted: boolean; error?: string }> {
  if (amountIDR <= 0) throw new Error("Jumlah harus > 0");
  const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amountIDR);
  return addWalletTxAsync(agentId, {
    agentId,
    type:        "payout",
    pointsDelta: 0,
    amountIDR:   -amountIDR,
    description: `Pencairan ${fmt}${notes ? ` — ${notes}` : ""}`,
    createdBy:   paidBy,
  });
}

// ─── B — Canonical agent ID resolver ─────────────────────────────────────────

/**
 * resolveAgentId — normalize any raw agent identifier to a canonical user UUID.
 *
 * All wallet transactions, profile pages, and order metadata MUST use the
 * Supabase auth user UUID (= agency_members.user_id) as the canonical ID.
 * This function is the single entry point for resolving any ambiguous ID.
 *
 * If memberLookup is provided (maps any possible ID → userId), it is tried
 * first. Falls back to returning rawId as-is (assumed already canonical).
 * Returns null for empty / "__none" / whitespace-only inputs.
 */
export function resolveAgentId(
  rawId: string | null | undefined,
  memberLookup?: (id: string) => string | null,
): string | null {
  if (!rawId || rawId.trim() === "" || rawId === "__none") return null;
  const trimmed = rawId.trim();
  if (memberLookup) {
    const resolved = memberLookup(trimmed);
    if (resolved) return resolved;
  }
  return trimmed;
}

/**
 * All metadata field names that can hold an agent's identity across different
 * order types and historical naming conventions.
 *
 * Used by extractFieldAgents() and AgentProfile to scan all possible keys.
 */
export const FIELD_AGENT_META_KEYS = [
  "voaFieldAgentId",
  "fieldAgentId",
  "pelaksanaId",
  "kurirAgentId",
  "assignedOperationalAgentId",
  "visaExecutorId",
  "salesAgentId",
  "assignedAgentId",
  "handlerAgentId",
  "courierAgentId",
] as const;

export type FieldAgentMetaKey = typeof FIELD_AGENT_META_KEYS[number];

export interface ExtractedFieldRole {
  /** Which metadata key was used to store this agent ID */
  fieldKey:        FieldAgentMetaKey;
  /** Canonical agent user UUID */
  agentId:         string;
  /** Fee amount in IDR (0 if no fee defined) */
  feeAmount:       number;
  /** WalletTxType to use when crediting this role */
  feeType:         WalletTxType;
  /** Deterministic idempotency key for wallet upsert */
  idempotencyKey:  string;
  /** Whether the *Credited flag is set in metadata */
  creditedFlag:    boolean;
}

/**
 * extractFieldAgents — canonical extractor for ALL field agent roles in an order.
 *
 * Single source of truth for reading field agent metadata. All pages (AgentProfile,
 * AgentProfileOwnerView, backfill, audit) MUST use this function to avoid missing
 * agents due to metadata key name variations.
 *
 * Covers all known metadata field names including legacy ones from earlier versions.
 * Each role produces a separate ExtractedFieldRole entry (no else-if exclusions).
 *
 * @param orderId  - order UUID (used to build idempotency keys)
 * @param metadata - raw order metadata object
 * @param filterAgentId - if provided, only returns roles for this agent
 */
export function extractFieldAgents(
  orderId: string,
  metadata: Record<string, unknown>,
  filterAgentId?: string | null,
): ExtractedFieldRole[] {
  const roles: ExtractedFieldRole[] = [];

  function tryAdd(
    fieldKey:        FieldAgentMetaKey,
    agentIdKey:      string,
    feeKey:          string,
    feeType:         WalletTxType,
    idempotencyPfx:  string,
    creditedKey:     string,
    defaultFee      = 0,
  ) {
    const rawId = metadata[agentIdKey];
    if (!rawId || rawId === "__none") return;
    const agentId = String(rawId).trim();
    if (!agentId) return;
    if (filterAgentId && filterAgentId !== agentId) return;
    const feeAmount = Number(metadata[feeKey] ?? defaultFee);
    roles.push({
      fieldKey,
      agentId,
      feeAmount,
      feeType,
      idempotencyKey: `${idempotencyPfx}-${orderId}`,
      creditedFlag:   !!(metadata[creditedKey] as boolean | undefined),
    });
  }

  // VOA field agent (primary — most common)
  tryAdd("voaFieldAgentId",            "voaFieldAgentId",            "voaAgentFee",        "voa_agent_fee",   "voa",       "voaFeeCredited");
  // Generic field agent (legacy / non-VOA)
  tryAdd("fieldAgentId",               "fieldAgentId",               "fieldAgentFee",      "field_agent_fee", "field",     "fieldFeeCredited");
  // Visa student pelaksana
  tryAdd("pelaksanaId",                "pelaksanaId",                "pelaksanaFee",       "pelaksana_fee",   "pelaksana", "pelaksanaFeeCredited", 200_000);
  // Kurir setoran
  tryAdd("kurirAgentId",               "kurirAgentId",               "kurirFee",           "kurir_fee",       "kurir",     "kurirFeeCredited");
  // Operational / transport agent
  tryAdd("assignedOperationalAgentId", "assignedOperationalAgentId", "operationalAgentFee","operational_fee", "op",        "operationalFeeCredited");
  // Visa executor (legacy field name used in some early orders)
  tryAdd("visaExecutorId",             "visaExecutorId",             "executorFee",        "pelaksana_fee",   "executor",  "executorFeeCredited");

  return roles;
}

/**
 * Check if a given agentId (user UUID) has ANY field assignment in this order.
 * Uses the canonical extractFieldAgents() internally.
 *
 * @returns list of field role keys where agentId appears
 */
export function getAgentFieldRoles(
  orderId: string,
  metadata: Record<string, unknown>,
  agentId: string,
): ExtractedFieldRole[] {
  return extractFieldAgents(orderId, metadata, agentId);
}

// ─── B — Duplicate-role detector ─────────────────────────────────────────────

export interface RoleConflict {
  agentId:   string;
  roles:     string[];
  /** The winning role by priority system. */
  winner:    string;
}

/**
 * Detect agents appearing in multiple roles for the same order.
 * Returns conflicts sorted by winner priority.
 *
 * @param roleMap  - Record<roleName, agentId | null | undefined>
 */
export function detectDuplicateRoles(
  roleMap: Record<string, string | null | undefined>,
): RoleConflict[] {
  // Group role names by agentId
  const byAgent: Record<string, string[]> = {};
  for (const [role, agentId] of Object.entries(roleMap)) {
    if (!agentId) continue;
    if (!byAgent[agentId]) byAgent[agentId] = [];
    byAgent[agentId].push(role);
  }
  const conflicts: RoleConflict[] = [];
  for (const [agentId, roles] of Object.entries(byAgent)) {
    if (roles.length <= 1) continue;
    // Find winner by lowest priority number
    const winner = roles.reduce((best, role) => {
      const bp = ROLE_PRIORITY[best] ?? 99;
      const rp = ROLE_PRIORITY[role]  ?? 99;
      return rp < bp ? role : best;
    });
    conflicts.push({ agentId, roles, winner });
  }
  return conflicts;
}

// ─── B — Reconciliation engine ────────────────────────────────────────────────

export type ReconciliationIssueSeverity = "error" | "warning" | "info";

export interface ReconciliationIssue {
  type:        "orphan_fee" | "missing_tx" | "duplicate_tx" | "mismatch_nominal" | "stale_credited_flag" | "duplicate_role";
  severity:    ReconciliationIssueSeverity;
  orderId?:    string;
  agentId?:    string;
  description: string;
  expected?:   number;
  actual?:     number;
  txId?:       string;
}

/**
 * Reconcile a single agent's wallet transactions against expected fees.
 * NEVER trusts *FeeCredited flags alone — always checks actual tx existence.
 *
 * @param agentId        - the agent being reconciled
 * @param txs            - actual wallet transactions from Supabase
 * @param expectedFees   - list of expected fee entries derived from orders
 */
export function reconcileWalletTxs(
  agentId: string,
  txs: WalletTransaction[],
  expectedFees: Array<{
    idempotencyKey: string;
    type:           WalletTxType;
    amountIDR:      number;
    orderId:        string;
    description:    string;
  }>,
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  // Index txs by id for O(1) lookup
  const txById  = new Map<string, WalletTransaction>(txs.map((t) => [t.id, t]));

  // Check each expected fee
  const expectedIds = new Set<string>();
  for (const fee of expectedFees) {
    const txId = `wtx-${fee.idempotencyKey}`;
    expectedIds.add(txId);
    const tx = txById.get(txId);

    if (!tx) {
      issues.push({
        type:        "missing_tx",
        severity:    "error",
        orderId:     fee.orderId,
        agentId,
        description: `Fee ${fee.type} untuk order ${fee.orderId.slice(0, 8)} belum tercatat di wallet`,
        expected:    fee.amountIDR,
        actual:      0,
        txId,
      });
      continue;
    }

    // Nominal mismatch (tolerance: ±1 IDR for rounding)
    if (Math.abs(tx.amountIDR - fee.amountIDR) > 1) {
      issues.push({
        type:        "mismatch_nominal",
        severity:    "warning",
        orderId:     fee.orderId,
        agentId,
        description: `Nominal ${fee.type} tidak sesuai untuk order ${fee.orderId.slice(0, 8)}`,
        expected:    fee.amountIDR,
        actual:      tx.amountIDR,
        txId,
      });
    }
  }

  // Detect orphan fees: txs that don't correspond to any expected fee
  for (const tx of txs) {
    if (tx.amountIDR <= 0) continue; // skip payouts/adjustments
    if (expectedIds.has(tx.id)) continue;
    // Only flag fee types (not mission_conversion, payout, adjustment)
    const feeTypes: WalletTxType[] = ["order_bonus", "voa_agent_fee", "field_agent_fee", "pelaksana_fee", "kurir_fee", "operational_fee"];
    if (!feeTypes.includes(tx.type)) continue;
    issues.push({
      type:        "orphan_fee",
      severity:    "info",
      agentId,
      description: `Transaksi ${tx.type} (${tx.id.slice(0, 16)}) tidak terhubung ke order aktif`,
      actual:      tx.amountIDR,
      txId:        tx.id,
    });
  }

  // Detect duplicate txs: same type + similar amount within 1 min
  const seen = new Map<string, WalletTransaction>();
  for (const tx of [...txs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const dedupeKey = `${tx.type}:${tx.amountIDR}`;
    const prev = seen.get(dedupeKey);
    if (prev) {
      const diffMs = Math.abs(new Date(tx.createdAt).getTime() - new Date(prev.createdAt).getTime());
      if (diffMs < 60_000) {
        issues.push({
          type:        "duplicate_tx",
          severity:    "error",
          agentId,
          description: `Kemungkinan duplikat transaksi ${tx.type}: ${prev.id.slice(0, 16)} ↔ ${tx.id.slice(0, 16)}`,
          actual:      tx.amountIDR,
          txId:        tx.id,
        });
      }
    }
    seen.set(dedupeKey, tx);
  }

  return issues;
}

/**
 * Translate a raw Supabase/system error into a user-friendly Indonesian message.
 * (C — Intelligent error translator)
 */
export function translateWalletError(rawError: string): string {
  const e = rawError.toLowerCase();
  if (e.includes("check") && (e.includes("constraint") || e.includes("violates"))) {
    return "Jenis fee belum diizinkan. Pastikan migration wallet-sync-fix.sql sudah dijalankan di Supabase.";
  }
  if (e.includes("rls") || e.includes("row-level security") || e.includes("policy")) {
    return "Akses ditolak oleh kebijakan keamanan. Gunakan endpoint server untuk operasi antar-agen.";
  }
  if (e.includes("duplicate") || e.includes("unique") || e.includes("conflict")) {
    return "Transaksi sudah ada (duplikat). Ini biasanya aman — transaksi sebelumnya sudah tercatat.";
  }
  if (e.includes("foreign key") || e.includes("fk_")) {
    return "Referensi tidak valid (agent atau agency tidak ditemukan). Periksa ID agen.";
  }
  if (e.includes("not found") || e.includes("404")) {
    return "Endpoint server tidak ditemukan. Pastikan server Express berjalan dan proxy /api dikonfigurasi.";
  }
  if (e.includes("timeout") || e.includes("timed out")) {
    return "Koneksi ke server timeout. Coba lagi — jaringan mungkin lambat.";
  }
  if (e.includes("network") || e.includes("fetch")) {
    return "Gagal terhubung ke server. Periksa koneksi internet atau coba reload.";
  }
  if (e.includes("jwt") || e.includes("token") || e.includes("auth")) {
    return "Sesi tidak valid. Coba logout dan login kembali.";
  }
  if (e.includes("42703") || e.includes("column")) {
    return "Kolom database belum ada. Jalankan migration SQL terbaru di Supabase SQL Editor.";
  }
  if (e.includes("storage") || e.includes("bucket")) {
    return "Storage Supabase bermasalah. Cek bucket dan RLS policy di dashboard Supabase.";
  }
  return rawError;
}
