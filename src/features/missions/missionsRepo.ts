import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { DailyMission, MissionSubmission, MissionStatus, MissionTemplate } from "./types";

// ── Row mappers ─────────────────────────────────────────────────────────────
function missionFromRow(r: Record<string, unknown>): DailyMission {
  return {
    id: String(r.id),
    agencyId: String(r.agency_id),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    rewardPoints: Number(r.reward_points ?? 10),
    deadline: String(r.deadline ?? ""),
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

function submissionFromRow(r: Record<string, unknown>): MissionSubmission {
  return {
    id: String(r.id),
    agencyId: String(r.agency_id),
    missionId: String(r.mission_id),
    agentId: String(r.agent_id),
    status: (r.status as MissionStatus) ?? "pending",
    proofImageUrl: r.proof_image_url ? String(r.proof_image_url) : null,
    notes: r.notes ? String(r.notes) : null,
    rewardPoints: Number(r.reward_points ?? 0),
    submittedAt: String(r.submitted_at ?? new Date().toISOString()),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
  };
}

// ── Missions CRUD ────────────────────────────────────────────────────────────
export async function listMissions(agencyId: string): Promise<DailyMission[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("agency_id", agencyId)
    .order("deadline", { ascending: false });
  if (error) { console.warn("[missions] listMissions:", error.message); return []; }
  return (data ?? []).map(missionFromRow);
}

export async function createMission(
  agencyId: string,
  payload: { title: string; description: string; rewardPoints: number; deadline: string },
  createdBy: string,
): Promise<DailyMission | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("daily_missions")
    .insert({
      agency_id: agencyId,
      title: payload.title,
      description: payload.description,
      reward_points: payload.rewardPoints,
      deadline: payload.deadline,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) { console.warn("[missions] createMission:", error.message); return null; }
  return missionFromRow(data as Record<string, unknown>);
}

export async function deleteMission(missionId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase.from("daily_missions").delete().eq("id", missionId).select("id");
  if (error) { console.warn("[missions] deleteMission:", error.message); return false; }
  if (!data || data.length === 0) { console.warn("[missions] deleteMission: RLS mungkin memblokir DELETE id=", missionId); return false; }
  return true;
}

// ── Submissions CRUD ─────────────────────────────────────────────────────────
export async function listSubmissions(agencyId: string): Promise<MissionSubmission[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("mission_submissions")
    .select("*")
    .eq("agency_id", agencyId)
    .order("submitted_at", { ascending: false });
  if (error) { console.warn("[missions] listSubmissions:", error.message); return []; }
  return (data ?? []).map(submissionFromRow);
}

export async function listMySubmissions(
  agencyId: string,
  agentId: string,
): Promise<MissionSubmission[]> {
  if (!isSupabaseConfigured() || !supabase) {
    // Try API route when Supabase not configured
    try {
      const res = await fetch(
        `/api/mission-submissions?agent_id=${encodeURIComponent(agentId)}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>[];
        return (data ?? []).map(submissionFromRow);
      }
    } catch (err) {
      console.warn("[missions] API fetch gagal:", err);
    }
    return [];
  }
  const { data, error } = await supabase
    .from("mission_submissions")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("agent_id", agentId)
    .order("submitted_at", { ascending: false });
  if (error) { console.warn("[missions] listMySubmissions:", error.message); return []; }
  return (data ?? []).map(submissionFromRow);
}

export async function submitMission(
  agencyId: string,
  missionId: string,
  agentId: string,
  rewardPoints: number,
  proofImageUrl: string | null,
  notes: string,
): Promise<MissionSubmission | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("mission_submissions")
    .upsert(
      {
        agency_id: agencyId,
        mission_id: missionId,
        agent_id: agentId,
        status: "pending",
        proof_image_url: proofImageUrl,
        notes: notes || null,
        reward_points: rewardPoints,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "mission_id,agent_id" },
    )
    .select()
    .single();
  if (error) { console.warn("[missions] submitMission:", error.message); return null; }
  return submissionFromRow(data as Record<string, unknown>);
}

export async function reviewSubmission(
  submissionId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { error } = await supabase
    .from("mission_submissions")
    .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (error) { console.warn("[missions] reviewSubmission:", error.message); return false; }
  return true;
}

// ── Storage: upload proof image ───────────────────────────────────────────────
export async function uploadProofImage(
  agencyId: string,
  agentId: string,
  missionId: string,
  file: File,
): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${agencyId}/${missionId}/${agentId}.${ext}`;
  const { error } = await supabase.storage
    .from("mission-proofs")
    .upload(path, file, { upsert: true });
  if (error) { console.warn("[missions] uploadProof:", error.message); return null; }
  const { data } = supabase.storage.from("mission-proofs").getPublicUrl(path);
  return data.publicUrl;
}

// ── Template CRUD ─────────────────────────────────────────────────────────────
function templateFromRow(r: Record<string, unknown>): MissionTemplate {
  return {
    id: String(r.id),
    agencyId: String(r.agency_id),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    defaultPoints: Number(r.default_points ?? 10),
    useCount: Number(r.use_count ?? 0),
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export async function listTemplates(agencyId: string): Promise<MissionTemplate[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("mission_templates")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) { console.warn("[missions] listTemplates:", error.message); return []; }
  return (data ?? []).map(templateFromRow);
}

export async function createTemplate(
  agencyId: string,
  payload: { title: string; description: string; defaultPoints: number },
  createdBy: string,
): Promise<MissionTemplate | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("mission_templates")
    .insert({
      agency_id: agencyId,
      title: payload.title,
      description: payload.description,
      default_points: payload.defaultPoints,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) { console.warn("[missions] createTemplate:", error.message); return null; }
  return templateFromRow(data as Record<string, unknown>);
}

export async function deleteTemplate(templateId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase.from("mission_templates").delete().eq("id", templateId).select("id");
  if (error) { console.warn("[missions] deleteTemplate:", error.message); return false; }
  if (!data || data.length === 0) { console.warn("[missions] deleteTemplate: RLS mungkin memblokir DELETE id=", templateId); return false; }
  return true;
}

export async function incrementTemplateUseCount(templateId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase.rpc("increment_template_use_count", { tmpl_id: templateId }).maybeSingle();
}

// ── Aggregates ────────────────────────────────────────────────────────────────
/** Jumlah poin misi yg sudah di-approve per agent → Map<agentId, points> */
export function sumMissionPointsByAgent(
  submissions: MissionSubmission[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of submissions) {
    if (s.status === "approved") {
      m.set(s.agentId, (m.get(s.agentId) ?? 0) + s.rewardPoints);
    }
  }
  return m;
}
