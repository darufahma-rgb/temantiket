import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** Stamp order minimal — match RPC `get_member_card` output */
export interface PublicMemberStamp {
  type: "umrah" | "flight" | "visa_voa" | "visa_student" | string;
  status: "Confirmed" | "Paid" | "Completed" | string;
  createdAt: string;
  /** "dubai" | "saudi" | null — diturunkan dari orders.metadata.transitType */
  transitType: string | null;
}

export interface PublicMemberCard {
  client: {
    name: string;
    createdAt: string;
    memberIndex: number;
    referralStamps: number;
  };
  orders: PublicMemberStamp[];
}

export type PublicMemberLookup =
  | { ok: true; data: PublicMemberCard }
  | { ok: false; error: "not_found" | "invalid_slug" | "network" };

/**
 * Lookup public Member Card data via Supabase RPC.
 * Read-only, anon-safe — RPC sendiri pake SECURITY DEFINER + projection minimal.
 */
export async function lookupMemberCard(slug: string): Promise<PublicMemberLookup> {
  if (!isSupabaseConfigured()) return { ok: false, error: "network" };
  const cleaned = (slug ?? "").trim();
  if (cleaned.length < 2) return { ok: false, error: "invalid_slug" };

  try {
    const { data, error } = await supabase!.rpc("get_member_card", { p_slug: cleaned });
    if (error) {
      console.error("[lookupMemberCard]", error);
      return { ok: false, error: "network" };
    }
    if (!data || typeof data !== "object") return { ok: false, error: "not_found" };
    const obj = data as Record<string, unknown>;
    if (obj.error === "not_found")    return { ok: false, error: "not_found" };
    if (obj.error === "invalid_slug") return { ok: false, error: "invalid_slug" };
    return { ok: true, data: obj as unknown as PublicMemberCard };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "network" };
  }
}
