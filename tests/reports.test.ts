import { describe, expect, it } from 'bun:test';
import { buildReport } from '../lib/reports';

const project: any = { id: 'p1', title: 'Linha A', clientId: 'c1', scheduledDate: '2026-10-03', deleted: false };
const task = (extra = {}): any => ({ id: 't1', projectId: 'p1', title: 'Instalação', priorityId: 'critical', statusId: 'open', estimatedDate: '2026-10-01', estimatedHours: '8', actualHours: '6', assigneeIds: ['u1', 'u2'], deleted: false, ...extra });
const input = (extra: any = {}) => ({
  projects: [project], tasks: [task()], projectMaterials: [], clients: [{ id: 'c1', clientName: 'Cliente A' }], users: [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bruno' }],
  projectPriorities: [{ id: 'critical', name: 'Urgente', scale: 3, deleted: false }], taskStatuses: [{ id: 'open', scale: 1 }], range: { from: '2026-10-01', to: '2026-10-31' }, now: new Date(2026, 9, 7), ...extra,
});

describe('Reports catalog', () => {
  it('keeps only non-stock materials whose expected delivery is overdue', () => {
    const report: any = buildReport('overdue-materials', input({ projectMaterials: [
      { id: 'late', projectId: 'p1', description: 'Motor', status: 'encomendado', expectedDeliveryDate: '2026-10-01' },
      { id: 'stock', projectId: 'p1', description: 'Parafuso', status: 'em_stock', expectedDeliveryDate: '2026-10-01' },
      { id: 'future', projectId: 'p1', description: 'Sensor', status: 'encomendado', expectedDeliveryDate: '2026-10-08' },
    ] }));
    expect(report.details.map((row: any) => row.id)).toEqual(['late']);
  });
  it('identifies only open overdue tasks with task priority level 3', () => {
    const report: any = buildReport('critical-overdue-tasks', input({ tasks: [task(), task({ id: 'not-critical', priorityId: undefined }), task({ id: 'done', statusId: 'done' })], taskStatuses: [{ id: 'open', scale: 1 }, { id: 'done', scale: 3 }] }));
    expect(report.details.map((row: any) => row.id)).toEqual(['t1']);
  });
  it('groups scheduled deliveries and duplicates assigned hours for each technician', () => {
    const deliveries: any = buildReport('scheduled-deliveries', input());
    const hours: any = buildReport('technician-hours', input());
    expect(deliveries.groups).toEqual([{ period: '2026-10', count: 1 }]);
    expect(hours.rows.map((row: any) => [row.name, row.estimated, row.actual])).toEqual([['Ana', 8, 6], ['Bruno', 8, 6]]);
  });
});

