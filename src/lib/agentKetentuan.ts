/**
 * agentKetentuan — Agent fee & rules data definitions + cloud sync helpers.
 *
 * Storage: agency_settings table (Supabase), two keys:
 *   "agent_fee_items"   → AgentFeeItem[]   (fee list, editable by owner)
 *   "agent_ketentuan"   → AgentRules       (notes, requirements, services)
 *
 * Defaults are hardcoded so the UI always shows something even without DB rows.
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentFeeItem {
  id: string;
  label: string;
  amount: number;       // IDR
  note?: string;        // optional suffix e.g. "Per pax"
}

export interface AgentRules {
  feeNotes: string[];
  requirementItems: string[];
  serviceItems: string[];
  tierResetMonths: number;
  lastUpdated: string; // human-readable e.g. "Januari 2026"
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_FEE_ITEMS: AgentFeeItem[] = [
  { id: "tiket-return",   label: "Tiket Return",    amount: 220000 },
  { id: "tiket-oneway",   label: "Tiket Oneway",    amount: 110000 },
  { id: "umrah-pp",       label: "Tiket Umrah PP",  amount: 100000, note: "per pax" },
  { id: "umrah-ow",       label: "Tiket Umrah OW",  amount: 50000,  note: "per pax" },
  { id: "imei-indo",      label: "IMEI Indo",       amount: 100000 },
  { id: "voa-mesir",      label: "VOA Mesir",       amount: 150000 },
  { id: "entry-student",  label: "Entry Student",   amount: 150000 },
  { id: "kurir-duit",     label: "Kurir Duit",      amount: 100000 },
  { id: "jemput-voa",     label: "Jemput VOA",      amount: 150000 },
];

export const DEFAULT_RULES: AgentRules = {
  feeNotes: [
    "Agent tidak perlu menaikkan harga sendiri ke customer — harga sudah diatur oleh Temantiket.",
    "Fee dapat berubah sewaktu-waktu sesuai kurs dan nominal pembayaran.",
    "Pelayanan agent akan terus ditingkatkan seiring berkembangnya Temantiket.",
  ],
  requirementItems: [
    "Memiliki akun Temantiket yang sudah terverifikasi",
    "Aktif menggunakan WhatsApp dan responsif terhadap pesan",
    "Bersedia mengikuti briefing dan pelatihan dari admin",
    "Menjaga profesionalisme dalam berkomunikasi dengan customer",
    "Tidak memasarkan produk yang bertentangan dengan kebijakan Temantiket",
    "Bersedia mematuhi seluruh ketentuan dan kebijakan Temantiket",
  ],
  serviceItems: [
    "Merespon pesan customer dengan cepat (maksimal 1×24 jam)",
    "Berkomunikasi aktif dan proaktif dalam setiap proses order",
    "Memberikan informasi yang jujur dan tidak menyesatkan customer",
    "Membantu proses pemesanan dari awal hingga order selesai",
    "Menjaga kerahasiaan data pribadi dan dokumen customer",
    "Menjelaskan prosedur dan persyaratan dengan bahasa yang mudah dipahami",
    "Membantu customer menyelesaikan kendala atau keluhan terkait order",
  ],
  tierResetMonths: 6,
  lastUpdated: "Januari 2026",
};

// ── Cloud sync ─────────────────────────────────────────────────────────────────

const KEY_FEE   = "agent_fee_items";
const KEY_RULES = "agent_ketentuan";

export async function pullAgentFeeItems(): Promise<AgentFeeItem[]> {
  const data = await pullAgencySetting<AgentFeeItem[]>(KEY_FEE);
  if (!data || !Array.isArray(data) || data.length === 0) return DEFAULT_FEE_ITEMS;
  // Merge with defaults to ensure new items added to defaults also appear
  return data;
}

export async function pushAgentFeeItems(items: AgentFeeItem[]): Promise<void> {
  await pushAgencySetting(KEY_FEE, items);
}

export async function pullAgentRules(): Promise<AgentRules> {
  const data = await pullAgencySetting<Partial<AgentRules>>(KEY_RULES);
  if (!data) return DEFAULT_RULES;
  return {
    feeNotes: data.feeNotes?.length ? data.feeNotes : DEFAULT_RULES.feeNotes,
    requirementItems: data.requirementItems?.length ? data.requirementItems : DEFAULT_RULES.requirementItems,
    serviceItems: data.serviceItems?.length ? data.serviceItems : DEFAULT_RULES.serviceItems,
    tierResetMonths: data.tierResetMonths ?? DEFAULT_RULES.tierResetMonths,
    lastUpdated: data.lastUpdated ?? DEFAULT_RULES.lastUpdated,
  };
}

export async function pushAgentRules(rules: AgentRules): Promise<void> {
  await pushAgencySetting(KEY_RULES, rules);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

export function fmtFeeIDR(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}
