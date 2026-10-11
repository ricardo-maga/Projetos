import { describe, expect, it } from 'bun:test';
import { buildReport } from '../lib/reports';

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
  it('identifies only open overdue tasks with task priority level 3', () => {
    const report: any = buildReport('critical-overdue-tasks', input({ tasks: [task(), task({ id: 'not-critical', priorityId: undefined }), task({ id: 'done', statusId: 'done' }), task({ id: 'undated', estimatedDate: '' })], taskStatuses: [{ id: 'open', scale: 1 }, { id: 'done', scale: 3 }] }));
    expect(report.details.map((row: any) => row.id)).toEqual(['t1']);
  });
  it('includes all scheduled months and task dates without a shared date range', () => {
    const deliveries: any = buildReport('scheduled-deliveries', input({ projects: [project, { ...project, id: 'p2', scheduledDate: '2025-01-03' }] }));
    const hours: any = buildReport('technician-hours', input({ tasks: [task(), task({ id: 'older', estimatedDate: '2025-01-01', estimatedHours: '2', actualHours: '1' }), task({ id: 'undated', estimatedDate: '', estimatedHours: '3', actualHours: '2' })] }));
    expect(deliveries.groups).toEqual([{ period: '2025-01', count: 1 }, { period: '2026-10', count: 1 }]);
    expect(hours.rows.map((row: any) => [row.name, row.estimated, row.actual])).toEqual([['Ana', 13, 9], ['Bruno', 13, 9]]);
  });
});
