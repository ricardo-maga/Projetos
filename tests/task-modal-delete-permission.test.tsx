import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { createTaskActions } from '../domains/tasks/modules/taskActions';

const source = readFileSync(new URL('../domains/tasks/ui/TaskDetailsModal.tsx', import.meta.url), 'utf8');
const task = { id: 'task', title: 'Tarefa de teste', deleted: false } as any;
function render(mode: any, canWrite: boolean, canDelete?: boolean, overrides: any = {}) {
  return renderToStaticMarkup(<TaskDetailsModal isOpen mode={mode} task={task} onClose={() => {}}
    taskStatuses={[]} users={[]} projects={[]} clients={[]} canWrite={canWrite} canDelete={canDelete}
    deleteTask={async () => true} {...overrides} />);
}
function deletion(overrides: Record<string, any> = {}) {
  const context: Record<string, any> = {
    activeTask: task, canDelete: true, effectiveMode: 'edit', submittingRef: { current: false },
    window: { confirm: () => { context.confirmed = true; return true; } },
    deleteTask: async () => { context.called = true; return true; },
    setIsSubmitting: (busy: boolean) => { context.busy = busy; },
    onDeleteSuccess: (id: string) => { context.deletedId = id; },
    onClose: () => { context.closed = true; }, setFormError: (error: string) => { context.error = error; },
    ...overrides,
  };
  const handler = source.slice(source.indexOf('const handleDelete ='), source.indexOf('const isReadOnly ='));
  const js = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return { context, remove: new Function(...Object.keys(context), js + '; return handleDelete;')(...Object.values(context)) };
}

describe('Task modal deletion capability', () => {
  it('uses deletion permission independently from editing, only in edit/execute', () => {
    for (const mode of ['edit', 'execute', 'view', 'create']) {
      for (const canWrite of [false, true]) {
        for (const canDelete of [false, true, undefined]) {
          const html = render(mode, canWrite, canDelete);
          expect(html.includes('Eliminar Tarefa')).toBe(canDelete === true && ['edit', 'execute'].includes(mode));
        }
      }
    }
    expect(render('edit', true, true, { task: null })).not.toContain('Eliminar Tarefa');
    expect(render('edit', true, true, { task: { ...task, deleted: true } })).not.toContain('Eliminar Tarefa');
    expect(render('edit', true, true, { deleteTask: undefined })).not.toContain('Eliminar Tarefa');
  });
  it('protects all fields and hides saving for a deletion-only profile', () => {
    const html = render('edit', false, true);
    for (const field of ['formTitle', 'formEstimatedDate', 'formEstimatedHours', 'formDescription', 'formActualHours', 'formStartDate', 'formStartTime', 'formEndDate', 'formEndTime', 'formNotes']) {
      const tag = html.match(new RegExp(`<(input|textarea)[^>]*id="task-${field}"[^>]*>`))?.[0];
      expect(tag).toContain('readOnly');
    }
    expect(html).not.toContain('type="submit"');
    expect(html).toContain('Eliminar Tarefa');
    expect(html.match(/<fieldset[^>]*>/)?.[0]).toContain('disabled');
  });
  it('rechecks permission, mode, task and busy state before confirming', async () => {
    for (const overrides of [{ canDelete: false }, { effectiveMode: 'view' }, { effectiveMode: 'create' }, { activeTask: null }, { activeTask: { ...task, deleted: true } }, { deleteTask: undefined }, { submittingRef: { current: true } }]) {
      const { context, remove } = deletion(overrides); await remove();
      expect(context.confirmed).toBeUndefined(); expect(context.called).toBeUndefined(); expect(context.closed).toBeUndefined();
    }
  });
  it('cancellation does not delete and success closes only after persistence', async () => {
    const cancelled = deletion({ window: { confirm: () => false } }); await cancelled.remove();
    expect(cancelled.context.called).toBeUndefined(); expect(cancelled.context.closed).toBeUndefined();
    let finish!: (success: boolean) => void;
    const pending = deletion({ deleteTask: () => new Promise<boolean>(resolve => { finish = resolve; }) });
    const first = pending.remove(); await pending.remove();
    expect(pending.context.busy).toBe(true); expect(pending.context.closed).toBeUndefined();
    finish(true); await first;
    expect(pending.context.closed).toBe(true); expect(pending.context.deletedId).toBe(task.id);
    expect(pending.context.busy).toBe(false); expect(pending.context.submittingRef.current).toBe(false);
  });
  it('keeps the modal open and releases the guard for failures or absent success', async () => {
    for (const deleteTask of [async () => false, async () => undefined, async () => { throw new Error('Sem permissão'); }, async () => { throw new Error('Conflito'); }, async () => { throw new Error('Não encontrada'); }]) {
      const { context, remove } = deletion({ deleteTask }); await remove();
      expect(context.closed).toBeUndefined(); expect(context.deletedId).toBeUndefined(); expect(context.error).toBeTruthy();
      expect(context.busy).toBe(false); expect(context.submittingRef.current).toBe(false);
    }
  });
  it('the canonical deletion action rejects missing/deleted tasks instead of silently succeeding', async () => {
    for (const tasks of [[], [{ ...task, deleted: true }]]) {
      const actions = createTaskActions({ state: { tasks } } as any);
      await expect(actions.deleteTask(task.id)).rejects.toThrow('disponível');
    }
  });
});

it('wires the canonical delete action from the page through the calendar to its shared task modal', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const calendar = readFileSync(new URL('../domains/calendar/ui/CalendarSection.tsx', import.meta.url), 'utf8');
  const pageCall = page.slice(page.indexOf('<CalendarSection'), page.indexOf('/>', page.indexOf('<CalendarSection')));
  const modalCall = calendar.slice(calendar.indexOf('<TaskDetailsModal'));
  expect(pageCall).toContain('deleteTask={deleteTask}');
  expect(modalCall).toContain('deleteTask={deleteTask}');
  expect(modalCall).toContain('canDelete={canDeleteTasks}');
});
