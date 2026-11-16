import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
function block(needle: string) {
  const start = css.indexOf('{', css.indexOf(needle));
  if (start < 0) throw new Error(`Missing CSS scope: ${needle}`);
  return Object.fromEntries([...css.slice(start + 1, css.indexOf('}', start)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map(([, key, value]) => [key, value.replace(/\s*!important$/, '').trim()]));
}
const foundation = block('@theme {');
const baseline = block('[data-theme="blue"] {');
const themes = ['blue', 'emerald', 'violet', 'amber', 'slate', 'rose', 'domino'];
function color(name: string, theme = 'blue'): number[] {
  const values = { ...foundation, ...baseline, ...block(`[data-theme="${theme}"]`) };
  let value = values[name];
  for (let i = 0; value?.startsWith('var(') && i < 10; i++) value = values[value.slice(4, -1)];
  if (!/^#[a-f\d]{6}$/i.test(value || '')) throw new Error(`Unresolved ${name} in ${theme}: ${value}`);
  return value.slice(1).match(/../g)!.map(channel => Number.parseInt(channel, 16) / 255);
}
function luminance(rgb: number[]) {
  return rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a: number[], b: number[]) {
  return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
}
function tint(foreground: number[], background: number[], alpha: number) {
  return foreground.map((value, index) => value * alpha + background[index] * (1 - alpha));
}

describe('Shared text roles retain normal-label contrast', () => {
  for (const theme of themes) {
    it(`keeps status text readable on white and tinted muted surfaces in ${theme}`, () => {
      for (const name of ['--color-success', '--color-warning', '--color-error']) {
        const foreground = color(name, theme);
        expect(contrast(foreground, [1, 1, 1])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(foreground, tint(foreground, color('--color-surface-muted-token', theme), 0.1))).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`separates coloured text from fills in layered selection states in ${theme}`, () => {
      const foreground = color('--color-primary-ink', theme);
      const selected = tint(color('--primary-600', theme), color('--color-surface-muted-token', theme), 0.28);
      expect(contrast(foreground, selected)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color('--color-text-muted-token', theme), color('--color-surface-muted-token', theme))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
