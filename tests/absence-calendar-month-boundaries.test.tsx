import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { findProjectElement as find } from './fixtures/projects-m3-harness';

const users = [{ id: 'ana', name: 'Ana Silva' }, { id: 'bruno', name: 'Bruno Costa' }];
const absence = (id: string, userId: string, start: string, end = start) => ({
  id, userId, absenceStartDate: start, absenceEndDate: end, reason: 'Vacation', createdDate: start,
});
const harness = (year: number, month: number) => createSectionHarness('../domains/absences/ui/AbsenceCalendar.tsx', {
  currentCalendarDate: new Date(year, month - 1, 1),
});
const cell = (tree: any, date: string) => find(tree, element => element.props?.['data-date'] === date);

describe('Shared absence calendar month boundaries', () => {
  it('shows real adjacent dates, spanning absences and special days in both variants', () => {
    for (const variant of ['default', 'dashboard']) {
      const tree = harness(2026, 12).render({ users, variant,
        absences: [absence('previous', 'ana', '2026-11-29', '2026-12-02'), absence('next', 'bruno', '2026-12-31', '2027-01-02')],
        specialDays: [{ id: 'previous', date: '2026-11-30', name: 'Data especial' }, { id: 'next', date: '2027-01-01', name: 'Ano Novo' }],
      });
      const adjacentDayBackgrounds = {
        '2026-11-29': 'bg-calendar-weekend',
        '2026-11-30': 'bg-category-purple-100',
        '2027-01-01': 'bg-category-purple-100',
        '2027-01-02': 'bg-calendar-weekend',
      };
      for (const [date, background] of Object.entries(adjacentDayBackgrounds)) {
        const day = cell(tree, date);
        expect(day.props['data-outside-month']).toBe(true);
        expect(day.props.className).toContain(background);
        const html = renderToStaticMarkup(day);
        expect(html).toContain(`dateTime="${date}"`);
        expect(html).toContain('text-text-muted');
        expect(html).toContain(date.startsWith('2026-11') ? 'Ana Silva (Ausente:' : 'Bruno Costa (Ausente:');
      }
      expect(renderToStaticMarkup(cell(tree, '2026-11-30'))).toContain('Data especial');
      expect(renderToStaticMarkup(cell(tree, '2027-01-01'))).toContain('Ano Novo');
      expect(cell(tree, '2026-12-01').props['data-outside-month']).toBe(false);
      expect(renderToStaticMarkup(cell(tree, '2026-12-01'))).toContain('Ana Silva (Ausente:');
      expect(renderToStaticMarkup(cell(tree, '2026-12-03'))).not.toContain('(Ausente:');
    }
  });

  it('keeps the user filter on adjacent days and navigates across years', () => {
    const h = harness(2027, 1);
    const props = { users, userIdFilter: 'ana', absences: [
      absence('a', 'ana', '2026-12-31'), absence('b', 'bruno', '2026-12-31'),
    ] };
    let tree = h.render(props);
    const outsideWeekday = cell(tree, '2026-12-31');
    expect(outsideWeekday.props.className).toContain('bg-surface-muted');
    const html = renderToStaticMarkup(outsideWeekday);
    expect(html).toContain('Ana Silva (Ausente:');
    expect(html).not.toContain('Bruno Costa (Ausente:');
    find(tree, element => element.props?.['aria-label'] === 'Mês anterior').props.onClick();
    tree = h.render(props);
    expect(h.state.currentCalendarDate.getFullYear()).toBe(2026);
    expect(cell(tree, '2026-12-31').props['data-outside-month']).toBe(false);
    find(tree, element => element.props?.['aria-label'] === 'Mês seguinte').props.onClick();
    expect(h.state.currentCalendarDate.getFullYear()).toBe(2027);
  });

  it('renders complete weeks without extra padding weeks, including leap February', () => {
    for (const [year, month, start, end, count] of [
      [2026, 2, '2026-02-01', '2026-02-28', 28],
      [2028, 2, '2028-01-30', '2028-03-04', 35],
      [2026, 5, '2026-04-26', '2026-06-06', 42],
    ] as const) {
      const html = renderToStaticMarkup(harness(year, month).render({ users, absences: [] }));
      const dates = [...html.matchAll(/data-date="([^"]+)"/g)].map(match => match[1]);
      expect(dates).toHaveLength(count);
      expect(new Set(dates).size).toBe(count);
      expect(dates[0]).toBe(start);
      expect(dates.at(-1)).toBe(end);
      if (year === 2028) expect(dates).toContain('2028-02-29');
    }
  });
});
