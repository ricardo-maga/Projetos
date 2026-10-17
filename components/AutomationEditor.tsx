'use client';

import React, { useState } from 'react';
import { AutomationRule, AutomationAction, ProjectStatus, TaskStatus } from '../lib/types';
import { 
  Zap, Plus, Trash2, Edit2, Play, CheckCircle2, ArrowRight, Bell, 
  ListTodo, Layers, ShieldCheck, Sparkles, Check, X, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface AutomationEditorProps {
  automationRules: AutomationRule[];
  addAutomationRule: (rule: Omit<AutomationRule, 'id' | 'createdDate'>) => Promise<{ success: boolean; message?: string }>;
  updateAutomationRule: (id: string, updates: Partial<AutomationRule>) => Promise<{ success: boolean; message?: string }>;
  deleteAutomationRule: (id: string) => Promise<{ success: boolean; message?: string }>;
  toggleAutomationRule: (id: string) => Promise<{ success: boolean; message?: string }>;
  projectStatuses: ProjectStatus[];
  taskStatuses: TaskStatus[];
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
    setTriggerToStatusId(rule.triggerCondition?.toStatusId || '');

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
    if (triggerType !== 'project_status_changed' && actionChangeProjectStatus && targetProjectStatusId) {
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
    if (triggerType === 'task_status_changed' && actionChangeProjectStatus && !triggerToStatusId) {
      alert('Escolha o estado da tarefa que deve desencadear a mudança do projeto.');
      return;
    }

    const ruleData: Omit<AutomationRule, 'id' | 'createdDate'> = {
      name: ruleName.trim(),
      description: ruleDescription.trim() || undefined,
      enabled: ruleEnabled,
      triggerType,
      triggerCondition: triggerType !== 'task_created' && triggerToStatusId ? { toStatusId: triggerToStatusId } : undefined,
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
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
            <div className="text-xl font-bold text-primary mt-0.5">Por evento</div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {visibleRules.length === 0 ? (
          <div className="bg-surface rounded-card border border-border p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-card bg-blue-50 text-primary flex items-center justify-center mx-auto mb-3">
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
              className={`bg-surface rounded-card border transition-all p-5 shadow-xs ${
                rule.enabled ? 'border-border hover:border-blue-300' : 'border-border opacity-60 bg-surface-muted/50'
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
                      rule.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                    title={rule.enabled ? 'Desativar Regra' : 'Ativar Regra'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out ${
                        rule.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-text-primary">{rule.name}</h3>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                        rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-text-secondary'
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
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-900 rounded-lg text-xs font-bold border border-blue-200">
                    <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>{getTriggerLabel(rule)}</span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />

                  {/* Actions Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {rule.actions.map((act, i) => {
                      if (act.type === 'create_default_tasks') {
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold border border-amber-200">
                            <ListTodo className="w-3.5 h-3.5 text-amber-700" />
                            Criar Tarefas Padrão
                          </span>
                        );
                      }
                      if (act.type === 'change_project_status') {
                        const targetStatus = projectStatuses.find(s => s.id === act.params?.targetStatusId)?.name || 'Novo Estado';
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-900 rounded-lg text-xs font-bold border border-purple-200">
                            <Layers className="w-3.5 h-3.5 text-purple-700" />
                            Projeto &rarr; {targetStatus}
                          </span>
                        );
                      }
                      if (act.type === 'send_notification') {
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-100 text-sky-900 rounded-lg text-xs font-bold border border-sky-200">
                            <Bell className="w-3.5 h-3.5 text-sky-700" />
                            Enviar Notificação
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>

                {/* Actions (Preview / Edit / Delete) */}
                <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border-subtle shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => handleRunTest(rule.id)}
                      className="px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-blue-700 hover:bg-blue-50 border border-border hover:border-blue-200 rounded-control transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Pré-visualizar as ações sem alterar dados"
                    >
                      <Play className="w-3 h-3 text-primary fill-blue-600" />
                      Pré-visualizar
                    </button>

                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rule)}
                        className="p-2 text-text-muted hover:text-primary hover:bg-surface-muted rounded-control transition-colors cursor-pointer"
                        title="Editar Regra"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRuleId(rule.id)}
                        className="p-2 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-control transition-colors cursor-pointer"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface rounded-card max-w-2xl w-full shadow-2xl border border-border-subtle overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-primary text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-card bg-primary/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {editingRuleId ? 'Editar Regra de Automação' : 'Nova Regra de Automação'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Configure os acionadores e as ações automáticas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveRule} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Section 1: Name and Description */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">1</span>
                  Identificação da Regra
                </div>

                <div className="space-y-3 pl-7">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Nome da Regra <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={ruleName}
                      onChange={e => setRuleName(e.target.value)}
                      placeholder="Ex: Gerar tarefas padrão ao colocar projeto Em Curso"
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Descrição da Regra (Opcional)
                    </label>
                    <textarea
                      value={ruleDescription}
                      onChange={e => setRuleDescription(e.target.value)}
                      placeholder="Explique o propósito desta automação..."
                      rows={2}
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-medium focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Trigger Condition */}
              <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">2</span>
                  Quando isto acontecer (Gatilho)
                </div>

                <div className="space-y-3 pl-7">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Evento de Origem</label>
                    <select
                      value={triggerType}
                      onChange={e => { setTriggerType(e.target.value as AutomationRule['triggerType']); setTriggerToStatusId(''); setActionCreateDefaultTasks(false); setActionChangeProjectStatus(false); }}
                      className="w-full px-3.5 py-2.5 bg-surface-muted border border-border rounded-control text-xs font-semibold cursor-pointer outline-none"
                    >
                      <option value="project_status_changed">Ao alterar o estado de um Projeto</option>
                      <option value="task_status_changed">Ao alterar o estado de uma Tarefa</option>
                      <option value="task_created">Ao criar uma nova Tarefa</option>
                    </select>
                  </div>

                  {triggerType === 'project_status_changed' && (
                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Quando o estado do projeto passar a ser:
                      </label>
                      <select
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
                      <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Quando o estado da tarefa passar a ser:
                      </label>
                      <select
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
                </div>
              </div>

              {/* Section 3: Actions to Execute */}
              <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">3</span>
                  Executar estas Ações
                </div>

                <div className="space-y-3 pl-7">
                  {/* Action 1: Create Default Tasks */}
                  {triggerType === 'project_status_changed' && <label className="flex items-start gap-3 p-3 bg-surface-muted border border-border rounded-control cursor-pointer hover:bg-surface-muted/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={actionCreateDefaultTasks}
                      onChange={e => setActionCreateDefaultTasks(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-primary rounded-xs cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Criar Tarefas Padrão no Projeto</div>
                      <div className="text-[11px] text-text-muted">
                        Insere automaticamente a lista de tarefas pré-definidas na configuração do sistema.
                      </div>
                    </div>
                  </label>}

                  {/* Action 2: Change Project Status */}
                  {triggerType !== 'project_status_changed' && <div className="p-3 bg-surface-muted border border-border rounded-control space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actionChangeProjectStatus}
                        onChange={e => setActionChangeProjectStatus(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-primary rounded-xs cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-text-primary">Alterar Estado do Projeto</div>
                        <div className="text-[11px] text-text-muted">
                          {triggerType === 'task_status_changed' ? 'Atualiza o projeto quando todas as tarefas ativas atingirem o estado escolhido.' : 'Atualiza o estado do projeto associado.'}
                        </div>
                      </div>
                    </label>

                    {actionChangeProjectStatus && (
                      <div className="pl-7 pt-1">
                        <select
                          value={targetProjectStatusId}
                          onChange={e => setTargetProjectStatusId(e.target.value)}
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs font-semibold outline-none"
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
                        className="mt-0.5 w-4 h-4 text-primary rounded-xs cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-text-primary">Enviar Notificação no Sistema</div>
                        <div className="text-[11px] text-text-muted">
                          Gera um aviso interno para todos os utilizadores internos ativos.
                        </div>
                      </div>
                    </label>

                    {actionSendNotification && (
                      <div className="pl-7 pt-1 space-y-2">
                        <input
                          type="text"
                          value={notificationTitle}
                          onChange={e => setNotificationTitle(e.target.value)}
                          placeholder="Título da notificação (ex: Projeto atualizado)"
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-semibold outline-none"
                          required={actionSendNotification}
                        />
                        <input
                          type="text"
                          value={notificationMessage}
                          onChange={e => setNotificationMessage(e.target.value)}
                          placeholder="Mensagem detalhada..."
                          className="w-full px-3 py-1.5 bg-surface border border-border rounded-lg text-xs outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-muted rounded-control transition-colors cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-primary hover:bg-blue-700 text-white text-xs font-bold rounded-control transition-all shadow-xs cursor-pointer"
                >
                  {editingRuleId ? 'Guardar Alterações' : 'Criar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Read-only rule preview */}
      {testRuleId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface rounded-card max-w-md w-full p-6 shadow-2xl border border-border-subtle space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-primary font-bold text-sm">
                <Play className="w-4 h-4 text-primary fill-blue-600" />
                Pré-visualizar Regra de Automação
              </div>
              <button onClick={() => setTestRuleId(null)} className="text-slate-400 hover:text-text-secondary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary">Resumo das ações da regra. Nenhum dado será alterado.</p>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-control text-blue-900 text-xs space-y-2">
              <p className="font-semibold">Ações previstas se o evento e as condições ocorrerem:</p>
              <ul className="list-disc pl-4 space-y-1">
                {(automationRules.find(rule => rule.id === testRuleId)?.actions || []).map((action, index) => (
                  <li key={index}>
                    {action.type === 'create_default_tasks' && 'Criar tarefas padrão apenas se o projeto não tiver tarefas ativas.'}
                    {action.type === 'change_project_status' && (automationRules.find(rule => rule.id === testRuleId)?.triggerType === 'task_status_changed'
                      ? 'Mudar o estado do projeto quando todas as tarefas ativas tiverem o estado do evento.'
                      : 'Mudar o estado do projeto associado à tarefa criada.')}
                    {action.type === 'send_notification' && 'Enviar uma notificação a cada utilizador interno ativo.'}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTestRuleId(null)}
                className="px-3.5 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-muted rounded-control"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
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
