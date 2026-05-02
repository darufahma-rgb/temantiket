import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { requireAgencyId, getCurrentAgencyId } from "@/store/authStore";

export type ClientDocCategory = "paspor" | "visa" | "tiket" | "lainnya";

export const CLIENT_DOC_CATEGORIES: {
  key: ClientDocCategory;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { key: "paspor",  label: "Paspor",  emoji: "📗", color: "bg-sky-100 text-sky-800 border-sky-200" },
  { key: "visa",    label: "Visa",    emoji: "📋", color: "bg-violet-100 text-violet-800 border-violet-200" },
  { key: "tiket",   label: "Tiket",   emoji: "🎫", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { key: "lainnya", label: "Lainnya", emoji: "📁", color: "bg-slate-100 text-slate-700 border-slate-200" },
];

export interface ClientDoc {
  id: string;
  agencyId: string;
  clientId: string;
  category: ClientDocCategory;
  label: string;
  fileName: string;
  fileType: string;
  dataUrl: string;
  createdAt: string;
}

export type ClientDocDraft = Omit<ClientDoc, "id" | "createdAt" | "agencyId">;

function fromRow(r: Record<string, unknown>): ClientDoc {
  return {
    id: String(r.id),
    agencyId: String(r.agency_id),
    clientId: String(r.client_id),
    category: (r.category as ClientDocCategory) ?? "lainnya",
    label: String(r.label ?? ""),
    fileName: String(r.file_name ?? ""),
    fileType: String(r.file_type ?? "image"),
    dataUrl: String(r.data_url ?? ""),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export async function listClientDocs(clientId: string): Promise<ClientDoc[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const agencyId = getCurrentAgencyId();
  if (!agencyId) return [];
  const { data, error } = await supabase
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
}

export async function createClientDoc(draft: ClientDocDraft): Promise<ClientDoc> {
  const agencyId = requireAgencyId();
  const id = `cdoc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const row = {
    id,
    agency_id: agencyId,
    client_id: draft.clientId,
    category: draft.category,
    label: draft.label,
    file_name: draft.fileName,
    file_type: draft.fileType,
    data_url: draft.dataUrl,
  };
  if (!isSupabaseConfigured() || !supabase) throw new Error("Supabase belum dikonfigurasi");
  const { data, error } = await supabase.from("client_documents").insert(row).select().single();
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function deleteClientDoc(id: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const agencyId = requireAgencyId();
  const { error } = await supabase
    .from("client_documents")
    .delete()
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) throw error;
}
