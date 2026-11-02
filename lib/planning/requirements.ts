export type RequirementKind = 'mandatory' | 'recommended' | 'conditional';
export type RequirementCondition = 'install_project_no' | 'sf_opportunity_no' | null;
export interface ProjectRequirement {
  id: string; categoryId: string; defaultTaskId: string; necessity: RequirementKind;
  conditionCode: RequirementCondition; active: boolean; sortOrder: number; version: number;
}
export interface RequirementProject {
  id: string; categoryId: string | null; categoryIds: string[];
  installProjectNo: string | null; sfOpportunityNo: string | null;
}
export interface RequirementState {
  projectId: string; requirementId: string; taskId: string | null;
  waived: boolean; reason: string | null; version: number;
}
export interface RequirementTask {
  id: string; deleted?: boolean; assigneeIds: string[]; estimatedDate: string | null;
  completedDate?: string | null;
}

export function applicableRequirement(requirement: ProjectRequirement, project: RequirementProject): boolean {
  if (!requirement.active || ![project.categoryId, ...project.categoryIds].includes(requirement.categoryId)) return false;
  if (requirement.necessity !== 'conditional') return true;
  if (requirement.conditionCode === 'install_project_no') return Boolean(project.installProjectNo?.trim());
  if (requirement.conditionCode === 'sf_opportunity_no') return Boolean(project.sfOpportunityNo?.trim());
  return false;
}

export function readiness(project: RequirementProject, requirements: ProjectRequirement[],
  states: RequirementState[], tasks: RequirementTask[]) {
  const active = requirements.filter(requirement => applicableRequirement(requirement, project));
  const items = active.map(requirement => {
    const state = states.find(s => s.projectId === project.id && s.requirementId === requirement.id);
    const task = state?.taskId ? tasks.find(t => t.id === state.taskId && !t.deleted) : undefined;
    return { requirementId: requirement.id, necessity: requirement.necessity,
      stateVersion: state?.version || 0, taskId: task?.id || null, waived: Boolean(state?.waived),
      missing: !task && !state?.waived, unassigned: Boolean(task && !task.assigneeIds.length),
      unplanned: Boolean(task && !task.estimatedDate), complete: Boolean(task?.completedDate) };
  });
  return { items, mandatory: items.filter(item => item.necessity === 'mandatory').length,
    missing: items.filter(item => item.missing).length,
    unassigned: items.filter(item => item.unassigned).length,
    unplanned: items.filter(item => item.unplanned).length,
    completed: items.filter(item => item.complete).length,
    waived: items.filter(item => item.waived).length };
}
