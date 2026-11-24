import { describe, expect, it } from 'bun:test';
import type { Task } from '@/lib/types';
import { getOperationalDayConflicts, getUserDayTasks } from '@/domains/calendar/modules/operationalCalendar';
import { renderCalendarFeed, type FeedTask } from '@/domains/calendar/modules/calendarFeeds';
import { getTaskConflictWarnings } from '@/domains/tasks/modules/taskConflicts';
import { checkTaskConflicts, normalizeTaskFromApiResponse } from '@/domains/tasks/modules/taskOperations';
import { buildPlannedTaskCopy } from '@/domains/tasks/modules/taskCopy';
import { getProjectTaskAnalysisMinutes } from '@/domains/projects/ui/ProjectSection';
import { createTaskSchema, queryTaskSchema, updateTaskSchema } from '@/lib/validations/task';

const date = '2026-11-24';
const pending = 'pending';
const planned = {
  id: 'planned-task', title: 'Instalação', statusId: pending, taskTypeId: 'type', projectId: null,
  estimatedDate: date, estimatedHours: '7', assigneeIds: ['user'], actualHours: null, deleted: false,
} as Task;
const provisional: Task = {
  ...planned, id: 'provisional-task', title: 'Reserva', estimatedHours: '4', planningStatus: 'provisional',
};

describe('Tarefas provisórias', () => {
  it('mostra a reserva na agenda e exclui-a dos avisos de sobreposição, de ausência e de carga', () => {
    const tasks = [planned, provisional];
    const anotherReservation = { ...provisional, id: 'another-reservation' };
    const absence = { userId: 'user', absenceStartDate: date, absenceEndDate: date };
    expect(getUserDayTasks(tasks, 'user', date)).toEqual(tasks);
    expect(getOperationalDayConflicts(tasks, undefined).hasConflict).toBe(false);
    expect(getOperationalDayConflicts([provisional, anotherReservation], undefined).hasConflict).toBe(false);
    expect(getOperationalDayConflicts([provisional], absence)).toMatchObject({ isAbsent: true, hasConflict: false, taskCount: 0 });
    expect(getOperationalDayConflicts(tasks, absence)).toMatchObject({ isAbsent: true, hasConflict: true, taskCount: 1 });
    expect(getTaskConflictWarnings({ date, assigneeIds: ['user'], planningStatus: 'provisional', tasks, users: [], absences: [absence] })).toEqual([]);
    expect(getTaskConflictWarnings({ date, assigneeIds: ['user'], currentTaskId: planned.id, tasks, users: [] })).toEqual([]);
    expect(checkTaskConflicts({ date, assigneeIds: ['user'], hours: 5 }, [provisional]).hasConflict).toBe(false);

    const confirmed: Task = { ...provisional, planningStatus: 'planned' };
    expect(getOperationalDayConflicts([planned, confirmed], undefined)).toMatchObject({ hasConflict: true, taskCount: 2 });
    expect(getTaskConflictWarnings({ date, assigneeIds: ['user'], currentTaskId: provisional.id, tasks, users: [] })).toHaveLength(1);
    expect(getProjectTaskAnalysisMinutes(provisional).workload).toBe(0);
    expect(getProjectTaskAnalysisMinutes(confirmed).workload).toBe(240);
    expect(getProjectTaskAnalysisMinutes(planned).workload).toBe(420);
  });

  it('ignora os níveis 3, 4 e 5 no conflito sem retirar tarefas ou horas', () => {
    const taskStatuses = [1, 2, 3, 4, 5].map(scale => ({ id: `custom-${scale}`, scale }));
    const effective: Task = { ...planned, statusId: 'custom-1' };
    const inProgress: Task = { ...planned, id: 'in-progress', statusId: 'custom-2' };
    const excluded = taskStatuses.slice(2).map(status => ({ ...planned, id: status.id, statusId: status.id }));
    const tasks = [effective, ...excluded];
    const absence = { userId: 'user', absenceStartDate: date, absenceEndDate: date };
    const day = (records: Task[], absent?: typeof absence) =>
      getOperationalDayConflicts(records, absent, 'Técnico', '24/11/2026', taskStatuses);

    expect(getUserDayTasks(tasks, 'user', date)).toHaveLength(4);
    expect(day(excluded, absence)).toMatchObject({ isAbsent: true, hasConflict: false, taskCount: 0 });
    expect(day(tasks)).toMatchObject({ hasConflict: false, taskCount: 1 });
    expect(day([...tasks, inProgress])).toMatchObject({ hasConflict: true, taskCount: 2 });
    expect(getTaskConflictWarnings({
      date, taskStatuses, assigneeIds: ['user'], currentTaskId: effective.id, statusId: effective.statusId, tasks, users: [],
    })).toEqual([]);
    for (const item of excluded) {
      expect(getTaskConflictWarnings({
        date, taskStatuses, assigneeIds: ['user'], statusId: item.statusId, tasks, users: [], absences: [absence],
      })).toEqual([]);
      expect(getProjectTaskAnalysisMinutes(item).workload).toBe(420);
    }
    expect(checkTaskConflicts({ date, taskStatuses, assigneeIds: ['user'], hours: 5 }, excluded).hasConflict).toBe(false);
    const legacy = ['ts-3', '99999999-9999-9999-9999-999999999904', '5'].map(statusId => ({ ...planned, statusId }));
    expect(getOperationalDayConflicts(legacy, undefined).taskCount).toBe(0);
  });

  it('transporta e duplica o planeamento e mantém a omissão numa atualização', () => {
    expect(normalizeTaskFromApiResponse({ id: 'old' }).planningStatus).toBe('planned');
    expect(normalizeTaskFromApiResponse({ id: 'reserve', planningStatus: 'provisional' }).planningStatus).toBe('provisional');
    expect(buildPlannedTaskCopy(provisional, date, null, [{ id: pending, scale: 1 }],
      [{ id: 'type', name: 'Instalação', scale: 1 }]).planningStatus).toBe('provisional');

    expect(createTaskSchema.parse({ title: 'Reserva', statusId: pending, taskTypeId: 'type', planningStatus: 'provisional' }).planningStatus).toBe('provisional');
    expect(updateTaskSchema.parse({ version: 1 }).planningStatus).toBeUndefined();
    expect(updateTaskSchema.parse({ version: 1, planningStatus: 'planned' }).planningStatus).toBe('planned');
    expect(updateTaskSchema.safeParse({ version: 1, planningStatus: null }).success).toBe(false);
    expect(queryTaskSchema.parse({ planningStatus: 'provisional' }).planningStatus).toBe('provisional');
  });

  it('publica a reserva como tempo livre e mantém o UID quando é confirmada', () => {
    const task: FeedTask = {
      id: provisional.id, task_title: provisional.title, project_id: null, start_date: null, end_date: null,
      estimated_date: date, version: 1, created_at: date, updated_at: date, assigneeIds: ['user'],
      planning_status: 'provisional',
    };
    const feed = (event: FeedTask) => renderCalendarFeed({
      scope: 'mine', ownerId: 'user', tasks: [event], projects: [], clients: [], users: [],
    });
    const tentative = feed(task);
    const confirmed = feed({ ...task, planning_status: 'planned', version: 2 });
    expect(tentative).toContain('SUMMARY:[Provisória]');
    expect(tentative).toContain('TRANSP:TRANSPARENT');
    expect(confirmed).toContain('TRANSP:OPAQUE');
    expect(confirmed).toContain('SEQUENCE:2');
    expect(confirmed.match(/^UID:.+$/m)?.[0]).toBe(tentative.match(/^UID:.+$/m)?.[0]);
  });
});
