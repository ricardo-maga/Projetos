import { z } from 'zod';

const optionalText = z.string().optional();
const nullableText = z.string().nullable().optional();
const optionalRelation = z.string().nullable().optional();

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
