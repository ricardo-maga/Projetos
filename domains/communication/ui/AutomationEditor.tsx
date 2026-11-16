'use client';

import React, { useState } from 'react';
import { AutomationRule, AutomationAction, ProjectStatus, TaskStatus, Project, User } from '@/lib/types';
import {
  Zap, Plus, Trash2, Edit2, Play, CheckCircle2, ArrowRight, Bell,
  ListTodo, Layers, ShieldCheck, Sparkles, Check, X, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Dialog } from '@/components/ui/Dialog';

interface AutomationEditorProps {
  automationRules: AutomationRule[];
  addAutomationRule: (rule: Omit<AutomationRule, 'id' | 'createdDate'>) => Promise<{ success: boolean; message?: string }>;
  updateAutomationRule: (id: string, updates: Partial<AutomationRule>) => Promise<{ success: boolean; message?: string }>;
  deleteAutomationRule: (id: string) => Promise<{ success: boolean; message?: string }>;
  toggleAutomationRule: (id: string) => Promise<{ success: boolean; message?: string }>;
  projectStatuses: ProjectStatus[];
  taskStatuses: TaskStatus[];
  projects: Project[];
  users: User[];
  canWrite?: boolean;
}

export default function AutomationEditor({
  automationRules = [],
  addAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  projectStatuses = [],
  taskStatuses = [],
  projects = [],
  users = [],
  canWrite = true,
}: AutomationEditorProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Rule Form State
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState<AutomationRule['triggerType']>('project_status_changed');
  const [triggerToStatusId, setTriggerToStatusId] = useState<string>('');

  // Action state
  const [actionCreateDefaultTasks, setActionCreateDefaultTasks] = useState(false);
  const [actionChangeProjectStatus, setActionChangeProjectStatus] = useState(false);
  const [targetProjectStatusId, setTargetProjectStatusId] = useState('');
  const [actionSendNotification, setActionSendNotification] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');

  // Delete modal state
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);

  // Test modal state
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [selectedTestProjectId, setSelectedTestProjectId] = useState<string>('');
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setRuleName('');
    setRuleDescription('');
    setRuleEnabled(true);
    setTriggerType('project_status_changed');
    setTriggerToStatusId('');
    setActionCreateDefaultTasks(false);
    setActionChangeProjectStatus(false);
    setTargetProjectStatusId('');
    setActionSendNotification(false);
    setNotificationTitle('');
    setNotificationMessage('');
    setEditingRuleId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (rule: AutomationRule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleDescription(rule.description || '');
    setRuleEnabled(rule.enabled);
    setTriggerType(rule.triggerType);
    setTriggerToStatusId(rule.triggerCondition?.toPresalesStatus || rule.triggerCondition?.toStatusId || '');

    // Parse actions
    const hasDefaultTasks = rule.actions.some(a => a.type === 'create_default_tasks');
    const changeStatusAction = rule.actions.find(a => a.type === 'change_project_status');
    const notifyAction = rule.actions.find(a => a.type === 'send_notification');

    setActionCreateDefaultTasks(hasDefaultTasks);
    setActionChangeProjectStatus(!!changeStatusAction);
    setTargetProjectStatusId(changeStatusAction?.params?.targetStatusId || '');
    setActionSendNotification(!!notifyAction);
    setNotificationTitle(notifyAction?.params?.notificationTitle || '');
    setNotificationMessage(notifyAction?.params?.notificationMessage || '');

    setShowModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) {
      alert('Por favor introduza um nome para a regra.');
      return;
    }

    const actions: AutomationAction[] = [];
    if (triggerType === 'project_status_changed' && actionCreateDefaultTasks) {
      actions.push({ type: 'create_default_tasks' });
    }
    if (['task_created','task_status_changed'].includes(triggerType) && actionChangeProjectStatus && targetProjectStatusId) {
      actions.push({
        type: 'change_project_status',
        params: { targetStatusId: targetProjectStatusId }
      });
    }
    if (actionSendNotification && notificationTitle.trim()) {
      actions.push({
        type: 'send_notification',
        params: {
          notificationTitle: notificationTitle.trim(),
          notificationMessage: notificationMessage.trim()
        }
      });
    }

    if (actions.length === 0) {
      alert('Por favor selecione pelo menos uma ação para ser executada.');
      return;
    }

    const ruleData: Omit<AutomationRule, 'id' | 'createdDate'> = {
      name: ruleName.trim(),
      description: ruleDescription.trim() || undefined,
      enabled: ruleEnabled,
      triggerType,
      triggerCondition: triggerType === 'presales_status_changed' && triggerToStatusId
        ? { toPresalesStatus: triggerToStatusId as 'submitted'|'accepted'|'suspended'|'won'|'lost' }
        : !['task_created','presales_created','presales_status_changed'].includes(triggerType) && triggerToStatusId
          ? { toStatusId: triggerToStatusId } : undefined,
      actions
    };

    if (editingRuleId) {
      setSaving(true);
      const result = await updateAutomationRule(editingRuleId, ruleData);
      setSaving(false);
      if (!result.success) { alert(result.message || 'Não foi possível guardar a regra.'); return; }
    } else {
      setSaving(true);
      const result = await addAutomationRule(ruleData);
      setSaving(false);
      if (!result.success) { alert(result.message || 'Não foi possível criar a regra.'); return; }
    }

    setShowModal(false);
    resetForm();
  };

  const handleRunTest = (ruleId: string) => {
    const rule = automationRules.find(r => r.id === ruleId);
    if (!rule) return;
    setTestRuleId(ruleId);
    const activeProjects = projects.filter(p => !p.deleted);
    if (activeProjects.length > 0) {
      setSelectedTestProjectId(activeProjects[0].id);
    }
    setTestFeedback(null);
  };

  const handleExecuteTest = () => {
    if (!testRuleId) return;
    const rule = automationRules.find(r => r.id === testRuleId);
    setTestFeedback(`A regra "${rule?.name || ''}" executaria ${rule?.actions.length || 0} ação(ões) ${rule?.triggerType.startsWith('presales_') ? 'num pedido Presales' : 'no projeto selecionado'}. Esta pré-visualização não alterou dados.`);
  };

  const getTriggerLabel = (rule: AutomationRule) => {
    switch (rule.triggerType) {
      case 'project_status_changed': {
        const statusName = projectStatuses.find(s => s.id === rule.triggerCondition?.toStatusId)?.name;
        return statusName
          ? `Ao mudar estado do projeto para "${statusName}"`
          : 'Ao mudar estado de qualquer projeto';
      }
      case 'task_status_changed': {
        const statusName = taskStatuses.find(s => s.id === rule.triggerCondition?.toStatusId)?.name;
        return statusName
          ? `Ao mudar estado da tarefa para "${statusName}"`
          : 'Ao mudar estado de qualquer tarefa';
      }
      case 'task_created':
        return 'Ao criar uma nova tarefa';
      case 'presales_created':
        return 'Ao criar um pedido Presales';
      case 'presales_status_changed':
        return rule.triggerCondition?.toPresalesStatus
          ? `Ao mudar Presales para "${rule.triggerCondition.toPresalesStatus}"` : 'Ao alterar o estado Presales';
      default:
        return 'Evento do sistema';
    }
  };

  const visibleRules = automationRules.filter(r => !r.deleted);
  const activeCount = visibleRules.filter(r => r.enabled).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner & Action */}
      <div className="bg-primary/10 border border-primary/20 rounded-card p-6 text-text-primary relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-ink text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-primary-ink" />
              Editor de Automação de Processos (No-Code)
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Regras de Negócio e Automações</h2>
            <p className="text-sm text-text-secondary max-w-2xl">
              Crie fluxos automáticos para gerar tarefas padrão, atualizar estados de projetos e notificar as equipas sem necessidade de intervenção manual.
            </p>
          </div>

          {canWrite && (
            <button
              onClick={handleOpenAdd}
              className="m3-button m3-button--filled inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova Regra de Automação
            </button>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-primary/20">
          <div className="bg-surface rounded-card p-3 border border-border">
            <div className="text-xs text-text-secondary font-medium">Total de Regras</div>
              <div className="text-xl font-bold text-text-primary mt-0.5">{visibleRules.length}</div>
          </div>
          <div className="bg-surface rounded-card p-3 border border-border">
            <div className="text-xs text-text-secondary font-medium">Regras Ativas</div>
            <div className="text-xl font-bold text-success mt-0.5">{activeCount}</div>
          </div>
          <div className="bg-surface rounded-card p-3 border border-border col-span-2 sm:col-span-1">
              <div className="text-xs text-text-secondary font-medium">Execução</div>
              <div className="text-xl font-bold text-primary-ink mt-0.5">Por evento</div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {visibleRules.length === 0 ? (
          <div className="bg-surface rounded-card border border-border p-12 text-center shadow-raised">
            <div className="w-12 h-12 rounded-card bg-action-50 text-primary-ink flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-text-primary mb-1">Nenhuma regra configurada</h3>
            <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
              Comece a economizar tempo criando automações que criam tarefas automaticamente ou notificam os responsáveis.
            </p>
            {canWrite && (
              <button
                onClick={handleOpenAdd}
                className="m3-button m3-button--filled inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar Primeira Regra
              </button>
            )}
          </div>
        ) : (
          visibleRules.map(rule => (
            <div
              key={rule.id}
              className={`bg-surface rounded-card border transition-all p-5 shadow-raised ${
                rule.enabled ? 'border-border hover:border-action-300' : 'border-border opacity-60 bg-surface-muted/50'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Rule Info & Toggle */}
                <div className="flex items-start gap-4 flex-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`${rule.enabled ? 'Desativar' : 'Ativar'} regra ${rule.name}`}
                    onClick={async () => { const result = await toggleAutomationRule(rule.id); if (!result.success) alert(result.message || 'Não foi possível alterar a regra.'); }}
                    disabled={!canWrite || saving}
                    className={`mt-1 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      rule.enabled ? 'bg-feedback-success-600' : 'bg-surface-elevated'
                    }`}
                    title={rule.enabled ? 'Desativar Regra' : 'Ativar Regra'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-raised ring-0 transition duration-200 ease-in-out ${
                        rule.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-text-primary">{rule.name}</h3>
                      <span className={`px-2 py-0.5 rounded-control text-micro font-extrabold uppercase ${
                        rule.enabled ? 'bg-feedback-success-100 text-feedback-success-800' : 'bg-surface-elevated text-text-secondary'
                      }`}>
                        {rule.enabled ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-text-muted">{rule.description}</p>
                    )}
                  </div>
                </div>

                {/* Flow Diagram (Trigger -> Actions) */}
                <div className="flex items-center gap-2 bg-surface-muted p-3 rounded-control border border-border/80 shrink-0 flex-wrap sm:flex-nowrap">
                  {/* Trigger Pill */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-action-100 text-action-900 rounded-control text-xs font-bold border border-action-200">
                    <Zap className="w-3.5 h-3.5 text-primary-ink shrink-0" />
                    <span>{getTriggerLabel(rule)}</span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-text-muted shrink-0 hidden sm:block" />

                  {/* Actions Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {rule.actions.map((act, i) => {
                      if (act.type === 'create_default_tasks') {
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-feedback-warning-100 text-feedback-warning-900 rounded-control text-xs font-bold border border-feedback-warning-200">
                            <ListTodo className="w-3.5 h-3.5 text-feedback-warning-700" />
                            Criar Tarefas Padrão
                          </span>
                        );
                      }
                      if (act.type === 'change_project_status') {
                        const targetStatus = projectStatuses.find(s => s.id === act.params?.targetStatusId)?.name || 'Novo Estado';
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-category-purple-100 text-category-purple-900 rounded-control text-xs font-bold border border-category-purple-200">
                            <Layers className="w-3.5 h-3.5 text-category-purple-700" />
                            Projeto &rarr; {targetStatus}
                          </span>
                        );
                      }
                      if (act.type === 'send_notification') {
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-category-sky-100 text-category-sky-900 rounded-control text-xs font-bold border border-category-sky-200">
                            <Bell className="w-3.5 h-3.5 text-category-sky-700" />
                            Enviar Notificação
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>

                {/* Actions (Test / Edit / Delete) */}
                <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border-subtle shrink-0 justify-end">
                  {(
                    <button
                      type="button"
                      onClick={() => handleRunTest(rule.id)}
                      className="px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-action-700 hover:bg-action-50 border border-border hover:border-action-200 rounded-control transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Pré-visualizar as ações sem alterar dados"
                    >
                      <Play className="w-3 h-3 text-primary-ink fill-action-600" />
                      Pré-visualizar
                    </button>
                  )}

                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rule)}
                        className="p-2 text-text-muted hover:text-primary-ink hover:bg-surface-muted rounded-control transition-colors cursor-pointer"
                        title="Editar Regra"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRuleId(rule.id)}
                        className="p-2 text-text-muted hover:text-feedback-error-600 hover:bg-feedback-error-50 rounded-control transition-colors cursor-pointer"
                        title="Eliminar Regra"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <Dialog isOpen={showModal} onClose={() => { if (!saving) setShowModal(false); }}
          title={editingRuleId ? 'Editar Regra de Automação' : 'Nova Regra de Automação'} className="max-w-2xl">
          <p className="mb-5 text-body-sm text-text-secondary">Configure os acionadores e as ações automáticas</p>
            {/* Modal Body */}
            <form onSubmit={handleSaveRule} className="space-y-6">
              {/* Section 1: Name and Description */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-action-100 text-action-700 flex items-center justify-center text-micro">1</span>
                  Identificação da Regra
                </div>

                <div className="space-y-3 pl-7">
                  <div>
                    <label htmlFor="automation-field-1" className="block text-xs font-semibold text-text-secondary mb-1">
                      Nome da Regra <span className="text-feedback-error-500">*</span>
                    </label>
                    <input id="automation-field-1"
                      type="text"
                      value={ruleName}
                      onChange={e => setRuleName(e.target.value)}
                      placeholder="Ex: Gerar tarefas padrão ao colocar projeto Em Curso"
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold focus:ring-2 focus:ring-action-100 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="automation-field-2" className="block text-xs font-semibold text-text-secondary mb-1">
                      Descrição da Regra (Opcional)
                    </label>
                    <textarea id="automation-field-2"
                      value={ruleDescription}
                      onChange={e => setRuleDescription(e.target.value)}
                      placeholder="Explique o propósito desta automação..."
                      rows={2}
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-medium focus:ring-2 focus:ring-action-100 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Trigger Condition */}
              <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-action-100 text-action-700 flex items-center justify-center text-micro">2</span>
                  Quando isto acontecer (Gatilho)
                </div>

                <div className="space-y-3 pl-7">
                  <div>
                    <label htmlFor="automation-field-3" className="block text-xs font-semibold text-text-secondary mb-1">Evento de Origem</label>
                    <select id="automation-field-3"
                      value={triggerType}
                      onChange={e => { setTriggerType(e.target.value as AutomationRule['triggerType']); setTriggerToStatusId(''); setActionCreateDefaultTasks(false); setActionChangeProjectStatus(false); }}
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold cursor-pointer outline-none"
                    >
                      <option value="project_status_changed">Ao alterar o estado de um Projeto</option>
                      <option value="task_status_changed">Ao alterar o estado de uma Tarefa</option>
                      <option value="task_created">Ao criar uma nova Tarefa</option>
                      <option value="presales_created">Ao criar um pedido Presales</option>
                      <option value="presales_status_changed">Ao alterar o estado Presales</option>
                    </select>
                  </div>

                  {triggerType === 'project_status_changed' && (
                    <div>
                      <label htmlFor="automation-field-4" className="block text-xs font-semibold text-text-secondary mb-1">
                        Quando o estado do projeto passar a ser:
                      </label>
                      <select id="automation-field-4"
                        value={triggerToStatusId}
                        onChange={e => setTriggerToStatusId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold cursor-pointer outline-none"
                      >
                        <option value="">Qualquer Estado</option>
                        {projectStatuses.filter(s => !s.deleted).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {triggerType === 'task_status_changed' && (
                    <div>
                      <label htmlFor="automation-field-5" className="block text-xs font-semibold text-text-secondary mb-1">
                        Quando o estado da tarefa passar a ser:
                      </label>
                      <select id="automation-field-5"
                        value={triggerToStatusId}
                        onChange={e => setTriggerToStatusId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold cursor-pointer outline-none"
                      >
                        <option value="">Qualquer Estado</option>
                        {taskStatuses.filter(s => !s.deleted).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {triggerType === 'presales_status_changed' && <div>
                    <label htmlFor="automation-field-6" className="block text-xs font-semibold text-text-secondary mb-1">Estado Presales de destino</label>
                    <select id="automation-field-6" value={triggerToStatusId} onChange={e => setTriggerToStatusId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold">
                      <option value="">Qualquer estado</option>
                      <option value="submitted">Por aceitar</option><option value="accepted">Em preparação</option>
                      <option value="suspended">Suspenso</option><option value="won">Ganho</option><option value="lost">Perdido</option>
                    </select>
                  </div>}
                </div>
              </div>

              {/* Section 3: Actions to Execute */}
              <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-action-100 text-action-700 flex items-center justify-center text-micro">3</span>
                  Executar estas Ações
                </div>

                <div className="space-y-3 pl-7">
                  {/* Action 1: Create Default Tasks */}
                  {triggerType === 'project_status_changed' && <label className="flex items-start gap-3 p-3 bg-surface-muted border border-border rounded-control cursor-pointer hover:bg-surface-muted/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={actionCreateDefaultTasks}
                      onChange={e => setActionCreateDefaultTasks(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-primary-ink rounded-xs cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Criar Tarefas Padrão no Projeto</div>
                      <div className="text-small-label text-text-muted">
                        Insere automaticamente a lista de tarefas pré-definidas na configuração do sistema.
                      </div>
                    </div>
                  </label>}

                  {/* Action 2: Change Project Status */}
                  {['task_created','task_status_changed'].includes(triggerType) && <div className="p-3 bg-surface-muted border border-border rounded-control space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actionChangeProjectStatus}
                        onChange={e => setActionChangeProjectStatus(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-primary-ink rounded-xs cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-text-primary">Alterar Estado do Projeto</div>
                        <div className="text-small-label text-text-muted">
                          {triggerType === 'task_status_changed' ? 'Atualiza o projeto quando todas as tarefas ativas atingirem o estado escolhido.' : 'Atualiza o estado do projeto associado.'}
                        </div>
                      </div>
                    </label>

                    {actionChangeProjectStatus && (
                      <div className="pl-7 pt-1">
                        <select
                          aria-label="Estado de destino do projeto"
                          value={targetProjectStatusId}
                          onChange={e => setTargetProjectStatusId(e.target.value)}
                          className="w-full px-3 py-2 bg-surface border border-border rounded-control text-xs font-semibold outline-none"
                          required={actionChangeProjectStatus}
                        >
                          <option value="">Selecione o Estado de Destino...</option>
                          {projectStatuses.filter(s => !s.deleted).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>}

                  {/* Action 3: Send Notification */}
                  <div className="p-3 bg-surface-muted border border-border rounded-control space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actionSendNotification}
                        onChange={e => setActionSendNotification(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-primary-ink rounded-xs cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-text-primary">Enviar Notificação no Sistema</div>
                        <div className="text-small-label text-text-muted">
                          Gera um aviso interno para os utilizadores/gestores relevantes.
                        </div>
                      </div>
                    </label>

                    {actionSendNotification && (
                      <div className="pl-7 pt-1 space-y-2">
                        <input
                          aria-label="Título da notificação"
                          type="text"
                          value={notificationTitle}
                          onChange={e => setNotificationTitle(e.target.value)}
                          placeholder="Título da notificação (ex: Projeto atualizado)"
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded-control text-xs font-semibold outline-none"
                          required={actionSendNotification}
                        />
                        <input
                          aria-label="Mensagem da notificação"
                          type="text"
                          value={notificationMessage}
                          onChange={e => setNotificationMessage(e.target.value)}
                          placeholder="Mensagem detalhada..."
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded-control text-xs outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-muted rounded-control transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                  <button
                  type="submit"
                    disabled={saving}
                  className="px-5 py-2 bg-primary hover:bg-action-700 text-inverse text-xs font-bold rounded-control transition-all shadow-raised cursor-pointer"
                >
                  {editingRuleId ? 'Guardar Alterações' : 'Criar Regra'}
                </button>
              </div>
            </form>
        </Dialog>
      )}

      {/* Manual Test Execution Modal */}
      {testRuleId && (
        <Dialog isOpen={Boolean(testRuleId)} onClose={() => setTestRuleId(null)} title="Testar Regra de Automação"
          className="max-w-md" bodyClassName="space-y-4">
            <p className="text-xs text-text-secondary">{automationRules.find(rule => rule.id === testRuleId)?.triggerType.startsWith('presales_')
              ? 'Pré-visualização da regra Presales. Nenhum dado será alterado.'
              : 'Selecione um projeto para consultar as ações previstas. Nenhum dado será alterado:'}</p>

            {!automationRules.find(rule => rule.id === testRuleId)?.triggerType.startsWith('presales_') && <div>
              <label htmlFor="automation-field-7" className="block text-xs font-semibold text-text-secondary mb-1">Projeto para Teste</label>
              <select id="automation-field-7"
                value={selectedTestProjectId}
                onChange={e => setSelectedTestProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold outline-none cursor-pointer"
              >
                {projects.filter(p => !p.deleted).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>}

            {testFeedback && (
              <div className="p-3 bg-feedback-success-50 border border-feedback-success-200 rounded-control text-feedback-success-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-feedback-success-600 shrink-0" />
                {testFeedback}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTestRuleId(null)}
                className="px-3.5 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-muted rounded-control"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteTest}
                className="px-4 py-2 bg-primary hover:bg-action-700 text-inverse text-xs font-bold rounded-control flex items-center gap-1.5 shadow-raised cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                  Pré-visualizar
              </button>
            </div>
        </Dialog>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteRuleId && (
        <ConfirmModal
          isOpen={true}
          title="Eliminar Regra de Automação"
          message="Tem a certeza que deseja eliminar esta regra de automação? O processo automático deixará de ser executado."
          onConfirm={() => {
            void deleteAutomationRule(confirmDeleteRuleId).then(result => { if (!result.success) alert(result.message || 'Não foi possível eliminar a regra.'); });
            setConfirmDeleteRuleId(null);
          }}
          onCancel={() => setConfirmDeleteRuleId(null)}
        />
      )}
    </div>
  );
}
