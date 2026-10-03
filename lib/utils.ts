import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ProjectRiskItem } from "./types"
import { parseTaskHoursToNumber } from "./tasks/taskService"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function matchId(idA?: string | null, idB?: string | null): boolean {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  return idA.replace(/[-]/g, '').toLowerCase() === idB.replace(/[-]/g, '').toLowerCase();
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
  return parseTaskHoursToNumber(timeStr);
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
  const hours = parseTaskHoursToNumber(timeStr);
  if (isNaN(hours) || hours <= 0) return '0';
  return String(Math.round(hours * 100) / 100);
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

export function getTaskEffectiveDate(t: { estimatedDate?: string | null; startDate?: string | null; endDate?: string | null }): string {
  // Se ambos os dados de execução real (data de início e fim) estiverem preenchidos, passa a ser a data de início real
  if (t.startDate && t.endDate && t.startDate.trim() && t.endDate.trim()) {
    return t.startDate.trim();
  }
  // Caso contrário, o campo "data planeada" (estimatedDate) é o que prevalece em qualquer situação
  if (t.estimatedDate && t.estimatedDate.trim()) {
    return t.estimatedDate.trim();
  }
  return t.startDate?.trim() || t.endDate?.trim() || '';
}

export interface StatusColorInfo {
  id: string;
  name: string;
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeClass: string;
  dotClass: string;
}

export const PASTEL_COLOR_MAP: Record<string, StatusColorInfo> = {
  vermelho: {
    id: 'vermelho',
    name: 'Vermelho',
    hex: '#fca5a5',
    bgClass: 'bg-red-50',
    textClass: 'text-red-700',
    borderClass: 'border-red-200',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
  },
  amarelo: {
    id: 'amarelo',
    name: 'Amarelo',
    hex: '#fef08a',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  verde: {
    id: 'verde',
    name: 'Verde',
    hex: '#bbf7d0',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  azul: {
    id: 'azul',
    name: 'Azul Céu',
    hex: '#38bdf8',
    bgClass: 'bg-sky-100',
    textClass: 'text-sky-800',
    borderClass: 'border-sky-300',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
    dotClass: 'bg-sky-500',
  },
  laranja: {
    id: 'laranja',
    name: 'Laranja',
    hex: '#fed7aa',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-800',
    borderClass: 'border-orange-200',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    dotClass: 'bg-orange-500',
  },
  cinza: {
    id: 'cinza',
    name: 'Cinza',
    hex: '#e2e8f0',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-200',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-400',
  },
};

export function getStatusColorInfo(colorInput?: string | null, fallbackScaleOrName?: number | string): StatusColorInfo {
  if (colorInput) {
    const lower = colorInput.toLowerCase().trim();
    if (lower.includes('vermelho') || lower === '#fca5a5' || lower === '#ef4444' || lower.includes('red') || lower.includes('danger')) return PASTEL_COLOR_MAP.vermelho;
    if (lower.includes('amarelo') || lower === '#fef08a' || lower === '#eab308' || lower.includes('yellow') || lower.includes('warning')) return PASTEL_COLOR_MAP.amarelo;
    if (lower.includes('verde') || lower === '#bbf7d0' || lower === '#22c55e' || lower.includes('green') || lower.includes('success')) return PASTEL_COLOR_MAP.verde;
    if (lower.includes('azul') || lower === '#bfdbfe' || lower === '#38bdf8' || lower === '#7dd3fc' || lower === '#3b82f6' || lower.includes('blue') || lower.includes('sky') || lower.includes('info')) return PASTEL_COLOR_MAP.azul;
    if (lower.includes('laranja') || lower === '#fed7aa' || lower === '#f97316' || lower.includes('orange')) return PASTEL_COLOR_MAP.laranja;
    if (lower.includes('cinza') || lower === '#e2e8f0' || lower === '#64748b' || lower.includes('gray') || lower.includes('slate') || lower.includes('secondary')) return PASTEL_COLOR_MAP.cinza;
  }

  if (typeof fallbackScaleOrName === 'number') {
    if (fallbackScaleOrName === 1) return PASTEL_COLOR_MAP.cinza;
    if (fallbackScaleOrName === 2) return PASTEL_COLOR_MAP.azul;
    if (fallbackScaleOrName === 3) return PASTEL_COLOR_MAP.verde;
    if (fallbackScaleOrName === 4) return PASTEL_COLOR_MAP.amarelo;
    if (fallbackScaleOrName >= 5) return PASTEL_COLOR_MAP.verde;
  } else if (typeof fallbackScaleOrName === 'string') {
    const lowerName = fallbackScaleOrName.toLowerCase();
    if (lowerName.includes('concl') || lowerName.includes('fechad') || lowerName.includes('implement')) return PASTEL_COLOR_MAP.verde;
    if (lowerName.includes('curso') || lowerName.includes('iniciad') || lowerName.includes('execu')) return PASTEL_COLOR_MAP.azul;
    if (lowerName.includes('susp') || lowerName.includes('pausa') || lowerName.includes('ensai')) return PASTEL_COLOR_MAP.amarelo;
    if (lowerName.includes('prepar') || lowerName.includes('melhor')) return PASTEL_COLOR_MAP.laranja;
  }

  return PASTEL_COLOR_MAP.azul;
}

export function getProjectStatusStyle(
  statusId?: string | null,
  projectStatuses: { id: string; name: string; color?: string; scale?: number }[] = []
): StatusColorInfo & { name: string } {
  if (!statusId) {
    return { ...PASTEL_COLOR_MAP.cinza, name: 'Sem Estado' };
  }
  const found = projectStatuses.find(s => s.id === statusId || matchId(s.id, statusId));
  if (found) {
    const colorInfo = getStatusColorInfo(found.color, found.scale || found.name);
    return { ...colorInfo, name: found.name };
  }
  const fallbackInfo = getStatusColorInfo(null, statusId);
  return { ...fallbackInfo, name: statusId };
}

export function getTaskStatusStyle(
  statusId?: string | null,
  taskStatuses: { id: string; name: string; color?: string; scale?: number }[] = []
): StatusColorInfo & { name: string } {
  if (!statusId) {
    return { ...PASTEL_COLOR_MAP.cinza, name: 'Sem Estado' };
  }
  const found = taskStatuses.find(s => s.id === statusId || matchTaskStatusId(s.id, statusId));
  if (found) {
    const colorInfo = getStatusColorInfo(found.color, found.scale || found.name);
    return { ...colorInfo, name: found.name };
  }

  if (statusId === 'ts-1' || statusId === '99999999-9999-9999-9999-999999999901') {
    return { ...PASTEL_COLOR_MAP.cinza, name: 'Por iniciar' };
  }
  if (statusId === 'ts-2' || statusId === '99999999-9999-9999-9999-999999999902') {
    return { ...PASTEL_COLOR_MAP.azul, name: 'Em curso' };
  }
  if (statusId === 'ts-3' || statusId === '99999999-9999-9999-9999-999999999903') {
    return { ...PASTEL_COLOR_MAP.verde, name: 'Completa' };
  }
  if (statusId === 'ts-4' || statusId === '99999999-9999-9999-9999-999999999904') {
    return { ...PASTEL_COLOR_MAP.amarelo, name: 'Suspensa' };
  }

  return { ...PASTEL_COLOR_MAP.azul, name: statusId };
}

export function genId(prefix: string = 'id'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const LEGACY_TO_CANONICAL: Record<string, string> = {
  '00000000-0000-0000-0000-000000000002': '10000000-0000-0000-0000-000000000003', // Project Manager -> PROJECT_MANAGER
  '00000000-0000-0000-0000-000000000003': '10000000-0000-0000-0000-000000000004', // Técnico -> TECHNICIAN
  '52616954-8b59-4459-a00b-963f1b29a91c': '10000000-0000-0000-0000-000000000005', // Comercial -> COMMERCIAL
};

const CANONICAL_IDS = new Set([
  '10000000-0000-0000-0000-000000000003', // PROJECT_MANAGER
  '10000000-0000-0000-0000-000000000004', // TECHNICIAN
  '10000000-0000-0000-0000-000000000005', // COMMERCIAL
]);

export function normalizeUUIDString(id: string): string {
  return id.replace(/[-]/g, '').toLowerCase();
}

export function translateToCanonicalRoleIds(ids: (string | null | undefined)[] | null | undefined): string[] {
  if (!ids) return [];
  const result: string[] = [];
  const normalizedAdded = new Set<string>();

  const normalizedLegacyMap: Record<string, string> = {};
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_TO_CANONICAL)) {
    normalizedLegacyMap[normalizeUUIDString(legacyId)] = canonicalId;
  }

  const normalizedCanonicalSet = new Set<string>();
  for (const canonicalId of CANONICAL_IDS) {
    normalizedCanonicalSet.add(normalizeUUIDString(canonicalId));
  }

  for (const rawId of ids) {
    if (!rawId) continue;
    const trimmed = rawId.trim();
    if (!trimmed) continue;

    const normalized = normalizeUUIDString(trimmed);

    if (normalizedLegacyMap[normalized]) {
      const canonicalVal = normalizedLegacyMap[normalized];
      const normCanonical = normalizeUUIDString(canonicalVal);
      if (!normalizedAdded.has(normCanonical)) {
        result.push(canonicalVal);
        normalizedAdded.add(normCanonical);
      }
    } else if (normalizedCanonicalSet.has(normalized)) {
      const canonicalVal = Array.from(CANONICAL_IDS).find(c => normalizeUUIDString(c) === normalized) || trimmed;
      if (!normalizedAdded.has(normalized)) {
        result.push(canonicalVal);
        normalizedAdded.add(normalized);
      }
    }
  }

  return result;
}



