import type { Project, ProjectMaterial } from './types';

const date = (value?: string) => {
  const raw = (value || '').trim().split('T')[0];
  const parts = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : raw.slice(0, 10);
};
export function buildProjectAnalytics(projects: Project[], statuses: any[], materials: ProjectMaterial[], days: number, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const since = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
  const all = projects.filter(p => !p.deleted);
  const scoped = all.filter(p => date(p.createdDate) >= since && date(p.createdDate) <= today);
  const active = (p: Project) => { const scale = statuses.find(s => s.id === p.statusId)?.scale; return scale >= 1 && scale < 5; };
  const activeProjects = all.filter(active);
  const referenceDate = (p: Project) => date(p.scheduledDate) || date(p.estimatedDate) || date(p.deliveryDate);
  const month = (offset: number) => { const d = new Date(now.getFullYear(), now.getMonth() + offset, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const awarded = (offset: number) => {
    const monthly = all.filter(p => date(p.startDate).startsWith(month(offset)));
    return { count: monthly.length, saleValue: monthly.reduce((sum, p) => {
      const value = Number(p.budgetValue);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0) };
  };
  const missing = new Set(materials.filter(m => !m.deleted && !['em_stock', 'em_armazem'].includes(m.status) &&
    (m.status === 'por_encomendar' || Boolean(date(m.expectedDeliveryDate) && date(m.expectedDeliveryDate) < today))).map(m => m.projectId));
  const group = (ids: (string | undefined)[]) => Object.entries(ids.reduce<Record<string, number>>((acc, id) => { const key = id || ''; acc[key] = (acc[key] || 0) + 1; return acc; }, {}))
    .map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return { scoped, active: activeProjects, overdue: activeProjects.filter(p => referenceDate(p) && referenceDate(p) < today),
    currentMonth: all.filter(p => referenceDate(p).startsWith(month(0))), nextMonth: all.filter(p => referenceDate(p).startsWith(month(1))),
    missing: all.filter(p => missing.has(p.id)), categories: group(scoped.flatMap(p => [...new Set(p.categoryIds?.length ? p.categoryIds : [p.categoryId])])),
    managers: group(activeProjects.map(p => p.projectManagerId)), sales: group(scoped.map(p => p.salesRepId)),
    awardedCurrentMonth: awarded(0), awardedPreviousMonth: awarded(-1), month };
}
