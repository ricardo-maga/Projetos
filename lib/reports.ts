import type { Client, Project, ProjectMaterial, ProjectPriority, Task, TaskStatus, User } from './types';
import { getTaskEffectiveDate } from './utils';
import { parseTaskHoursToNumber } from './tasks/taskService';

export type ReportId = 'overdue-materials' | 'critical-overdue-tasks' | 'scheduled-deliveries' | 'technician-hours';
export type ReportRange = { from: string; to: string };

export const REPORT_CATALOG: Array<{ id: ReportId; label: string; description: string }> = [
  { id: 'overdue-materials', label: 'Materiais em atraso', description: 'Materiais pendentes cuja entrega prevista já passou.' },
  { id: 'critical-overdue-tasks', label: 'Tarefas críticas em atraso', description: 'Tarefas abertas com prioridade de nível 3 e data operacional ultrapassada.' },
  { id: 'scheduled-deliveries', label: 'Projetos entregues por mês', description: 'Entregas planeadas agrupadas pela data agendada.' },
  { id: 'technician-hours', label: 'Horas por técnico', description: 'Horas previstas, reais e desvio por técnico e período.' },
];

const iso = (value?: string) => (value || '').trim().slice(0, 10);
const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const inRange = (date: string, range: ReportRange) => Boolean(date && date >= range.from && date <= range.to);
const month = (date: string) => date.slice(0, 7);

export interface ReportsInput {
  projects: Project[]; tasks: Task[]; projectMaterials: ProjectMaterial[]; clients: Client[]; users: User[];
  projectPriorities: ProjectPriority[]; taskStatuses: TaskStatus[]; range: ReportRange; projectId?: string; clientId?: string; managerId?: string; technicianId?: string; taskStatusId?: string; now?: Date;
}

export function buildReport(id: ReportId, input: ReportsInput) {
  const activeProjects = new Map(input.projects.filter(project => !project.deleted).map(project => [project.id, project]));
  const clientName = (project?: Project) => input.clients.find(client => client.id === project?.clientId)?.clientName || 'Sem cliente';
  const userName = (id: string) => input.users.find(user => user.id === id)?.name || 'Sem técnico';
  const scopedProject = (projectId: string) => { const project = activeProjects.get(projectId); return Boolean(project) && (!input.projectId || projectId === input.projectId) && (!input.clientId || project!.clientId === input.clientId) && (!input.managerId || project!.projectManagerId === input.managerId); };

  if (id === 'overdue-materials') {
    const rows = input.projectMaterials.filter(material => {
      const expected = iso(material.expectedDeliveryDate);
      return !material.deleted && scopedProject(material.projectId) && activeProjects.has(material.projectId)
        && !['em_stock', 'em_armazem'].includes(material.status) && expected < today(input.now);
    }).map(material => ({ ...material, expectedDeliveryDate: iso(material.expectedDeliveryDate), project: activeProjects.get(material.projectId)! }));
    return { rows, total: rows.length, details: rows.map(row => ({ id: row.id, primary: row.description, secondary: `${clientName(row.project)} · ${row.project.title}`, date: row.expectedDeliveryDate, projectId: row.projectId, value: row.status })) };
  }

  if (id === 'critical-overdue-tasks') {
    const rows = input.tasks.filter(task => {
      const effectiveDate = iso(getTaskEffectiveDate(task));
      const priority = input.projectPriorities.find(item => item.id === task.priorityId);
      const status = input.taskStatuses.find(item => item.id === task.statusId);
      return !task.deleted && Boolean(task.projectId) && scopedProject(task.projectId!) && activeProjects.has(task.projectId!)
        && priority?.scale === 3 && (status?.scale === 1 || status?.scale === 2) && (!input.taskStatusId || task.statusId === input.taskStatusId) && effectiveDate < today(input.now);
    }).map(task => ({ task, project: activeProjects.get(task.projectId!)!, effectiveDate: iso(getTaskEffectiveDate(task)) }));
    return { rows, total: rows.length, details: rows.map(({ task, project, effectiveDate }) => ({ id: task.id, primary: task.title, secondary: `${clientName(project)} · ${project.title}`, date: effectiveDate, projectId: project.id, value: 'Crítica' })) };
  }

  if (id === 'scheduled-deliveries') {
    const rows = [...activeProjects.values()].filter(project => scopedProject(project.id) && inRange(iso(project.scheduledDate), input.range));
    const groups = Object.entries(rows.reduce<Record<string, number>>((all, project) => { const key = month(iso(project.scheduledDate)); all[key] = (all[key] || 0) + 1; return all; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));
    return { rows, total: rows.length, groups, details: rows.map(project => ({ id: project.id, primary: project.title, secondary: clientName(project), date: iso(project.scheduledDate), projectId: project.id, value: 'Agendado' })) };
  }

  const buckets = new Map<string, { technicianId: string; name: string; estimated: number; actual: number; tasks: number }>();
  input.tasks.filter(task => !task.deleted && scopedProject(task.projectId || '') && inRange(iso(getTaskEffectiveDate(task)), input.range))
    .forEach(task => (task.assigneeIds || []).filter(technicianId => !input.technicianId || technicianId === input.technicianId).forEach(technicianId => {
      const current = buckets.get(technicianId) || { technicianId, name: userName(technicianId), estimated: 0, actual: 0, tasks: 0 };
      current.estimated += parseTaskHoursToNumber(task.estimatedHours); current.actual += parseTaskHoursToNumber(task.actualHours); current.tasks += 1; buckets.set(technicianId, current);
    }));
  const rows = [...buckets.values()].sort((a, b) => b.actual - a.actual || b.estimated - a.estimated || a.name.localeCompare(b.name));
  return { rows, total: rows.length, details: rows.map(row => ({ id: row.technicianId, primary: row.name, secondary: `${row.tasks} tarefas atribuídas`, date: '', projectId: '', value: `${row.estimated.toFixed(1)} h / ${row.actual.toFixed(1)} h` })) };
}
