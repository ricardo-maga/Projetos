import type { Project, ProjectRiskItem } from './types';
import { formatToOnlyHours } from './utils';

export type FocusPageSize = 5 | 10 | 20 | 'all';
export interface FocusPaginationPreference { size: FocusPageSize; page: number }
export function readFocusPagination(raw: string | null, defaultSize: FocusPageSize, allowed: FocusPageSize[]): FocusPaginationPreference {
  try {
    const value = JSON.parse(raw || 'null');
    return { size: allowed.includes(value?.size) ? value.size : defaultSize,
      page: Number.isSafeInteger(value?.page) && value.page > 0 ? value.page : 1 };
  } catch { return { size: defaultSize, page: 1 }; }
}
export function paginateFocus<T>(items: T[], preference: FocusPaginationPreference) {
  const size = preference.size === 'all' ? Math.max(items.length, 1) : preference.size;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(preference.page, pages);
  return { items: items.slice((page - 1) * size, page * size), page, pages };
}
export function focusHours(value?: string | null) {
  return `${Math.round(Number(formatToOnlyHours(value)))}h`;
}
export function assignedFocusRisks(risks: ProjectRiskItem[], projects: Project[], userId: string) {
  const visibleProjects = new Set(projects.filter(p => !p.deleted).map(p => p.id));
  return risks.filter(r => !r.deleted && r.ownerId === userId && visibleProjects.has(r.projectId))
    .sort((a, b) => (a.reviewDate || '9999').localeCompare(b.reviewDate || '9999') || a.id.localeCompare(b.id));
}
