import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const brand = css.slice(css.indexOf('/* Domino brand palette'), css.indexOf('/* Shell and shared primitives'));

function contrastWithWhite(hex: string) {
  const rgb = hex.match(/[a-f0-9]{2}/gi)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05);
}

describe('Domino brand palette', () => {
  it('keeps all twelve exact swatches from the brand guide in one shared scope', () => {
    for (const color of ['003b5c', '66899d', 'b2c4ce', 'e5ebef', '009639', '66c088', 'b2dfc3', 'e5f4eb', '4298b5', '8ec1d3', 'c6e0e9', 'ecf5f8']) {
      expect(brand).toContain(`#${color}`);
    }
    expect(brand).toContain('--brand-charcoal: #1a1a1a');
    expect(brand).toContain('html,');
    expect(brand).toContain('body,');
    expect(brand).toContain('#main-root[data-theme]');
    expect(brand).not.toContain('data-active-tab');
  });

  it('rebinds Foundation and legacy blue aliases at the same theme boundary', () => {
    expect(brand).toContain('--color-primary: var(--primary-600)');
    expect(brand).toContain('--color-blue-600: var(--primary-600) !important');
    expect(brand).toContain('--color-surface: var(--color-surface-token)');
    expect(brand).toContain('--m3-primary: var(--brand-domino-blue)');
    expect(brand).toContain('--m3-on-primary-container: var(--brand-domino-blue)');
  });

  it('uses accessible strong fills without replacing semantic errors or configured status maps', () => {
    expect(brand).toContain('--color-success-strong: #007a2e');
    expect(contrastWithWhite('#003b5c')).toBeGreaterThan(4.5);
    expect(contrastWithWhite('#007a2e')).toBeGreaterThan(4.5);
    expect(brand).not.toContain('--color-error:');
    expect(brand).not.toContain('--color-warning:');
    expect(brand).not.toContain('--color-success:');
    expect(brand).not.toMatch(/\.(bg|text)-(emerald|rose|indigo|green)-/);
  });

  it('uses brand accents for Dashboard summaries while preserving status styling', () => {
    const source = readFileSync(new URL('../components/BentoDashboard.tsx', import.meta.url), 'utf8');
    expect(source).toContain('bg-brand-green/10 text-brand-green');
    expect(source).toContain('bg-brand-accent/10 text-brand-accent');
    expect(source).toContain('getProjectStatusStyle');
  });
});
