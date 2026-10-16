import type { Project, ProjectStatus } from './types';

export function normalizeForecast(value: string): string {
  if (!value) return '';
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(value);
  if (!match) throw new Error('O Forecast deve indicar um mês e ano válidos.');
  return `${match[1]}-${match[2]}-01`;
}

export function forecastLabel(value?: string): string {
  if (!value) return 'Forecast N/D';
  const normalized = normalizeForecast(value);
  const [year, month] = normalized.split('-').map(Number);
  const name = new Intl.DateTimeFormat('pt-PT', { month: 'long' }).format(new Date(year, month - 1, 1));
  return `Forecast ${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function forecastMonth(value?: string): string {
  return value ? normalizeForecast(value).slice(0, 7) : '';
}

export function currentForecastMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
}

export function offsetForecastMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function projectForecastAlert(project: Pick<Project, 'forecastDate' | 'statusId'>, statuses: ProjectStatus[], now = new Date()): 'next' | 'current' | 'overdue' | null {
  const month = forecastMonth(project.forecastDate);
  if (!month) return null;
  const scale = statuses.find(status => status.id === project.statusId)?.scale;
  if (scale === undefined || scale >= 4) return null;
  const current = currentForecastMonth(now);
  if (month < current) return 'overdue';
  if (month === current) return 'current';
  if (month === offsetForecastMonth(current, 1)) return 'next';
  return null;
}
