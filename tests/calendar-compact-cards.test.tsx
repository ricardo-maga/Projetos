import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';

describe('Compact weekly calendar', () => {
  it('collapses tasks to client names, expands independently and preserves opening the task', () => {
    let opened = '';
    const task: any = { id: 't', projectId: 'p', title: 'Detalhes privados da tarefa', statusId: 's', assigneeIds: ['u'], estimatedDate: '2026-10-07', estimatedHours: '2', deleted: false };
    const props: any = { tasks: [task], users: [{ id: 'u', name: 'Técnico Teste', type: 'Team' }], projects: [{ id: 'p', title: 'Projeto Exemplo', clientId: 'c' }], clients: [{ id: 'c', clientName: 'Cliente Exemplo' }], taskStatuses: [{ id: 's', name: 'Em curso', color: '#005a75', scale: 2 }], onSelectTask: (t: any) => opened = t.id, specialDays: [{ date: '2026-10-05', name: 'Feriado' }] };
    const h = createSectionHarness('OperationalUserCalendar.tsx', { selectedUserIds: ['u'], anchorDate: new Date(2026, 9, 7) });
    let tree = h.render(props);
    let html = renderToStaticMarkup(tree);
    expect(html).toContain('Cliente Exemplo');
    expect(html).not.toContain(task.title);
    expect(html).not.toContain('Abrir tarefa');
    expect(html).toContain('width:168px');
    expect(html).toContain('width:64px');
    expect(html).not.toContain('w-56');
    expect(html).toContain('SEG'); expect(html).not.toContain('Segunda');
    expect(html).toContain('OUT'); expect(html).toContain('Feriado');
    find(tree, e => e.props?.['aria-expanded'] === false).props.onClick();
    tree = h.render(props); html = renderToStaticMarkup(tree);
    expect(html).toContain(task.title); expect(html).toContain('Projeto Exemplo');
    expect(html).not.toContain('Atribuído a:');
    expect(opened).toBe('');
    find(tree, e => e.props?.children === 'Abrir tarefa').props.onClick();
    expect(opened).toBe('t');
    find(tree, e => e.props?.['aria-expanded'] === true).props.onClick();
    expect(renderToStaticMarkup(h.render(props))).not.toContain(task.title);
  });
});
