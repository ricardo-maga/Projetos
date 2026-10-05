import { describe, expect, it } from 'bun:test';
import React from 'react';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { findProjectElement as find } from './fixtures/projects-m3-harness';
import { FocusPagination, FOCUS_TASK_SIZES, FOCUS_PROJECT_SIZES } from '../components/FocusPagination';
import { assignedFocusRisks, focusHours, paginateFocus, readFocusPagination } from '../lib/myFocus';

function harness() {
  const url = new URL('../components/MyFocusSection.tsx', import.meta.url);
  const source = readFileSync(url, 'utf8');
  const ast = ts.createSourceFile('MyFocusSection.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast) === 'useState') names.push(n.name.elements[0].getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  const state: any = {}, preferences: any = {};
  let cursor = 0;
  const isolated = { ...React, useState(initial: any) {
    const name = names[cursor++];
    if (!(name in state)) state[name] = typeof initial === 'function' ? initial() : initial;
    return [state[name], (value: any) => state[name] = typeof value === 'function' ? value(state[name]) : value];
  }, useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn, useEffect: () => {} };
  const require = createRequire(url), exports: any = {};
  const pagination = { FocusPagination, FOCUS_TASK_SIZES, FOCUS_PROJECT_SIZES,
    useFocusPagination(userId: string, section: string, size: any) {
      const key = `${userId}:${section}`;
      preferences[key] ||= { size, page: 1 };
      return { preference: preferences[key], update: (next: any) => preferences[key] = next };
    } };
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', js)((id: string) => id === 'react' ? isolated : id === './FocusPagination' ? pagination : require(id), exports);
  return { state, preferences, render(props: any) { cursor = 0; return exports.default(props); } };
}
export const focusPreviewProps: any = {
  currentUser: { id: 'qa-focus-user', name: 'Ana Exemplo', roleId: 'ug-1' }, users: [], userGroups: [],
  clients: [{ id: 'c', clientName: 'Cliente de exemplo' }],
  projects: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, clientId: 'c', title: `Projeto ${i}`, installProjectNo: `IP-${i}`, projectManagerId: 'qa-focus-user', statusId: 'active', deliveryDate: '2026-12-01', deleted: false })),
  tasks: Array.from({ length: 23 }, (_, i) => ({ id: `t${i}`, title: `Tarefa ${i}`, projectId: 'p0', assigneeIds: ['qa-focus-user'], statusId: 'pending', estimatedHours: '02:00:00', estimatedDate: '2026-12-01', deleted: false })),
  projectStatuses: [{ id: 'active', name: 'Em curso', scale: 2 }], taskStatuses: [{ id: 'pending', name: 'Por iniciar', scale: 1 }],
  projectRiskItems: [{ id: 'r1', title: 'Risco da Ana', projectId: 'p0', ownerId: 'qa-focus-user', reviewDate: '2026-12-01', statusId: 'open' }, { id: 'r2', title: 'Risco de outro utilizador', projectId: 'p0', ownerId: 'other' }],
  riskStatuses: [{ id: 'open', name: 'Ativo' }], updateTask: () => {}, onSelectProject: () => {},
};
describe('My Focus M3', () => {
  it('uses default limits, whole-hour labels, assigned risks and no notifications or task progress', () => {
    const h = harness(), tree = h.render(focusPreviewProps);
    const tasks = find(tree, e => e.props?.id === 'card-my-tasks');
    const projects = find(tree, e => e.props?.id === 'card-managed-projects');
    expect(renderToStaticMarkup(tasks).match(/Executar tarefa Tarefa/g)).toHaveLength(10);
    expect(renderToStaticMarkup(projects).match(/N.º IP-/g)).toHaveLength(5);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('2h'); expect(html).not.toContain('02:00:00');
    expect(html).toContain('Risco da Ana'); expect(html).not.toContain('Risco de outro utilizador');
    expect(html).not.toContain('Notificações'); expect(html).not.toContain('Progresso das Tarefas');
    // Configured status helpers may legitimately emit palette classes. The
    // section itself must use semantic tokens rather than local palette maps.
    expect(readFileSync(new URL('../components/MyFocusSection.tsx', import.meta.url), 'utf8')).not.toMatch(/(?:bg|text|border)-(?:slate|blue|indigo)-/);
  });
  it('opens execute mode without mutating status; retains permission guard', () => {
    let calls = 0;
    const h = harness(), props = { ...focusPreviewProps, updateTask: () => { calls++; } };
    const tree = h.render(props);
    const action = find(tree, e => e.props?.['aria-label'] === 'Executar tarefa Tarefa 0');
    expect(action.props.disabled).toBe(false);
    action.props.onClick({ stopPropagation() {} });
    expect(h.state.taskModalState.mode).toBe('execute');
    expect(h.state.taskModalState.task.id).toBe('t0'); expect(calls).toBe(0);
    const restricted = h.render({ ...props, currentUser: { ...props.currentUser, roleId: 'ug-4' } });
    expect(find(restricted, e => e.props?.['aria-label'] === 'Executar tarefa Tarefa 0').props.disabled).toBe(true);
  });
  it('paginates independently and keeps project navigation and calendar selection', () => {
    const h = harness(); let projectId = '';
    let tree = h.render({ ...focusPreviewProps, onSelectProject: (id: string) => projectId = id });
    const pager = find(tree, e => e.type === FocusPagination && e.props.label === 'tarefas');
    pager.props.update({ size: 5, page: 2 });
    tree = h.render(focusPreviewProps);
    const html = renderToStaticMarkup(find(tree, e => e.props?.id === 'card-my-tasks'));
    expect(html).toContain('Executar tarefa Tarefa 5'); expect(html).not.toContain('Executar tarefa Tarefa 0');
    expect(find(tree, e => e.type === FocusPagination && e.props.label === 'projetos').props.preference.size).toBe(5);
    const calendar = find(tree, e => e.props?.id === 'card-monthly-calendar');
    const day = find(calendar, e => e.props?.['aria-pressed'] !== undefined);
    day.props.onClick(); expect(h.state.selectedDateStr).toBeDefined();
    const risks = find(tree, e => e.props?.id === 'card-my-risks');
    tree = h.render({ ...focusPreviewProps, onSelectProject: (id: string) => projectId = id });
    find(find(tree, e => e.props?.id === 'card-my-risks'), e => e.props?.onClick).props.onClick();
    expect(projectId).toBe('p0'); expect(risks).toBeDefined();
  });
  it('validates saved preferences and safely clamps empty or shortened lists', () => {
    expect(readFocusPagination('{bad', 10, FOCUS_TASK_SIZES)).toEqual({ size: 10, page: 1 });
    expect(readFocusPagination('{"size":20,"page":2}', 5, FOCUS_PROJECT_SIZES)).toEqual({ size: 5, page: 2 });
    expect(readFocusPagination('{"size":"all","page":0}', 10, FOCUS_TASK_SIZES)).toEqual({ size: 'all', page: 1 });
    expect(paginateFocus([1, 2, 3], { size: 5, page: 9 })).toEqual({ items: [1, 2, 3], page: 1, pages: 1 });
    expect(paginateFocus([], { size: 'all', page: 9 })).toEqual({ items: [], page: 1, pages: 1 });
    expect(focusHours('02:30:00')).toBe('3h'); expect(focusHours(null)).toBe('0h');
  });
  it('excludes deleted and foreign risks and risks linked to deleted or absent projects', () => {
    const risks: any = [{ id: 'a', projectId: 'p0', ownerId: 'u' }, { id: 'b', projectId: 'p0', ownerId: 'u', deleted: true }, { id: 'c', projectId: 'gone', ownerId: 'u' }, { id: 'd', projectId: 'p0', ownerId: 'other' }];
    expect(assignedFocusRisks(risks, focusPreviewProps.projects, 'u').map(r => r.id)).toEqual(['a']);
  });
});
