import type { Client, Project, ProjectMaterial, ProjectPriority, Task, TaskStatus } from './types';
import { getTaskEffectiveDate, matchId, matchTaskStatusId } from './utils';

export type ReportId = 'overdue-materials' | 'critical-open-tasks';

export const REPORT_CATALOG: Array<{ id: ReportId; label: string; description: string }> = [
  { id: 'overdue-materials', label: 'Materiais em atraso', description: 'Materiais pendentes cuja entrega prevista já passou.' },
  { id: 'critical-open-tasks', label: 'Tarefas críticas em aberto', description: 'Tarefas com prioridade de nível 3 e estado de nível 1 ou 2.' },
];

const iso = (value?: string) => (value || '').trim().slice(0, 10);
const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export interface ReportsInput {
  projects: Project[];
  tasks: Task[];
  projectMaterials: ProjectMaterial[];
  clients: Client[];
  projectPriorities: ProjectPriority[];
  taskStatuses: TaskStatus[];
  now?: Date;
}

export function buildReport(id: ReportId, input: ReportsInput) {
  const activeProjects = new Map(input.projects.filter(project => !project.deleted).map(project => [project.id, project]));
  const clientName = (project?: Project) => input.clients.find(client => client.id === project?.clientId)?.clientName || 'Sem cliente';

  if (id === 'overdue-materials') {
    const rows = input.projectMaterials.filter(material => {
      const expected = iso(material.expectedDeliveryDate);
      return !material.deleted && activeProjects.has(material.projectId)
        && !['em_stock', 'em_armazem'].includes(material.status) && Boolean(expected) && expected < today(input.now);
    }).map(material => ({ ...material, expectedDeliveryDate: iso(material.expectedDeliveryDate), project: activeProjects.get(material.projectId)! }));
    return { rows, total: rows.length, details: rows.map(row => ({ id: row.id, primary: row.description, secondary: `${clientName(row.project)} · ${row.project.title}`, date: row.expectedDeliveryDate, projectId: row.projectId, value: row.status })) };
  }

  const rows = input.tasks.filter(task => {
    const priority = input.projectPriorities.find(item => matchId(item.id, task.priorityId));
    const status = input.taskStatuses.find(item => matchTaskStatusId(item.id, task.statusId));
    const project = task.projectId ? activeProjects.get(task.projectId) : undefined;
    return !task.deleted && (!task.projectId || Boolean(project))
      && priority?.scale === 3 && (status?.scale === 1 || status?.scale === 2);
  }).map(task => ({ task, project: task.projectId ? activeProjects.get(task.projectId) : undefined, effectiveDate: iso(getTaskEffectiveDate(task)) }));
  return { rows, total: rows.length, details: rows.map(({ task, project, effectiveDate }) => ({ id: task.id, primary: task.title, secondary: project ? `${clientName(project)} · ${project.title}` : 'Sem projeto', date: effectiveDate, projectId: project?.id || '', value: 'Crítica' })) };
}
