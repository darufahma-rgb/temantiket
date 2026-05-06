import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** Stamp order minimal — match RPC `get_member_card` output */
export interface PublicMemberStamp {
  type: "umrah" | "flight" | "visa_voa" | "visa_student" | string;
  status: "Confirmed" | "Paid" | "Completed" | string;
  createdAt: string;
  /** "dubai" | "saudi" | null — diturunkan dari orders.metadata.transitType */
  transitType: string | null;
  /** 0-based step index from order.metadata.processStep — fetched via secondary query */
  processStep?: number;
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
 *
 * After getting the basic card, attempts a secondary query to enrich stamps
 * with processStep from order metadata. This secondary query may be blocked
 * by RLS for anon users — failure is silently ignored.
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

    const card = obj as unknown as PublicMemberCard;

    // ── Secondary enrichment: try to get processStep per order ──────────────
    // Parse member index from slug (format: "{name-parts}-{4-digit-number}")
    try {
      const indexMatch = cleaned.match(/-(\d{4})$/);
      if (indexMatch) {
        const memberIndex = parseInt(indexMatch[1], 10);
        // Try to find client — may be blocked by RLS for anon users
        const { data: clientRows } = await supabase!
          .from("clients")
          .select("id")
          .order("created_at", { ascending: true })
          .range(memberIndex - 1, memberIndex - 1);

        const clientId = (clientRows ?? [])[0]?.id as string | undefined;
        if (clientId) {
          const { data: orderRows } = await supabase!
            .from("orders")
            .select("type, metadata, created_at")
            .eq("client_id", clientId)
            .in("status", ["Confirmed", "Paid", "Completed"]);

          if (orderRows && orderRows.length > 0) {
            // Match stamps to orders by type + nearest date
            card.orders = card.orders.map((stamp) => {
              const match = (orderRows as Array<{type: string; metadata: Record<string, unknown>; created_at: string}>)
                .filter((r) => r.type === stamp.type)
                .sort((a, b) =>
                  Math.abs(new Date(a.created_at).getTime() - new Date(stamp.createdAt).getTime()) -
                  Math.abs(new Date(b.created_at).getTime() - new Date(stamp.createdAt).getTime())
                )[0];
              return {
                ...stamp,
                processStep: match ? Number((match.metadata as Record<string, unknown>)?.processStep ?? 0) : undefined,
              };
            });
          }
        }
      }
    } catch {
      // Secondary query failed (likely RLS blocking anon) — continue without processStep
    }

    return { ok: true, data: card };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "network" };
  }
}
