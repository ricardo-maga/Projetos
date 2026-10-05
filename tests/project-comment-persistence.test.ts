import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/supabaseSync.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('      (state.comments && state.comments.length > 0) ?');
const end = source.indexOf('\n\n      // User Absences', start);
const expression = source.slice(start, end).trim().replace(/,$/, '');
const js = ts.transpileModule(`async function run(state: any, supabase: any) {
  const stringToUUID = (id: string) => id;
  const validProjIds = new Set();
  const validUsrIds = new Set(['author']);
  return ${expression};
}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const run = new Function(`${js}; return run;`)();

it('retains the project association when global sync contains no projects', async () => {
  let rows: any[] = [];
  const result = await run({ projects: [], comments: [{ id: 'comment', projectId: 'project', authorId: 'author', comment: 'Nota' }] }, {
    from(table: string) {
      expect(table).toBe('comments');
      return { upsert: async (payload: any[]) => { rows = payload; return { error: null }; } };
    },
  });
  expect(rows[0].project_id).toBe('project');
  expect(rows[0].comment).toBe('Nota');
  expect(result.error).toBeNull();
});

it('propagates foreign key errors instead of clearing the project association', async () => {
  const result = await run({ comments: [{ id: 'comment', projectId: 'missing', comment: 'Nota' }] }, {
    from: () => ({ upsert: async (rows: any[]) => {
      expect(rows[0].project_id).toBe('missing');
      return { error: { code: '23503', message: 'Project does not exist' } };
    } }),
  });
  expect(result.error.code).toBe('23503');
});
