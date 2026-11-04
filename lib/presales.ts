import { z } from 'zod';

const id = z.guid();
const date = z.iso.date();
const days = z.number().min(0.5).max(999).refine(value => Number.isInteger(value * 2));
export const presalesBlock = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('rich_text'), title: z.string().trim().min(1).max(200),
    content: z.string().max(30000) }),
  z.object({ id, type: z.literal('image'), title: z.string().trim().min(1).max(200),
    assetId: id, caption: z.string().max(500).default('') }),
  z.object({ id, type: z.literal('item_summary'), title: z.string().trim().min(1).max(200),
    itemIds: z.array(id).max(100), displayLabel: z.string().max(300).default('') }),
]);
export const presalesDocumentSchema = z.object({ schemaVersion: z.literal(1),
  blocks: z.array(presalesBlock).max(100) }).refine(value =>
  new Set(value.blocks.map(block => block.id)).size === value.blocks.length,
  { path: ['blocks'], message: 'Identificadores de secção repetidos.' });
export type PresalesDocument = z.infer<typeof presalesDocumentSchema>;

export const createPresalesSchema = z.object({
  title: z.string().trim().min(2).max(200), ownerId: id,
  plannedStartDate: date, plannedEndDate: date,
  requirements: z.string().max(10000).default(''), outcome: z.string().max(10000).default(''),
  commercialManagerId: id.nullable().default(null), projectManagerId: id.nullable().default(null),
  originCode: z.enum(['email','phone','whatsapp','in_person','other']).nullable().default(null),
  priorityId: id.nullable().default(null), opportunitySf: z.string().max(300).default(''),
}).refine(value => value.plannedEndDate > value.plannedStartDate, { path: ['plannedEndDate'] });
export const presalesActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), version: z.number().int().positive(),
    title: z.string().trim().min(2).max(200), plannedStartDate: date, plannedEndDate: date,
    requirements: z.string().max(10000), outcome: z.string().max(10000),
    commercialManagerId: id.nullable(), projectManagerId: id.nullable(),
    originCode: z.enum(['email','phone','whatsapp','in_person','other']).nullable(),
    priorityId: id.nullable(), opportunitySf: z.string().max(300) })
    .refine(value => value.plannedEndDate > value.plannedStartDate, { path: ['plannedEndDate'] }),
  z.object({ action: z.literal('accept'), version: z.number().int().positive(),
    assigneeIds: z.array(id).min(1).max(30), estimatedDays: days }),
  z.object({ action: z.enum(['suspend','resume','won','lost','publish','new_revision']), version: z.number().int().positive() }),
  z.object({ action: z.literal('add_task'), version: z.number().int().positive(),
    title: z.string().trim().min(2).max(200), description: z.string().max(10000).default(''),
    assigneeIds: z.array(id).min(1).max(30), estimatedDays: days.nullable().default(null) }),
  z.object({ action: z.literal('assign_task'), version: z.number().int().positive(), taskId: id,
    assigneeIds: z.array(id).min(1).max(30) }),
  z.object({ action: z.literal('task_action'), version: z.number().int().positive(), taskId: id,
    taskVersion: z.number().int().positive(), taskAction: z.enum(['start','block','resume','complete','reopen']),
    reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal('save_document'), version: z.number().int().positive(), document: presalesDocumentSchema }),
  z.object({ action: z.literal('save_item'), version: z.number().int().positive(), id: id.optional(),
    title: z.string().trim().min(1).max(300), unit: z.string().trim().min(1).max(30),
    quantity: z.number().positive().max(999999), unitPrice: z.number().min(0).max(999999999),
    groupLabel: z.string().max(100).default(''), sortOrder: z.number().int().min(0).max(10000).default(0) }),
  z.object({ action: z.literal('delete_item'), version: z.number().int().positive(), id }),
  z.object({ action: z.literal('link_project'), version: z.number().int().positive(), projectId: id }),
]);

export interface PresalesTask { id: string; title: string; description: string; statusId: string;
  version: number; assigneeIds: string[]; estimatedDays: number | null; isInitial: boolean }
export interface PresalesItem { id: string; title: string; unit: string; quantity: number; unitPrice: number;
  groupLabel: string; sortOrder: number; total: number }
export interface PresalesRevision { id: string; revisionNumber: number; publishedBy: string; publishedAt: string;
  documentSnapshot: PresalesDocument; itemsSnapshot: PresalesItem[]; contactsSnapshot: Record<string, unknown> }
export interface PresalesRequest {
  id: string; processNumber: number | null; title: string; status: 'submitted'|'accepted'|'suspended'|'won'|'lost';
  requesterId: string; ownerId: string; version: number; plannedStartDate: string; plannedEndDate: string;
  requirements: string; outcome: string; commercialManagerId: string|null; projectManagerId: string|null;
  originCode: string|null; priorityId: string|null; opportunitySf: string;
  clientId: string|null; description: string; startedOn: string|null; completedOn: string|null;
  potentialValue: number|null; saleDate: string|null; saleValue: number|null;
  executionProjectId: string|null; document: PresalesDocument; documentLocked: boolean;
  tasks: PresalesTask[]; items: PresalesItem[]; revisions: PresalesRevision[];
}
