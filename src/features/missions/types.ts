export type MissionStatus = "pending" | "approved" | "rejected";

export interface DailyMission {
  id: string;
  agencyId: string;
  title: string;
  description: string;
  rewardPoints: number;
  deadline: string;
  createdBy: string | null;
  createdAt: string;
  feeIDR?: number;
  targetAgentIds?: string[] | "all";
}

export interface MissionSubmission {
  id: string;
  agencyId: string;
  missionId: string;
  agentId: string;
  status: MissionStatus;
  proofImageUrl: string | null;
  notes: string | null;
  rewardPoints: number;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface MissionWithSubmissions extends DailyMission {
  submissions: MissionSubmission[];
}

export interface MissionTemplate {
  id: string;
  agencyId: string;
  title: string;
  description: string;
  defaultPoints: number;
  useCount: number;
  createdBy: string | null;
  createdAt: string;
}
