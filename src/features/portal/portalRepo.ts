import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface BookingPaymentEntry {
  type: "dp" | "installment" | "final" | "refund" | "other";
  amount: number;
  method?: string;
  paidAt: string;
  notes?: string;
}

export interface BookingStatus {
  jamaah: { name: string; phone?: string; bookingCode: string; roomType?: string };
  trip: {
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    emoji: string;
    pricePerPax: number | null;
  };
  payments: BookingPaymentEntry[];
  totalPaid: number;
  outstanding: number;
  status: "lunas" | "sebagian" | "belum";
}

export type LookupResult =
  | { ok: true; data: BookingStatus }
  | { ok: false; error: "not_found" | "invalid_code" | "network" };

export async function lookupBooking(code: string): Promise<LookupResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "network" };
  try {
    const { data, error } = await supabase!.rpc("get_booking_status", { p_code: code.trim() });
    if (error) {
      console.error("[lookupBooking]", error);
      return { ok: false, error: "network" };
    }
    if (!data || typeof data !== "object") return { ok: false, error: "not_found" };
    const obj = data as Record<string, unknown>;
    if (obj.error === "not_found") return { ok: false, error: "not_found" };
    if (obj.error === "invalid_code") return { ok: false, error: "invalid_code" };
    return { ok: true, data: obj as unknown as BookingStatus };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "network" };
  }
}
