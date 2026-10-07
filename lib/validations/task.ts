import { z } from 'zod';

const optionalDateField = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && typeof v === 'string' && v.trim() ? v.trim() : null));

/**
 * Normalizes a projectId field:
 * - undefined => undefined
 * - null => null
 * - '' => null
 * - string UUID => trimmed UUID string
 */
const optionalNullableProjectId = z
  .string()
  .nullable()
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    const trimmed = typeof val === 'string' ? val.trim() : '';
    return trimmed === '' ? null : trimmed;
  });

export const createTaskSchema = z.object({
  projectId: optionalNullableProjectId.default(null),
  title: z.string().trim().min(2, 'O título da tarefa deve ter no mínimo 2 caracteres'),
  description: z.string().optional().default(''),
  statusId: z.string().optional(),
  taskTypeId: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === '' ? null : val)),
  priorityId: z.string().nullable().optional().transform((val) => (val === '' ? null : val)),
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
}).refine(
  (data) => {
    if (data.startTime && data.endTime) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  {
    message: 'A hora de fim deve ser posterior à hora de início.',
    path: ['endTime'],
  }
).refine(
  (data) => {
    if (data.startDate && !data.endDate) {
      return false;
    }
    return true;
  },
  {
    message: 'A data de fim é obrigatória se a data de início estiver preenchida.',
    path: ['endDate'],
  }
).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.endDate >= data.startDate;
    }
    return true;
  },
  {
    message: 'A data de fim não pode ser anterior à data de início.',
    path: ['endDate'],
  }
);

export const updateTaskSchema = z.object({
  projectId: optionalNullableProjectId,
  title: z.string().trim().min(2, 'O título da tarefa deve ter no mínimo 2 caracteres').optional(),
  description: z.string().optional(),
  statusId: z.string().optional(),
  taskTypeId: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === '' ? null : val)),
  estimatedHours: z.number().nonnegative().optional(),
  actualHours: z.number().nonnegative().optional(),
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
    .transform((ids) => (ids ? ids.filter((id) => Boolean(id && id.trim())) : undefined)),
  version: z.number().int().min(1, 'A versão da tarefa deve ser um número inteiro superior a 0').optional(),
}).refine(
  (data) => {
    if (data.startTime && data.endTime) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  {
    message: 'A hora de fim deve ser posterior à hora de início.',
    path: ['endTime'],
  }
).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.endDate >= data.startDate;
    }
    return true;
  },
  {
    message: 'A data de fim não pode ser anterior à data de início.',
    path: ['endDate'],
  }
);

export const queryTaskSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional().default(''),
  projectId: z.string().optional(),
  statusId: z.string().optional(),
  taskTypeId: z.string().optional(),
  userId: z.string().optional(),
});

