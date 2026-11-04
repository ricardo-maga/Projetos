import { z } from 'zod';
import type { DefaultTask } from '../types';

const hours = z.string().regex(/^\d{1,3}:[0-5]\d$/, 'A duração deve usar HH:MM.');

export const createDefaultTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  estimatedHours: hours,
  taskTypeId: z.string().uuid().nullable().optional(),
}).strict();

export const updateDefaultTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  estimatedHours: hours.optional(),
  taskTypeId: z.string().uuid().nullable().optional(),
  syncVersion: z.number().int().positive(),
}).strict();

export function mapDefaultTask(row: any): DefaultTask {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    estimatedHours: row.estimated_hours || '',
    taskTypeId: row.task_type_id || undefined,
    syncVersion: Number(row.sync_version) || 1,
  };
}
