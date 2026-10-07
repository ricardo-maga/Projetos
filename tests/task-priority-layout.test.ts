import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

it('places configured priority beside task type, outside the date/hour grid', () => {
  const source = readFileSync('components/TaskDetailsModal.tsx', 'utf8');
  const ast = ts.createSourceFile('modal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let row = '';
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'div'
      && node.openingElement.getText(ast).includes('grid grid-cols-1 sm:grid-cols-2 gap-3')) {
      if (node.getText(ast).includes('id="task-formPriorityId"')) row = node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(row).toContain('id="task-formTypeId"');
  expect(row).not.toContain('id="task-formEstimatedDate"');
  expect(row).not.toContain('id="task-formEstimatedHours"');
  expect(row).toContain('projectPriorities.filter');
  expect(row).toContain('{priority.name}');
  expect(row).not.toContain('Crítica');
  expect(row.match(/id="task-formPriorityId"/g)).toHaveLength(1);
});
