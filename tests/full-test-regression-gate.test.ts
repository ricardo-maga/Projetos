import { describe, expect, it } from 'bun:test';
import { assessFullTestRun } from '../scripts/full-test-regression-gate.mjs';

const known = new Set(['UI antiga > exemplo']);
const report = (failures: string[], passed = 2) => [
  ...failures.map(name => `(fail) ${name} [1.00ms]`),
  `${passed} pass`,
  '0 skip',
  `${failures.length} fail`,
  `Ran ${passed + failures.length} tests across 2 files. [10.00ms]`,
].join('\n');

describe('full test regression gate', () => {
  it('accepts only the documented failures with a complete runner summary', () => {
    expect(assessFullTestRun(report(['UI antiga > exemplo']), 1, known).errors).toEqual([]);
  });

  it('rejects a new failure even when the known one also occurs', () => {
    const result = assessFullTestRun(report(['UI antiga > exemplo', 'Nova regressão']), 1, known);
    expect(result.unexpected).toEqual(['Nova regressão']);
    expect(result.errors).not.toEqual([]);
  });

  it('rejects a stale baseline entry and a runner crash', () => {
    expect(assessFullTestRun(report([]), 0, known).resolved).toEqual(['UI antiga > exemplo']);
    expect(assessFullTestRun('(fail) UI antiga > exemplo\nError: runner crashed', 1, known).errors)
      .toContain('O executor não produziu um resumo completo da suite.');
  });

  it('rejects truncated counts and inconsistent exit codes', () => {
    const output = report(['UI antiga > exemplo']).replace('1 fail', '2 fail');
    expect(assessFullTestRun(output, 1, known).errors).not.toEqual([]);
    expect(assessFullTestRun(report(['UI antiga > exemplo']), 2, known).errors).not.toEqual([]);
  });
});
