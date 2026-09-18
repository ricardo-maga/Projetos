import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Helper to get today's civil date in Europe/Lisbon
export function getTodayLisbon(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export const queryCapacitySchema = z
  .object({
    resource_id: z.string().uuid('ID de recurso inválido (deve ser UUID)').optional(),
    resourceId: z.string().uuid('ID de recurso inválido (deve ser UUID)').optional(),
    date: z.string().regex(dateRegex, 'Data deve estar no formato YYYY-MM-DD').optional(),
    date_from: z.string().regex(dateRegex, 'Data inicial deve estar no formato YYYY-MM-DD').optional(),
    dateFrom: z.string().regex(dateRegex, 'Data inicial deve estar no formato YYYY-MM-DD').optional(),
    date_to: z.string().regex(dateRegex, 'Data final deve estar no formato YYYY-MM-DD').optional(),
    dateTo: z.string().regex(dateRegex, 'Data final deve estar no formato YYYY-MM-DD').optional(),
  })
  .transform((data) => {
    const resourceId = data.resource_id || data.resourceId;
    let dateFrom = data.date_from || data.dateFrom;
    let dateTo = data.date_to || data.dateTo;

    if (data.date) {
      dateFrom = dateFrom || data.date;
      dateTo = dateTo || data.date;
    }

    const today = getTodayLisbon();
    if (!dateFrom && !dateTo) {
      dateFrom = today;
      dateTo = today;
    } else if (dateFrom && !dateTo) {
      dateTo = dateFrom;
    } else if (!dateFrom && dateTo) {
      dateFrom = dateTo;
    }

    return {
      resourceId,
      dateFrom: dateFrom!,
      dateTo: dateTo!,
    };
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'A data inicial (date_from) não pode ser superior à data final (date_to)',
    path: ['dateFrom'],
  });

export const queryAvailabilitySchema = z
  .object({
    resource_id: z.string().uuid('ID de recurso é obrigatório e deve ser UUID').optional(),
    resourceId: z.string().uuid('ID de recurso é obrigatório e deve ser UUID').optional(),
    duration_minutes: z.coerce
      .number()
      .int('Duração deve ser um número inteiro')
      .min(15, 'Duração mínima para pesquisa de disponibilidade é de 15 minutos')
      .optional(),
    durationMinutes: z.coerce
      .number()
      .int('Duração deve ser um número inteiro')
      .min(15, 'Duração mínima para pesquisa de disponibilidade é de 15 minutos')
      .optional(),
    date: z.string().regex(dateRegex, 'Data deve estar no formato YYYY-MM-DD').optional(),
    date_from: z.string().regex(dateRegex, 'Data inicial deve estar no formato YYYY-MM-DD').optional(),
    dateFrom: z.string().regex(dateRegex, 'Data inicial deve estar no formato YYYY-MM-DD').optional(),
    date_to: z.string().regex(dateRegex, 'Data final deve estar no formato YYYY-MM-DD').optional(),
    dateTo: z.string().regex(dateRegex, 'Data final deve estar no formato YYYY-MM-DD').optional(),
    step_minutes: z.coerce.number().int().min(15).max(120).optional(),
    stepMinutes: z.coerce.number().int().min(15).max(120).optional(),
  })
  .refine((data) => !!(data.resource_id || data.resourceId), {
    message: 'O parâmetro resource_id é obrigatório para consulta de disponibilidade',
    path: ['resource_id'],
  })
  .refine((data) => (data.duration_minutes !== undefined ? data.duration_minutes >= 15 : data.durationMinutes !== undefined ? data.durationMinutes >= 15 : false), {
    message: 'O parâmetro duration_minutes é obrigatório e deve ter no mínimo 15 minutos',
    path: ['duration_minutes'],
  })
  .transform((data) => {
    const resourceId = (data.resource_id || data.resourceId)!;
    const durationMinutes = (data.duration_minutes ?? data.durationMinutes)!;
    const stepMinutes = data.step_minutes ?? data.stepMinutes ?? 30;

    let dateFrom = data.date_from || data.dateFrom;
    let dateTo = data.date_to || data.dateTo;

    if (data.date) {
      dateFrom = dateFrom || data.date;
      dateTo = dateTo || data.date;
    }

    const today = getTodayLisbon();
    if (!dateFrom && !dateTo) {
      dateFrom = today;
      dateTo = today;
    } else if (dateFrom && !dateTo) {
      dateTo = dateFrom;
    } else if (!dateFrom && dateTo) {
      dateFrom = dateTo;
    }

    return {
      resourceId,
      durationMinutes,
      stepMinutes,
      dateFrom: dateFrom!,
      dateTo: dateTo!,
    };
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'A data inicial (date_from) não pode ser superior à data final (date_to)',
    path: ['dateFrom'],
  });

export const queryResourceLoadSchema = queryCapacitySchema;
