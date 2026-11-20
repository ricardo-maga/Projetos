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
import TimelineAbsenceBadge from '../domains/projects/ui/TimelineAbsenceBadge';
import { addCivilDays, formatDateToYYYYMMDD, getOperationalCalendarDays } from '../lib/operationalCalendar';

const today = new Date(2026, 9, 5, 12);
const visibleWeek = { visibleStartDate: '2026-10-05', visibleEndDate: '2026-10-11' };
const statuses = [1, 2, 3, 4, 5, 6, 7, 0].map(scale => ({ id: `s${scale}`, name: `Estado ${scale}`, scale }));
const project = (id: string, extra = {}) => ({ id, title: `Projeto ${id}`, clientId: 'c', installProjectNo: `IP-${id}`, statusId: 's2', deleted: false, ...extra }) as any;
const clients: any = [{ id: 'c', clientName: 'Cliente Exemplo', shortName: 'Exemplo' }];
export const timelinePreviewProps: React.ComponentProps<typeof ProjectTimeline> = {
  projects: Array.from({ length: 55 }, (_, i) => project(String(i))), clients, tasks: [], projectStatuses: statuses, taskStatuses: [],
  specialDays: [{ date: '2026-10-06', name: 'Dia especial' } as any], projectRiskItems: [], canCreate: true, onSelectTask: () => {}, onCreateTask: () => {},
};
describe('Project timeline M3', () => {
  it('includes all active scales 1–4 in Todos, excluding deleted, unknown and completed projects without tasks', () => {
    const projects = [1, 2, 3, 4, 5, 6, 7, 0].map(scale => project(`p${scale}`, { statusId: `s${scale}` })).concat([project('gone', { deleted: true }), project('unknown', { statusId: 'unknown' })]);
    const events = buildProjectTimelineEvents(projects, [], [], false);
    expect(filterProjectTimeline(projects, clients, statuses, events, new Map(), { ...visibleWeek, search: '', horizon: 'all' }, today).map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
  it('defaults to a 28-day event horizon and a seven-day normal view without a completed-project checkbox', () => {
    const h = createSectionHarness('ProjectTimeline.tsx');
    const tree = h.render(timelinePreviewProps);
    expect(h.state.horizon).toBe(28);
    expect(find(tree, e => e.type === DateViewNavigator).props.periodDays).toBe(7);
    expect(find(tree, e => e.type === M3SegmentedControl).props.value).toBe(28);
    const navigator = find(tree, e => e.type === DateViewNavigator);
    expect(navigator.props.periodSelector.props.options.map((option: any) => option.label)).toEqual(['7 dias', '14 dias', '28 dias', '56 Dias HD']);
    expect(navigator.props.periodLabelClassName).toBe('whitespace-nowrap sm:w-52 sm:shrink-0');
    const eventFilter = find(tree, e => e.type === M3SegmentedControl);
    expect(eventFilter.props.label).toBe('Com eventos em');
    expect(find(tree, e => e.type === 'span' && e.props?.children === 'Com eventos em:').props.className).toContain('sm:w-52');
    expect(renderToStaticMarkup(tree)).not.toContain('Mostrar projetos com eventos nos próximos dias');
    expect(renderToStaticMarkup(tree)).not.toContain('Projetos concluídos');
  });
  it('uses the visible period for completed projects independently of the event horizon, and also admits undated tasks', () => {
    const projects = [
      project('active-undated'), project('done-today', { statusId: 's5' }), project('done-edge', { statusId: 's5' }),
      project('done-later', { statusId: 's5' }), project('done-past', { statusId: 's5' }), project('done-undated', { statusId: 's5' }),
      project('done-partial', { statusId: 's5' }), project('done-estimate', { statusId: 's7' }),
      project('done-actual', { statusId: 's6' }), project('done-deleted-task', { statusId: 's5' }),
      project('done-milestone', { statusId: 's5', deliveryDate: '2026-10-05' }), project('done-risk', { statusId: 's5' }),
      project('deleted', { statusId: 's5', deleted: true }), project('unknown', { statusId: 'unknown' }),
    ];
    const tasks: any = [
      { id: 'a', projectId: 'active-undated' }, { id: 'b', projectId: 'done-today', estimatedDate: '2026-10-05' },
      { id: 'c', projectId: 'done-edge', estimatedDate: '2026-11-01' }, { id: 'd', projectId: 'done-later', estimatedDate: '2026-11-02' },
      { id: 'e', projectId: 'done-past', estimatedDate: '2026-10-04' }, { id: 'f', projectId: 'done-undated' },
      { id: 'g', projectId: 'done-partial', startDate: '2026-10-04' },
      { id: 'h', projectId: 'done-estimate', startDate: '2026-12-01', estimatedDate: '2026-10-06' },
      { id: 'i', projectId: 'done-actual', startDate: '2026-10-06', endDate: '2026-10-09', estimatedDate: '2026-12-01' },
      { id: 'j', projectId: 'done-deleted-task', estimatedDate: '2026-10-05', deleted: true },
      { id: 'k', projectId: 'done-deleted-task', deleted: true }, { id: 'l', projectId: 'deleted' }, { id: 'm', projectId: 'unknown' },
    ];
    const events = buildProjectTimelineEvents(projects, tasks, [{ id: 'r', projectId: 'done-risk', title: 'Risco', reviewDate: '2026-10-05' } as any], true);
    const undated = buildUndatedProjectTasks(tasks);
    const filtered = (horizon: 7 | 28 | 'all', search = '', visibleEndDate = visibleWeek.visibleEndDate) => filterProjectTimeline(projects, clients, statuses, events, undated, { ...visibleWeek, visibleEndDate, search, horizon }, today).map(p => p.id);
    const weekly = ['active-undated', 'done-today', 'done-undated', 'done-partial', 'done-estimate', 'done-actual'];
    expect(filtered(28)).toEqual(weekly);
    expect(filtered(7)).toEqual(weekly);
    expect(filtered('all')).toEqual(weekly);
    expect(filtered('all', '', '2026-11-01')).toEqual(['active-undated', 'done-today', 'done-edge', 'done-undated', 'done-partial', 'done-estimate', 'done-actual']);
    expect(filtered('all', '', '2026-11-29')).toEqual(['active-undated', 'done-today', 'done-edge', 'done-later', 'done-undated', 'done-partial', 'done-estimate', 'done-actual']);
    expect(filtered(28, 'IP-done-undated')).toEqual(['done-undated']);
  });
  it('shows all active projects in Todos and includes completed projects only at the inclusive visible-period boundaries', () => {
    const projects = [1, 2, 3, 4].map(scale => project(`active-${scale}`, { statusId: `s${scale}` })).concat([
      project('before', { statusId: 's5' }), project('start', { statusId: 's6' }), project('end', { statusId: 's7' }), project('after', { statusId: 's5' }),
    ]);
    const tasks: any = ['2026-10-04', '2026-10-05', '2026-10-11', '2026-10-12'].map((date, index) => ({ id: `t${index}`, projectId: ['before', 'start', 'end', 'after'][index], estimatedDate: date }));
    const events = buildProjectTimelineEvents(projects, tasks, [], false);
    const filter = (range: typeof visibleWeek) => filterProjectTimeline(projects, clients, statuses, events, new Map(), { ...range, search: '', horizon: 'all' }, today).map(p => p.id);
    expect(filter(visibleWeek)).toEqual(['active-1', 'active-2', 'active-3', 'active-4', 'start', 'end']);
    expect(filter({ visibleStartDate: '2026-10-12', visibleEndDate: '2026-10-18' })).toEqual(['active-1', 'active-2', 'active-3', 'active-4', 'after']);
  });
  it('keeps the active-project horizon anchored to today while completed projects follow calendar navigation', () => {
    const date = formatDateToYYYYMMDD(new Date()), future = addCivilDays(date, 56);
    const h = createSectionHarness('ProjectTimeline.tsx');
    const props = { ...timelinePreviewProps,
      projects: [project('active', { scheduledDate: date }), project('done', { statusId: 's5' }), project('future', { statusId: 's6' })],
      tasks: [{ id: 'today', projectId: 'done', estimatedDate: date }, { id: 'future', projectId: 'future', estimatedDate: future }] as any[] };
    let tree = h.render(props);
    const visible = (id: string) => find(tree, e => e.props?.['aria-label'] === `Ocultar projeto Projeto ${id} da timeline`);
    expect(visible('active')).toBeDefined(); expect(visible('done')).toBeDefined(); expect(visible('future')).toBeUndefined();
    for (let i = 0; i < 8; i++) find(tree, e => e.type === DateViewNavigator).props.onNext();
    tree = h.render(props);
    expect(visible('active')).toBeDefined(); expect(visible('done')).toBeUndefined(); expect(visible('future')).toBeDefined();
    expect(h.state.horizon).toBe(28);
    visible('future').props.onClick();
    tree = h.render(props); expect(visible('future')).toBeUndefined();
    find(h.render(props), e => e.props?.children === 'Repor todos os projetos').props.onClick();
    tree = h.render(props); expect(visible('future')).toBeDefined();
  });
  it('selects the 56-day HD view independently of normal periods and shares widths with the floating header and scrollbar', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all', floatingHeader: { left: 0, width: 1200, height: 60 } });
    let tree = h.render(timelinePreviewProps);
    for (const [mode, count] of [['56-hd', 56], [28, 28]] as const) {
      const anchor = h.state.anchor;
      find(tree, e => e.type === DateViewNavigator).props.periodSelector.props.onChange(mode);
      tree = h.render(timelinePreviewProps);
      expect(h.state.anchor).toBe(anchor);
      expect(h.state.horizon).toBe('all');
      expect(find(tree, e => e.type === DateViewNavigator).props.periodDays).toBe(count);
      expect(find(tree, e => e.type === DateViewNavigator).props.periodSelector.props.value).toBe(mode);
      const html = renderToStaticMarkup(tree);
      expect(html.match(/scope="col"/g)).toHaveLength(count + 1);
      expect(html).not.toContain('28 Dias HD'); expect(html).toContain('56 Dias HD');
      const widths = find(tree, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style?.width);
      if (typeof mode === 'string') {
        expect(widths[0]).toBe(36); expect(widths[1]).toBe(28); expect(widths[5]).toBe(28);
      } else {
        expect(widths[0]).toBeUndefined(); expect(widths[1]).toBe(64);
      }
      const table = find(tree, e => e.type === 'table');
      if (mode === '56-hd') expect(table.props.style.minWidth).toBeLessThan(2200);
      const fixed = find(tree, e => e.props?.['data-project-timeline-fixed-header'] !== undefined);
      expect(find(fixed, e => e.type === 'table').props.style.minWidth).toBe(table.props.style.minWidth);
      expect(find(fixed, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style)).toEqual(find(tree, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style));
      expect(find(tree, e => e.props?.['data-project-timeline-horizontal-scroll'] !== undefined).props.children.props.style.width).toBe(table.props.style.minWidth);
    }
    const defaults = renderToStaticMarkup(<DateViewNavigator periodDays={7} onPeriodDaysChange={() => {}} onPrev={() => {}} onNext={() => {}} onToday={() => {}} />);
    expect(defaults).toContain('14 dias'); expect(defaults).not.toContain('Dias HD');
  });
  it('generates 56 continuous Monday-aligned days across a year boundary', () => {
    const days = getOperationalCalendarDays(new Date(2026, 11, 31), 56);
    expect(days).toHaveLength(56);
    expect(days[0].dateStr).toBe('2026-12-28');
    expect(days[55].dateStr).toBe('2027-02-21');
    expect(new Set(days.map(day => day.dateStr)).size).toBe(56);
  });
  it('shows only all assignee initial badges in HD task cards, including expanded projects, and preserves task actions', () => {
    let selected = '', created = '';
    const updates: any[] = [];
    const props: any = { ...timelinePreviewProps, projects: [project('one')],
      users: [{ id: 'a', name: 'Ana Silva' }, { id: 'b', name: 'Bruno Costa' }, { id: 'c', name: 'Carla Reis' }],
      tasks: [{ id: 'project', projectId: 'one', title: 'Título do projeto', estimatedDate: '2026-10-05', assigneeIds: ['a', 'b', 'c'], estimatedHours: '8' },
        { id: 'other', projectId: null, title: 'Título de outra tarefa', estimatedDate: '2026-10-05', assigneeIds: ['a'], estimatedHours: '4' },
        { id: 'unassigned', projectId: 'one', title: 'Por atribuir', estimatedDate: '2026-10-10', assigneeIds: [] }],
      onSelectTask: (task: any) => selected = task.id, onCreateTask: (date: string) => created = date,
      updateTask: (id: string, change: any) => updates.push([id, change]) };
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all', view: '56-hd' });
    let tree = h.render(props);
    const card = find(tree, e => e.props?.['data-timeline-hd-task'] === 'project');
    const html = renderToStaticMarkup(card.props.children);
    for (const [name, initials] of [['Ana Silva', 'AS'], ['Bruno Costa', 'BC'], ['Carla Reis', 'CR']]) {
      expect(html).toContain(`>${initials}</span>`); expect(html).toContain(`aria-label="${name}"`);
      expect(html).not.toContain(`>${name}</span>`);
    }
    expect(html).not.toContain('Título'); expect(html).not.toContain('8h'); expect(html).toContain('rounded-full');
    expect(card.props.title).toBe('Título do projeto · Ana Silva · Bruno Costa · Carla Reis');
    expect(html).not.toContain('title=');
    expect(renderToStaticMarkup(find(tree, e => e.props?.['data-timeline-hd-task'] === 'unassigned').props.children)).not.toContain('title=');
    expect(find(tree, e => e.props?.['data-timeline-hd-task'] === 'other')).toBeDefined();
    expect(renderToStaticMarkup(find(tree, e => e.props?.['data-timeline-hd-task'] === 'unassigned'))).toContain('Sem utilizador alocado');
    const widths = find(tree, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style.width);
    expect(widths[5]).toBe(36); expect(widths[6]).toBe(28);
    expect(find(tree, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-05').props.className).toContain('project-timeline-conflict-cell');
    card.props.onClick(); expect(selected).toBe('project');
    find(tree, e => e.props?.['aria-expanded'] === false).props.onClick();
    tree = h.render(props);
    expect(renderToStaticMarkup(find(tree, e => e.props?.['data-timeline-hd-task'] === 'project').props.children)).toBe(html);
    find(tree, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-06').props.onDoubleClick({ target: {} });
    expect(created).toBe('2026-10-06');
    const values = new Map<string, string>();
    const dataTransfer = { setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) || '' };
    find(tree, e => e.props?.['data-timeline-hd-task'] === 'project').props.onDragStart({ dataTransfer });
    find(tree, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-06').props.onDrop({ dataTransfer, preventDefault() {} });
    expect(updates).toEqual([['project', { estimatedDate: '2026-10-06' }]]);
    const readOnly = h.render({ ...props, canCreate: false });
    expect(find(readOnly, e => e.props?.['data-timeline-hd-task'] === 'project').props.draggable).toBe(false);
    expect(find(readOnly, e => e.props?.['aria-label']?.startsWith('Criar tarefa'))).toBeUndefined();
  });
  it('compacts absences only in HD, preserving absence descriptions and using only cell stripes for conflicts', () => {
    const props: any = { ...timelinePreviewProps, projects: [], users: [{ id: 'a', name: 'Ana Silva' }, { id: 'gone', name: 'Eliminado', deleted: true }],
      tasks: [{ id: 't', projectId: null, estimatedDate: '2026-10-05', title: 'Visita', assigneeIds: ['a'] }],
      absences: [{ id: 'absence', userId: 'a', absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-10', reason: 'Férias' },
        { id: 'gone', userId: 'gone', absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-10', reason: 'Eliminado' }] };
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today });
    let tree = h.render(props);
    expect(renderToStaticMarkup(tree)).toContain('Ana Silva: AUSENTE');
    h.state.view = '56-hd'; tree = h.render(props);
    const conflictBadge = find(tree, e => e.type === TimelineAbsenceBadge);
    expect(conflictBadge.props.description).toContain('Ana Silva · 05/10/2026 · Férias');
    expect(conflictBadge.props.description).not.toContain('Conflito');
    const plainDay = find(tree, e => e.props?.['data-timeline-drop-cell'] === 'other:2026-10-06');
    expect(find(plainDay, e => e.type === TimelineAbsenceBadge).props.description).toBe('Ana Silva · 06/10/2026 · Férias');
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('>AS</span>'); expect(html).not.toContain('Ana Silva: AUSENTE');
    expect(html).not.toContain('>Férias<'); expect(html).not.toContain('Eliminado');
    expect(html).not.toContain('bg-error/10'); expect(html).toContain('bg-surface-muted');
    expect(html).not.toContain('⚠'); expect(html).not.toContain('Conflito crítico');
    expect(html).toContain('project-timeline-conflict-cell');
    h.state.view = 28;
    expect(renderToStaticMarkup(h.render(props))).toContain('Ana Silva: AUSENTE');
  });
  it('creates HD tasks by double-click or keyboard in the correct cell, without plus buttons or nested-control side effects', () => {
    const created: any[] = [];
    const props = { ...timelinePreviewProps, projects: [project('one')], onCreateTask: (date: string, id?: string) => created.push([date, id]) };
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
    for (const view of ['56-hd']) {
      h.state.view = view;
      let tree = h.render(props);
      expect(renderToStaticMarkup(tree)).not.toContain('lucide-plus');
      expect(find(tree, e => e.props?.['aria-label']?.startsWith('Criar tarefa') && e.type !== 'td')).toBeUndefined();
      const projectCell = find(tree, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-06');
      const otherCell = find(tree, e => e.props?.['data-timeline-drop-cell'] === 'other:2026-10-07');
      expect(projectCell.props.tabIndex).toBe(0);
      projectCell.props.onDoubleClick({ target: {} });
      expect(created.at(-1)).toEqual(['2026-10-06', 'one']);
      otherCell.props.onDoubleClick({ target: {} });
      expect(created.at(-1)).toEqual(['2026-10-07', undefined]);
      let count = created.length;
      projectCell.props.onDoubleClick({ target: { closest: () => ({ tagName: 'BUTTON' }) } });
      expect(created).toHaveLength(count);
      const target = {};
      let prevented = false;
      projectCell.props.onKeyDown({ key: 'Enter', target, currentTarget: target, preventDefault() { prevented = true; } });
      expect(prevented).toBe(true); expect(created.at(-1)).toEqual(['2026-10-06', 'one']);
      count = created.length;
      projectCell.props.onKeyDown({ key: 'Enter', target: {}, currentTarget: target });
      expect(created).toHaveLength(count);
      const readOnly = h.render({ ...props, canCreate: false });
      const restrictedCell = find(readOnly, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-06');
      expect(restrictedCell.props.onDoubleClick).toBeUndefined(); expect(restrictedCell.props.onKeyDown).toBeUndefined();
      expect(restrictedCell.props.tabIndex).toBeUndefined();
      h.state.fullscreen = true;
      otherCell.props.onDoubleClick({ target: {} });
      expect(h.state.fullscreen).toBe(false);
    }
    h.state.view = 28;
    const normal = h.render(props);
    expect(find(normal, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-06').props.onDoubleClick).toBeUndefined();
    find(normal, e => e.props?.['aria-label'] === 'Criar tarefa em Projeto one no dia 2026-10-06').props.onClick();
    expect(created.at(-1)).toEqual(['2026-10-06', 'one']);
  });
  it('filters upcoming events inclusively from today, with canonical task dates and optional risk reviews', () => {
    const projects = [project('today', { scheduledDate: '2026-10-05' }), project('edge7', { deliveryDate: '2026-10-11' }), project('edge14', { estimatedDate: '2026-10-18' }), project('edge21', { startDate: '2026-10-25' }), project('edge28', { deliveryDate: '2026-11-01' }), project('past', { deliveryDate: '2026-10-04' }), project('risk'), project('task'), project('none')];
    const tasks: any = [{ id: 't', projectId: 'task', title: 'Tarefa', estimatedDate: '2026-10-06', startDate: '2026-12-01', assigneeIds: ['u'] }, { id: 'deleted', projectId: 'none', estimatedDate: '2026-10-06', deleted: true }];
    const risks: any = [{ id: 'r', projectId: 'risk', title: 'Risco', reviewDate: '2026-10-06' }, { id: 'gone', projectId: 'none', reviewDate: '2026-10-06', deleted: true }];
    const events = buildProjectTimelineEvents(projects, tasks, risks, false);
    for (const [horizon, expected] of [[7, ['today', 'edge7', 'task']], [14, ['today', 'edge7', 'edge14', 'task']], [21, ['today', 'edge7', 'edge14', 'edge21', 'task']], [28, ['today', 'edge7', 'edge14', 'edge21', 'edge28', 'task']]] as const) {
      expect(filterProjectTimeline(projects, clients, statuses, events, new Map(), { ...visibleWeek, search: '', horizon }, today).map(p => p.id)).toEqual([...expected]);
    }
    const withRisks = buildProjectTimelineEvents(projects, tasks, risks, true);
    expect(filterProjectTimeline(projects, clients, statuses, withRisks, new Map(), { ...visibleWeek, search: '', horizon: 7 }, today).map(p => p.id)).toContain('risk');
    expect(withRisks.has('none')).toBe(false);
    expect(events.get('task')?.get('2026-10-06')?.[0].kind).toBe('task');
  });
  it('labels each project date by its meaning and keeps cell borders on collapsed rows', () => {
    const dated = project('dated', { startDate: '2026-10-05', scheduledDate: '2026-10-06', estimatedDate: '2026-10-07', deliveryDate: '2026-10-08' });
    const events = buildProjectTimelineEvents([dated], [], [], false).get('dated');
    expect(events?.get('2026-10-05')?.[0].title).toBe('Adjudicação');
    expect(events?.get('2026-10-06')?.[0].title).toBe('Data agendada');
    expect(events?.get('2026-10-07')?.[0].title).toBe('Previsão de entrega');
    expect(events?.get('2026-10-08')?.[0].title).toBe('Data entrega');
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
    const tree = h.render({ ...timelinePreviewProps, projects: [dated] });
    const row = find(tree, e => e.type === 'th' && e.props?.scope === 'row' && e.props?.className?.includes('space-y-1'));
    expect(row.props.className).toContain('border-b');
    const cell = find(tree, e => e.type === 'td' && e.props?.['data-timeline-drop-cell'] === 'dated:2026-10-05');
    expect(cell.props.className).toContain('border-b border-l');
  });
  it('uses actual start only when both execution dates are present and supports project/client/IP searches', () => {
    const projects = [project('one'), project('two', { clientId: 'other' })];
    const tasks: any = [{ id: 't', projectId: 'one', title: 'Real', startDate: '2026-10-05', endDate: '2026-10-07', estimatedDate: '2026-12-01', assigneeIds: ['u'] }];
    const events = buildProjectTimelineEvents(projects, tasks, [], false);
    expect(events.get('one')?.has('2026-10-05')).toBe(true);
    expect(events.get('one')?.has('2026-12-01')).toBe(false);
    for (const search of ['projeto one', 'CLIENTE EXEMPLO', 'IP-one']) expect(filterProjectTimeline(projects, clients, statuses, events, new Map(), { ...visibleWeek, search, horizon: 'all' }, today).map(p => p.id)).toEqual(['one']);
  });
  it('shows 50 projects per page and resets pagination when filters change', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
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
  it('renders 7, 14 or 28 days, shades weekend/special columns and never constrains table vertical height', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
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
    expect(dock.props.className).toContain('relative');
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
    for (const period of [28] as const) {
      find(tree, e => e.type === DateViewNavigator).props.onPeriodDaysChange(period);
      tree = h.render({ ...timelinePreviewProps, projects: [project('one')] });
      expect(renderToStaticMarkup(tree).match(/scope="col"/g)).toHaveLength(period + 1);
      expect(find(tree, e => e.type === DateViewNavigator).props.periods).toEqual([7, 14, 28]);
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
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
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
  it.each([7, 14, 28, '56-hd'])('expands undated tasks with the project and schedules them by drag in view %s', (view) => {
    const task: any = { id: 'pending', projectId: 'one', title: 'Por planear', startDate: '2026-10-04', endDate: '', estimatedDate: '', assigneeIds: [], statusId: 'pending' };
    const updates: any[] = [];
    let selected = '';
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all', view });
    const props = { ...timelinePreviewProps, projects: [project('one'), project('two')], tasks: [task], updateTask: (id: string, change: any) => updates.push([id, change]), onSelectTask: (item: any) => { selected = item.id; } };
    let tree = h.render(props);
    const cell = find(tree, e => e.props?.['data-timeline-project-cell'] === 'one');
    expect(find(cell, e => e.props?.role === 'img').props['aria-label']).toBe('1 tarefa sem data de Projeto one');
    expect(renderToStaticMarkup(cell)).toContain('lucide-calendar-days');
    expect(renderToStaticMarkup(cell)).not.toContain('>Tarefas sem data<');
    expect(find(cell, e => e.props?.['aria-label'] === 'Abrir tarefa sem data Por planear')).toBeUndefined();
    expect(find(find(tree, e => e.props?.['data-timeline-project-cell'] === 'two'), e => e.props?.role === 'img')).toBeUndefined();
    find(cell, e => e.props?.['aria-expanded'] === false).props.onClick();
    tree = h.render(props);
    expect(renderToStaticMarkup(tree)).toContain('Data incompleta');
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
    find(find(tree, e => e.props?.['data-timeline-project-cell'] === 'one'), e => e.props?.['aria-expanded'] === true).props.onClick();
    tree = h.render(props);
    expect(find(tree, e => e.props?.['aria-label'] === 'Abrir tarefa sem data Por planear')).toBeUndefined();
    find(find(tree, e => e.props?.['data-timeline-project-cell'] === 'one'), e => e.props?.['aria-expanded'] === false).props.onClick();
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
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
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
    const source = readFileSync(new URL('../domains/projects/ui/ProjectTimeline.tsx', import.meta.url), 'utf8');
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
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
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
  it('marks both sides of a cross-project conflict and formats expanded task details', () => {
    const title = 'Tarefa longa que deve ocupar no máximo duas linhas quando o bloco está expandido';
    const tasks: any = [
      { id: 'other', projectId: null, title: 'Outra tarefa', estimatedDate: '2026-10-05', assigneeIds: ['u'], statusId: 'pending' },
      { id: 'project', projectId: 'one', title, estimatedDate: '2026-10-05', assigneeIds: ['u'], estimatedHours: '8', statusId: 'pending' },
    ];
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
    const props = { ...timelinePreviewProps, projects: [project('one')], tasks, users: [{ id: 'u', name: 'Ana Silva' }] } as any;
    let tree = h.render(props);
    for (const key of ['other:2026-10-05', 'one:2026-10-05']) {
      expect(find(tree, e => e.props?.['data-timeline-drop-cell'] === key).props.className).toContain('project-timeline-conflict-cell');
    }
    expect(find(tree, e => e.props?.['data-timeline-drop-cell'] === 'one:2026-10-06').props.className).not.toContain('project-timeline-conflict-cell');
    find(tree, e => e.props?.['aria-expanded'] === false).props.onClick();
    tree = h.render(props);
    const heading = find(tree, e => e.type === 'span' && e.props?.title === title);
    expect(heading.props.className).toContain('line-clamp-2');
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('8h</span>');
    expect(html).not.toContain('8 h previstas');
  });
  it('reports absences in other tasks, including days without tasks, and highlights assigned conflicts', () => {
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
    const props = {
      ...timelinePreviewProps, projects: [], users: [{ id: 'u', name: 'Ana Silva' }, { id: 'gone', name: 'Inativo', deleted: true }],
      tasks: [{ id: 'other', projectId: null, title: 'Visita', estimatedDate: '2026-10-05', assigneeIds: ['u'], statusId: 'pending' }],
      absences: [{ id: 'a', userId: 'u', absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-10', reason: 'Férias' },
        { id: 'b', userId: 'gone', absenceStartDate: '2026-10-05', absenceEndDate: '2026-10-10', reason: 'Outra' }],
    } as any;
    const tree = h.render(props);
    const html = renderToStaticMarkup(tree);
    expect(html).not.toContain('⚠'); expect(html).not.toContain('Conflito crítico');
    expect(html).toContain('Ana Silva: AUSENTE');
    expect(html).toContain('Férias');
    expect(html).not.toContain('Inativo:');
    expect(find(tree, e => e.props?.['data-timeline-drop-cell'] === 'other:2026-10-05').props.className).toContain('project-timeline-conflict-cell');
    expect(find(tree, e => e.props?.['data-timeline-drop-cell'] === 'other:2026-10-06').props.className).not.toContain('project-timeline-conflict-cell');
    const widths = find(tree, e => e.type === 'colgroup').props.children[1].map((e: any) => e.props.style?.width);
    expect(widths[5]).toBeUndefined();
  });
  it('keeps compact task cards visible while project details expand and collapse', () => {
    const task: any = { id: 't', projectId: 'one', title: 'Tarefa compacta', estimatedDate: '2026-10-10', statusId: 'custom', assigneeIds: ['u'], estimatedHours: '4' };
    const props: any = { ...timelinePreviewProps, projects: [project('one')], tasks: [task], users: [{ id: 'u', name: 'Ana Silva' }], taskStatuses: [{ id: 'custom', name: 'Estado tarefa exclusivo', color: 'verde' }] };
    const h = createSectionHarness('ProjectTimeline.tsx', { anchor: today, horizon: 'all' });
    let tree = h.render(props), html = renderToStaticMarkup(tree);
    expect(html).toContain('Cliente Exemplo'); expect(html).not.toContain('>Projeto one<');
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
    expect(html).toContain('Tarefa compacta'); expect(html).toContain('Ana Silva'); expect(html).toContain('4h'); expect(html).toContain('AS');
    expect(html).toContain('border-l-4'); expect(html).not.toContain('Estado tarefa exclusivo');
    expect(html).toContain('IP-one'); expect(html).not.toContain('IP:');
    find(tree, e => e.props?.['aria-expanded'] === true).props.onClick();
    html = renderToStaticMarkup(h.render(props));
    expect(html).toContain('Tarefa compacta');
    expect(html).not.toContain('>IP-one<');
  });
});
