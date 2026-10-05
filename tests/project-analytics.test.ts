import { describe, expect, it } from 'bun:test';
import { buildProjectAnalytics } from '../lib/projectAnalytics';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAnalytics from '../components/ProjectAnalytics';
const now = new Date(2026, 9, 5, 12);
const statuses = [{ id: 'active', scale: 3 }, { id: 'done', scale: 5 }];
const p = (id: string, createdDate: string, extra = {}) => ({ id, createdDate, statusId: 'active', deliveryDate: '2026-10-04', categoryId: 'cat', projectManagerId: 'manager', salesRepId: 'sales', deleted: false, ...extra }) as any;
describe('Project analytics', () => {
  it('defaults to 30 days and identifies missing-material projects by client, title and IP', () => {
    const html = renderToStaticMarkup(React.createElement(ProjectAnalytics, {
      projects: [p('old', '2025-01-01', { clientId: 'client', title: 'Linha de produção', installProjectNo: 'IP-123' })],
      projectStatuses: statuses, categories: [], users: [], clients: [{ id: 'client', clientName: 'Brasmar' } as any],
      materials: [{ projectId: 'old', status: 'por_encomendar' } as any], onSelectProject: () => {},
    }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?30 dias/);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Brasmar');
    expect(html).toContain('Linha de produção');
    expect(html).toContain('IP-123');
    expect(html).not.toContain('Sem projetos com material em falta/atraso');
  });
  it('counts monthly awards by start date and sums sale values independently of the window', () => {
    const projects = [
      p('current', '2026-01-01', { startDate: '2026-10-01', budgetValue: 100.5 }),
      p('current-local', '2026-01-01', { startDate: '31/10/2026', budgetValue: '200' }),
      p('previous', '2026-01-01', { startDate: '2026-09-30T12:00:00Z', budgetValue: 50 }),
      p('deleted', '2026-10-01', { startDate: '2026-10-01', budgetValue: 999, deleted: true }),
      p('missing', '2026-10-01'),
    ];
    for (const days of [7, 30, 60, 90]) {
      const data = buildProjectAnalytics(projects, statuses, [], days, now);
      expect(data.awardedCurrentMonth).toEqual({ count: 2, saleValue: 300.5 });
      expect(data.awardedPreviousMonth).toEqual({ count: 1, saleValue: 50 });
    }
  });
  it('handles the previous year, missing values and empty monthly results', () => {
    const data = buildProjectAnalytics([
      p('previous', '2025-01-01', { startDate: '2025-12-31', budgetValue: 10 }),
      p('missing-value', '2025-01-01', { startDate: '2025-12-01' }),
      p('invalid-value', '2025-01-01', { startDate: '2025-12-02', budgetValue: 'invalid' }),
    ], statuses, [], 7, new Date(2026, 0, 5, 12));
    expect(data.awardedPreviousMonth).toEqual({ count: 3, saleValue: 10 });
    expect(data.awardedCurrentMonth).toEqual({ count: 0, saleValue: 0 });
  });
  it('applies creation window while month counters ignore it', () => {
    const data = buildProjectAnalytics([p('new', '2026-10-01'), p('old', '2026-01-01'), p('next', '2026-01-01', { deliveryDate: '2026-11-01' }), p('deleted', '2026-10-01', { deleted: true }), p('future', '2026-10-06', { deliveryDate: '' })], statuses, [], 7, now);
    expect(data.scoped.map(p => p.id)).toEqual(['new']);
    expect(data.currentMonth).toHaveLength(2);
    expect(data.nextMonth).toHaveLength(1);
    expect(data.overdue).toHaveLength(2);
  });
  it('uses status scale and deduplicates category membership', () => {
    const data = buildProjectAnalytics([p('done', '2026-10-01', { statusId: 'done' }), p('new', '2026-10-01', { categoryIds: ['cat', 'cat', 'second'] })], statuses, [], 30, now);
    expect(data.active).toHaveLength(1);
    expect(data.overdue).toHaveLength(1);
    expect(data.categories).toEqual([{ id: 'cat', count: 2 }, { id: 'second', count: 1 }]);
    expect(data.managers[0].count).toBe(1);
    expect(data.sales[0].count).toBe(2);
  });
  it('counts missing material by project, excluding stock/deleted materials', () => {
    const materials: any = [{ projectId: 'new', status: 'por_encomendar' }, { projectId: 'new', status: 'encomendado', expectedDeliveryDate: '2026-10-01' }, { projectId: 'stock', status: 'em_stock', expectedDeliveryDate: '2026-10-01' }, { projectId: 'deleted', status: 'por_encomendar', deleted: true }];
    const data = buildProjectAnalytics([p('new', '2026-10-01'), p('stock', '2026-10-01'), p('deleted', '2026-10-01')], statuses, materials, 30, now);
    expect(data.missing.map(p => p.id)).toEqual(['new']);
  });
  it('uses all active projects for active, overdue and manager counters across every window', () => {
    const configured = [1, 2, 3, 4, 5].map(scale => ({ id: `s${scale}`, scale }));
    const projects = configured.map(s => p(s.id, '2025-01-01', { statusId: s.id }));
    projects.push(p('deleted', '2025-01-01', { statusId: 's1', deleted: true }));
    for (const days of [7, 30, 60, 90]) {
      const data = buildProjectAnalytics(projects, configured, [], days, now);
      expect(data.scoped).toHaveLength(0);
      expect(data.active.map(p => p.id)).toEqual(['s1', 's2', 's3', 's4']);
      expect(data.overdue).toHaveLength(4);
      expect(data.managers).toEqual([{ id: 'manager', count: 4 }]);
    }
  });
  it('prioritizes scheduled then estimated real delivery then delivery for overdue and month counters', () => {
    const projects = [
      p('scheduled-next', '2025-01-01', { scheduledDate: '2026-11-01', estimatedDate: '2026-10-01', deliveryDate: '2026-09-01' }),
      p('estimated-next', '2025-01-01', { scheduledDate: ' ', estimatedDate: '01/11/2026', deliveryDate: '2026-09-01' }),
      p('scheduled-late', '2025-01-01', { scheduledDate: '2026-10-01', estimatedDate: '2026-11-01' }),
      p('estimated-late', '2025-01-01', { estimatedDate: '2026-10-02', deliveryDate: '2026-11-01' }),
      p('delivery-late', '2025-01-01'),
      p('today', '2025-01-01', { scheduledDate: '2026-10-05' }),
      p('undated', '2025-01-01', { deliveryDate: '' }),
      p('done', '2025-01-01', { statusId: 'done' }),
    ];
    const data = buildProjectAnalytics(projects, statuses, [], 7, now);
    expect(data.overdue.map(p => p.id)).toEqual(['scheduled-late', 'estimated-late', 'delivery-late']);
    expect(data.nextMonth.map(p => p.id)).toEqual(['scheduled-next', 'estimated-next']);
    expect(data.currentMonth.map(p => p.id)).toEqual(['scheduled-late', 'estimated-late', 'delivery-late', 'today', 'done']);
  });
  it('includes missing material projects outside the window without duplicates or deleted projects', () => {
    const materials: any = [{ projectId: 'old', status: 'por_encomendar' }, { projectId: 'old', status: 'encomendado', expectedDeliveryDate: '2026-10-01' }, { projectId: 'deleted', status: 'por_encomendar' }];
    for (const days of [7, 30, 60, 90]) {
      const data = buildProjectAnalytics([p('old', '2025-01-01'), p('deleted', '2025-01-01', { deleted: true })], statuses, materials, days, now);
      expect(data.missing.map(p => p.id)).toEqual(['old']);
    }
  });
});
