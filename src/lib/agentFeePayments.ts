/**
 * Menyimpan nomor WA agen dan riwayat pembayaran fee komisi per-agency.
 * localStorage = instant cache; setiap mutasi juga di-push ke Supabase.
 *
 * Tabel Supabase:
 *   public.agent_fee_payments  → fee payment records
 *   public.agency_settings     → agent phones (key: 'agent_phones')
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { requireAgencyId, getCurrentAgencyId } from "@/store/authStore";
import { pullAgencySetting, pushAgencySetting } from "./settingsSync";
import { beginFeatureSync, resolveFeatureSync } from "@/store/featureSyncStore";

export interface FeePaymentRecord {
  id: string;
  agentId: string;
  amount: number;
  paidAt: string;
  note: string;
}

const PHONES_KEY   = "igh:agent-phones";
const PAYMENTS_KEY = "igh:fee-payments";
const PHONES_CLOUD_KEY = "agent_phones";

/** Feature key used for CloudSyncBadge. */
export const FEE_PAYMENT_SYNC_KEY = "fee_payments";

// ── Nomor WA agen ──────────────────────────────────────────────────────────

export function loadAgentPhones(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PHONES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveAgentPhone(agentId: string, phone: string): void {
  const all = loadAgentPhones();
  all[agentId] = phone.trim();
  try { localStorage.setItem(PHONES_KEY, JSON.stringify(all)); } catch { /* noop */ }
  void pushAgencySetting(PHONES_CLOUD_KEY, all);
}

export function getAgentPhone(agentId: string): string {
  return loadAgentPhones()[agentId] ?? "";
}

/** Pull phones dari Supabase → tulis ke localStorage → return map. */
export async function pullAgentPhones(): Promise<Record<string, string>> {
  const remote = await pullAgencySetting<Record<string, string>>(PHONES_CLOUD_KEY);
  if (!remote) return loadAgentPhones();
  try { localStorage.setItem(PHONES_KEY, JSON.stringify(remote)); } catch { /* noop */ }
  return remote;
}

// ── Riwayat Pembayaran Fee ─────────────────────────────────────────────────

export function loadFeePayments(): FeePaymentRecord[] {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    return raw ? (JSON.parse(raw) as FeePaymentRecord[]) : [];
  } catch {
    return [];
  }
}

function saveFeePaymentsCache(records: FeePaymentRecord[]): void {
  try { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(records.slice(0, 500))); } catch { /* noop */ }
}

export function recordFeePayment(agentId: string, amount: number, note = ""): FeePaymentRecord {
  const record: FeePaymentRecord = {
    id: `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    agentId,
    amount,
    paidAt: new Date().toISOString(),
    note,
  };
  const all = loadFeePayments();
  all.unshift(record);
  saveFeePaymentsCache(all);

  const canSync = beginFeatureSync(FEE_PAYMENT_SYNC_KEY);

  if (canSync) {
    void (async () => {
      try {
        const agencyId = requireAgencyId();
        const { error } = await supabase!.from("agent_fee_payments").insert({
          id:        record.id,
          agency_id: agencyId,
          agent_id:  record.agentId,
          amount:    record.amount,
          paid_at:   record.paidAt,
          note:      record.note,
        });
        if (error) {
          console.warn("[agentFeePayments] insert cloud gagal:", error.message);
          resolveFeatureSync(FEE_PAYMENT_SYNC_KEY, error.message);
        } else {
          resolveFeatureSync(FEE_PAYMENT_SYNC_KEY);
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.warn("[agentFeePayments] cloud insert exception:", e);
        resolveFeatureSync(FEE_PAYMENT_SYNC_KEY, msg);
      }
    })();
  }

  return record;
}

/** Pull fee payments dari Supabase → merge ke localStorage. */
export async function pullFeePayments(): Promise<FeePaymentRecord[]> {
  if (!isSupabaseConfigured()) return loadFeePayments();
  try {
    const agencyId = getCurrentAgencyId();
    if (!agencyId) return loadFeePayments();
    const { data, error } = await supabase!
      .from("agent_fee_payments")
      .select("*")
      .eq("agency_id", agencyId)
      .order("paid_at", { ascending: false })
      .limit(500);
    if (error) {
      console.warn("[agentFeePayments] pull gagal:", error.message);
      return loadFeePayments();
    }
    const records: FeePaymentRecord[] = (data ?? []).map((r) => ({
      id:      String(r.id),
      agentId: String(r.agent_id),
      amount:  Number(r.amount),
      paidAt:  String(r.paid_at),
      note:    String(r.note ?? ""),
    }));
    saveFeePaymentsCache(records);
    return records;
  } catch (e) {
    console.warn("[agentFeePayments] pull exception:", e);
    return loadFeePayments();
  }
}

export function getFeePaymentsForAgent(agentId: string): FeePaymentRecord[] {
  return loadFeePayments().filter((r) => r.agentId === agentId);
}

export function getTotalPaidForAgent(agentId: string): number {
  return getFeePaymentsForAgent(agentId).reduce((s, r) => s + r.amount, 0);
}

/** Format untuk URL wa.me: strip non-digit, konversi 08xx → 628xx */
export function toWaDigits(raw: string): string {
  const digits = raw.replace(/\D+/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits;
}

/** Buka WhatsApp dengan pesan pre-filled. */
export function openWaMessage(phone: string, message: string): void {
  const digits = toWaDigits(phone);
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
