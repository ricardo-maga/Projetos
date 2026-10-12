import { z } from 'zod';

const optionalText = z.string().optional();
const nullableText = z.string().nullable().optional();
const optionalRelation = z.string().nullable().optional();

export const createTicketSchema = z.object({
  title: z.string().trim().min(1),
  description: optionalText,
  source: optionalText,
  sourceDetails: optionalText,
  status: optionalText,
  priority: optionalText,
  category: optionalText,
  clientId: optionalRelation,
  requesterName: optionalText,
  requesterEmail: optionalText,
  requesterPhone: optionalText,
  assignedToId: optionalRelation,
  convertedProjectId: optionalRelation,
  projectId: optionalRelation,
});

export const updateTicketSchema = z.object({
  syncVersion: z.number().int().positive().optional(),
  title: z.string().trim().min(1).optional(),
  description: nullableText,
  source: optionalText,
  sourceDetails: nullableText,
  status: optionalText,
  statusId: optionalRelation,
  priority: optionalText,
  priorityId: optionalRelation,
  taskTypeId: optionalRelation,
  category: nullableText,
  clientId: optionalRelation,
  requesterName: nullableText,
  requesterEmail: nullableText,
  requesterPhone: nullableText,
  assignedToId: optionalRelation,
  convertedProjectId: optionalRelation,
  projectId: optionalRelation,
  convertedTaskId: optionalRelation,
  resolutionNotes: nullableText,
  validationNotes: nullableText,
  resolvedDate: nullableText,
});

export const createProjectMaterialSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().min(1),
  supplier: z.string().trim().min(1),
  quantity: z.coerce.number().finite().positive().optional(),
  reference: optionalText,
  budget: z.union([z.string(), z.number().finite()]).optional(),
  costPrice: z.coerce.number().finite().optional(),
  salePrice: z.coerce.number().finite().optional(),
  expectedDeliveryDate: optionalText,
  status: optionalText,
});

export const updateProjectMaterialSchema = createProjectMaterialSchema.partial().extend({
  syncVersion: z.number().int().positive().optional(),
});
