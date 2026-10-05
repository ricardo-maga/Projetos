import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge } from '../components/ui/Badge';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('production build validates application types and lint instead of ignoring errors', () => {
  const config = read('next.config.ts');
  expect(config).toContain("tsconfigPath: './tsconfig.application.json'");
  expect(config).toContain('ignoreBuildErrors: false');
  expect(config).toContain('ignoreDuringBuilds: false');
  const scope = JSON.parse(read('tsconfig.application.json'));
  for (const folder of ['app', 'components', 'hooks', 'lib'])
    expect(scope.include.some((pattern: string) => pattern.startsWith(folder + '/'))).toBe(true);
});
test('Foundation Badge forwards the accessible native title', () => {
  expect(renderToStaticMarkup(React.createElement(Badge, { title: 'Falha de gravação', children: 'Erro' }))).toContain('title="Falha de gravação"');
});
test('project import closes the existing modal, not a removed form state', () => {
  const source = read('components/ProjectSection.tsx');
  expect(source).not.toContain('setShowAddTaskForm');
  expect(source).toContain('setTaskModalState(prev => ({ ...prev, isOpen: false, task: null }))');
});
