import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { deliveredProjectsWithPendingTasks, type DeliveredProjectsInput } from '../domains/projects/modules/deliveredProjectsWithPendingTasks';
import { buildReport } from '../domains/reports/modules/reportBuilder';
import Dashboard from '../domains/monitoring/ui/BentoDashboard';
import PendingProjectTaskList from '../domains/projects/ui/PendingProjectTaskList';

const input = (overrides: Partial<DeliveredProjectsInput> = {}): DeliveredProjectsInput => ({
  projects: [{ id: 'p', title: 'Linha entregue', clientId: 'c', statusId: 'delivered', installProjectNo: 'IP-123', deleted: false }] as DeliveredProjectsInput['projects'],
  tasks: [{ id: 't', projectId: 'p', title: 'Acerto final', statusId: 'open', estimatedDate: '2026-11-18', assigneeIds: ['u1', 'u2'], deleted: false }] as DeliveredProjectsInput['tasks'],
  projectStatuses: [{ id: 'delivered', name: 'Entregue', scale: 5 }, { id: 'active', name: 'Concluído', scale: 4 }, { id: 'cancelled', name: 'Concluído', scale: 6 }] as DeliveredProjectsInput['projectStatuses'],
  taskStatuses: [{ id: 'open', name: 'Por iniciar', scale: 1 }, { id: 'doing', name: 'Em curso', scale: 2 }, { id: 'done', scale: 3 }, { id: 'cancelled', scale: 4 }] as DeliveredProjectsInput['taskStatuses'],
  clients: [{ id: 'c', clientName: 'Cliente completo' }] as DeliveredProjectsInput['clients'],
  users: [{ id: 'u1', name: 'Ana Silva' }, { id: 'u2', name: 'Bruno Costa', deleted: true }] as DeliveredProjectsInput['users'],
  ...overrides,
});

