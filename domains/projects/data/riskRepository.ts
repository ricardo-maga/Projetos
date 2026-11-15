import { z } from 'zod';

const optionalId = z.union([z.guid(), z.literal('')]);
export const riskInput = z.object({
  projectId: z.guid(), title: z.string().trim().min(1).max(500),
  categoryId: optionalId.default(''), identificationDate: z.iso.date(), ownerId: optionalId.default(''),
  description: z.string().max(10000).default(''), consequence: z.string().max(10000).default(''),
  probability: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5),
  mitigationPlan: z.string().max(10000).default(''), contingencyPlan: z.string().max(10000).default(''),
  reviewDate: z.union([z.iso.date(), z.literal('')]).default(''),
  statusId: optionalId.default(''), priorityId: optionalId.default(''),
});

export function mapRisk(row: any) {
  return {
    id: row.id, projectId: row.project_id, title: row.title,
    categoryId: row.category_id || '', identificationDate: row.identification_date,
    ownerId: row.owner_id || '', description: row.description || '', consequence: row.consequence || '',
    probability: row.probability, impact: row.impact, mitigationPlan: row.mitigation_plan || '',
    contingencyPlan: row.contingency_plan || '', reviewDate: row.review_date || '',
    statusId: row.status_id || '', priorityId: row.priority_id || '',
    deleted: row.deleted === true, createdDate: row.created_at,
    syncVersion: Number(row.sync_version) || 1,
  };
}

export function riskPayload(value: z.infer<typeof riskInput>) {
  return {
    project_id: value.projectId, title: value.title, category_id: value.categoryId || null,
    identification_date: value.identificationDate, owner_id: value.ownerId || null,
    description: value.description || null, consequence: value.consequence || null,
    probability: value.probability, impact: value.impact,
    mitigation_plan: value.mitigationPlan || null, contingency_plan: value.contingencyPlan || null,
    review_date: value.reviewDate || null, status_id: value.statusId || null,
    priority_id: value.priorityId || null,
  };
}
