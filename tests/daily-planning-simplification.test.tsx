import { describe, it, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import CalendarSection from '../components/CalendarSection';
import { isTaskOnDate } from '../lib/operationalCalendar';

const props: any = { projects: [{ id: 'project', title: 'Projeto diário' }], tasks: [], users: [], clients: [], absences: [],
  taskStatuses: [], currentUser: { id: 'qa-user', roleId: 'ug-1' }, userGroups: [] };

describe('Daily planning without allocation UI', () => {
  it('keeps the operational weekly calendar and two visible views', () => {
    const html = renderToStaticMarkup(<CalendarSection {...props} />);
    expect(html).toContain('Calendário semanal');
    expect(html).toContain('Timeline de projetos');
    expect(html).not.toContain('CONFIRMED');
    expect(html).not.toContain('DRAFT');
  });
  it('uses canonical task date semantics without changing actual execution dates', () => {
    const task: any = { estimatedDate: '2026-10-05', estimatedHours: '02:30', deleted: false };
    expect(isTaskOnDate(task, '2026-10-05')).toBe(true);
    expect(isTaskOnDate({ ...task, startDate: '2026-10-06', endDate: '2026-10-07' }, '2026-10-06')).toBe(true);
  });
  it('renders task hours on the project timeline and opens the existing task modal', () => {
    const url = new URL('../components/CalendarSection.tsx', import.meta.url);
    const source = readFileSync(url, 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const states = ['projects', new Date(2026, 9, 5), '', null];
    let cursor = 0;
    const requireActual = createRequire(url);
    const exports: any = {};
    const react = { ...React, useState: () => [states[cursor++], () => {}], useMemo: (callback: any) => callback() };
    new Function('require', 'exports', js)((name: string) => name === 'react' ? react : requireActual(name), exports);
    const html = renderToStaticMarkup(exports.default({ ...props, tasks: [{ id: 'task', title: 'Tarefa diária', projectId: 'project', estimatedDate: '2026-10-05', estimatedHours: '02:30', deleted: false }] }));
    expect(html).toContain('Tarefa diária');
    expect(html).toContain('2.5 h previstas');
    expect(html).toContain('Criar tarefa em Projeto diário no dia 2026-10-05');
    expect(source).toContain('mode: canWriteTasks');
  });
  it('removes allocation queries and props from application and task/calendar consumers', () => {
    for (const path of ['../app/page.tsx', '../hooks/useERP.ts', '../components/TaskSection.tsx', '../components/CalendarSection.tsx']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source).not.toContain('planningAllocations');
      expect(source).not.toContain('fetchPlanningCapacity');
      expect(source).not.toContain('createPlanningAllocation');
    }
  });
});
