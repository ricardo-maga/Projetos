import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ProjectRiskItem } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export interface CalculatedRiskDetails {
  score: number;
  label: string;
  color: string;
  dot: string;
}

export function getProjectCalculatedRisk(
  projectId: string,
  projectRiskItems: ProjectRiskItem[] = []
): CalculatedRiskDetails {
  const matchId = (idA?: string | null, idB?: string | null) => {
    if (!idA || !idB) return false;
    if (idA === idB) return true;
    return idA.replace(/[-]/g, '').toLowerCase() === idB.replace(/[-]/g, '').toLowerCase();
  };

  const projectRisks = (projectRiskItems || []).filter(
    ri => !ri.deleted && matchId(ri.projectId, projectId)
  );

  if (!projectRisks || projectRisks.length === 0) {
    return {
      score: 0,
      label: 'N/D',
      color: 'text-slate-500 bg-slate-100 border-slate-200',
      dot: '⚪'
    };
  }

  let maxScore = 0;
  for (const item of projectRisks) {
    const score = (item.probability || 1) * (item.impact || 1);
    if (score > maxScore) {
      maxScore = score;
    }
  }

  if (maxScore >= 16) {
    return { score: maxScore, label: 'Crítico', color: 'text-rose-700 bg-rose-100 border-rose-300', dot: '🔴' };
  } else if (maxScore >= 11) {
    return { score: maxScore, label: 'Alto', color: 'text-orange-700 bg-orange-100 border-orange-300', dot: '🟠' };
  } else if (maxScore >= 6) {
    return { score: maxScore, label: 'Médio', color: 'text-amber-700 bg-amber-100 border-amber-300', dot: '🟡' };
  } else {
    return { score: maxScore, label: 'Baixo', color: 'text-emerald-700 bg-emerald-100 border-emerald-300', dot: '🟢' };
  }
}

export const TASK_STATUS_ID_MAPPINGS: Record<string, string> = {
  'ts-1': '99999999-9999-9999-9999-999999999901',
  'ts-2': '99999999-9999-9999-9999-999999999902',
  'ts-3': '99999999-9999-9999-9999-999999999903',
  'ts-4': '99999999-9999-9999-9999-999999999904',
  '99999999-9999-9999-9999-999999999901': 'ts-1',
  '99999999-9999-9999-9999-999999999902': 'ts-2',
  '99999999-9999-9999-9999-999999999903': 'ts-3',
  '99999999-9999-9999-9999-999999999904': 'ts-4',
};

export function matchTaskStatusId(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (TASK_STATUS_ID_MAPPINGS[a] === b || TASK_STATUS_ID_MAPPINGS[b] === a) return true;
  return false;
}

export function getTaskStatusName(
  statusId?: string | null,
  taskStatuses: { id: string; name: string; scale?: number }[] = []
): string {
  if (!statusId) return '';
  const found = taskStatuses.find(s => s.id === statusId || matchTaskStatusId(s.id, statusId));
  if (found && found.name) return found.name;

  if (taskStatuses.length > 0) {
    return statusId;
  }

  // Fallback map only if taskStatuses array is completely empty/uninitialized
  if (statusId === 'ts-1' || statusId === '99999999-9999-9999-9999-999999999901') return 'Por iniciar';
  if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999999999902') return 'Em curso';
  if (statusId === 'ts-3' || statusId === '99999999-9999-9999-9999-999999999903') return 'Completa';
  if (statusId === 'ts-4' || statusId === '99999999-9999-9999-9999-999999999904') return 'Suspensa';

  return statusId;
}

export function getDefaultTaskStatusId(
  taskStatuses: { id: string; name?: string; scale?: number; deleted?: boolean }[] = []
): string {
  const activeStatuses = taskStatuses.filter(s => !s.deleted);
  if (activeStatuses.length > 0) {
    const defaultByScale = activeStatuses.find(s => s.scale === 1);
    if (defaultByScale) return defaultByScale.id;

    return activeStatuses[0].id;
  }
  return '99999999-9999-9999-9999-999999999901';
}

