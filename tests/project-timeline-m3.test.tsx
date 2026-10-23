import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { buildProjectTimelineEvents, buildUndatedProjectTasks, canDropTimelineTask, computeTimelineTaskDropUpdates, filterProjectTimeline, getOtherTimelineTasks } from '../lib/projectTimeline';
import { getTaskConflictWarnings } from '../lib/taskConflicts';
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
    const tasks: any = [{ id: 't', projectId: 'task', title: 'Tarefa', estimatedDate: '2026-10-06', startDate: '2026-12-01', assigneeIds: ['u'] }, { id: 'deleted', projectId: 'none', estimatedDate: '2026-10-06', deleted: true }];
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
    const tasks: any = [{ id: 't', projectId: 'one', title: 'Real', startDate: '2026-10-05', endDate: '2026-10-07', estimatedDate: '2026-12-01', assigneeIds: ['u'] }];
    const events = buildProjectTimelineEvents(projects, tasks, [], false);
    expect(events.get('one')?.has('2026-10-05')).toBe(true);
    expect(events.get('one')?.has('2026-12-01')).toBe(false);
    for (const search of ['projeto one', 'CLIENTE EXEMPLO', 'IP-one']) expect(filterProjectTimeline(projects, clients, statuses, events, { search, horizon: 'all', showCompleted: false }, today).map(p => p.id)).toEqual(['one']);
  });
  it('shows 50 projects per page and resets pagination when filters change', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    let tree = h.render(timelinePreviewProps);
    expect(find(tree, e => e.type === M3SegmentedControl).props.value).toBe('all');
    expect(renderToStaticMarkup(tree).match(/scope="row"/g)).toHaveLength(51);
    expect(renderToStaticMarkup(tree)).toContain('Cliente Exemplo');
    find(tree, e => e.props?.['aria-label'] === 'Página seguinte de projetos').props.onClick();
    tree = h.render(timelinePreviewProps);
    expect(renderToStaticMarkup(tree).match(/scope="row"/g)).toHaveLength(6);
    find(tree, e => e.props?.['aria-label'] === 'Pesquisar na timeline').props.onChange({ target: { value: 'IP-1' } });
    expect(h.state.page).toBe(1);
  });
  it('renders 7, 14, 21 or 28 days, shades weekend/special columns and never constrains table vertical height', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    let tree = h.render({ ...timelinePreviewProps, projects: [project('one')] });
    find(tree, e => e.type === DateViewNavigator).props.onPeriodDaysChange(14);
    tree = h.render({ ...timelinePreviewProps, projects: [project('one')] });
    const html = renderToStaticMarkup(tree);
    expect(html.match(/scope="col"/g)).toHaveLength(15);
    expect(html).toContain('Dia especial');
    const scroll = find(tree, e => e.props?.['data-project-timeline-scroll'] !== undefined);
    expect(scroll.props.className).toContain('overflow-x-auto overflow-y-hidden');
    const dock = find(tree, e => e.props?.['data-project-timeline-dock'] !== undefined);
    const horizontal = find(tree, e => e.props?.['data-project-timeline-horizontal-scroll'] !== undefined);
    expect(dock.props.className).toContain('sticky bottom-0');
    expect(horizontal.props.children.props.style.width).toBe(1930);
    const tableNode = { scrollLeft: 0 }, dockNode = { scrollLeft: 0 };
    scroll.props.ref.current = tableNode;
    horizontal.props.ref.current = dockNode;
    dockNode.scrollLeft = 240;
    horizontal.props.onScroll({ currentTarget: dockNode });
    expect(tableNode.scrollLeft).toBe(240);
    tableNode.scrollLeft = 310;
    scroll.props.onScroll({ currentTarget: tableNode });
    expect(dockNode.scrollLeft).toBe(310);
    expect(find(tree, e => e.type === 'table').props.style.minWidth).toBe(1930);
    for (const period of [21, 28] as const) {
      find(tree, e => e.type === DateViewNavigator).props.onPeriodDaysChange(period);
      tree = h.render({ ...timelinePreviewProps, projects: [project('one')] });
      expect(renderToStaticMarkup(tree).match(/scope="col"/g)).toHaveLength(period + 1);
      expect(find(tree, e => e.type === DateViewNavigator).props.periods).toEqual([7, 14, 21, 28]);
    }
    const navigator = find(tree, e => e.type === DateViewNavigator);
    expect(navigator.props.navigationStepDays).toBe(7);
    navigator.props.onNext();
    expect(h.state.anchor.getDate()).toBe(12);
    navigator.props.onPrev();
    expect(h.state.anchor.getDate()).toBe(5);
    expect(renderToStaticMarkup(<DateViewNavigator periodDays={28} navigationStepDays={7} onPeriodDaysChange={() => {}} onPrev={() => {}} onNext={() => {}} onToday={() => {}} />)).toContain('title="Avançar 7 dias"');
    const stickyHeaders = [
      find(tree, e => e.type === 'th' && e.props?.scope === 'col' && e.props?.children === 'Projeto'),
      find(tree, e => e.type === 'th' && e.props?.scope === 'row' && e.props?.children === 'Outras tarefas'),
      find(tree, e => e.type === 'th' && e.props?.scope === 'row' && e.props?.className?.includes('space-y-1')),
    ];
    stickyHeaders.forEach(header => expect(header.props.className).toContain('lg:sticky lg:left-0'));
    h.state.fullscreen = true;
    tree = h.render(timelinePreviewProps);
    const master = find(tree, e => e.props?.['data-project-timeline-master'] !== undefined);
    expect(master.props.className).toContain('p-3');
    expect(find(tree, e => e.props?.['data-project-timeline-scroll'] !== undefined).props.className).not.toContain('overflow-y-auto');
  });
  it('preserves task opening and canonical quick creation callbacks', () => {
    const task: any = { id: 't', projectId: 'one', title: 'Tarefa real', estimatedDate: '2026-10-05', statusId: 'pending', estimatedHours: '2', assigneeIds: ['u'] };
    let selected = '', created = '';
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    const props = { ...timelinePreviewProps, projects: [project('one')], tasks: [task], onSelectTask: (t: any) => selected = t.id, onCreateTask: (date: string, id?: string) => created = `${date}:${id || 'none'}` };
    let tree = h.render(props);
    find(tree, e => e.props?.['aria-expanded'] === false).props.onClick();
    tree = h.render(props);
    const event = find(tree, e => e.props?.onClick && e.props.children?.props?.children?.[0]?.props?.children?.[1] === 'Tarefa real');
    expect(event).toBeDefined(); event.props.onClick(); expect(selected).toBe('t');
    find(tree, e => e.props?.['aria-label'] === 'Criar tarefa em Projeto one no dia 2026-10-05').props.onClick();
    expect(created).toBe('2026-10-05:one');
    find(tree, e => e.props?.['aria-label'] === 'Criar tarefa sem projeto no dia 2026-10-05').props.onClick();
    expect(created).toBe('2026-10-05:none');
    const restricted = h.render({ ...timelinePreviewProps, canCreate: false });
    expect(find(restricted, e => e.props?.['aria-label']?.startsWith('Criar tarefa'))).toBeUndefined();
  });
  it('moves dates within a project, allows projectless tasks anywhere, and preserves execution duration', () => {
    const assigned = { id: 'a', projectId: 'one', estimatedDate: '2026-10-05', startDate: '2026-10-05', endDate: '2026-10-07', deleted: false } as any;
    const other = { id: 'b', projectId: null, estimatedDate: '2026-10-05', startDate: '', endDate: '', deleted: false } as any;
    expect(canDropTimelineTask(assigned, 'one')).toBe(true);
    expect(canDropTimelineTask(assigned, 'two')).toBe(false);
    expect(canDropTimelineTask(assigned, null)).toBe(false);
    expect(computeTimelineTaskDropUpdates(assigned, '2026-10-10', 'one')).toEqual({ estimatedDate: '2026-10-10', startDate: '2026-10-10', endDate: '2026-10-12' });
    expect(computeTimelineTaskDropUpdates(assigned, '2026-10-10', 'two')).toBeNull();
    expect(computeTimelineTaskDropUpdates(other, '2026-10-06', null)).toEqual({ estimatedDate: '2026-10-06' });
    expect(computeTimelineTaskDropUpdates(other, '2026-10-06', 'two')).toEqual({ estimatedDate: '2026-10-06', projectId: 'two' });
    expect(computeTimelineTaskDropUpdates(other, '2026-10-05', null)).toBeNull();
  });
  it('groups only active project tasks without an operational date and preserves partial execution dates', () => {
    const tasks: any = [
      { id: 'blank', projectId: 'one', startDate: '', endDate: '', estimatedDate: '' },
      { id: 'partial', projectId: 'one', startDate: '2026-10-04', endDate: '', estimatedDate: '' },
      { id: 'dated', projectId: 'one', startDate: '2026-10-04', endDate: '2026-10-06', estimatedDate: '' },
      { id: 'estimate', projectId: 'one', startDate: '', endDate: '', estimatedDate: '2026-10-05' },
      { id: 'deleted', projectId: 'one', deleted: true },
      { id: 'other', projectId: null },
    ];
    expect(buildUndatedProjectTasks(tasks).get('one')?.map(task => task.id)).toEqual(['blank', 'partial']);
    expect(computeTimelineTaskDropUpdates(tasks[1], '2026-10-06', 'one')).toEqual({ estimatedDate: '2026-10-06' });
    expect(tasks[1].startDate).toBe('2026-10-04');
  });
  it('opens compact undated tasks and schedules them by drag within the project', () => {
    const task: any = { id: 'pending', projectId: 'one', title: 'Por planear', startDate: '2026-10-04', endDate: '', estimatedDate: '', assigneeIds: [], statusId: 'pending' };
    const updates: any[] = [];
    let selected = '';
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    const props = { ...timelinePreviewProps, projects: [project('one'), project('two')], tasks: [task], updateTask: (id: string, change: any) => updates.push([id, change]), onSelectTask: (item: any) => { selected = item.id; } };
    let tree = h.render(props);
    expect(renderToStaticMarkup(tree)).toContain('Tarefas sem data');
    find(tree, e => e.props?.['aria-label'] === 'Mostrar 1 tarefas sem data de Projeto one').props.onClick();
    tree = h.render(props);
    const card = find(tree, e => e.props?.['aria-label'] === 'Abrir tarefa sem data Por planear');
    expect(card.props.draggable).toBe(true);
    card.props.onClick();
    expect(selected).toBe('pending');
    expect(find(tree, e => e.props?.['aria-label'] === 'Planear Por planear em Projeto one')).toBeUndefined();
    const values = new Map<string, string>();
    const dataTransfer: any = { setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) || '' };
    card.props.onDragStart({ dataTransfer });
    const drop = (key: string) => find(tree, e => e.props?.['data-timeline-drop-cell'] === key).props.onDrop({ dataTransfer, preventDefault: () => {} });
    drop('two:2026-10-07');
    expect(updates).toHaveLength(0);
    drop('one:2026-10-07');
    expect(updates[0]).toEqual(['pending', { estimatedDate: '2026-10-07' }]);
    tree = h.render({ ...props, canCreate: false });
    expect(find(tree, e => e.props?.['aria-label'] === 'Abrir tarefa sem data Por planear').props.draggable).toBe(false);
    expect(find(tree, e => e.props?.['aria-label'] === 'Planear Por planear em Projeto one')).toBeUndefined();
  });
  it('drops only editable timeline tasks into allowed cells', () => {
    const tasks: any = [
      { id: 'a', projectId: 'one', title: 'Projeto A', estimatedDate: '2026-10-05', assigneeIds: [], statusId: 'pending' },
      { id: 'b', projectId: null, title: 'Sem projeto', estimatedDate: '2026-10-05', assigneeIds: [], statusId: 'pending' },
    ];
    const updates: any[] = [];
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    const props = { ...timelinePreviewProps, projects: [project('one'), project('two')], tasks, updateTask: (id: string, change: any) => updates.push([id, change]) };
    const tree = h.render(props);
    const values = new Map<string, string>();
    const dataTransfer: any = { setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) || '' };
    const drag = (title: string) => find(tree, e => e.props?.['aria-label'] === `Abrir tarefa ${title}` && e.props?.onDragStart);
    const cell = (key: string) => find(tree, e => e.props?.['data-timeline-drop-cell'] === key);
    const event: any = { dataTransfer, preventDefault: () => {} };
    drag('Projeto A').props.onDragStart(event);
    cell('two:2026-10-06').props.onDrop(event);
    cell('other:2026-10-06').props.onDrop(event);
    expect(updates).toEqual([]);
    cell('one:2026-10-06').props.onDrop(event);
    expect(updates).toEqual([['a', { estimatedDate: '2026-10-06' }]]);
    drag('Sem projeto').props.onDragStart(event);
    cell('two:2026-10-06').props.onDrop(event);
    expect(updates[1]).toEqual(['b', { estimatedDate: '2026-10-06', projectId: 'two' }]);
    const readOnly = h.render({ ...props, canCreate: false });
    expect(find(readOnly, e => e.props?.['aria-label'] === 'Abrir tarefa Projeto A').props.draggable).toBe(false);
    expect(find(readOnly, e => e.props?.['aria-label']?.startsWith('Criar tarefa sem projeto'))).toBeUndefined();
  });
  it('uses Foundation controls and semantic palette tokens', () => {
    const source = readFileSync(new URL('../components/ProjectTimeline.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/<(button|input|select|textarea)\b/);
    expect(source).not.toMatch(/(?:bg|text|border)-(?:slate|blue|indigo)-/);
  });
  it('shows other tasks first and counts assigned projectless tasks in conflicts', () => {
    const tasks: any = [
      { id: 'other', projectId: null, title: 'Sem projeto', estimatedDate: '2026-10-05', assigneeIds: ['u'], statusId: 'pending' },
      { id: 'unassigned', projectId: 'one', title: 'Sem utilizador', estimatedDate: '2026-10-05', assigneeIds: [], statusId: 'pending' },
      { id: 'regular', projectId: 'one', title: 'Regular', estimatedDate: '2026-10-05', assigneeIds: ['u'], statusId: 'pending' },
      { id: 'deleted', projectId: null, title: 'Apagada', estimatedDate: '2026-10-05', assigneeIds: ['u'], deleted: true },
    ];
    expect(getOtherTimelineTasks(tasks, '2026-10-05').map(task => task.id)).toEqual(['other']);
    expect(buildProjectTimelineEvents([project('one')], tasks, [], false).get('one')?.get('2026-10-05')?.map(event => event.kind === 'task' ? event.task.id : null).filter(Boolean)).toEqual(['unassigned', 'regular']);
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    const props = { ...timelinePreviewProps, projects: [project('one')], tasks };
    const html = renderToStaticMarkup(h.render(props));
    expect(html.indexOf('Outras tarefas')).toBeLessThan(html.indexOf('Cliente Exemplo'));
    expect(html).toContain('Sem projeto');
    expect(html).toContain('Sem utilizador');
    expect(html).toContain('class="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado"');
    find(h.render(props), e => e.props?.['aria-expanded'] === false).props.onClick();
    expect(renderToStaticMarkup(h.render(props))).toContain('class="w-3 h-3 rounded-full bg-error" aria-label="Sem utilizador alocado"');
    expect(getTaskConflictWarnings({ date: '2026-10-05', assigneeIds: ['u'], currentTaskId: 'regular', tasks, users: [{ id: 'u', name: 'Ana' } as any] }).join(' ')).toContain('Sem projeto');
  });
  it('reports absences in other tasks, including days without tasks, and highlights assigned conflicts', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    const props = {
      ...timelinePreviewProps, projects: [], users: [{ id: 'u', name: 'Ana Silva' }, { id: 'gone', name: 'Inativo', deleted: true }],
      tasks: [{ id: 'other', projectId: null, title: 'Visita', estimatedDate: '2026-10-05', assigneeIds: ['u'], statusId: 'pending' }],
      absences: [{ id: 'a', userId: 'u', absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-10', reason: 'Férias' },
        { id: 'b', userId: 'gone', absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-10', reason: 'Outra' }],
    } as any;
    const tree = h.render(props);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('Ana Silva: ⚠️ AUSENTE (1 tarefa)');
    expect(html).toContain('Ana Silva: AUSENTE');
    expect(html).toContain('Férias');
    expect(html).not.toContain('Inativo:');
    const widths = find(tree, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style?.width);
    expect(widths[5]).toBeUndefined();
  });
  it('shows compact task cards with status color when collapsed, then expands task details', () => {
    const task: any = { id: 't', projectId: 'one', title: 'Tarefa compacta', estimatedDate: '2026-10-10', statusId: 'custom', assigneeIds: ['u'], estimatedHours: '4' };
    const props: any = { ...timelinePreviewProps, projects: [project('one')], tasks: [task], users: [{ id: 'u', name: 'Ana Silva' }], taskStatuses: [{ id: 'custom', name: 'Estado tarefa exclusivo', color: 'verde' }] };
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    let tree = h.render(props), html = renderToStaticMarkup(tree);
    expect(html).toContain('Cliente Exemplo'); expect(html).not.toContain('Projeto one');
    expect(html).toContain('Tarefa compacta'); expect(html).not.toContain('IP-one');
    expect(html).toContain('AS'); expect(html).toContain('border-l-4'); expect(html).not.toContain('Estado tarefa exclusivo');
    expect(find(tree, e => e.props?.['aria-label'] === 'Criar tarefa em Projeto one no dia 2026-10-10')).toBeDefined();
    find(tree, e => e.props?.['aria-label'] === 'Ocultar projeto Projeto one da timeline').props.onClick();
    tree = h.render(props);
    expect(renderToStaticMarkup(tree)).toContain('Repor todos os projetos');
    expect(renderToStaticMarkup(tree)).not.toContain('Cliente Exemplo');
    find(tree, e => e.props?.children === 'Repor todos os projetos').props.onClick();
    tree = h.render(props);
    const widths = find(tree, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style?.width);
    // The Saturday with a registered task is not compressed, even while collapsed.
    expect(widths[5]).toBeUndefined(); expect(widths[6]).toBe(64);
    find(tree, e => e.props?.['aria-expanded'] === false).props.onClick();
    tree = h.render(props); html = renderToStaticMarkup(tree);
    expect(html).toContain('Tarefa compacta'); expect(html).toContain('Ana Silva'); expect(html).toContain('4 h previstas'); expect(html).toContain('AS');
    expect(html).toContain('border-l-4'); expect(html).not.toContain('Estado tarefa exclusivo');
    expect(html).toContain('IP-one'); expect(html).not.toContain('IP:');
    find(tree, e => e.props?.['aria-expanded'] === true).props.onClick();
    expect(renderToStaticMarkup(h.render(props))).not.toContain('Tarefa compacta');
  });
});
