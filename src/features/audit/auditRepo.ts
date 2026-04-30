import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface AuditLog {
  id: number;
  agencyId: string | null;
  userId: string | null;
  tableName: string;
  recordId: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

const fromRow = (r: Record<string, unknown>): AuditLog => ({
  id: Number(r.id),
  agencyId: (r.agency_id as string) ?? null,
  userId: (r.user_id as string) ?? null,
  tableName: String(r.table_name ?? ""),
  recordId: (r.record_id as string) ?? null,
  action: (r.action as AuditLog["action"]) ?? "INSERT",
  oldData: (r.old_data as Record<string, unknown>) ?? null,
  newData: (r.new_data as Record<string, unknown>) ?? null,
  createdAt: String(r.created_at ?? new Date().toISOString()),
});

export async function listRecentAuditLogs(limit = 100): Promise<AuditLog[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase!
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

const TABLE_LABEL: Record<string, string> = {
  trips: "Paket Trip",
  jamaah: "Jamaah",
  jamaah_docs: "Dokumen Jamaah",
  packages: "Paket Kalkulator",
  payments: "Pembayaran",
};

export function tableLabel(t: string): string {
  return TABLE_LABEL[t] ?? t;
}

export function describeChange(log: AuditLog): string {
  const name = (log.newData?.name as string) || (log.oldData?.name as string) || log.recordId || "—";
  const target = `${tableLabel(log.tableName)} "${name}"`;
  switch (log.action) {
    case "INSERT": return `Membuat ${target}`;
    case "UPDATE": return `Mengubah ${target}`;
    case "DELETE": return `Menghapus ${target}`;
  }
}
