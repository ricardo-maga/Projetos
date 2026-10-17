import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAutomationRule } from '../lib/automation/validateRule.ts';
import { buildLegacySyncPayload } from '../lib/supabase/syncPayload.ts';

const state = {
  projectStatuses: [{ id: 'project-status', deleted: false }],
  taskStatuses: [{ id: 'task-status', deleted: false }],
};

const rule = (changes = {}) => ({
  id: 'rule-id', name: 'Avisar', enabled: true, triggerType: 'task_status_changed',
  triggerCondition: { toStatusId: 'task-status' },
  actions: [{ type: 'send_notification', params: { notificationTitle: 'Tarefa alterada' } }],
  createdDate: '2026-10-17T00:00:00Z', ...changes,
});

test('accepts supported task status notifications', () => {
  assert.equal(validateAutomationRule(rule(), state), null);
});

test('rejects retired quotes and unsupported action combinations', () => {
  assert.match(validateAutomationRule(rule({ triggerType: 'quote_approved' }), state), /descontinuado/);
  assert.match(validateAutomationRule(rule({ actions: [{ type: 'create_default_tasks' }] }), state), /não suportada/);
});

test('rejects missing target statuses and duplicate actions', () => {
  assert.match(validateAutomationRule(rule({ triggerCondition: { toStatusId: 'missing' } }), state), /estado do evento/);
  assert.match(validateAutomationRule(rule({ actions: [
    { type: 'send_notification', params: { notificationTitle: 'A' } },
    { type: 'send_notification', params: { notificationTitle: 'B' } },
  ] }), state), /repetição/);
});

test('requires a task status when an action changes project status', () => {
  const candidate = rule({ triggerCondition: undefined, actions: [
    { type: 'change_project_status', params: { targetStatusId: 'project-status' } },
  ] });
  assert.match(validateAutomationRule(candidate, state), /Escolha um estado da tarefa/);
});

test('permits tombstones for retired rules', () => {
  assert.equal(validateAutomationRule(rule({ deleted: true, triggerType: 'quote_approved' }), state), null);
});

test('sends a tombstone when deleting a persisted rule', () => {
  const previous = { automationRules: [rule()] };
  const next = { automationRules: [rule({ deleted: true, enabled: false })] };
  const payload = buildLegacySyncPayload(previous, next);
  assert.deepEqual(payload.automationRules, next.automationRules);
});
