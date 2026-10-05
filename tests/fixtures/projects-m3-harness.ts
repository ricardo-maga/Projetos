import React from 'react';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Runs the real component with isolated state/effects; no DB, session or global
// module mocks. Children remain the actual Foundation and domain components.
export function createProjectHarness(initialState: Record<string, any> = {}) {
  const sourceUrl = new URL('../../components/ProjectSection.tsx', import.meta.url);
  const source = readFileSync(sourceUrl, 'utf8');
  const ast = ts.createSourceFile('ProjectSection.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const stateNames: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState') {
      stateNames.push(node.name.elements[0].getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const state: Record<string, any> = { ...initialState };
  const effects: (() => any)[] = [];
  let cursor = 0;
  const isolatedReact = {
    ...React,
    useState(initial: any) {
      const name = stateNames[cursor++];
      if (!(name in state)) state[name] = typeof initial === 'function' ? initial() : initial;
      return [state[name], (value: any) => { state[name] = typeof value === 'function' ? value(state[name]) : value; }];
    },
    useEffect(effect: () => any) { effects.push(effect); },
    useRef: (initial: any) => ({ current: initial }),
    useMemo: (calculate: () => any) => calculate(),
    useCallback: (callback: any) => callback,
  };
  const requireActual = createRequire(sourceUrl);
  const js = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const exports: Record<string, any> = {};
  new Function('require', 'exports', js)((id: string) => id === 'react' ? isolatedReact : requireActual(id), exports);
  return { state, effects, render(props: any) { cursor = 0; effects.length = 0; return exports.default(props); } };
}

export function findProjectElement(tree: any, predicate: (element: any) => boolean): any {
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = findProjectElement(child, predicate);
    if (found) return found;
  }
}
