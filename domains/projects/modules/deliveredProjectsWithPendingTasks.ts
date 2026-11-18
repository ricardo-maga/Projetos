import type { Client, Project, ProjectStatus, Task, TaskStatus, User } from '@/lib/types';
import { stringToUUID } from '@/lib/supabaseSync';

export interface PendingProjectTask {
  task: Task;
  date: string;
  assignees: Array<{ id: string; name: string }>;
}

export interface DeliveredProjectWithPendingTasks {
  project: Project;
  clientName: string;
  pendingTasks: PendingProjectTask[];
}

export interface DeliveredProjectsInput {
  projects: Project[];
  tasks: Task[];
  projectStatuses: ProjectStatus[];
  taskStatuses: TaskStatus[];
  clients: Client[];
  users: User[];
}

const key = (id: string) => stringToUUID(id).toLowerCase();

/** A read-only projection shared by the dashboard and the operational report. */
export function deliveredProjectsWithPendingTasks(input: DeliveredProjectsInput): DeliveredProjectWithPendingTasks[] {
  const projectLevels = new Map(input.projectStatuses.map(status => [key(status.id), status.scale]));
  const taskLevels = new Map(input.taskStatuses.map(status => [key(status.id), status.scale]));
  const clients = new Map(input.clients.map(client => [key(client.id), client.clientName]));
  const users = new Map(input.users.map(user => [key(user.id), user.name]));
  const groups = new Map<string, DeliveredProjectWithPendingTasks>();

  for (const project of input.projects) {
    if (project.deleted || projectLevels.get(key(project.statusId)) !== 5) continue;
    groups.set(key(project.id), { project, clientName: clients.get(key(project.clientId)) || 'Sem cliente', pendingTasks: [] });
  }

  for (const task of input.tasks) {
    if (task.deleted || !task.projectId) continue;
    const level = taskLevels.get(key(task.statusId));
    if (level !== 1 && level !== 2) continue;
    const group = groups.get(key(task.projectId));
    if (!group) continue;
    group.pendingTasks.push({
      task,
      date: (task.estimatedDate || '').trim().slice(0, 10),
      assignees: (task.assigneeIds || []).map(id => ({ id, name: users.get(key(id)) || 'Utilizador indisponível' })),
    });
  }

  return [...groups.values()].filter(group => group.pendingTasks.length > 0)
    .sort((a, b) => a.project.title.localeCompare(b.project.title, 'pt-PT'))
    .map(group => ({ ...group, pendingTasks: group.pendingTasks.sort((a, b) =>
      (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') || a.task.title.localeCompare(b.task.title, 'pt-PT')) }));
}
