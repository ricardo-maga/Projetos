import { z } from 'zod';
import type { AutomationRule, ERPState } from '@/lib/types';
import { validateAutomationRule } from '../modules/validateRule';

export const ruleInput = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(),
  enabled: z.boolean(),
  triggerType: z.enum(['project_status_changed', 'task_status_changed', 'task_created', 'presales_created', 'presales_status_changed']),
  triggerCondition: z.object({
    fromStatusId: z.string().optional(), toStatusId: z.string().optional(),
    toPresalesStatus: z.enum(['submitted', 'accepted', 'suspended', 'won', 'lost']).optional(),
  }).optional(),
  actions: z.array(z.object({
    type: z.enum(['create_default_tasks', 'change_project_status', 'send_notification']),
    params: z.object({ targetStatusId: z.string().optional(), notificationTitle: z.string().optional(), notificationMessage: z.string().optional() }).optional(),
  })).min(1),
});

export function mapRule(row: any): AutomationRule {
  return { id: row.id, name: row.name, description: row.description || '',
    enabled: row.enabled !== false, triggerType: row.trigger_type,
    triggerCondition: row.trigger_condition || {}, actions: row.actions || [],
    deleted: row.deleted === true, createdDate: row.created_at,
    syncVersion: Number(row.sync_version) || 1 };
}

export function rulePayload(rule: z.infer<typeof ruleInput>) {
  return { name: rule.name, description: rule.description || null, enabled: rule.enabled,
    trigger_type: rule.triggerType, trigger_condition: rule.triggerCondition || {}, actions: rule.actions };
}

export async function validateAgainstStatuses(db: any, rule: z.infer<typeof ruleInput>): Promise<string | null> {
  const [projects, tasks] = await Promise.all([
    db.from('project_status').select('id,deleted'), db.from('task_status').select('id,deleted'),
  ]);
  if (projects.error || tasks.error) throw projects.error || tasks.error;
  const state = { projectStatuses: projects.data || [], taskStatuses: tasks.data || [] } as Pick<ERPState, 'projectStatuses' | 'taskStatuses'>;
  return validateAutomationRule(rule as AutomationRule, state);
}
