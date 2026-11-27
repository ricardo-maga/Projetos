import { expect, it } from 'bun:test';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { COLOR_SCHEME_IDS, getPresentationTheme, normalizePreferredTheme } from '../lib/presentationTheme';

it('applies every public theme before login even when useERP exposes its bootstrap baseline', () => {
  for (const theme of ['domino','blue','emerald','violet','amber','slate','rose']) {
    expect(getPresentationTheme(false, CLEAN_BASELINE_STATE.appConfig.theme, theme, 'default')).toBe(theme);
  }
});

it('uses the authenticated configuration after the database has loaded', () => {
  expect(getPresentationTheme(true, 'emerald', 'blue', 'rose')).toBe('emerald');
});

it('keeps the cached and default fallbacks when public branding is unavailable', () => {
  expect(getPresentationTheme(false, CLEAN_BASELINE_STATE.appConfig.theme, undefined, 'violet')).toBe('violet');
  expect(getPresentationTheme(false, CLEAN_BASELINE_STATE.appConfig.theme)).toBe('default');
});

it('accepts the shared catalog and treats invalid personal preferences as inherited', () => {
  for (const scheme of COLOR_SCHEME_IDS) expect(normalizePreferredTheme(scheme)).toBe(scheme);
  for (const invalid of ['default', 'unknown', 'VIOLET', '', null, undefined, { theme: 'violet' }]) {
    expect(normalizePreferredTheme(invalid)).toBeNull();
  }
});

it('skips invalid application theme values in each configuration source', () => {
  expect(getPresentationTheme(true, 'invalid', 'emerald', 'violet')).toBe('emerald');
  expect(getPresentationTheme(false, 'emerald', 'invalid', 'violet')).toBe('default');
  expect(getPresentationTheme(true, 'invalid', 'invalid', 'violet')).toBe('default');
});
