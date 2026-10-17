import { describe, expect, it } from 'bun:test';
import { buildProjectAnalytics, commercialProjectsInWindow, fiscalYearStart } from '../lib/projectAnalytics';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAnalytics from '../components/ProjectAnalytics';
const now = new Date(2026, 9, 5, 12);
const statuses = [{ id: 'active', scale: 3 }, { id: 'done', scale: 5 }];
const p = (id: string, createdDate: string, extra = {}) => ({ id, createdDate, statusId: 'active', deliveryDate: '2026-10-04', categoryId: 'cat', projectManagerId: 'manager', salesRepId: 'sales', deleted: false, ...extra }) as any;
describe('Project analytics', () => {
  it('filters commercial projects by start date and only includes managers with projects in the selected period', () => {
    const projects = [
      p('before-90', '2026-10-05', { startDate: '2026-07-07', salesRepId: 'old' }),
      p('at-90', '2025-01-01', { startDate: '2026-07-08', salesRepId: 'ninety' }),
      p('at-60', '2025-01-01', { startDate: '2026-08-07', salesRepId: 'sixty' }),
      p('at-30', '2025-01-01', { startDate: '06/09/2026', salesRepId: 'thirty' }),
      p('today', '2025-01-01', { startDate: '2026-10-05', salesRepId: 'thirty' }),
      p('tomorrow', '2025-01-01', { startDate: '2026-10-06', salesRepId: 'future' }),
      p('deleted', '2025-01-01', { startDate: '2026-10-05', salesRepId: 'deleted', deleted: true }),
      p('unassigned', '2025-01-01', { startDate: '2026-10-05', salesRepId: '' }),
    ];
    expect(commercialProjectsInWindow(projects, 30, now).map(project => project.id)).toEqual(['today', 'at-30']);
    expect(commercialProjectsInWindow(projects, 60, now).map(project => project.id)).toEqual(['today', 'at-30', 'at-60']);
    expect(commercialProjectsInWindow(projects, 90, now).map(project => project.id)).toEqual(['today', 'at-30', 'at-60', 'at-90']);
  });
  it('uses April fiscal boundaries and moves FY labels on 1 April', () => {
    const projects = [
      p('before', '2025-01-01', { startDate: '2025-03-31', salesRepId: 'before' }),
      p('fy25-start', '2025-01-01', { startDate: '2025-04-01', salesRepId: 'fy25' }),
      p('fy25-end', '2025-01-01', { startDate: '31/03/2026', salesRepId: 'fy25' }),
      p('fy26-start', '2025-01-01', { startDate: '2026-04-01', salesRepId: 'fy26' }),
      p('fy26-end', '2025-01-01', { startDate: '2027-03-31', salesRepId: 'fy26' }),
      p('fy27-start', '2025-01-01', { startDate: '2027-04-01', salesRepId: 'fy27' }),
    ];
    expect(fiscalYearStart(new Date(2027, 2, 31, 12))).toBe(2026);
    expect(fiscalYearStart(new Date(2027, 3, 1, 12))).toBe(2027);
    expect(commercialProjectsInWindow(projects, 'previousFY', now).map(project => project.id)).toEqual(['fy25-end', 'fy25-start']);
    expect(commercialProjectsInWindow(projects, 'currentFY', now).map(project => project.id)).toEqual(['fy26-end', 'fy26-start']);
    expect(commercialProjectsInWindow(projects, 'previousFY', new Date(2027, 3, 1, 12)).map(project => project.id)).toEqual(['fy26-end', 'fy26-start']);
    expect(commercialProjectsInWindow(projects, 'currentFY', new Date(2027, 3, 1, 12)).map(project => project.id)).toEqual(['fy27-start']);
  });
  it('defaults to 30 days and identifies missing-material projects by client, title and IP', () => {
    const html = renderToStaticMarkup(React.createElement(ProjectAnalytics, {
      projects: [p('old', '2025-01-01', { clientId: 'client', title: 'Linha de produção', installProjectNo: 'IP-123' })],
      projectStatuses: statuses, categories: [], users: [], clients: [{ id: 'client', clientName: 'Brasmar' } as any],
      materials: [{ projectId: 'old', status: 'por_encomendar' } as any], onSelectProject: () => {},
    }));
    expect(html).toContain('aria-label="Janela das categorias"');
    expect(html).toContain('aria-label="Janela do ranking comercial"');
    expect(html).toContain('Ranking comerciais');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html.match(/>30 dias<|>60 dias<|>90 dias</g)).toHaveLength(6);
    expect(html).not.toContain('>7 dias<');
    expect(html).toContain('Brasmar');
    expect(html).toContain('Linha de produção');
    expect(html).toContain('IP-123');
    expect(html).not.toContain('Sem projetos com material em falta/atraso');
  });
  it('renders the commercial manager selector and all five period buttons', () => {
    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const html = renderToStaticMarkup(React.createElement(ProjectAnalytics, {
      projects: [p('visible', '2020-01-01', { startDate, title: 'Projeto visível', salesRepId: 'sales' }),
        p('hidden', '2020-01-01', { startDate: '2020-01-01', title: 'Projeto antigo', salesRepId: 'old' })],
      projectStatuses: statuses, categories: [], users: [{ id: 'sales', name: 'Ana Silva' }, { id: 'old', name: 'Outro gestor' }],
      onSelectProject: () => {},
    }));
    expect(html).toContain('Projetos por gestor comercial');
    expect(html).toContain('aria-label="Período dos projetos por gestor comercial"');
    expect(html).toContain(`FY${String(fiscalYearStart(today) - 1).slice(-2)}`);
    expect(html).toContain(`FY${String(fiscalYearStart(today)).slice(-2)}`);
    expect(html).toContain('value="sales"');
    expect(html).toContain('Ana Silva</option>');
    expect(html).not.toContain('<option value="old"');
    expect(html).toContain('Projeto visível');
    expect(html).not.toContain('Projeto antigo');
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
      expect(data.awardedCurrentMonth).toMatchObject({ count: 2, saleValue: 300.5 });
      expect(data.awardedCurrentMonth.projects.map(p => p.id)).toEqual(['current', 'current-local']);
      expect(data.awardedPreviousMonth).toMatchObject({ count: 1, saleValue: 50 });
    }
  });
  it('handles the previous year, missing values and empty monthly results', () => {
    const data = buildProjectAnalytics([
      p('previous', '2025-01-01', { startDate: '2025-12-31', budgetValue: 10 }),
      p('missing-value', '2025-01-01', { startDate: '2025-12-01' }),
      p('invalid-value', '2025-01-01', { startDate: '2025-12-02', budgetValue: 'invalid' }),
    ], statuses, [], 7, new Date(2026, 0, 5, 12));
    expect(data.awardedPreviousMonth).toMatchObject({ count: 3, saleValue: 10 });
    expect(data.awardedCurrentMonth).toMatchObject({ count: 0, saleValue: 0 });
  });
  it('rolls fiscal years on 1 April and excludes deleted projects', () => {
    const projects = [
      p('before', '2025-01-01', { startDate: '2025-03-31' }),
      p('previous-start', '2025-01-01', { startDate: '2025-04-01' }),
      p('previous-end', '2025-01-01', { startDate: '31/03/2026' }),
      p('current-start', '2025-01-01', { startDate: '2026-04-01' }),
      p('current-end', '2025-01-01', { startDate: '2027-03-31' }),
      p('after', '2025-01-01', { startDate: '2027-04-01' }),
      p('deleted', '2025-01-01', { startDate: '2026-04-01', deleted: true }),
    ];
    const october = buildProjectAnalytics(projects, statuses, [], 30, now);
    expect(october.fiscalCurrent.year).toBe(2026);
    expect(october.fiscalCurrent.projects.map(p => p.id)).toEqual(['current-start', 'current-end']);
    expect(october.fiscalPrevious.projects.map(p => p.id)).toEqual(['previous-start', 'previous-end']);
    const march = buildProjectAnalytics(projects, statuses, [], 30, new Date(2026, 2, 31, 12));
    expect(march.fiscalCurrent.year).toBe(2025);
    expect(march.fiscalCurrent.projects.map(p => p.id)).toEqual(['previous-start', 'previous-end']);
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
