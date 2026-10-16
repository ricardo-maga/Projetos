import { describe, expect, it } from 'bun:test';
import { buildReport, REPORT_CATALOG } from '../lib/reports';

const project: any = { id: 'p1', title: 'Linha A', clientId: 'c1', scheduledDate: '2026-10-03', deleted: false };
const task = (extra = {}): any => ({ id: 't1', projectId: 'p1', title: 'Instalação', priorityId: 'critical', statusId: 'open', estimatedDate: '2026-10-01', estimatedHours: '8', actualHours: '6', assigneeIds: ['u1', 'u2'], deleted: false, ...extra });
const input = (extra: any = {}) => ({
  projects: [project], tasks: [task()], projectMaterials: [], clients: [{ id: 'c1', clientName: 'Cliente A' }], users: [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bruno' }],
  projectPriorities: [{ id: 'critical', name: 'Urgente', scale: 3, deleted: false }], taskStatuses: [{ id: 'open', scale: 1 }], now: new Date(2026, 9, 7), ...extra,
});

describe('Reports catalog', () => {
  it('keeps only non-stock materials whose expected delivery is overdue', () => {
    const report: any = buildReport('overdue-materials', input({ projectMaterials: [
      { id: 'late', projectId: 'p1', description: 'Motor', status: 'encomendado', expectedDeliveryDate: '2026-10-01' },
      { id: 'stock', projectId: 'p1', description: 'Parafuso', status: 'em_stock', expectedDeliveryDate: '2026-10-01' },
      { id: 'future', projectId: 'p1', description: 'Sensor', status: 'encomendado', expectedDeliveryDate: '2026-10-08' },
      { id: 'undated', projectId: 'p1', description: 'Bomba', status: 'encomendado' },
    ] }));
    expect(report.details.map((row: any) => row.id)).toEqual(['late']);
  });
  it('keeps only the two requested reports', () => {
    expect(REPORT_CATALOG.map(item => item.id)).toEqual(['overdue-materials', 'critical-open-tasks']);
  });
  it('includes critical open tasks with or without a project or date', () => {
    const report = buildReport('critical-open-tasks', input({
      tasks: [task(), task({ id: 'not-critical', priorityId: undefined }), task({ id: 'done', statusId: 'done' }), task({ id: 'undated', estimatedDate: '' }), task({ id: 'future', estimatedDate: '2026-10-20', statusId: 'in-progress' }), task({ id: 'standalone', projectId: null })],
      taskStatuses: [{ id: 'open', scale: 1 }, { id: 'in-progress', scale: 2 }, { id: 'done', scale: 3 }],
    }));
    expect(report.details.map(row => row.id)).toEqual(['t1', 'undated', 'future', 'standalone']);
    expect(report.details.find(row => row.id === 'standalone')?.secondary).toBe('Sem projeto');
  });
  it('returns no critical tasks when their priority has not been assigned', () => {
    expect(buildReport('critical-open-tasks', input({ tasks: [task({ priorityId: undefined })] })).total).toBe(0);
  });
});
