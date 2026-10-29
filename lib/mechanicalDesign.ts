import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.iso.date();
const estimatedDays = z.number().min(0.5).max(999).refine(value => Number.isInteger(value * 2));
export const createDesignSchema = z.object({
  title: z.string().trim().min(2).max(200),
  ownerId: uuid,
  projectId: uuid.nullable().optional(),
  plannedStartDate: date,
  plannedEndDate: date,
  instructions: z.string().max(10000).default(''),
  deliverables: z.string().max(10000).default(''),
}).refine(value => value.plannedEndDate >= value.plannedStartDate, { path: ['plannedEndDate'] });
export const manageDesignSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), version: z.number().int().positive(), assigneeIds: z.array(uuid).min(1), estimatedDays }),
  z.object({ action: z.literal('reject'), version: z.number().int().positive() }),
  z.object({ action: z.literal('edit'), version: z.number().int().positive(), instructions: z.string().max(10000),
    deliverables: z.string().max(10000), fileIdentifier: z.string().max(300), fileRevision: z.string().max(100),
    plannedStartDate: date, plannedEndDate: date }).refine(value => value.plannedEndDate >= value.plannedStartDate, { path: ['plannedEndDate'] }),
  z.object({ action: z.literal('deliver'), version: z.number().int().positive() }),
  z.object({ action: z.literal('file'), version: z.number().int().positive(),
    fileIdentifier: z.string().trim().min(1).max(300), fileRevision: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal('add_task'), version: z.number().int().positive(), title: z.string().trim().min(2).max(200),
    description: z.string().max(10000).default(''), assigneeIds: z.array(uuid).min(1), estimatedDays }),
  z.object({ action: z.literal('assign_task'), version: z.number().int().positive(), taskId: uuid,
    assigneeIds: z.array(uuid).min(1) }),
  z.object({ action: z.enum(['start','block','resume','complete','reopen']), taskId: uuid,
    taskVersion: z.number().int().positive(), reason: z.string().max(1000).optional() }),
]);

export const TASK_STATUS = {
  pending: '99999999-9999-9999-9999-999999999901',
  progress: '99999999-9999-9999-9999-999999999902',
  complete: '99999999-9999-9999-9999-999999999903',
  blocked: '99999999-9999-9999-9999-999999999904',
} as const;

export interface DesignTask {
  id: string; title: string; description: string; statusId: string; version: number;
  assigneeIds: string[]; isInitial: boolean; estimatedDays: number | null;
}
export interface DesignRequest {
  id: string; title: string; status: 'submitted' | 'accepted' | 'rejected' | 'delivered';
  requesterId: string; ownerId: string; projectId: string | null; version: number;
  plannedStartDate: string; plannedEndDate: string;
  createdAt: string; deliveredAt: string | null; deliveredBy: string | null;
  instructions: string; deliverables: string; fileIdentifier: string; fileRevision: string;
  tasks: DesignTask[];
  events: { action: string; actorId: string; occurredAt: string; taskId?: string }[];
}

export function mapDesignRows(requests: any[], details: any[], links: any[], tasks: any[], assignees: any[],
  requestEvents: any[] = [], taskEvents: any[] = []): DesignRequest[] {
  const detailMap = new Map(details.map(row => [row.request_id, row]));
  const taskMap = new Map(tasks.map(row => [row.id, row]));
  const assigneeMap = new Map<string, string[]>();
  for (const row of assignees) assigneeMap.set(row.task_id, [...(assigneeMap.get(row.task_id) || []), row.user_id]);
  const linkMap = new Map<string, DesignTask[]>();
  for (const link of links) {
    const task = taskMap.get(link.task_id);
    if (!task) continue;
    const current = linkMap.get(link.request_id) || [];
    current.push({ id: task.id, title: task.task_title, description: task.task_description || '',
      statusId: task.status_id, version: task.version, assigneeIds: assigneeMap.get(task.id) || [],
      isInitial: Boolean(link.is_initial), estimatedDays: link.estimated_days === null ? null : Number(link.estimated_days) });
    linkMap.set(link.request_id, current);
  }
  return requests.map(row => {
    const detail = detailMap.get(row.id) || {};
    return { id: row.id, title: row.title, status: row.status, requesterId: row.requester_id,
      ownerId: row.area_owner_id, projectId: row.project_id, version: row.version,
      plannedStartDate: row.planned_start_date || '', plannedEndDate: row.planned_end_date || '',
      createdAt: row.created_at, deliveredAt: row.delivered_at, deliveredBy: row.delivered_by,
      instructions: detail.instructions || '', deliverables: detail.deliverables || '',
      fileIdentifier: detail.file_identifier || '', fileRevision: detail.file_revision || '',
      tasks: linkMap.get(row.id) || [], events: [
        ...requestEvents.filter(event => event.request_id === row.id).map(event => ({ action: event.action,
          actorId: event.actor_id, occurredAt: event.occurred_at })),
        ...taskEvents.filter(event => event.request_id === row.id).map(event => ({ action: event.action,
          actorId: event.actor_id, occurredAt: event.occurred_at, taskId: event.task_id })),
      ].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)) };
  });
}
