/** Categories for presentation only; persisted audit events keep their exact names. */
export function auditActionCategory(action: string): string {
  const name = action.toUpperCase();
  if (name.endsWith('_CREATED')) return 'CREATE';
  if (name.endsWith('_UPDATED') || name.endsWith('_STATUS_CHANGED') || name.endsWith('_RESTORED')) return 'UPDATE';
  if (name.endsWith('_DELETED')) return 'DELETE';
  return name;
}

export function auditEntityCategory(entity: string): string {
  const name = entity.toUpperCase();
  return ({ PROJECTS: 'PROJECT', TASKS: 'TASK', CLIENTS: 'CLIENT', USERS: 'USER', PROJECT_RISK_ITEMS: 'RISK' } as Record<string, string>)[name] || name;
}

export const auditModuleLabels: Record<string, string> = {
  project: 'Projetos', task: 'Tarefas', client: 'Clientes', risk: 'Riscos',
  material: 'Materiais', comment: 'Comentários', automation_rule: 'Regras de automação',
  automation_execution: 'Execuções de automações', work_request: 'Pedidos internos',
  work_task: 'Tarefas de pedidos', integration: 'Integrações', absence: 'Ausências',
  special_day: 'Dias especiais', default_task: 'Tarefas predefinidas',
  configuration: 'Configuração', notification_setting: 'Notificações',
  user: 'Utilizadores e acessos', calendar_subscription: 'Subscrições de calendário',
  presales_asset: 'Anexos de Pré-venda', presales_origin: 'Origens de Pré-venda', presales_template: 'Modelos de Pré-venda',
  rbac: 'Papéis e permissões', reference_data: 'Dados de referência', project_import: 'Importação de projetos', audit: 'Auditoria',
};

const specificActions: Record<string, string> = {
  'task.copied': 'Cópia de tarefa',
  'rbac.role_permissions_updated': 'Permissões do papel alteradas',
  'rbac.user_roles_updated': 'Papéis do utilizador alterados',
  'task.moved': 'Mudança de projeto da tarefa',
  'task.rescheduled': 'Remarcação de tarefa',
  'audit.export_prepared': 'Exportação preparada',
  'project_import.completed': 'Importação de projetos processada',
  'automation_execution.executed': 'Regra executada',
  'user.login_failed': 'Tentativa de entrada sem sucesso',
  LOGIN_FAILED: 'Tentativa de entrada sem sucesso', USER_ACCESS_ACTIVATED: 'Acesso de utilizador ativado',
  LOGIN: 'Entrada na aplicação', LOGOUT: 'Saída da aplicação', CLIENT_EVENT: 'Evento comunicado pelo browser',
};

const actionLabels: Record<string, string> = {
  created: 'Criação', updated: 'Edição', deleted: 'Eliminação', restored: 'Reposição',
  status_changed: 'Mudança de estado', revoked: 'Revogação', rotated: 'Renovação',
  create: 'Criação', edit: 'Edição', accept: 'Aceitação', reject: 'Rejeição', file: 'Arquivo',
  deliver: 'Entrega', add_task: 'Adição de tarefa', assign_task: 'Atribuição de tarefa',
  publish: 'Publicação', new_revision: 'Nova revisão', link_project: 'Ligação a projeto',
  start: 'Início', block: 'Bloqueio', resume: 'Retoma', suspend: 'Suspensão',
  complete: 'Conclusão', reopen: 'Reabertura', assign: 'Atribuição', won: 'Ganho', lost: 'Perdido',
};

export const auditSourceLabels: Record<string, string> = {
  application: 'Aplicação', automation: 'Automação', system: 'Sistema', legacy: 'Registo anterior',
};

export const auditOutcomeLabels: Record<string, string> = {
  succeeded: 'Sucesso', failed: 'Falha', partial: 'Parcial',
};

const fieldLabels: Record<string, string> = {
  project_title: 'Título', task_title: 'Título', name: 'Nome', title: 'Título', status_id: 'Estado',
  status: 'Estado', priority_id: 'Prioridade', risk_id: 'Risco', client_id: 'Cliente',
  owner_id: 'Responsável', project_manager_id: 'Gestor de projeto', field_manager_id: 'Gestor de campo',
  sales_rep_id: 'Comercial', project_id: 'Projeto', estimated_date: 'Data prevista',
  scheduled_date: 'Data agendada', start_date: 'Início', end_date: 'Fim', start_time: 'Hora de início',
  end_time: 'Hora de fim', delivery_date: 'Entrega', completed_date: 'Conclusão',
  forecast_date: 'Forecast', expected_delivery_date: 'Entrega prevista', quantity: 'Quantidade',
  estimated_hours: 'Horas estimadas', actual_hours: 'Horas realizadas',
  rule_id: 'Regra', comment: 'Comentário', rule_configuration: 'Configuração da regra',
  assignees: 'Responsáveis', source_task_id: 'Tarefa de origem', row_count: 'Linhas exportadas', filters: 'Filtros',
  compensationCompleted: 'Compensação concluída', accessEnabled: 'Acesso ativo',
};

export function auditFieldLabel(field: string) {
  return fieldLabels[field] || field.replaceAll('_', ' ');
}

export function auditActionLabel(code: string) {
  if (specificActions[code]) return specificActions[code];
  const [module, action] = code.split('.');
  if (!action) return code;
  return `${actionLabels[action] || auditFieldLabel(action)} · ${auditModuleLabels[module] || module}`;
}
