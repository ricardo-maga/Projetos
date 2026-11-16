import { expect, it } from 'bun:test';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';
import { getPresentationTheme } from '../lib/presentationTheme';

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
