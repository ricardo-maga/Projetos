import { z } from 'zod';

const optionalText = z.string().max(2000).optional();

export const createProjectMaterialSchema = z.object({
  projectId: z.guid(),
  description: z.string().trim().min(1).max(2000),
  supplier: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().finite().positive().optional(),
  reference: optionalText,
  budget: z.union([z.string().max(100), z.number().finite()]).optional(),
  costPrice: z.coerce.number().finite().optional(),
  salePrice: z.coerce.number().finite().optional(),
  expectedDeliveryDate: optionalText,
  status: optionalText,
});

export const updateProjectMaterialSchema = createProjectMaterialSchema.partial().extend({
  syncVersion: z.number().int().positive().optional(),
});
