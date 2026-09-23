import { z } from 'zod';

const optionalDateField = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && typeof v === 'string' && v.trim() ? v.trim() : null));

export const createTaskSchema = z.object({
  projectId: z.string().trim().min(1, 'O ID de projeto é obrigatório'),
  title: z.string().trim().min(2, 'O título da tarefa deve ter no mínimo 2 caracteres'),
  description: z.string().optional().default(''),
  statusId: z.string().optional(),
  taskTypeId: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === '' ? null : val)),
  estimatedHours: z.number().nonnegative().optional().default(0),
  actualHours: z.number().nonnegative().optional().default(0),
  startDate: optionalDateField,
  startTime: optionalDateField,
  endDate: optionalDateField,
  endTime: optionalDateField,
  estimatedDate: optionalDateField,
  completedDate: optionalDateField,
  notes: z.string().optional(),
  assignedUserIds: z
    .array(z.string())
    .optional()
    .default([])
    .transform((ids) => ids.filter((id) => Boolean(id && id.trim()))),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  version: z.number().int().min(1, 'A versão da tarefa deve ser um número inteiro superior a 0').optional(),
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
