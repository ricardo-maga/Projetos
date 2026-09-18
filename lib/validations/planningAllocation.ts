import { z } from 'zod';

export const planningAllocationStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']);

export type PlanningAllocationStatus = z.infer<typeof planningAllocationStatusSchema>;

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const createPlanningAllocationSchema = z
  .object({
    task_id: z.string().uuid('ID de tarefa inválido (deve ser UUID)').optional(),
    taskId: z.string().uuid('ID de tarefa inválido (deve ser UUID)').optional(),
    resource_id: z.string().uuid('ID de recurso inválido (deve ser UUID)').optional(),
    resourceId: z.string().uuid('ID de recurso inválido (deve ser UUID)').optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (deve ser AAAA-MM-DD)'),
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora inicial inválido (deve ser HH:mm)')
      .optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora inicial inválido (deve ser HH:mm)')
      .optional(),
    end_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora final inválido (deve ser HH:mm)')
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora final inválido (deve ser HH:mm)')
      .optional(),
    status: planningAllocationStatusSchema.optional().default('DRAFT'),
    override_work_schedule: z.boolean().optional().default(false),
  })
  .transform((data) => {
    const finalTaskId = data.task_id || data.taskId;
    const finalResourceId = data.resource_id || data.resourceId;
    const finalStartTime = data.start_time || data.startTime;
    const finalEndTime = data.end_time || data.endTime;

    return {
      taskId: finalTaskId!,
      resourceId: finalResourceId!,
      date: data.date,
      startTime: finalStartTime!,
      endTime: finalEndTime!,
      status: data.status,
      overrideWorkSchedule: data.override_work_schedule,
    };
  })
  .refine((data) => !!data.taskId, {
    message: 'O campo task_id é obrigatório.',
    path: ['task_id'],
  })
  .refine((data) => !!data.resourceId, {
    message: 'O campo resource_id é obrigatório.',
    path: ['resource_id'],
  })
  .refine((data) => !!data.startTime, {
    message: 'O campo start_time é obrigatório.',
    path: ['start_time'],
  })
  .refine((data) => !!data.endTime, {
    message: 'O campo end_time é obrigatório.',
    path: ['end_time'],
  })
  .refine(
    (data) => {
      const startMin = parseTimeToMinutes(data.startTime);
      const endMin = parseTimeToMinutes(data.endTime);
      return startMin < endMin;
    },
    {
      message: 'A hora de início deve ser anterior à hora de fim e a alocação não pode atravessar a meia-noite.',
      path: ['end_time'],
    }
  )
  .refine(
    (data) => {
      const startMin = parseTimeToMinutes(data.startTime);
      const endMin = parseTimeToMinutes(data.endTime);
      return endMin - startMin >= 15;
    },
    {
      message: 'A duração mínima de uma alocação é de 15 minutos.',
      path: ['end_time'],
    }
  );

export const updatePlanningAllocationSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (deve ser AAAA-MM-DD)').optional(),
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora inicial inválido (deve ser HH:mm)')
      .optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora inicial inválido (deve ser HH:mm)')
      .optional(),
    end_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora final inválido (deve ser HH:mm)')
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Formato de hora final inválido (deve ser HH:mm)')
      .optional(),
    status: planningAllocationStatusSchema.optional(),
    version: z.number().int().min(1, 'O campo version é obrigatório para controlo de concorrência'),
    override_work_schedule: z.boolean().optional(),
    overrideWorkSchedule: z.boolean().optional(),
    // Forbidden fields
    id: z.any().optional(),
    task_id: z.any().optional(),
    taskId: z.any().optional(),
    created_at: z.any().optional(),
  })
  .transform((data) => {
    return {
      date: data.date,
      startTime: data.start_time || data.startTime,
      endTime: data.end_time || data.endTime,
      status: data.status,
      version: data.version,
      overrideWorkSchedule: data.override_work_schedule ?? data.overrideWorkSchedule,
      hasIdAttempt: data.id !== undefined,
      hasTaskIdAttempt: (data.task_id !== undefined && data.task_id !== null) || (data.taskId !== undefined && data.taskId !== null),
      hasCreatedAtAttempt: data.created_at !== undefined,
    };
  })
  .refine((data) => !data.hasTaskIdAttempt, {
    message: 'Não é permitido alterar o task_id de uma alocação existente.',
    path: ['task_id'],
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        const startMin = parseTimeToMinutes(data.startTime);
        const endMin = parseTimeToMinutes(data.endTime);
        return startMin < endMin;
      }
      return true;
    },
    {
      message: 'A hora de início deve ser anterior à hora de fim e a alocação não pode atravessar a meia-noite.',
      path: ['end_time'],
    }
  )
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        const startMin = parseTimeToMinutes(data.startTime);
        const endMin = parseTimeToMinutes(data.endTime);
        return endMin - startMin >= 15;
      }
      return true;
    },
    {
      message: 'A duração mínima de uma alocação é de 15 minutos.',
      path: ['end_time'],
    }
  );

export const queryPlanningAllocationSchema = z.object({
  task_id: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  resource_id: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: planningAllocationStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});
