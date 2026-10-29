import React from 'react';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Isolated hooks for the real component, leaving its children and handlers intact.
export function createSectionHarness(file: string, initial: Record<string, any> = {}) {
  const url = new URL(`../../components/${file}`, import.meta.url);
  const source = readFileSync(url, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast) === 'useState') names.push(n.name.elements[0].getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  const state: Record<string, any> = { ...initial }, effects: (() => any)[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0;
  const isolated = { ...React,
    useState(value: any) {
      const name = names[cursor++];
      if (!(name in state)) state[name] = typeof value === 'function' ? value() : value;
      return [state[name], (next: any) => state[name] = typeof next === 'function' ? next(state[name]) : next];
    },
    useRef(value: any) { return refs[refCursor++] ||= { current: value }; },
    useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn,
    useEffect: (fn: () => any) => effects.push(fn),
  };
  const require = createRequire(url), exports: any = {};
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const harnessAsyncAction = () => {
    let running = false;
    return {
      busy: false,
      async run(action: () => Promise<unknown> | unknown) {
        if (running) return undefined;
        running = true;
        try { return await action(); }
        finally { running = false; }
      },
    };
  };
  new Function('require', 'exports', js)((id: string) => {
    if (id === 'react') return isolated;
    // The source component runs outside a React renderer in this harness.
    // Keep the async guard without invoking React hooks from an imported module.
    if (id.endsWith('/hooks/useAsyncAction')) return { useAsyncAction: harnessAsyncAction };
    return require(id);
  }, exports);
  return { state, refs, effects, render(props: any) { cursor = 0; refCursor = 0; effects.length = 0; return exports.default(props); } };
}
