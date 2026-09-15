import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().trim().min(2, 'O título do projeto deve ter no mínimo 2 caracteres'),
  clientId: z.string().uuid('ID de cliente inválido (deve ser UUID)'),
  description: z.string().optional().default(''),
  installProjectNo: z.string().optional().default(''),
  statusId: z.string().optional(),
  categoryId: z.string().optional(),
  categoryIds: z.array(z.string()).optional(),
  priorityId: z.string().optional(),
  riskId: z.string().optional(),
  projectManagerId: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  partnerIds: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
  isUrgent: z.boolean().optional().default(false),
  color: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  version: z.number().int().min(1, 'Número de versão obrigatório para controlo de concorrência'),
});

export const queryProjectSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional().default(''),
  statusId: z.string().optional(),
  categoryId: z.string().optional(),
  managerId: z.string().optional(),
  clientId: z.string().optional(),
});
