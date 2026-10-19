import type { AutomationRule, ERPState } from '../types';

const EVENTS = new Set(['project_status_changed', 'task_status_changed', 'task_created']);
const ACTIONS: Record<string, Set<string>> = {
  project_status_changed: new Set(['create_default_tasks', 'send_notification']),
  task_status_changed: new Set(['change_project_status', 'send_notification']),
  task_created: new Set(['change_project_status', 'send_notification']),
};

export function validateAutomationRule(rule: AutomationRule, state: ERPState): string | null {
  if (rule.deleted === true) return null;
  if (typeof rule.name !== 'string' || !rule.name.trim()) return 'A regra precisa de um nome.';
  if (!EVENTS.has(rule.triggerType)) return 'Evento de automação descontinuado ou inválido.';
  if (!Array.isArray(rule.actions) || rule.actions.length === 0) return 'Selecione uma ação.';
  const statusIds = new Set((rule.triggerType === 'project_status_changed' ? state.projectStatuses : state.taskStatuses)
    .filter(status => !status.deleted).map(status => status.id));
  if (rule.triggerType !== 'task_created') {
    if (!rule.triggerCondition?.toStatusId) return 'Escolha um estado da tarefa ou do projeto para o evento.';
    if (!statusIds.has(rule.triggerCondition.toStatusId)) return 'O estado do evento não existe ou foi eliminado.';
  }
  const projectStatusIds = new Set(state.projectStatuses.filter(status => !status.deleted).map(status => status.id));
  const seen = new Set<string>();
  for (const action of rule.actions) {
    if (!ACTIONS[rule.triggerType].has(action.type) || seen.has(action.type))
      return 'Combinação ou repetição de ações não suportada.';
    seen.add(action.type);
    if (action.type === 'change_project_status' && !projectStatusIds.has(action.params?.targetStatusId || ''))
      return 'O estado de destino do projeto não existe ou foi eliminado.';
    if (action.type === 'send_notification' && !action.params?.notificationTitle?.trim())
      return 'A notificação precisa de um título.';
  }
  return null;
}
