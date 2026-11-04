import { z } from 'zod';
import type { SpecialDay } from '../types';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const name = z.string().trim().min(1).max(200);

export const createSpecialDaySchema = z.object({ date, name }).strict();
export const updateSpecialDaySchema = z.object({
  date: date.optional(), name: name.optional(), syncVersion: z.number().int().positive(),
}).strict();

export function mapSpecialDay(row: any): SpecialDay {
  return { id: row.id, date: row.date, name: row.name, syncVersion: Number(row.sync_version) || 1 };
}
