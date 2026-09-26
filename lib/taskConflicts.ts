import { Task, Project, User } from './types';

export interface TaskConflictParams {
  date?: string | null;
  assigneeIds: string[];
  currentTaskId?: string | null;
  tasks: Task[];
  users: User[];
  absences?: any[];
  projects?: Project[];
}

export function getTaskConflictWarnings({
  date,
  assigneeIds,
  currentTaskId,
  tasks = [],
  users = [],
  absences = [],
  projects = [],
}: TaskConflictParams): string[] {
  if (!date || !assigneeIds || assigneeIds.length === 0) return [];

  const warnings: string[] = [];

  for (const userId of assigneeIds) {
    const user = users.find(
      u => u.id === userId || (u.id && u.id.replace(/[-]/g, '').toLowerCase() === userId.replace(/[-]/g, '').toLowerCase())
    );
    const userName = user ? user.name : 'Utilizador';

    // 1. Check absences for this user on this date
    if (absences && Array.isArray(absences)) {
      const isAbsent = absences.some((abs: any) => {
        if (abs.deleted) return false;
        const uMatch =
          abs.userId === userId ||
          abs.user_id === userId ||
          (abs.userId && abs.userId.replace(/[-]/g, '').toLowerCase() === userId.replace(/[-]/g, '').toLowerCase());
        if (!uMatch) return false;
        const rawStart = abs.absenceStartDate || abs.startDate || abs.start_date;
        const rawEnd = abs.absenceEndDate || abs.endDate || abs.end_date || rawStart;
        if (!rawStart) return false;
        const absStart = rawStart.trim().slice(0, 10);
        const absEnd = (rawEnd || rawStart).trim().slice(0, 10);
        const targetDate = date.trim().slice(0, 10);
        return targetDate >= absStart && targetDate <= absEnd;
      });

      if (isAbsent) {
        const dFormatted = date.split('-').reverse().join('/');
        warnings.push(`⚠️ ${userName} está ausente em ${dFormatted}.`);
      }
    }

    // 2. Check other planned tasks on that same day for this user
    const otherTasksOnDay = tasks.filter((t) => {
      if (t.deleted) return false;
      if (
        currentTaskId &&
        (t.id === currentTaskId || t.id.replace(/[-]/g, '').toLowerCase() === currentTaskId.replace(/[-]/g, '').toLowerCase())
      ) {
        return false;
      }
      const tAssignees = t.assigneeIds || [];
      const isAssigned = tAssignees.some(
        aid => aid === userId || (aid && aid.replace(/[-]/g, '').toLowerCase() === userId.replace(/[-]/g, '').toLowerCase())
      );
      if (!isAssigned) return false;
      const tDate = t.estimatedDate || t.startDate;
      return tDate === date;
    });

    if (otherTasksOnDay.length > 0) {
      const dFormatted = date.split('-').reverse().join('/');
      const taskLines = otherTasksOnDay.map((ot) => {
        const proj = projects.find(
          (p) => p.id === ot.projectId || (p.id && p.id.replace(/[-]/g, '').toLowerCase() === (ot.projectId || '').replace(/[-]/g, '').toLowerCase())
        );
        const projTitle = proj ? proj.title : '';
        const hoursText = ot.estimatedHours ? ` — ${ot.estimatedHours} h` : '';
        return `• ${ot.title}${projTitle ? ` [${projTitle}]` : ''}${hoursText}`;
      });

      warnings.push(
        `⚠️ ${userName} já tem ${otherTasksOnDay.length} tarefa${otherTasksOnDay.length > 1 ? 's' : ''} planeada${otherTasksOnDay.length > 1 ? 's' : ''} para ${dFormatted}:\n${taskLines.join('\n')}`
      );
    }
  }

  return warnings;
}
