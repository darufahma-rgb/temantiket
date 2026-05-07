/**
 * missionMeta — stores per-mission extra data (feeIDR, targetAgentIds)
 * in agency_settings since the DB schema cannot be modified.
 *
 * Key: "mission_meta"
 * Value: Record<missionId, { feeIDR: number; targetAgentIds: string[] | "all" }>
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";

export interface MissionMeta {
  feeIDR: number;
  targetAgentIds: string[] | "all";
}

export type MissionMetaMap = Record<string, MissionMeta>;

const META_KEY = "mission_meta";

export async function pullMissionMeta(): Promise<MissionMetaMap> {
  const data = await pullAgencySetting<MissionMetaMap>(META_KEY);
  return data ?? {};
}

export async function saveMissionMetaEntry(
  current: MissionMetaMap,
  missionId: string,
  meta: MissionMeta,
): Promise<MissionMetaMap> {
  const updated = { ...current, [missionId]: meta };
  await pushAgencySetting(META_KEY, updated);
  return updated;
}

export async function removeMissionMetaEntry(
  current: MissionMetaMap,
  missionId: string,
): Promise<MissionMetaMap> {
  const updated = { ...current };
  delete updated[missionId];
  await pushAgencySetting(META_KEY, updated);
  return updated;
}
