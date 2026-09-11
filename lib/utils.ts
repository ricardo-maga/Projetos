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
  if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999999999902') return 'Em andamento';
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
  if (found && found.name) return found.name;
  return '';
}

export function getDefaultTaskTypeId(
  taskTypes: { id: string; name?: string; scale?: number; deleted?: boolean }[] = []
): string {
  const activeTypes = taskTypes.filter(t => !t.deleted);
  if (activeTypes.length > 0) {
    return activeTypes[0].id;
  }
  return '';
}


