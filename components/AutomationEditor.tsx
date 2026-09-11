'use client';

import React, { useState } from 'react';
import { AutomationRule, AutomationAction, ProjectStatus, TaskStatus, Project, User } from '../lib/types';
import { 
  Zap, Plus, Trash2, Edit2, Play, CheckCircle2, ArrowRight, Bell, 
  ListTodo, Layers, ShieldCheck, Sparkles, Check, X, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface AutomationEditorProps {
  automationRules: AutomationRule[];
  addAutomationRule: (rule: Omit<AutomationRule, 'id' | 'createdDate'>) => void;
  updateAutomationRule: (id: string, updates: Partial<AutomationRule>) => void;
  deleteAutomationRule: (id: string) => void;
  toggleAutomationRule: (id: string) => void;
  runAutomationRule?: (id: string, projectId?: string) => void;
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
  runAutomationRule,
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

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) {
      alert('Por favor introduza um nome para a regra.');
      return;
    }

    const actions: AutomationAction[] = [];
    if (actionCreateDefaultTasks) {
      actions.push({ type: 'create_default_tasks' });
    }
    if (actionChangeProjectStatus && targetProjectStatusId) {
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
      triggerCondition: triggerToStatusId ? { toStatusId: triggerToStatusId } : undefined,
      actions
    };

    if (editingRuleId) {
      updateAutomationRule(editingRuleId, ruleData);
    } else {
      addAutomationRule(ruleData);
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
    if (!testRuleId || !runAutomationRule) return;
    runAutomationRule(testRuleId, selectedTestProjectId);
    const rule = automationRules.find(r => r.id === testRuleId);
    setTestFeedback(`A regra "${rule?.name || ''}" foi executada com sucesso no projeto selecionado!`);
    setTimeout(() => {
      setTestFeedback(null);
      setTestRuleId(null);
    }, 2500);
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
      case 'quote_approved':
        return 'Ao aprovar orçamento de um cliente';
      case 'task_created':
        return 'Ao criar uma nova tarefa';
      default:
        return 'Evento do sistema';
    }
  };

  const activeCount = automationRules.filter(r => r.enabled).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner & Action */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Zap className="w-64 h-64 text-white" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              Editor de Automação de Processos (No-Code)
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Regras de Negócio e Automações</h2>
            <p className="text-sm text-slate-300 max-w-2xl">
              Crie fluxos automáticos para gerar tarefas padrão, atualizar estados de projetos e notificar as equipas sem necessidade de intervenção manual.
            </p>
          </div>

          {canWrite && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova Regra de Automação
            </button>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10 backdrop-blur-sm">
            <div className="text-xs text-slate-400 font-medium">Total de Regras</div>
            <div className="text-xl font-bold text-white mt-0.5">{automationRules.length}</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10 backdrop-blur-sm">
            <div className="text-xs text-emerald-400 font-medium">Regras Ativas</div>
            <div className="text-xl font-bold text-emerald-300 mt-0.5">{activeCount}</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10 backdrop-blur-sm col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-400 font-medium">Execuções Automáticas</div>
            <div className="text-xl font-bold text-blue-300 mt-0.5">Ativas no Servidor</div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {automationRules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Nenhuma regra configurada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              Comece a economizar tempo criando automações que criam tarefas automaticamente ou notificam os responsáveis.
            </p>
            {canWrite && (
              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Criar Primeira Regra
              </button>
            )}
          </div>
        ) : (
          automationRules.map(rule => (
            <div 
              key={rule.id}
              className={`bg-white rounded-2xl border transition-all p-5 shadow-xs ${
                rule.enabled ? 'border-slate-200 hover:border-blue-300' : 'border-slate-200 opacity-60 bg-slate-50/50'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Rule Info & Toggle */}
                <div className="flex items-start gap-4 flex-1">
                  <button
                    type="button"
                    onClick={() => canWrite && toggleAutomationRule(rule.id)}
                    disabled={!canWrite}
                    className={`mt-1 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      rule.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                    title={rule.enabled ? 'Desativar Regra' : 'Ativar Regra'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        rule.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                        rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {rule.enabled ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-slate-500">{rule.description}</p>
                    )}
                  </div>
                </div>

                {/* Flow Diagram (Trigger -> Actions) */}
                <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/80 shrink-0 flex-wrap sm:flex-nowrap">
                  {/* Trigger Pill */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-900 rounded-lg text-xs font-bold border border-blue-200">
                    <Zap className="w-3.5 h-3.5 text-blue-600 shrink-0" />
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

                {/* Actions (Test / Edit / Delete) */}
                <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100 shrink-0 justify-end">
                  {runAutomationRule && (
                    <button
                      type="button"
                      onClick={() => handleRunTest(rule.id)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Testar execução desta regra manualmente num projeto"
                    >
                      <Play className="w-3 h-3 text-blue-600 fill-blue-600" />
                      Testar
                    </button>
                  )}

                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rule)}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        title="Editar Regra"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRuleId(rule.id)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
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
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
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
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">1</span>
                  Identificação da Regra
                </div>

                <div className="space-y-3 pl-7">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome da Regra <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={ruleName}
                      onChange={e => setRuleName(e.target.value)}
                      placeholder="Ex: Gerar tarefas padrão ao colocar projeto Em Curso"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Descrição da Regra (Opcional)
                    </label>
                    <textarea
                      value={ruleDescription}
                      onChange={e => setRuleDescription(e.target.value)}
                      placeholder="Explique o propósito desta automação..."
                      rows={2}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Trigger Condition */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">2</span>
                  Quando isto acontecer (Gatilho)
                </div>

                <div className="space-y-3 pl-7">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Evento de Origem</label>
                    <select
                      value={triggerType}
                      onChange={e => setTriggerType(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer outline-none"
                    >
                      <option value="project_status_changed">Ao alterar o estado de um Projeto</option>
                      <option value="task_status_changed">Ao alterar o estado de uma Tarefa</option>
                      <option value="quote_approved">Ao aprovar um Orçamento de cliente</option>
                      <option value="task_created">Ao criar uma nova Tarefa</option>
                    </select>
                  </div>

                  {triggerType === 'project_status_changed' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Quando o estado do projeto passar a ser:
                      </label>
                      <select
                        value={triggerToStatusId}
                        onChange={e => setTriggerToStatusId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer outline-none"
                      >
                        <option value="">Qualquer Estado</option>
                        {projectStatuses.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {triggerType === 'task_status_changed' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Quando o estado da tarefa passar a ser:
                      </label>
                      <select
                        value={triggerToStatusId}
                        onChange={e => setTriggerToStatusId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer outline-none"
                      >
                        <option value="">Qualquer Estado</option>
                        {taskStatuses.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Actions to Execute */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">3</span>
                  Executar estas Ações
                </div>

                <div className="space-y-3 pl-7">
                  {/* Action 1: Create Default Tasks */}
                  <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={actionCreateDefaultTasks}
                      onChange={e => setActionCreateDefaultTasks(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-blue-600 rounded-xs cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Criar Tarefas Padrão no Projeto</div>
                      <div className="text-[11px] text-slate-500">
                        Insere automaticamente a lista de tarefas pré-definidas na configuração do sistema.
                      </div>
                    </div>
                  </label>

                  {/* Action 2: Change Project Status */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actionChangeProjectStatus}
                        onChange={e => setActionChangeProjectStatus(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded-xs cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Alterar Estado do Projeto</div>
                        <div className="text-[11px] text-slate-500">
                          Atualiza o estado do projeto associado para um estado de destino específico.
                        </div>
                      </div>
                    </label>

                    {actionChangeProjectStatus && (
                      <div className="pl-7 pt-1">
                        <select
                          value={targetProjectStatusId}
                          onChange={e => setTargetProjectStatusId(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                          required={actionChangeProjectStatus}
                        >
                          <option value="">Selecione o Estado de Destino...</option>
                          {projectStatuses.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Action 3: Send Notification */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actionSendNotification}
                        onChange={e => setActionSendNotification(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded-xs cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Enviar Notificação no Sistema</div>
                        <div className="text-[11px] text-slate-500">
                          Gera um aviso interno para os utilizadores/gestores relevantes.
                        </div>
                      </div>
                    </label>

                    {actionSendNotification && (
                      <div className="pl-7 pt-1 space-y-2">
                        <input
                          type="text"
                          value={notificationTitle}
                          onChange={e => setNotificationTitle(e.target.value)}
                          placeholder="Título da Notificação (ex: Orçamento Aprovado)"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                          required={actionSendNotification}
                        />
                        <input
                          type="text"
                          value={notificationMessage}
                          onChange={e => setNotificationMessage(e.target.value)}
                          placeholder="Mensagem detalhada..."
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  {editingRuleId ? 'Guardar Alterações' : 'Criar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Test Execution Modal */}
      {testRuleId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Play className="w-4 h-4 text-blue-600 fill-blue-600" />
                Testar Regra de Automação
              </div>
              <button onClick={() => setTestRuleId(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Selecione um projeto existente para simular o disparo imediato desta regra de automação:
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Projeto para Teste</label>
              <select
                value={selectedTestProjectId}
                onChange={e => setSelectedTestProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none cursor-pointer"
              >
                {projects.filter(p => !p.deleted).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            {testFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {testFeedback}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTestRuleId(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteTest}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                Executar Agora
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
            deleteAutomationRule(confirmDeleteRuleId);
            setConfirmDeleteRuleId(null);
          }}
          onCancel={() => setConfirmDeleteRuleId(null)}
        />
      )}
    </div>
  );
}
