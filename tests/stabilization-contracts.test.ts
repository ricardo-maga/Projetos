import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { updateTaskSchema } from '../lib/validations/task';

describe('stabilization contracts', () => {
  test('task updates require the OCC version', () => {
    expect(updateTaskSchema.safeParse({ title: 'Tarefa atualizada' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: 'Tarefa atualizada', version: 4 }).success).toBe(true);
  });

  test('project details request every page of tasks', () => {
    const source = readFileSync(new URL('../components/ProjectSection.tsx', import.meta.url), 'utf8');
    expect(source).toContain('pageSize=100&page=${page}');
    expect(source).toContain('while (page <= totalPages)');
  });

  test('mandatory initial queries fail closed', () => {
    const source = readFileSync(new URL('../lib/supabaseSync.ts', import.meta.url), 'utf8');
    expect(source).toContain('const mandatoryResults = [');
    expect(source).toContain('if (mandatoryError)');
    expect(source).not.toContain("getProjectsServerData(client, { all: true, includeDeleted: true }).catch");
  });
});
