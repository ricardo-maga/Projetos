import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { M3Button, M3IconButton, M3FilterChip, M3SegmentedControl, M3SectionHeader } from '../components/M3';
import DateViewNavigator from '../components/ui/DateViewNavigator';

describe('Material 3 / Workspace primitives', () => {
  it('actions do not submit forms by default, but explicit submit is supported', () => {
    expect(renderToStaticMarkup(<M3Button>Editar</M3Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<M3Button type="submit">Gravar</M3Button>)).toContain('type="submit"');
  });

  it('loading disables the action and exposes busy state', () => {
    const html = renderToStaticMarkup(<M3Button isLoading>Gravar</M3Button>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Gravar');
  });

  it('outlined and destructive styles remain explicit', () => {
    const html = renderToStaticMarkup(<M3Button tone="outlined" danger>Eliminar</M3Button>);
    expect(html).toContain('m3-button--outlined');
    expect(html).toContain('m3-button--danger');
  });

  it('icon actions retain their accessible name and responsive visibility classes', () => {
    const html = renderToStaticMarkup(<M3IconButton label="Abrir menu" className="hidden md:inline-flex">+</M3IconButton>);
    expect(html).toContain('aria-label="Abrir menu"');
    expect(html).toContain('type="button"');
    expect(html).toContain('hidden md:inline-flex');
  });

  it('filter chips expose selected and disabled states', () => {
    expect(renderToStaticMarkup(<M3FilterChip selected>Ana</M3FilterChip>)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<M3FilterChip selected={false} disabled>Ana</M3FilterChip>)).toContain('disabled=""');
  });

  it('segments expose exactly one selection and pass the original value to the handler', () => {
    let selected: 7 | 14 = 7;
    const element = M3SegmentedControl<7 | 14>({
      label: 'Período', value: 7,
      options: [{ value: 7, label: '7 dias' }, { value: 14, label: '14 dias' }],
      onChange: value => { selected = value; },
    });
    const html = renderToStaticMarkup(element);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('role="group"');
    element.props.children[1].props.onClick();
    expect(selected).toBe(14);
  });

  it('segments preserve disabled options', () => {
    const html = renderToStaticMarkup(<M3SegmentedControl label="Vista" value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }]} onChange={() => {}} />);
    expect(html).toContain('disabled=""');
  });

  it('section header renders optional description and actions', () => {
    const html = renderToStaticMarkup(<M3SectionHeader title="Calendário" description="Agenda" actions={<M3Button>Nova tarefa</M3Button>} />);
    expect(html).toContain('<h2>Calendário</h2>');
    expect(html).toContain('<p>Agenda</p>');
    expect(html).toContain('Nova tarefa');
  });

  it('date navigation keeps labels, selected period and Today disabled state', () => {
    const html = renderToStaticMarkup(<DateViewNavigator periodDays={14} onPeriodDaysChange={() => {}} onPrev={() => {}} onNext={() => {}} onToday={() => {}} label="1–14 outubro" isToday />);
    expect(html).toContain('aria-label="Período anterior"');
    expect(html).toContain('aria-label="Período seguinte"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-live="polite"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});

describe('Workspace visual migration boundaries', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const migratedCSS = css.slice(css.indexOf('/* Gmail / Google Workspace'));

  it('uses Workspace blue, white cards and neutral light shell instead of purple surfaces', () => {
    for (const color of ['#0b57d0', '#d3e3fd', '#f6f8fc', '#ffffff', '#1f1f1f']) expect(migratedCSS).toContain(color);
    expect(migratedCSS).not.toContain('#fbf8ff');
  });

  it('does not override semantic status colors or global table geometry', () => {
    expect(migratedCSS).not.toContain('.bg-indigo-50');
    expect(migratedCSS).not.toContain('border-collapse: separate');
    expect(migratedCSS).not.toContain('button:not(.m3-nav-item)');
    expect(migratedCSS).toContain('[data-m3-exclude]');
    expect(migratedCSS).toContain('[data-active-tab="tickets"]');
  });

  it('provides keyboard focus and reduced motion', () => {
    expect(migratedCSS).toContain(':focus-visible');
    expect(migratedCSS).toContain('prefers-reduced-motion: reduce');
    expect(migratedCSS).not.toContain('display: inline-flex; align-items: center; justify-content: center; border-radius: 999px !important');
  });

  it('renders the weekly calendar once, without unsupported props', () => {
    const source = readFileSync(new URL('../components/CalendarSection.tsx', import.meta.url), 'utf8');
    expect(source.match(/<OperationalUserCalendar\b/g)).toHaveLength(1);
    expect(source).not.toContain('renderTopBarOnly');
  });
});
