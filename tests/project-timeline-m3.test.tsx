import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { buildProjectTimelineEvents, filterProjectTimeline } from '../lib/projectTimeline';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';
import ProjectTimeline from '../components/ProjectTimeline';
import DateViewNavigator from '../components/ui/DateViewNavigator';
import { M3SegmentedControl } from '../components/M3';

const today = new Date(2026, 9, 5, 12);
const statuses = [1, 2, 3, 4, 5, 0].map(scale => ({ id: `s${scale}`, name: `Estado ${scale}`, scale }));
const project = (id: string, extra = {}) => ({ id, title: `Projeto ${id}`, clientId: 'c', installProjectNo: `IP-${id}`, statusId: 's2', deleted: false, ...extra }) as any;
const clients: any = [{ id: 'c', clientName: 'Cliente Exemplo', shortName: 'Exemplo' }];
export const timelinePreviewProps: React.ComponentProps<typeof ProjectTimeline> = {
  projects: Array.from({ length: 55 }, (_, i) => project(String(i))), clients, tasks: [], projectStatuses: statuses, taskStatuses: [],
  specialDays: [{ date: '2026-10-06', name: 'Dia especial' } as any], projectRiskItems: [], canCreate: true, onSelectTask: () => {}, onCreateTask: () => {},
};
describe('Project timeline M3', () => {
  it('defaults to all active scales 1–4, excluding deleted and unknown projects', () => {
    const projects = [1, 2, 3, 4, 5, 0].map(scale => project(`p${scale}`, { statusId: `s${scale}` })).concat([project('gone', { deleted: true }), project('unknown', { statusId: 'unknown' })]);
    const events = buildProjectTimelineEvents(projects, [], [], false);
    expect(filterProjectTimeline(projects, clients, statuses, events, { search: '', horizon: 'all', showCompleted: false }, today).map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(filterProjectTimeline(projects, clients, statuses, events, { search: '', horizon: 'all', showCompleted: true }, today).map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
  it('filters upcoming events inclusively from today, with canonical task dates and optional risk reviews', () => {
    const projects = [project('today', { scheduledDate: '2026-10-05' }), project('edge7', { deliveryDate: '2026-10-11' }), project('edge14', { estimatedDate: '2026-10-18' }), project('edge21', { startDate: '2026-10-25' }), project('edge28', { deliveryDate: '2026-11-01' }), project('past', { deliveryDate: '2026-10-04' }), project('risk'), project('task'), project('none')];
    const tasks: any = [{ id: 't', projectId: 'task', title: 'Tarefa', estimatedDate: '2026-10-06', startDate: '2026-12-01' }, { id: 'deleted', projectId: 'none', estimatedDate: '2026-10-06', deleted: true }];
    const risks: any = [{ id: 'r', projectId: 'risk', title: 'Risco', reviewDate: '2026-10-06' }, { id: 'gone', projectId: 'none', reviewDate: '2026-10-06', deleted: true }];
    const events = buildProjectTimelineEvents(projects, tasks, risks, false);
    for (const [horizon, expected] of [[7, ['today', 'edge7', 'task']], [14, ['today', 'edge7', 'edge14', 'task']], [21, ['today', 'edge7', 'edge14', 'edge21', 'task']], [28, ['today', 'edge7', 'edge14', 'edge21', 'edge28', 'task']]] as const) {
      expect(filterProjectTimeline(projects, clients, statuses, events, { search: '', horizon, showCompleted: false }, today).map(p => p.id)).toEqual([...expected]);
    }
    const withRisks = buildProjectTimelineEvents(projects, tasks, risks, true);
    expect(filterProjectTimeline(projects, clients, statuses, withRisks, { search: '', horizon: 7, showCompleted: false }, today).map(p => p.id)).toContain('risk');
    expect(withRisks.has('none')).toBe(false);
    expect(events.get('task')?.get('2026-10-06')?.[0].kind).toBe('task');
  });
  it('uses actual start only when both execution dates are present and supports project/client/IP searches', () => {
    const projects = [project('one'), project('two', { clientId: 'other' })];
    const tasks: any = [{ id: 't', projectId: 'one', title: 'Real', startDate: '2026-10-05', endDate: '2026-10-07', estimatedDate: '2026-12-01' }];
    const events = buildProjectTimelineEvents(projects, tasks, [], false);
    expect(events.get('one')?.has('2026-10-05')).toBe(true);
    expect(events.get('one')?.has('2026-12-01')).toBe(false);
    for (const search of ['projeto one', 'CLIENTE EXEMPLO', 'IP-one']) expect(filterProjectTimeline(projects, clients, statuses, events, { search, horizon: 'all', showCompleted: false }, today).map(p => p.id)).toEqual(['one']);
  });
  it('shows 50 projects per page and resets pagination when filters change', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    let tree = h.render(timelinePreviewProps);
    expect(find(tree, e => e.type === M3SegmentedControl).props.value).toBe('all');
    expect(renderToStaticMarkup(tree).match(/scope="row"/g)).toHaveLength(50);
    expect(renderToStaticMarkup(tree)).toContain('Cliente Exemplo');
    find(tree, e => e.props?.['aria-label'] === 'Página seguinte de projetos').props.onClick();
    tree = h.render(timelinePreviewProps);
    expect(renderToStaticMarkup(tree).match(/scope="row"/g)).toHaveLength(5);
    find(tree, e => e.props?.['aria-label'] === 'Pesquisar na timeline').props.onChange({ target: { value: 'IP-1' } });
    expect(h.state.page).toBe(1);
  });
  it('renders 7/14 days, shades weekend/special columns and never constrains table vertical height', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    let tree = h.render({ ...timelinePreviewProps, projects: [project('one')] });
    find(tree, e => e.type === DateViewNavigator).props.onPeriodDaysChange(14);
    tree = h.render({ ...timelinePreviewProps, projects: [project('one')] });
    const html = renderToStaticMarkup(tree);
    expect(html.match(/scope="col"/g)).toHaveLength(15);
    expect(html).toContain('Dia especial');
    const scroll = find(tree, e => e.props?.['data-project-timeline-scroll'] !== undefined);
    expect(scroll.props.className).toBe('overflow-x-auto overflow-y-hidden');
    expect(find(tree, e => e.type === 'table').props.style.minWidth).toBe(2360);
    h.state.fullscreen = true;
    tree = h.render(timelinePreviewProps);
    const master = find(tree, e => e.props?.['data-project-timeline-master'] !== undefined);
    expect(master.props.className).toContain('overflow-y-auto');
    expect(find(tree, e => e.props?.['data-project-timeline-scroll'] !== undefined).props.className).not.toContain('overflow-y-auto');
  });
  it('preserves task opening and canonical quick creation callbacks', () => {
    const task: any = { id: 't', projectId: 'one', title: 'Tarefa real', estimatedDate: '2026-10-05', statusId: 'pending', estimatedHours: '2' };
    let selected = '', created = '';
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    const tree = h.render({ ...timelinePreviewProps, projects: [project('one')], tasks: [task], onSelectTask: (t: any) => selected = t.id, onCreateTask: (date: string, id: string) => created = `${date}:${id}` });
    const event = find(tree, e => e.props?.onClick && e.props.children?.props?.children?.[0]?.props?.children?.[1] === 'Tarefa real');
    expect(event).toBeDefined(); event.props.onClick(); expect(selected).toBe('t');
    find(tree, e => e.props?.['aria-label'] === 'Criar tarefa em Projeto one no dia 2026-10-05').props.onClick();
    expect(created).toBe('2026-10-05:one');
    const restricted = h.render({ ...timelinePreviewProps, canCreate: false });
    expect(find(restricted, e => e.props?.['aria-label']?.startsWith('Criar tarefa'))).toBeUndefined();
  });
  it('uses Foundation controls and semantic palette tokens', () => {
    const source = readFileSync(new URL('../components/ProjectTimeline.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/<(button|input|select|textarea)\b/);
    expect(source).not.toMatch(/(?:bg|text|border)-(?:slate|blue|indigo)-/);
  });
});
