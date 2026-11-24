import React from 'react';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { X } from 'lucide-react';
import { IconButton } from '../components/ui/IconButton';
import { describe, expect, it } from 'bun:test';
import { updateTaskSchema } from '../lib/validations/task';
import { updateTaskServer } from '../lib/tasks/taskService';
import { apiUpdateTask } from '../lib/taskOperations';

describe('Planned date clearing', () => {
  it('preserves omitted temporal fields and normalizes explicit empty dates', () => {
    const omitted = updateTaskSchema.parse({ version: 1, title: 'Novo título' });
    for (const key of ['estimatedDate', 'startDate', 'endDate', 'startTime', 'endTime', 'completedDate'] as const)
      expect(omitted[key]).toBeUndefined();
    for (const value of ['', '   ', null])
      expect(updateTaskSchema.parse({ version: 1, estimatedDate: value }).estimatedDate).toBeNull();
  });

  it('transports clearing separately from omission through the actual schema and service', async () => {
    const calls: any[] = [];
    const sb = {
      rpc: async (_name: string, args: any) => {
        calls.push(args);
        return { data: { id: 'task', task_title: 'Tarefa', version: 2, estimated_date: args.p_estimated_date }, error: null };
      },
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
    };
    const original = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url, options) => {
        const parsed = updateTaskSchema.parse(JSON.parse(String(options?.body)));
        const result = await updateTaskServer(sb as any, 'task', { ...parsed, userId: 'actor' });
        return Response.json(result);
      }) as typeof fetch;
      for (const estimatedDate of [undefined, '', null, '2026-11-17']) {
        const result = await apiUpdateTask('task', { version: 1, estimatedDate });
        expect(result.success).toBe(true);
      }
      expect(calls.map(c => c.p_update_estimated_date)).toEqual([false, true, true, true]);
      expect(calls.map(c => c.p_estimated_date)).toEqual([null, null, null, '2026-11-17']);
      expect(calls.every(c => c.p_update_dates === false)).toBe(true);
    } finally { globalThis.fetch = original; }
  });
});

// Exercise the real modal action without requiring a database or a login.
it('clear action only changes editable form state and cannot submit the form', () => {
  const source = readFileSync(new URL('../domains/tasks/ui/TaskDetailsModal.tsx', import.meta.url), 'utf8');
  const condition = source.match(/^\s*const canClearEstimatedDate = .*;$/m)?.[0];
  const action = source.match(/\{(canClearEstimatedDate && \([\s\S]*?<\/IconButton>\s*\))\}/)?.[1];
  if (!condition || !action) throw new Error('Could not find the planned date clear action');
  const js = ts.transpileModule(`${condition}\nconst action = ${action};`, {
    fileName: 'action.tsx', compilerOptions: { jsx: ts.JsxEmit.React },
  }).outputText;
  let value = '2026-11-17';
  let fieldFocused = false;
  const inputRef = { current: { focus: () => { fieldFocused = true; } } };
  const renderAction = new Function(
    'React', 'IconButton', 'X', 'formEstimatedDate', 'isPlanningReadOnly', 'isSubmitting',
    'setFormEstimatedDate', 'estimatedDateInputRef', js + '; return action;',
  );
  const render = (date: string, readOnly: boolean, busy: boolean) =>
    renderAction(React, IconButton, X, date, readOnly, busy, (next: string) => { value = next; }, inputRef);
  expect(render('', false, false)).toBe(false);
  expect(render(value, true, false)).toBe(false);
  expect(render(value, false, true).props.disabled).toBe(true);
  const button = render(value, false, false);
  expect(button.props.type).toBe('button');
  expect(button.props['aria-label']).toBe('Limpar data planeada');
  button.props.onClick();
  expect(value).toBe('');
  expect(fieldFocused).toBe(true);
});
