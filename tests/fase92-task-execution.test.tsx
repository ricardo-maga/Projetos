import { describe, it, expect, afterEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import TaskDetailsModal, { getTaskUpdatePayload } from '../components/TaskDetailsModal';
import { SingleChoice, getNextChoiceIndex } from '../components/ui/SingleChoice';
import { Badge } from '../components/ui/Badge';
import { getTaskStatusStyle, getUserInitials } from '../lib/utils';
import { apiUpdateTask, validateTaskExecutionTimes, parseTaskHoursToFloat } from '../lib/taskOperations';
import { updateTaskServer } from '../lib/tasks/taskService';

const source = readFileSync(new URL('../components/TaskDetailsModal.tsx', import.meta.url), 'utf8');
const taskSource = readFileSync(new URL('../components/TaskSection.tsx', import.meta.url), 'utf8');
const projectSource = readFileSync(new URL('../components/ProjectSection.tsx', import.meta.url), 'utf8');
const statuses = [{ id: 'ts-1', name: 'Configurado A', color: 'laranja' }, { id: 'ts-2', name: 'Configurado B', color: 'vermelho' }];
const values = { projectId: 'do-not-update', title: 'Injected title', description: 'Injected description', taskTypeId: 'tt-1', estimatedDate: '2026-12-01', estimatedHours: 100, completedDate: '2026-12-02', statusId: 'ts-2', assigneeIds: ['eligible'], actualHours: 3, startDate: '2026-10-04', startTime: '09:00', endDate: '2026-10-04', endTime: '12:00', notes: 'Execution' };
const allowed = ['statusId', 'assigneeIds', 'actualHours', 'startDate', 'startTime', 'endDate', 'endTime', 'notes'].sort();
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Execute the real submit-handler source, with isolated state/API doubles.
function submitContext(overrides: Record<string, any> = {}) {
  const context: Record<string, any> = {
    effectiveMode: 'execute', canWrite: true, isSubmitting: false,
    formTitle: values.title, formProjectId: values.projectId, projects: [],
    formDescription: values.description, formTypeId: values.taskTypeId,
    formEstimatedDate: values.estimatedDate, formEstimatedHours: '100',
    formStatusId: values.statusId, formAssignees: values.assigneeIds,
    formActualHours: '3', formStartDate: values.startDate, formStartTime: values.startTime,
    formEndDate: values.endDate, formEndTime: values.endTime, formNotes: values.notes,
    activeTask: { id: 'task', version: 7 },
    setFormError: (error: string | null) => { context.error = error; },
    setIsSubmitting: (busy: boolean) => { context.busy = busy; },
    onClose: () => { context.closed = true; },
    onSaveSuccess: (task: any) => { context.saved = task; },
    updateTask: async (_id: string, payload: any) => { context.payload = payload; return { id: 'task', version: 8 }; },
    createTask: undefined, validateTaskExecutionTimes, parseTaskHoursToFloat, getTaskUpdatePayload,
    ...overrides,
  };
  const handler = source.slice(source.indexOf('const handleSave ='), source.indexOf('const handleDelete ='));
  const js = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const submit = new Function(...Object.keys(context), `${js}; return handleSave;`)(...Object.values(context));
  return { context, submit: () => submit({ preventDefault() {} }) };
}

describe('FASE 92 — UI and execution allowlist', () => {
  it('real list renderer keeps three circular initials and the remaining +N', () => {
    const renderer = taskSource.slice(taskSource.indexOf('const renderAssignees ='), taskSource.indexOf('const getStatusName ='));
    const js = ts.transpileModule(renderer, { fileName: 'renderer.tsx', compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
    const users = [{ id: 'qa-1', name: 'Ana Exemplo' }, { id: 'qa-2', name: 'Pedro Exemplo' }, { id: 'qa-3', name: 'Maria Exemplo' }, { id: 'qa-4', name: 'José Exemplo' }, { id: 'qa-5', name: 'Rui Exemplo' }];
    const render = new Function('React', 'Badge', 'users', 'matchUserId', 'getUserInitials', `${js}; return renderAssignees;`)(React, Badge, users, (a: string, b: string) => a === b, getUserInitials);
    const html = renderToStaticMarkup(render(users.map(user => user.id)));
    expect(html.match(/rounded-full/g)?.length).toBe(3);
    expect(html).toContain('>AE</span>');
    expect(html).toContain('>PE</span>');
    expect(html).toContain('>ME</span>');
    expect(html).toContain('+2');
    expect(renderToStaticMarkup(render([]))).toContain('Sem atribuição');
  });
  it('real delete handler keeps confirmation, cancellation and the existing deletion callback', async () => {
    const handler = source.slice(source.indexOf('const handleDelete ='), source.indexOf('const isReadOnly ='));
    const js = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    for (const accepted of [false, true]) {
      let deleted = false;
      let closed = false;
      let confirmed = '';
      const context = { activeTask: { id: 'qa-task', title: 'Original' }, deleteTask: async (id: string) => { expect(id).toBe('qa-task'); deleted = true; }, window: { confirm: (message: string) => { confirmed = message; return accepted; } }, setIsSubmitting: () => {}, onDeleteSuccess: undefined, onClose: () => { closed = true; }, setFormError: () => {} };
      const remove = new Function(...Object.keys(context), `${js}; return handleDelete;`)(...Object.values(context));
      await remove();
      expect(confirmed).toContain('Tem a certeza');
      expect(deleted).toBe(accepted);
      expect(closed).toBe(accepted);
    }
  });
  it('drops every locked planning field even if supplied to the execution builder', () => {
    expect(Object.keys(getTaskUpdatePayload('execute', values)).sort()).toEqual(allowed);
    expect(getTaskUpdatePayload('edit', values)).toBe(values);
  });
  it('real submit sends only allowed fields, preserving success and loading handling', async () => {
    const { context, submit } = submitContext({ formTitle: '' });
    await submit();
    expect(Object.keys(context.payload).sort()).toEqual(allowed);
    expect(context.payload.assigneeIds).toEqual(['eligible']);
    expect(context.saved.version).toBe(8);
    expect(context.closed).toBe(true);
    expect(context.busy).toBe(false);
  });
  it('real submit preserves errors and prevents forbidden/repeated submissions', async () => {
    const failed = submitContext({ updateTask: async () => { throw new Error('Conflict'); } });
    await failed.submit();
    expect(failed.context.error).toBe('Conflict');
    expect(failed.context.closed).toBeUndefined();
    expect(failed.context.busy).toBe(false);
    for (const overrides of [{ canWrite: false }, { isSubmitting: true }]) {
      const blocked = submitContext(overrides);
      await blocked.submit();
      expect(blocked.context.payload).toBeUndefined();
    }
  });
  it('keeps temporal validation before persistence', async () => {
    const invalid = submitContext({ formEndDate: '2026-10-03' });
    await invalid.submit();
    expect(invalid.context.payload).toBeUndefined();
    expect(invalid.context.error).toContain('data de fim');
  });
  it('renders planning read-only, execution editable, and exactly one status group first', () => {
    const html = renderToStaticMarkup(<TaskDetailsModal isOpen mode="execute" taskStatuses={statuses} users={[]} projects={[]} clients={[]} onClose={() => {}} />);
    expect(html.match(/role="radiogroup"/g)?.length).toBe(1);
    expect(html.indexOf('role="radiogroup"')).toBeLessThan(html.indexOf('Dados de Planeamento'));
    for (const field of ['formTitle', 'formEstimatedDate', 'formEstimatedHours', 'formDescription', 'projectSearchQuery']) {
      const tag = html.match(new RegExp(`<(input|textarea)[^>]*id="task-${field}"[^>]*>`))?.[0];
      expect(tag).toContain('readOnly');
    }
    expect(html.match(/<select[^>]*id="task-formTypeId"[^>]*>/)?.[0]).toContain('disabled');
    for (const field of ['formActualHours', 'formStartDate', 'formStartTime', 'formEndDate', 'formEndTime', 'formNotes']) {
      const tag = html.match(new RegExp(`<(input|textarea)[^>]*id="task-${field}"[^>]*>`))?.[0];
      expect(tag).toBeDefined();
      expect(tag).not.toContain('readOnly');
    }
    expect(html.match(/<fieldset[^>]*>/)?.[0]).not.toContain('disabled');
    const view = renderToStaticMarkup(<TaskDetailsModal isOpen mode="view" taskStatuses={statuses} users={[]} projects={[]} clients={[]} onClose={() => {}} />);
    expect(view.match(/<fieldset[^>]*>/)?.[0]).toContain('disabled');
  });
  it('single choice uses configured names/colors, one checked option and keyboard navigation', () => {
    const options = statuses.map(s => ({ value: s.id, label: s.name, className: getTaskStatusStyle(s.id, statuses).badgeClass }));
    const html = renderToStaticMarkup(<SingleChoice label="Estado" value="ts-2" options={options} onChange={() => {}} />);
    expect(html.match(/aria-checked="true"/g)?.length).toBe(1);
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html).toContain('Configurado B');
    expect(html).toContain(getTaskStatusStyle('ts-2', statuses).bgClass);
    expect(getNextChoiceIndex('ArrowRight', 1, 2)).toBe(0);
    expect(getNextChoiceIndex('ArrowLeft', 0, 2)).toBe(1);
    expect(getNextChoiceIndex('Home', 1, 2)).toBe(0);
    expect(getNextChoiceIndex('End', 0, 2)).toBe(1);
    expect(getNextChoiceIndex('Tab', 0, 2)).toBeUndefined();
    const disabled = renderToStaticMarkup(<SingleChoice label="Estado" value="ts-2" options={options} onChange={() => {}} disabled />);
    expect(disabled.match(/disabled=""/g)?.length).toBe(2);
  });
  it('list presentation and confirmation stay consistent, projects use canonical badges', () => {
    expect(taskSource).not.toContain('Lista Operacional de Tarefas');
    expect(taskSource).toContain('Lista de tarefas');
    expect(taskSource).toContain('const maxVisible = 3');
    expect(taskSource).toContain('rounded-full');
    expect(taskSource).toContain('+{');
    expect(taskSource).toContain('Confirmar Eliminação de Tarefa');
    expect(taskSource).toContain('hover:text-error focus-visible:text-error');
    expect(taskSource).toContain("openTaskModal(t, 'execute')");
    expect(projectSource).toContain('<Badge className={getTaskStatusStyle(task.statusId, taskStatuses).badgeClass}>');
    expect(source).not.toContain('value={formStatusId}');
  });
});

describe('FASE 92 — existing API/service partial persistence contract (mock transport)', () => {
  it('serialized PATCH excludes planning and retains version/status/assignees', async () => {
    let sent: any;
    globalThis.fetch = (async (_url: any, options: any) => {
      sent = JSON.parse(options.body);
      return Response.json({ success: true, data: { id: 'task', version: 8, statusId: 'ts-2', assignedUserIds: ['eligible'] } });
    }) as typeof fetch;
    const result = await apiUpdateTask('task', { ...getTaskUpdatePayload('execute', values), version: 7 });
    expect(result.success).toBe(true);
    expect(sent.version).toBe(7);
    expect(sent.statusId).toBe('ts-2');
    expect(sent.assignedUserIds).toEqual(['eligible']);
    for (const key of ['projectId', 'title', 'description', 'estimatedHours', 'estimatedDate', 'taskTypeId', 'completedDate']) expect(sent).not.toHaveProperty(key);
  });
  it('keeps API OCC conflicts', async () => {
    globalThis.fetch = (async () => Response.json({ success: false, message: 'Conflict' }, { status: 409 })) as typeof fetch;
    const result = await apiUpdateTask('task', { statusId: 'ts-2', version: 7 });
    expect(result.isConflict).toBe(true);
    expect(result.status).toBe(409);
  });
  it('service sends canonical update flags and returns authoritative task_assignees', async () => {
    let args: any;
    const sb = {
      rpc: async (name: string, params: any) => { expect(name).toBe('update_task_atomic'); args = params; return { data: { id: 'task', task_title: 'Original', status_id: params.p_status_id, version: 8 }, error: null }; },
      from: (table: string) => { expect(table).toBe('task_assignees'); return { select: () => ({ eq: async () => ({ data: [{ user_id: 'eligible' }] }) }) }; },
    };
    const { assigneeIds, estimatedHours, actualHours, ...payload } = getTaskUpdatePayload('execute', values);
    const result = await updateTaskServer(sb as any, 'task', { ...payload, estimatedHours: estimatedHours === undefined ? undefined : parseTaskHoursToFloat(estimatedHours), actualHours: parseTaskHoursToFloat(actualHours), assignedUserIds: assigneeIds, version: 7, userId: 'actor' });
    expect(args.p_expected_version).toBe(7);
    expect(args.p_update_project_id).toBe(false);
    expect(args.p_update_assignees).toBe(true);
    expect(args.p_update_dates).toBe(true);
    for (const key of ['p_task_title', 'p_task_description', 'p_task_type_id', 'p_estimated_date', 'p_estimated_hours']) expect(args[key]).toBeNull();
    expect(result.data?.assignedUserIds).toEqual(['eligible']);
    expect(result.data?.version).toBe(8);
  });
  it('keeps service SQLSTATE mappings', async () => {
    for (const [code, status] of [['P0001', 409], ['23514', 400], ['42501', 403], ['P0002', 404]]) {
      const result = await updateTaskServer({ rpc: async () => ({ error: { code, message: 'existing error' } }) } as any, 'task', { version: 7, userId: 'actor' });
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(status as number);
    }
  });
});
