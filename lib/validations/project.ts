import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'O título do projeto é obrigatório').max(255, 'O título do projeto não pode ter mais de 255 caracteres'),
  clientId: z.string().optional().default(''),
  description: z.string().optional().default(''),
  installProjectNo: z.string().optional().default(''),
  sfOpportunityNo: z.string().optional().default(''),
  statusId: z.string().optional().default(''),
  categoryId: z.string().optional().default(''),
  categoryIds: z.array(z.string().trim()).optional().default([]),
  priorityId: z.string().optional().default(''),
  riskId: z.string().optional().default(''),
  projectManagerId: z.string().optional().nullable().default(''),
  fieldManagerId: z.string().optional().nullable().default(''),
  salesRepId: z.string().optional().nullable().default(''),
  teamIds: z.array(z.string().trim()).optional().default([]),
  teamsInvolvedIds: z.array(z.string().trim()).optional().default([]),
  partnerIds: z.array(z.string().trim()).optional().default([]),
  partnersIds: z.array(z.string().trim()).optional().default([]),
  startDate: z.string().optional().default(''),
  deliveryDate: z.string().optional().default(''),
  estimatedDate: z.string().optional().default(''),
  scheduledDate: z.string().optional().default(''),
  completedDate: z.string().optional().default(''),
  budgetValue: z.coerce.number().min(0, 'O orçamento do projeto não pode ser negativo').optional().default(0),
  isUrgent: z.boolean().optional().default(false),
  demo: z.boolean().optional().default(false),
  documents: z.array(z.string()).optional().default([]),
  clientContactName: z.string().optional().default(''),
  clientContactEmail: z.string().optional().default(''),
  clientContactPhone: z.string().optional().default(''),
  color: z.string().optional(),
  notes: z.string().optional(),
  createdById: z.string().optional(),
  version: z.number().int().min(1).optional().default(1),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  version: z.number().int().min(1, 'A versão do projeto deve ser um número inteiro superior a 0').optional(),
});

export const queryProjectSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional().default(''),
  statusId: z.string().optional(),
  categoryId: z.string().optional(),
  managerId: z.string().optional(),
  clientId: z.string().optional(),
  statusGroup: z.enum(['active', 'implementation', 'all', 'completed']).optional(),
});

