import { describe, expect, it } from 'bun:test';
import { buildProjectAnalytics } from '../lib/projectAnalytics';
const now = new Date(2026, 9, 5, 12);
const statuses = [{ id: 'active', scale: 3 }, { id: 'done', scale: 5 }];
const p = (id: string, createdDate: string, extra = {}) => ({ id, createdDate, statusId: 'active', deliveryDate: '2026-10-04', categoryId: 'cat', projectManagerId: 'manager', salesRepId: 'sales', deleted: false, ...extra }) as any;
describe('Project analytics', () => {
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
    expect(data.overdue).toHaveLength(1);
  });
  it('uses status scale and deduplicates category membership', () => {
    const data = buildProjectAnalytics([p('done', '2026-10-01', { statusId: 'done' }), p('new', '2026-10-01', { categoryIds: ['cat', 'cat', 'second'] })], statuses, [], 30, now);
    expect(data.active).toHaveLength(1);
    expect(data.overdue).toHaveLength(1);
    expect(data.categories).toEqual([{ id: 'cat', count: 2 }, { id: 'second', count: 1 }]);
    expect(data.managers[0].count).toBe(2);
    expect(data.sales[0].count).toBe(2);
  });
  it('counts missing material by project, excluding stock/deleted materials', () => {
    const materials: any = [{ projectId: 'new', status: 'por_encomendar' }, { projectId: 'new', status: 'encomendado', expectedDeliveryDate: '2026-10-01' }, { projectId: 'stock', status: 'em_stock', expectedDeliveryDate: '2026-10-01' }, { projectId: 'deleted', status: 'por_encomendar', deleted: true }];
    const data = buildProjectAnalytics([p('new', '2026-10-01'), p('stock', '2026-10-01'), p('deleted', '2026-10-01')], statuses, materials, 30, now);
    expect(data.missing.map(p => p.id)).toEqual(['new']);
  });
});
