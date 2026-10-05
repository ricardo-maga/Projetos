import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createProjectHarness, findProjectElement } from './fixtures/projects-m3-harness';
import { projectPreviewProps } from './projects-m3.test';

// Execute the real risk persistence block with a transport fake, not a copy
// of its implementation. The sync API intentionally supplies no projects.
const source = readFileSync(new URL('../lib/supabaseSync.ts', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('    // Save Project Risk Items'), source.indexOf('    // 5. Update many-to-many'));
const js = ts.transpileModule(`async function run(state: any, supabase: any) {
  const stringToUUID = (id: string) => id;
  const formatDbDate = (date: string) => date || null;
  const formatSupabaseError = (error: any) => error.message;
  const validUserIds = new Set(['owner']);
  ${block}
  return { success: true };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const run = new Function(`${js}; return run;`)();

const state = { projects: [], projectRiskItems: [{ id: 'risk', projectId: 'project', title: 'Teste', ownerId: 'owner' }] };

describe('Project risk global sync regression', () => {
  it('keeps the form open until success and prevents duplicate pending submissions', async () => {
    const h = createProjectHarness({ showRiskModal: true, riskTitle: 'Novo risco' });
    let resolve: any;
    let calls = 0;
    const pending = new Promise<{ success: boolean }>(r => { resolve = r; });
    const tree = h.render({ ...projectPreviewProps, selectedProjectId: 'qa-project',
      addProjectRiskItem: () => { calls++; return pending; } });
    const form = findProjectElement(tree, e => e.type === 'form' && e.props.onSubmit?.name === 'handleSaveRisk');
    const saving = form.props.onSubmit({ preventDefault() {} });
    await form.props.onSubmit({ preventDefault() {} });
    expect(calls).toBe(1);
    expect(h.state.showRiskModal).toBe(true);
    expect(h.state.isSavingRisk).toBe(true);
    resolve({ success: true });
    await saving;
    expect(h.state.showRiskModal).toBe(false);
    expect(h.state.riskTitle).toBe('');
  });

  it('preserves form data and reports a failed database write', async () => {
    const originalAlert = globalThis.alert;
    const alerts: string[] = [];
    globalThis.alert = ((message: string) => alerts.push(message)) as any;
    try {
      const h = createProjectHarness({ showRiskModal: true, riskTitle: 'Manter risco', editingRiskId: 'risk' });
      const tree = h.render({ ...projectPreviewProps, selectedProjectId: 'qa-project',
        updateProjectRiskItem: async () => ({ success: false, message: 'Falha de gravação' }) });
      const form = findProjectElement(tree, e => e.type === 'form' && e.props.onSubmit?.name === 'handleSaveRisk');
      await form.props.onSubmit({ preventDefault() {} });
      expect(h.state.showRiskModal).toBe(true);
      expect(h.state.riskTitle).toBe('Manter risco');
      expect(h.state.isSavingRisk).toBe(false);
      expect(alerts).toEqual(['Falha de gravação']);
    } finally { globalThis.alert = originalAlert; }
  });
  it('persists risk links using database projects even when payload projects are empty', async () => {
    let saved: any;
    const db = { from(table: string) {
      if (table === 'projects') return { select: () => ({ in: async (_: string, ids: string[]) => {
        expect(ids).toEqual(['project']); return { data: [{ id: 'project' }], error: null };
      } }) };
      expect(table).toBe('project_risk_items');
      return { upsert: async (rows: any) => { saved = rows; return { error: null }; } };
    } };
    expect(await run(state, db)).toEqual({ success: true });
    expect(saved[0].project_id).toBe('project');
    expect(saved[0].title).toBe('Teste');
  });

  it('rejects missing projects instead of silently discarding risks', async () => {
    const db = { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) };
    expect((await run(state, db)).success).toBe(false);
  });

  it('reports project lookup errors', async () => {
    const db = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'lookup failed' } }) }) }) };
    expect((await run(state, db)).message).toContain('lookup failed');
  });

  it('reports rejected writes rather than success', async () => {
    const db = { from: (table: string) => table === 'projects'
      ? { select: () => ({ in: async () => ({ data: [{ id: 'project' }], error: null }) }) }
      : { upsert: async () => ({ error: { message: 'write failed' } }) } };
    expect((await run(state, db)).message).toContain('write failed');
  });
});