describe('Delivered projects with pending tasks', () => {
  it('uses only exact configured levels, excluding deleted, unlinked and unknown records', () => {
    const data = input();
    const project = data.projects[0];
    const task = data.tasks[0];
    const result = deliveredProjectsWithPendingTasks({ ...data,
      projects: [project, ...[
        { id: 'active', statusId: 'active' }, { id: 'cancelled', statusId: 'cancelled' },
        { id: 'unknown', statusId: 'missing' }, { id: 'deleted', deleted: true },
        { id: 'no-pending' },
      ].map(extra => ({ ...project, ...extra }))],
      tasks: [task, { ...task, id: 'doing', statusId: 'doing' },
        ...['done', 'cancelled', 'missing'].map(statusId => ({ ...task, id: statusId, statusId })),
        ...['active', 'cancelled', 'unknown', 'deleted', 'orphan'].map(projectId => ({ ...task, id: `task-${projectId}`, projectId })),
        { ...task, id: 'deleted-task', deleted: true }, { ...task, id: 'standalone', projectId: null },
      ],
    });
    expect(result.map(group => group.project.id)).toEqual(['p']);
    expect(result[0].pendingTasks.map(row => row.task.id)).toEqual(['t', 'doing']);
    expect(deliveredProjectsWithPendingTasks({ ...data, projectStatuses: [] })).toEqual([]);
    expect(deliveredProjectsWithPendingTasks({ ...data, taskStatuses: [] })).toEqual([]);
  });

  it('sorts projects and planned dates, leaves undated tasks last and resolves all assignees', () => {
    const data = input();
    const task = data.tasks[0];
    const groups = deliveredProjectsWithPendingTasks({ ...data,
      projects: [data.projects[0], { ...data.projects[0], id: 'a', title: 'A primeira linha' }],
      tasks: [{ ...task, id: 'undated', estimatedDate: '', startDate: '2026-01-01', assigneeIds: [] },
        task, { ...task, id: 'early', estimatedDate: '2026-11-01', assigneeIds: ['missing'] },
        { ...task, id: 'alpha', title: 'Ajuste', estimatedDate: '2026-11-18' }, { ...task, id: 'other-project', projectId: 'a' }],
    });
    expect(groups.map(group => group.project.id)).toEqual(['a', 'p']);
    expect(groups[1].pendingTasks.map(row => row.task.id)).toEqual(['early', 't', 'alpha', 'undated']);
    expect(groups[1].pendingTasks.at(-1)?.date).toBe('');
    expect(groups[1].pendingTasks[0].assignees[0].name).toBe('Utilizador indisponível');
    expect(groups[1].pendingTasks[1].assignees.map(user => user.name)).toEqual(['Ana Silva', 'Bruno Costa']);
    expect(data.users[1].deleted).toBe(true);
    const html = renderToStaticMarkup(<PendingProjectTaskList tasks={groups[1].pendingTasks} onSelectTask={() => {}} />);
    expect(html).toContain('18/11/2026');
    expect(html).toContain('Sem data prevista');
    expect(html).toContain('Sem utilizadores atribuídos');
    expect(html).toContain('Ana Silva');
    expect(html).toContain('Bruno Costa');
  });

  it('matches legacy relation IDs to UUIDs without inferring a status level', () => {
    const data = input();
    const result = deliveredProjectsWithPendingTasks({ ...data,
      projects: [{ ...data.projects[0], statusId: 'ps-5' }],
      projectStatuses: [{ id: '33333333-3333-3333-3333-333333333305', name: 'Entregue', scale: 5, deleted: false }],
      tasks: [{ ...data.tasks[0], statusId: 'ts-2', assigneeIds: ['u-1'] }],
      taskStatuses: [{ id: '99999999-9999-9999-9999-999999999902', name: 'A decorrer', scale: 2 }],
      users: [{ ...data.users[0], id: '11111111-1111-1111-1111-111111111111' }],
    });
    expect(result[0].pendingTasks[0].assignees[0].name).toBe('Ana Silva');
    expect(deliveredProjectsWithPendingTasks({ ...data, projects: [{ ...data.projects[0], statusId: 'ps-5' }] })).toEqual([]);
  });

  it('feeds identical groups to the report and dashboard and removes a project after its last pending task completes', () => {
    const data = input();
    const report = buildReport('delivered-projects-with-pending-tasks', { ...data, projectMaterials: [], projectPriorities: [] });
    expect(report.rows).toEqual(deliveredProjectsWithPendingTasks(data));
    expect(report.total).toBe(1);
    expect(report.details[0].primary).toBe('Cliente completo · Linha entregue');
    const html = renderToStaticMarkup(<Dashboard {...data} absences={[]} comments={[]} projectCategories={[]} projectPriorities={[]} onNavigate={() => {}} onSelectProject={() => {}} onSelectTask={() => {}} />);
    const panel = html.split('<table aria-label="Projetos entregues com pendentes"')[1].split('</table>')[0];
    expect(html.indexOf('aria-label="Projetos em Forecast"')).toBeLessThan(html.indexOf('aria-label="Projetos entregues com pendentes"'));
    expect(panel).toContain('Cliente completo');
    expect(panel).toContain('Acerto final');
    expect(panel).toContain('Ana Silva');
    expect(panel).toContain('Abrir projeto Linha entregue');
    expect(panel).toContain('Abrir tarefa Acerto final');
    expect(panel).not.toContain('Prazo de entrega');
    expect(panel).not.toContain('<th class="px-5 py-3.5">Estado</th>');
    const completed = { ...data, tasks: [{ ...data.tasks[0], statusId: 'done' }] };
    expect(buildReport('delivered-projects-with-pending-tasks', { ...completed, projectMaterials: [], projectPriorities: [] }).total).toBe(0);
    const emptyHtml = renderToStaticMarkup(<Dashboard {...completed} absences={[]} comments={[]} projectCategories={[]} projectPriorities={[]} onNavigate={() => {}} onSelectProject={() => {}} />);
    expect(emptyHtml).toContain('Sem projetos entregues com pendentes.');
  });

  it('keeps task text readable without offering an unauthorized opening action', () => {
    const groups = deliveredProjectsWithPendingTasks(input());
    const html = renderToStaticMarkup(<PendingProjectTaskList tasks={groups[0].pendingTasks} />);
    expect(html).toContain('Acerto final');
    expect(html).not.toContain('<button');
  });
});
