import { expect, it } from 'bun:test';
import { auditActionCategory, auditEntityCategory } from '../domains/administration/modules/auditPresentation';
import { auditCsvCell, auditFilters, decodeAuditCursor } from '../domains/administration/modules/auditQuery';

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

it('protects CSV cells and validates audit cursors and date bounds', () => {
  expect(auditCsvCell('  =2+2')).toBe('"\'  =2+2"');
  expect(auditCsvCell('Uma "referência"')).toBe('"Uma ""referência"""');
  const cursor = ['2026-11-21T11:30:00.123456+00:00', '20000000-0000-4000-8000-000000000001'];
  expect(decodeAuditCursor(Buffer.from(JSON.stringify(cursor)).toString('base64url'))).toEqual(cursor);
  expect(decodeAuditCursor('malformed')).toBeNull();
  expect(auditFilters.safeParse({ from: '2026-11-21T00:00:00Z', to: '2026-11-20T00:00:00Z' }).success).toBe(false);
});
