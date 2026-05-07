import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface SavedVisaCalcRow {
  id: string;
  userId: string;
  agencyId: string;
  name: string;
  visaType: "voa" | "student";
  state: unknown;
  createdAt: string;
}

function rowToCalc(r: Record<string, unknown>): SavedVisaCalcRow {
  return {
    id:        String(r.id),
    userId:    String(r.user_id),
    agencyId:  String(r.agency_id),
    name:      String(r.name ?? ""),
    visaType:  (r.visa_type as "voa" | "student") ?? "voa",
    state:     r.state,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export async function listVisaSavedCalcs(agencyId: string): Promise<SavedVisaCalcRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("visa_saved_calcs")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) { console.warn("[visaCalcs] list:", error.message); return []; }
  return (data ?? []).map(rowToCalc);
}

export async function createVisaSavedCalc(
  userId: string,
  agencyId: string,
  name: string,
  visaType: "voa" | "student",
  state: unknown,
): Promise<SavedVisaCalcRow | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("visa_saved_calcs")
    .insert({ user_id: userId, agency_id: agencyId, name, visa_type: visaType, state })
    .select()
    .single();
  if (error) { console.warn("[visaCalcs] create:", error.message); return null; }
  return rowToCalc(data as Record<string, unknown>);
}

export async function deleteVisaSavedCalc(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase
    .from("visa_saved_calcs")
    .delete()
    .eq("id", id);
  if (error) { console.warn("[visaCalcs] delete:", error.message); return false; }
  return true;
}
