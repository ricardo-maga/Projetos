import { describe, expect, it } from 'bun:test';
import { apiCreateTask, apiUpdateTask } from '../lib/taskOperations';
import { createTaskServer, updateTaskServer } from '../lib/tasks/taskService';

describe('Task priority transport', () => {
  it('sends the selected priority on create and edit, and sends null when clearing it', async () => {
    const originalFetch = globalThis.fetch;
    const payloads: Record<string, unknown>[] = [];
    try {
      globalThis.fetch = (async (_url, options) => {
        payloads.push(JSON.parse(String(options?.body)));
        return Response.json({ success: true, data: { id: 'task-1', title: 'Tarefa', statusId: 'open', priorityId: payloads.at(-1)?.priorityId } });
      }) as typeof fetch;

      await apiCreateTask({ title: 'Tarefa', priorityId: 'priority-3' });
      await apiUpdateTask('task-1', { priorityId: 'priority-3', version: 1 });
      await apiUpdateTask('task-1', { priorityId: null, version: 2 });

      expect(payloads.map(payload => payload.priorityId)).toEqual(['priority-3', 'priority-3', null]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('passes priority changes to the atomic database functions', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const sb = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: { id: 'task-1', task_title: 'Tarefa', priority_id: args.p_priority_id, version: 2 }, error: null };
      },
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
    };

    await createTaskServer(sb as any, { id: 'task-1', title: 'Tarefa', priorityId: 'priority-3', userId: 'actor' });
    await updateTaskServer(sb as any, 'task-1', { priorityId: 'priority-3', version: 1, userId: 'actor' });
    await updateTaskServer(sb as any, 'task-1', { priorityId: null, version: 2, userId: 'actor' });
    await updateTaskServer(sb as any, 'task-1', { statusId: 'ts-2', version: 3, userId: 'actor' });

    expect(calls.map(call => call.name)).toEqual(['create_task_atomic', 'update_task_atomic', 'update_task_atomic', 'update_task_atomic']);
    expect(calls.map(call => call.args.p_priority_id)).toEqual(['priority-3', 'priority-3', null, null]);
    expect(calls.slice(1).map(call => call.args.p_update_priority)).toEqual([true, true, false]);
  });
});
