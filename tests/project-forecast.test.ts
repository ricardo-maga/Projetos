import { describe, expect, it } from 'bun:test';
import { currentForecastMonth, forecastLabel, normalizeForecast, offsetForecastMonth, projectForecastAlert } from '../lib/projectForecast';
import { createProjectSchema, updateProjectSchema } from '../lib/validations/project';

const statuses = [
  { id: 'preparation', name: 'Preparação', scale: 3, deleted: false },
  { id: 'installation', name: 'Instalação', scale: 4, deleted: false },
  { id: 'finished', name: 'Concluído', scale: 5, deleted: false },
];

describe('Forecast mensal de instalação', () => {
  it('stores only the first day of a valid month and formats the Portuguese label', () => {
    expect(normalizeForecast('2026-10')).toBe('2026-10-01');
    expect(forecastLabel('2026-10-01')).toBe('Forecast Outubro 2026');
    expect(forecastLabel('')).toBe('Forecast N/D');
    expect(() => normalizeForecast('2026-13')).toThrow();
    expect(updateProjectSchema.safeParse({ forecastDate: '2026-10-12' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ forecastDate: '' }).success).toBe(true);
  });

  it('keeps the field optional on creation', () => {
    const project = createProjectSchema.parse({ title: 'Teste', clientId: 'client', projectManagerId: 'manager', categoryId: 'category' });
    expect(project.forecastDate).toBe('');
  });

  it('handles year rollover and three alert periods until installation starts', () => {
    const now = new Date('2026-12-15T12:00:00Z');
    expect(currentForecastMonth(now)).toBe('2026-12');
    expect(offsetForecastMonth('2026-12', 1)).toBe('2027-01');
    for (const [month, expected] of [['2026-11', 'overdue'], ['2026-12', 'current'], ['2027-01', 'next'], ['2027-02', null]] as const) {
      expect(projectForecastAlert({ forecastDate: `${month}-01`, statusId: 'preparation' }, statuses, now)).toBe(expected);
    }
    expect(projectForecastAlert({ forecastDate: '2026-11-01', statusId: 'installation' }, statuses, now)).toBeNull();
    expect(projectForecastAlert({ forecastDate: '2026-11-01', statusId: 'finished' }, statuses, now)).toBeNull();
    expect(projectForecastAlert({ forecastDate: '', statusId: 'preparation' }, statuses, now)).toBeNull();
  });
});
