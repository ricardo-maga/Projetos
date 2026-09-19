export type PlanningAllocationStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export interface PlanningAllocationRow {
  id: string;
  task_id: string;
  resource_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm:ss or HH:mm
  end_time: string;
  status: PlanningAllocationStatus;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface PlanningAllocationDTO {
  id: string;
  taskId: string;
  resourceId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: PlanningAllocationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  durationMinutes: number;
  task?: {
    id: string;
    title: string;
    projectId?: string;
  } | null;
  resource?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface PlanningAllocationCreateInput {
  taskId: string;
  resourceId: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: 'DRAFT' | 'CONFIRMED';
  overrideWorkSchedule?: boolean;
}

export interface PlanningAllocationUpdateInput {
  version: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: PlanningAllocationStatus;
  overrideWorkSchedule?: boolean;
}

export interface PlanningAllocationFilters {
  taskId?: string;
  resourceId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: PlanningAllocationStatus;
  page?: number;
  pageSize?: number;
}

export interface PlanningWarning {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationSuccess {
  isValid: true;
  warnings: PlanningWarning[];
}

export interface ValidationFailure {
  isValid: false;
  errorCode: string;
  message: string;
  httpStatus: number;
  details?: Record<string, any>;
  warnings: PlanningWarning[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface ValidationContext {
  taskId: string;
  resourceId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: PlanningAllocationStatus;
  currentAllocationId?: string;
  overrideWorkSchedule?: boolean;
  isAdmin?: boolean;
}

// ==========================================
// FASE 20 — CAPACIDADE E PLANEAMENTO TYPES
// ==========================================

export interface WorkPeriod {
  start: string; // HH:mm
  end: string;   // HH:mm
  minutes: number;
}

export interface FreePeriod {
  start: string; // HH:mm
  end: string;   // HH:mm
  durationMinutes: number;
}

export interface ResourceCapacityDetail {
  resourceId: string;
  resourceName: string;
  date: string; // YYYY-MM-DD
  theoreticalCapacityMinutes: number;
  absenceMinutes: number;
  nonProjectMinutes: number;
  operationalCapacityMinutes: number;
  confirmedAllocationMinutes: number;
  availableMinutes: number;
  overAllocatedMinutes: number;
  utilizationPercent: number;
  workSchedulePeriods: WorkPeriod[];
  freePeriods: FreePeriod[];
}

export interface ResourceAvailabilitySlot {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  durationMinutes: number;
}

export interface ResourceLoadSummary {
  resourceId: string;
  resourceName: string;
  date: string; // YYYY-MM-DD
  operationalCapacityMinutes: number;
  plannedMinutes: number;
  availableMinutes: number;
  overAllocatedMinutes: number;
  utilizationPercent: number;
}

