/**
 * templateMeta — stores per-template default settings (feeIDR, targetMode, targetAgentIds)
 * in agency_settings under key "template_meta".
 *
 * This lets owners save their preferred fee and target audience once on a template,
 * so daily injection becomes a single click.
 */

import { pullAgencySetting, pushAgencySetting } from "./settingsSync";

export interface TemplateMeta {
  feeIDR: number;
  targetMode: "all" | "specific";
  targetAgentIds: string[];
}

export type TemplateMetaMap = Record<string, TemplateMeta>;

const META_KEY = "template_meta";

export async function pullTemplateMeta(): Promise<TemplateMetaMap> {
  const data = await pullAgencySetting<TemplateMetaMap>(META_KEY);
  return data ?? {};
}

export async function saveTemplateMetaEntry(
  current: TemplateMetaMap,
  templateId: string,
  meta: TemplateMeta,
): Promise<TemplateMetaMap> {
  const updated = { ...current, [templateId]: meta };
  await pushAgencySetting(META_KEY, updated);
  return updated;
}

export async function removeTemplateMetaEntry(
  current: TemplateMetaMap,
  templateId: string,
): Promise<TemplateMetaMap> {
  const updated = { ...current };
  delete updated[templateId];
  await pushAgencySetting(META_KEY, updated);
  return updated;
}
