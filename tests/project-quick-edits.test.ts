import { afterEach, describe, expect, it } from 'bun:test';
import { createProjectActions } from '../domains/projects/modules/projectActions';
import { createTaskActions } from '../domains/tasks/modules/taskActions';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('project view quick edits', () => {
  it('keeps the exact confirmed project date without a global refresh', async () => {
    let state: any = {
      projects: [{ id: 'project-1', title: 'Projeto', version: 1, estimatedDate: '2026-11-01' }],
      tasks: [], notifications: [], projectStatuses: [],
    };
    let refreshes = 0;
    let sent: any;
    globalThis.fetch = (async (_url: string, options: any) => {
      sent = JSON.parse(options.body);
      return {
        ok: true, status: 200,
        json: async () => ({ success: true, data: { ...state.projects[0], version: 2, estimatedDate: sent.estimatedDate } }),
      } as Response;
    }) as typeof fetch;
    const actions = createProjectActions({
      isDbConfigured: true, state,
      setState: (update: any) => { state = update(state); },
      setSyncStatus: () => {}, setSyncError: () => {}, logAudit: () => {},
      refreshFromDatabase: async () => { refreshes++; return true; },
      getApiErrorMessage: (_result: any, fallback: string) => fallback,
    });

    await actions.updateProject('project-1', { estimatedDate: '2026-12-19' });

    expect(sent.estimatedDate).toBe('2026-12-19');
    expect(state.projects[0].estimatedDate).toBe('2026-12-19');
    expect(state.projects[0].version).toBe(2);
    expect(refreshes).toBe(0);
  });

  it('updates a project task from the API response without a global refresh', async () => {
    let state: any = {
      projects: [], notifications: [], taskStatuses: [],
      tasks: [{ id: 'task-1', title: 'Tarefa', projectId: 'project-1', version: 1, estimatedDate: '2026-11-01', assigneeIds: [] }],
    };
    let refreshes = 0;
    let sent: any;
    globalThis.fetch = (async (_url: string, options: any) => {
      sent = JSON.parse(options.body);
      return {
        ok: true, status: 200,
        json: async () => ({ success: true, data: { ...state.tasks[0], version: 2, estimatedDate: sent.estimatedDate } }),
      } as Response;
    }) as typeof fetch;
    const actions = createTaskActions({
      isDbConfigured: true, state,
      setState: (update: any) => { state = update(state); },
      setSyncStatus: () => {}, setSyncError: () => {}, logAudit: () => {},
      refreshFromDatabase: async () => { refreshes++; return true; },
      getApiErrorMessage: (_result: any, fallback: string) => fallback,
    });

    await actions.updateTask('task-1', { estimatedDate: '2026-12-19' });

    expect(sent.estimatedDate).toBe('2026-12-19');
    expect(state.tasks[0].estimatedDate).toBe('2026-12-19');
    expect(state.tasks[0].version).toBe(2);
    expect(refreshes).toBe(0);
  });
});