export function getTaskTypeName(
  taskTypeId?: string | null,
  taskTypes: { id: string; name: string; scale?: number }[] = []
): string {
  if (!taskTypeId) return '';
  const found = taskTypes.find(t => t.id === taskTypeId);
  if (found && found.name) {
    // Return only name, without level/scale if present in text
    return found.name.replace(/\s*\((?:Nível|Nivel|Level)\s*\d+\)/gi, '').trim();
  }
  return '';
}

export function getDefaultTaskTypeId(
  taskTypes: { id: string; name?: string; scale?: number; deleted?: boolean }[] = []
): string {
  // Requirement: Do not pre-fill any default value on task creation
  return '';
}

export function parseTimeToHours(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const clean = String(timeStr).trim();
  if (!clean) return 0;
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    return hours + mins / 60;
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function formatHoursToHHMM(hoursFloat: number): string {
  if (isNaN(hoursFloat) || hoursFloat < 0) return '00:00';
  const totalMins = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function stripSecondsFromHours(timeStr?: string | null): string {
  if (!timeStr) return '0';
  const clean = String(timeStr).trim();
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const h = parts[0] || '0';
    return h;
  }
  return clean;
}

export function formatToOnlyHours(timeStr?: string | null): string {
  if (!timeStr) return '0';
  const clean = String(timeStr).trim();
  if (!clean) return '0';
  const hours = parseTimeToHours(clean);
  if (isNaN(hours) || hours <= 0) return '0';
  return String(Math.round(hours));
}

export interface TaskConflictWarning {
  type: 'absence' | 'task';
  userName: string;
  detail: string;
}

export function checkTaskSchedulingConflicts(params: {
  taskId?: string | null;
  startDate?: string;
  endDate?: string;
  estimatedDate?: string;
  assigneeIds?: string[];
  users?: { id: string; name: string }[];
  tasks?: { id: string; title: string; startDate?: string; endDate?: string; estimatedDate?: string; assigneeIds?: string[]; deleted?: boolean }[];
  userAbsences?: { id?: string; userId: string; absenceStartDate: string; absenceEndDate: string; reason?: string }[];
}): TaskConflictWarning[] {
  const { taskId, startDate, endDate, estimatedDate, assigneeIds = [], users = [], tasks = [], userAbsences = [] } = params;
  if (!assigneeIds || assigneeIds.length === 0) return [];

  const taskStart = startDate || estimatedDate || endDate;
  const taskEnd = endDate || estimatedDate || startDate;
  if (!taskStart || !taskEnd) return [];

  const warnings: TaskConflictWarning[] = [];

  const sDate = taskStart <= taskEnd ? taskStart : taskEnd;
  const eDate = taskStart <= taskEnd ? taskEnd : taskStart;

  assigneeIds.forEach(userId => {
    const user = users.find(u => u.id === userId);
    const userName = user ? user.name : 'Técnico';

    // 1. Check absences
    userAbsences.forEach(abs => {
      if (abs.userId === userId) {
        const absStart = abs.absenceStartDate;
        const absEnd = abs.absenceEndDate || abs.absenceStartDate;
        if (absStart && absEnd) {
          const aStart = absStart <= absEnd ? absStart : absEnd;
          const aEnd = absStart <= absEnd ? absEnd : absStart;
          // Check overlap
          if (sDate <= aEnd && eDate >= aStart) {
            warnings.push({
              type: 'absence',
              userName,
              detail: `Ausência registada (${abs.reason || 'Ausência'}) de ${aStart} a ${aEnd}`
            });
          }
        }
      }
    });

    // 2. Check other tasks
    tasks.forEach(t => {
      if (t.deleted) return;
      if (taskId && t.id === taskId) return;
      if (t.assigneeIds && t.assigneeIds.includes(userId)) {
        const oStart = t.startDate || t.estimatedDate || t.endDate;
        const oEnd = t.endDate || t.estimatedDate || t.startDate;
        if (oStart && oEnd) {
          const otherStart = oStart <= oEnd ? oStart : oEnd;
          const otherEnd = oStart <= oEnd ? oEnd : oStart;
          if (sDate <= otherEnd && eDate >= otherStart) {
            warnings.push({
              type: 'task',
              userName,
              detail: `Tarefa "${t.title}" já agendada de ${otherStart} a ${otherEnd}`
            });
          }
        }
      }
    });
  });

  return warnings;
}


