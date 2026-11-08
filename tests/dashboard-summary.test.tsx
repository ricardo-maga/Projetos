import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { buildDashboardSummary } from '../lib/dashboardSummary';
import { MetricCard } from '../components/ui/MetricCard';

const now = new Date(2026, 9, 5, 12);
const statuses = [1, 2, 3, 4, 5].map(scale => ({ id: `p${scale}`, name: `Projeto ${scale}`, scale }));
const taskStatuses: any = [1, 2, 3, 4].map(scale => ({ id: `t${scale}`, name: `Tarefa ${scale}`, scale }));
const project = (id: string, fields = {}) => ({ id, statusId: 'p1', deleted: false, ...fields }) as any;
const task = (id: string, fields = {}) => ({ id, statusId: 't1', deleted: false, ...fields }) as any;

describe('Dashboard first-row indicators', () => {
  it('counts active projects from configured levels 1–4 without a temporal condition', () => {
    const projects = statuses.map(status => project(status.id, { statusId: status.id, scheduledDate: '2020-01-01' }));
    projects.push(project('deleted', { deleted: true }), project('unknown', { statusId: 'unknown' }));
    expect(buildDashboardSummary(projects, [], statuses, taskStatuses, now).activeProjects).toBe(4);
  });
  it('uses only the first filled scheduled, estimated or delivery date, matching Projects analysis', () => {
    const projects = [
      project('scheduled-next', { scheduledDate: '2026-11-02', estimatedDate: '2026-10-02', deliveryDate: '2026-10-03' }),
      project('scheduled-current', { scheduledDate: '2026-10-03', estimatedDate: '2026-11-02' }),
      project('estimated-next', { scheduledDate: '  ', estimatedDate: '2026-11-02', deliveryDate: '2026-10-03' }),
      project('delivery-current', { deliveryDate: '15/10/2026' }),
      project('finished-current', { statusId: 'p5', deliveryDate: '2026-10-25' }),
      project('past', { scheduledDate: '2026-09-30', deliveryDate: '2026-10-03' }),
      project('deleted', { deleted: true, scheduledDate: '2026-10-02' }), project('none'),
    ];
    const summary = buildDashboardSummary(projects, [], statuses, taskStatuses, now);
    expect(summary.currentMonthProjects).toBe(3);
    expect(summary.nextMonthProjects).toBe(2);
    expect(summary.currentMonthName).toBe('outubro'); expect(summary.nextMonthName).toBe('novembro');
  });
  it('handles the next year and excludes the same month in another year', () => {
    const summary = buildDashboardSummary([project('next', { deliveryDate: '2027-01-01' }), project('old', { deliveryDate: '2026-01-01' })], [], statuses, taskStatuses, new Date(2026, 11, 5));
    expect(summary.nextMonthProjects).toBe(1); expect(summary.nextMonthName).toBe('janeiro');
  });
  it('counts open configured task levels 1/2 regardless of dates or project status, excluding deleted and unknown states', () => {
    const tasks = [task('undated'), task('past', { statusId: 't2', estimatedDate: '2020-01-01' }), task('future', { estimatedDate: '2030-01-01', projectId: 'finished' }),
      task('completed', { statusId: 't3' }), task('other', { statusId: 't4' }), task('deleted', { deleted: true }), task('unknown', { statusId: 'missing' })];
    expect(buildDashboardSummary([], tasks, statuses, taskStatuses, now).openTasks).toBe(3);
  });
  it('shares the M3 metric card and uses the dashboard container breakpoint', () => {
    const html = renderToStaticMarkup(<MetricCard title="Tarefas abertas" value={3} />);
    expect(html).toContain('p-5 space-y-2'); expect(html).toContain('text-heading-lg'); expect(html).toContain('>3</p>');
    expect(readFileSync(new URL('../domains/monitoring/ui/BentoDashboard.tsx', import.meta.url), 'utf8')).toContain("from '@/components/ui/MetricCard'");
    expect(readFileSync(new URL('../domains/projects/ui/ProjectAnalytics.tsx', import.meta.url), 'utf8')).toContain("from '@/components/ui/MetricCard'");
    const dashboard = readFileSync(new URL('../domains/monitoring/ui/BentoDashboard.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(dashboard).toContain('m3-dashboard-summary md:col-span-12 grid gap-4');
    expect(css).toContain('.m3-dashboard { container: dashboard / inline-size; }');
    expect(css).toContain('@container dashboard (min-width: 560px)');
    expect(css).toContain('.m3-dashboard-summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }');
  });
});
