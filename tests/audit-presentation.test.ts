import { expect, it } from 'bun:test';
import { auditActionCategory, auditEntityCategory } from '../domains/administration/modules/auditPresentation';

it('categorizes canonical server events alongside historical actions without treating client reports as server writes', () => {
  expect(['CREATE', 'CLIENT_CREATED', 'PROJECT_CREATED'].map(auditActionCategory)).toEqual(['CREATE', 'CREATE', 'CREATE']);
  expect(auditActionCategory('TASK_STATUS_CHANGED')).toBe('UPDATE');
  expect(auditActionCategory('CLIENT_DELETED')).toBe('DELETE');
  expect(auditActionCategory('CLIENT_EVENT')).toBe('CLIENT_EVENT');
  expect(auditActionCategory('LOGIN')).toBe('LOGIN');
});

it('matches server table names to the entity filters used by the UI', () => {
  expect(['projects', 'PROJECT', 'tasks', 'clients', 'users', 'project_risk_items'].map(auditEntityCategory)).toEqual(['PROJECT', 'PROJECT', 'TASK', 'CLIENT', 'USER', 'RISK']);
  expect(auditEntityCategory('SYSTEM')).toBe('SYSTEM');
});
