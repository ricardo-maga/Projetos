import { z } from 'zod';

export const referenceCollection = z.enum([
  'projectStatuses', 'projectCategories', 'projectRisks', 'projectPriorities',
  'projectTeams', 'projectPartners', 'taskStatuses', 'taskTypes',
  'riskCategories', 'riskStatuses', 'riskPriorities',
]);
export type ReferenceCollection = z.infer<typeof referenceCollection>;
export const referenceTables: Record<ReferenceCollection, string> = {
  projectStatuses: 'project_status', projectCategories: 'project_category',
  projectRisks: 'project_risk', projectPriorities: 'project_priority',
  projectTeams: 'project_teams', projectPartners: 'project_partners',
  taskStatuses: 'task_status', taskTypes: 'task_types',
  riskCategories: 'risk_categories', riskStatuses: 'risk_statuses', riskPriorities: 'risk_priorities',
};
export const scaledCollections = new Set<ReferenceCollection>([
  'projectStatuses', 'projectRisks', 'projectPriorities', 'taskStatuses', 'taskTypes', 'riskStatuses', 'riskPriorities',
]);
export const coloredCollections = new Set<ReferenceCollection>([
  'projectStatuses', 'projectRisks', 'projectPriorities', 'taskStatuses', 'riskStatuses', 'riskPriorities',
]);
export const referenceFields = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  scale: z.number().int().min(0).max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict();

export function referencePayload(collection: ReferenceCollection, fields: z.infer<typeof referenceFields>) {
  return {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(scaledCollections.has(collection) && fields.scale !== undefined ? { scale: fields.scale } : {}),
    ...(coloredCollections.has(collection) && fields.color !== undefined ? { color: fields.color } : {}),
  };
}
