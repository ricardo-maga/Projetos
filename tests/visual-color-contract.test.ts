import { describe, expect, it } from 'bun:test';
import { collectColorRoles, findUnresolvedColorClasses } from '../scripts/visual-color-contract.mjs';

const roles = collectColorRoles([`
  :root { --color-analysis-private: #111111; }
  @theme { --color-primary-ink: #003b5c; --color-analysis-text-primary: #111111; }
  @theme inline { --color-surface: var(--surface); }
`]);

describe('Registered visual colour contract', () => {
  it('detects accidental suffix migrations in hover variants and template fragments', () => {
    expect(findUnresolvedColorClasses('hover:text-analysis-text-primary-ink bg-surface/70 text-primary-ink', roles))
      .toEqual([{ value: 'text-analysis-text-primary-ink', index: 6 }]);
  });
  it('does not expose private root variables as generated utilities', () => {
    expect(findUnresolvedColorClasses('text-analysis-private', roles)).toHaveLength(1);
  });
  it('accepts registered colour roles while leaving geometry and typography to their contracts', () => {
    expect(findUnresolvedColorClasses('text-analysis-text-primary hover:text-primary-ink/80 rounded-card text-body-sm shadow-raised', roles)).toEqual([]);
  });
  it('does not interpret CSS variable names or longer identifiers as utility classes', () => {
    expect(findUnresolvedColorClasses('--color-analysis-text-primary-ink mytext-analysis-private', roles)).toEqual([]);
  });
});
