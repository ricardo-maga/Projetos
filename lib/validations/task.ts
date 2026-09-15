import { z } from 'zod';

export const createTaskSchema = z.object({
  projectId: z.string().uuid('ID de projeto inválido (deve ser UUID)'),
  title: z.string().trim().min(2, 'O título da tarefa deve ter no mínimo 2 caracteres'),
  description: z.string().optional().default(''),
  statusId: z.string().optional(),
  taskTypeId: z.string().optional(),
  estimatedHours: z.number().nonnegative().optional().default(0),
  actualHours: z.number().nonnegative().optional().default(0),
  startDate: z.string().optional(),
  startTime: z.string().optional(),
  endDate: z.string().optional(),
  endTime: z.string().optional(),
  estimatedDate: z.string().optional(),
  completedDate: z.string().optional(),
  notes: z.string().optional(),
  assignedUserIds: z.array(z.string()).optional().default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  version: z.number().int().min(1, 'Número de versão obrigatório para controlo de concorrência'),
});

export const queryTaskSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional().default(''),
  projectId: z.string().optional(),
  statusId: z.string().optional(),
  taskTypeId: z.string().optional(),
  userId: z.string().optional(),
});
