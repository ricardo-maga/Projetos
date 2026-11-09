'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AppConfiguration, SpecialDay, DefaultTask, ERPState } from '@/lib/types';
import {
  Settings, RefreshCw, Key, Info, Calendar, Plus, Trash2, ListTodo, Edit2, Check, X,
  Database, UploadCloud, CheckCircle, AlertCircle, Terminal, Copy, ShieldCheck,
  Users, GripVertical, Zap, ChevronLeft, ChevronRight
} from 'lucide-react';
import CommunicationSettingsSection from '@/domains/communication/ui/CommunicationSettingsSection';
import SpecialDaysSection from '@/domains/calendar/ui/SpecialDaysSection';
import DefaultTasksSection from '@/domains/tasks/ui/DefaultTasksSection';
import ReferenceDataSection from './ReferenceDataSection';
import AuditLogSection from './AuditLogSection';
import AppLogo from '@/components/AppLogo';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ConfirmModal from '@/components/ConfirmModal';
import {
  testSupabaseConnection,
  SUPABASE_OPTIMIZE_INDEXES_SQL,
} from '@/lib/supabaseSync';
// import Papa from 'papaparse';
import UserAdministrationSection from './UserAdministrationSection';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import Tabs from '@/components/ui/Tabs';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { M3SectionHeader, M3Button } from '@/components/M3';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

import { hasPermission } from '@/lib/permissions';
import { formatHoursToHHMM, parseTimeToHours } from '@/lib/utils';

interface ConfigSectionProps {
  activeConfigTab?: string;
  onChangeConfigTab?: (tab: string) => void;
  config: AppConfiguration;
  specialDays: SpecialDay[];
  updateConfig: (updates: Partial<AppConfiguration>) => Promise<{ success: boolean; message?: string }>;
  onResetDemoData?: () => void;
  onClearDemoData?: () => void;
  addSpecialDay: (date: string, name: string) => Promise<{ success: boolean; message?: string }>;
  updateSpecialDay: (id: string, updates: Partial<SpecialDay>) => Promise<{ success: boolean; message?: string }>;
  deleteSpecialDay: (id: string) => void;
  defaultTasks?: DefaultTask[];
  addDefaultTask?: (title: string, description: string, estimatedHours: string, taskTypeId?: string) => Promise<{ success: boolean; message?: string }>;
  updateDefaultTask?: (id: string, updates: Partial<DefaultTask>) => Promise<{ success: boolean; message?: string }>;
  deleteDefaultTask?: (id: string) => void;
  projectCategories?: any[];
  projectStatuses?: any[];
  taskStatuses?: any[];
  taskTypes?: any[];
  projectRisks?: any[];
  projectPriorities?: any[];
  projectTeams?: any[];
  projectPartners?: any[];
  addAuxRecord?: (tableName: any, name: string, extra?: { scale?: number }) => void;
  updateAuxRecord?: (tableName: any, id: string, updates: Partial<{ name: string; scale: number; deleted: boolean }>) => void;
  deleteAuxRecord?: (tableName: any, id: string) => void;
  updateNotificationSetting?: (id: string, updates: Partial<import('@/lib/types').NotificationSetting>) => Promise<{ success: boolean; message?: string }>;
  reorderAuxRecords?: (tableName: any, newItems: any[]) => void;
  state: ERPState;
  databaseStatus: 'idle' | 'syncing' | 'synced' | 'error';
  databaseError?: string | null;
  auditStatus?: 'idle' | 'loading' | 'loaded' | 'error';
  addProject?: any;
  clients?: import('@/lib/types').Client[];
  addClient?: any;
  addUser?: any;
  updateUser?: any;
  deleteUser?: any;
  currentUser?: any;
  userGroups?: any[];
  automationRules?: import('@/lib/types').AutomationRule[];
  addAutomationRule?: any;
  updateAutomationRule?: any;
  deleteAutomationRule?: any;
  toggleAutomationRule?: any;
  onRefreshFromDatabase?: () => Promise<boolean>;
}

export { PASTEL_COLORS, getPastelColor } from './ReferenceDataSection';

export default function ConfigSection({
  activeConfigTab: activeConfigTabProp = 'sistema',
  onChangeConfigTab,
  config,
  specialDays = [],
  updateConfig,
  onResetDemoData,
  onClearDemoData,
  addSpecialDay,
  updateSpecialDay,
  deleteSpecialDay,
  defaultTasks = [],
  addDefaultTask,
  updateDefaultTask,
  deleteDefaultTask,
  projectCategories = [],
  projectStatuses = [],
  taskStatuses = [],
  taskTypes = [],
  projectRisks = [],
  projectPriorities = [],
  projectTeams = [],
  projectPartners = [],
  addAuxRecord,
  updateAuxRecord,
  deleteAuxRecord,
  updateNotificationSetting,
  reorderAuxRecords,
  state,
  databaseStatus,
  databaseError,
  auditStatus = 'idle',
  addProject,
  clients = [],
  addClient,
  addUser,
  updateUser,
  deleteUser,
  currentUser,
  userGroups = [],
  automationRules = [],
  addAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  onRefreshFromDatabase,
}: ConfigSectionProps) {
  const canReadConfig = hasPermission(currentUser, 'config_read');
  const canWriteConfig = hasPermission(currentUser, 'config_write');
  const [appName, setAppName] = useState(config.appName);
  const [appDesc, setAppDesc] = useState(config.appDescription);
  const [logo, setLogo] = useState(config.logoImagePath || config.logo || '');
  const [footer, setFooter] = useState(config.footerCopyrightText);
  const [theme, setTheme] = useState(config.theme || 'default');
  const configKey = JSON.stringify({
    appName: config.appName,
    appDescription: config.appDescription,
    logo: config.logoImagePath || config.logo || '',
    footer: config.footerCopyrightText,
    theme: config.theme || 'default',
  });

  const [prevConfigKey, setPrevConfigKey] = useState(configKey);
  if (prevConfigKey !== configKey) {
    setPrevConfigKey(configKey);
    setAppName(config.appName);
    setAppDesc(config.appDescription);
    setLogo(config.logoImagePath || config.logo || '');
    setFooter(config.footerCopyrightText);
    setTheme(config.theme || 'default');
  }

  const activeConfigTab = activeConfigTabProp || 'sistema';
  const setActiveConfigTab = (tab: string) => {
    if (onChangeConfigTab) onChangeConfigTab(tab);
  };

  // Supabase state management
  const [supabaseStatus, setSupabaseStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [supabaseMessage, setSupabaseMessage] = useState('Pronto para testar a leitura da base de dados.');
  const { busy: isSavingConfig, run: runConfigAction } = useAsyncAction();
  const connectionTestInFlight = useRef(false);
  const [showIndexSql, setShowIndexSql] = useState(false);
  const [indexSqlCopied, setIndexSqlCopied] = useState(false);

  const copyIndexSqlToClipboard = () => {
    navigator.clipboard.writeText(SUPABASE_OPTIMIZE_INDEXES_SQL);
    setIndexSqlCopied(true);
    setTimeout(() => setIndexSqlCopied(false), 2000);
  };

  const handleTestConnection = async () => {
    if (connectionTestInFlight.current) return;
    connectionTestInFlight.current = true;
    setSupabaseStatus('testing');
    setSupabaseMessage('A testar ligação com o Supabase...');
    try {
      const result = await testSupabaseConnection();
      if (result.success) {
        setSupabaseStatus('success');
        setSupabaseMessage(result.message);
      } else {
        setSupabaseStatus('failed');
        setSupabaseMessage(result.message);
      }
    } finally {
      connectionTestInFlight.current = false;
    }
  };

  useEffect(() => {
    if (supabaseStatus === 'testing') return;
    if (databaseStatus === 'synced') {
      setSupabaseStatus('success');
      setSupabaseMessage('A aplicação leu os dados da base de dados com sucesso.');
    } else if (databaseStatus === 'error') {
      setSupabaseStatus('failed');
      setSupabaseMessage(databaseError || 'Não foi possível ler a base de dados.');
    } else if (databaseStatus === 'syncing') {
      setSupabaseStatus('idle');
      setSupabaseMessage('A sincronizar dados com a base de dados.');
    }
  }, [databaseStatus, databaseError]);



  // Confirmation Modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runConfigAction(async () => {
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    const result = await updateConfig({
      appName,
      appDescription: appDesc,
      logoImagePath: logo,
      logo: logo,
      footerCopyrightText: footer,
      theme,
    });
    if (result.success) alert('Configurações gravadas com sucesso!');
    else alert(result.message || 'Não foi possível gravar as configurações.');
    });
  };

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setImportingCsv(true);
    setCsvResult(null);
    try {
      if (!addProject || !currentUser?.id || !hasPermission(currentUser, 'projects_write')) {
        throw new Error('Sem permissão para criar projetos.');
      }
      const PapaModule = await import('papaparse');
      const Papa = PapaModule.default || PapaModule;
      const parsed = Papa.parse<Record<string, string>>(csvText.trim(), { header: true, skipEmptyLines: 'greedy' });
      if (parsed.errors.length) throw new Error(`CSV inválido: ${parsed.errors[0].message}`);
      const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const aliases = {
        title: ['nomedeprojeto', 'nomedoprojeto', 'titulodoprojeto', 'titulo', 'projeto'],
        client: ['cliente'],
        ip: ['nIP', 'numeroip', 'noip', 'ip'].map(normalize),
        sf: ['nSF', 'numerosf', 'nosf', 'sf'].map(normalize),
        start: ['datainicio', 'datadeinicio', 'inicio'],
      };
      const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, parsed.meta.fields?.find(header => names.includes(normalize(header)))])) as Record<string, string | undefined>;
      const missing = Object.entries(columns).filter(([, header]) => !header).map(([field]) => field);
      if (missing.length) throw new Error(`Colunas em falta: ${missing.join(', ')}.`);
      const parseDate = (value: string) => {
        const trimmed = value.trim();
        const pt = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
        const iso = pt ? `${pt[3]}-${pt[2]}-${pt[1]}` : trimmed;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) || new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) {
          throw new Error('Data início inválida. Use AAAA-MM-DD ou DD/MM/AAAA.');
        }
        return iso;
      };
      const knownClients = new Map((clients || []).filter(c => !c.deleted).flatMap(c => [c.clientName, c.shortName].filter(Boolean).map(name => [normalize(name), c.id] as const)));
      let success = 0;
      const errors: string[] = [];
      for (let index = 0; index < parsed.data.length; index++) {
        const row = parsed.data[index];
        try {
          const get = (field: keyof typeof aliases) => String(row[columns[field]!] || '').trim();
          const title = get('title');
          const clientName = get('client');
          if (!title || !clientName) throw new Error('Nome de projeto e cliente são obrigatórios.');
          if (title.length > 255) throw new Error('Nome de projeto excede 255 caracteres.');
          const startDate = parseDate(get('start'));
          let clientId = knownClients.get(normalize(clientName));
          if (!clientId) {
            if (!addClient || !hasPermission(currentUser, 'clients_write')) throw new Error(`Cliente "${clientName}" inexistente e sem permissão para o criar.`);
            const created = await addClient({ clientName, shortName: clientName, location: '', notes: '' });
            clientId = created?.id;
            if (!clientId) throw new Error(`Não foi possível criar o cliente "${clientName}".`);
            knownClients.set(normalize(clientName), clientId);
          }
          await addProject({
            demo: false, title, clientId, description: 'Importado por CSV',
            categoryId: projectCategories.find(c => !c.deleted)?.id || '',
            categoryIds: projectCategories.find(c => !c.deleted)?.id ? [projectCategories.find(c => !c.deleted).id] : [],
            statusId: projectStatuses.find(s => !s.deleted)?.id || '',
            projectManagerId: currentUser.id,
            fieldManagerId: '', salesRepId: '', startDate,
            deliveryDate: '', estimatedDate: '', scheduledDate: '',
            installProjectNo: get('ip'), sfOpportunityNo: get('sf'),
            riskId: '', priorityId: '', teamsInvolvedIds: [], partnersIds: [],
            documents: [], budgetValue: 0,
          });
          success++;
        } catch (error: any) {
          errors.push(`Linha ${index + 2}: ${error?.message || 'Erro ao importar projeto.'}`);
        }
      }
      setCsvResult({ success, failed: errors.length, errors });
      if (success && !errors.length) setCsvText('');
    } catch (error: any) {
      setCsvResult({ success: 0, failed: 1, errors: [error?.message || 'Erro ao ler CSV.'] });
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="m3-config space-y-6" id="config-section-root">
      {['sistema', 'campos', 'dias', 'tarefas'].includes(activeConfigTab) && (
        <div className="space-y-4">
          <M3SectionHeader title="Configurações da aplicação" />
          <Tabs
            tabs={[
              { id: 'sistema', label: 'Aplicação' },
              { id: 'campos', label: 'Campos auxiliares' },
              { id: 'dias', label: 'Dias especiais' },
              { id: 'tarefas', label: 'Tarefas modelo' },
            ]}
            activeTabId={activeConfigTab}
            onChange={setActiveConfigTab}
          />
        </div>
      )}
      {['auditoria', 'importacao'].includes(activeConfigTab) && (
        <div className="space-y-4">
          <M3SectionHeader title="Sistema" />
          <Tabs
            tabs={[
              { id: 'auditoria', label: 'Registo de auditoria' },
              { id: 'importacao', label: 'Base de dados' },
            ]}
            activeTabId={activeConfigTab}
            onChange={setActiveConfigTab}
          />
        </div>
      )}

      {/* SISTEMA TAB */}
      {activeConfigTab === 'sistema' && (
      <form onSubmit={handleSubmit} className="w-full">
        <Card className="bg-surface rounded-card border border-border overflow-hidden animate-fade-in" id="core-config-card">
          <div className="p-4 sm:p-5 border-b border-border bg-surface-muted/60">
            <M3SectionHeader
              title="Aplicação"
              description="Defina a identidade visual e os dados apresentados no portal."
              actions={canWriteConfig ? <M3Button type="submit" disabled={isSavingConfig}>{isSavingConfig ? 'A guardar...' : 'Guardar alterações'}</M3Button> : undefined}
            />
          </div>
          <div className="p-4 sm:p-5 space-y-6">
            <section aria-labelledby="portal-identity-heading" className="space-y-4">
              <div>
                <h3 id="portal-identity-heading" className="text-heading-sm text-text-primary">Identidade do portal</h3>
                <p className="mt-1 text-body-sm text-text-secondary">Informação visível no cabeçalho e no rodapé da aplicação.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Input label="Nome do portal" type="text" required value={appName} onChange={e => setAppName(e.target.value)} />
                <Input label="Descrição do portal" type="text" value={appDesc} onChange={e => setAppDesc(e.target.value)} />
                <div className="lg:col-span-2">
                  <Input label="Texto de rodapé" type="text" value={footer} onChange={e => setFooter(e.target.value)} />
                </div>
              </div>
            </section>

            <section aria-labelledby="portal-logo-heading" className="pt-6 border-t border-border-subtle space-y-4">
              <div>
                <h3 id="portal-logo-heading" className="text-heading-sm text-text-primary">Logótipo</h3>
                <p className="mt-1 text-body-sm text-text-secondary">Escolha o ficheiro ou o código SVG apresentado na aplicação.</p>
              </div>
              <Input
                label="Caminho da imagem do logótipo"
                type="text"
                value={logo}
                onChange={e => setLogo(e.target.value)}
                placeholder="https://exemplo.com/logo.svg, /logo.png, data:image/svg+xml;... ou <svg...>"
                className="font-mono text-body"
              />
              <p className="text-body-sm text-text-secondary">
                  Suporta URLs de imagens (SVG, PNG, JPG, WebP), ficheiros locais (/logo.svg), Data URIs (base64) e código SVG inline.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-surface-muted border border-border rounded-control">
                <span className="text-label font-semibold text-text-secondary shrink-0">Pré-visualização</span>
                <AppLogo logoUrl={logo} appName={appName} className="w-72 max-w-full h-10 rounded-control bg-surface border border-border shadow-2xs p-1" />
              </div>
            </section>

            <section aria-labelledby="portal-theme-heading" className="pt-6 border-t border-border-subtle space-y-4">
              <div>
                <h3 id="portal-theme-heading" className="text-heading-sm text-text-primary">Esquema de cores</h3>
                <p className="mt-1 text-body-sm text-text-secondary">A paleta é aplicada imediatamente à sessão atual.</p>
              </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'domino', name: 'Domino Institucional', desc: 'Paleta oficial Domino', hex: '#003b5c' },
                    { id: 'blue', name: 'Azul Clássico', desc: 'Padrão original azul', hex: '#2563eb' },
                    { id: 'emerald', name: 'Verde Esmeralda', desc: 'Moderno e sofisticado', hex: '#059669' },
                    { id: 'violet', name: 'Violeta Elegante', desc: 'Design criativo', hex: '#7c3aed' },
                    { id: 'amber', name: 'Âmbar Solar', desc: 'Quente e acolhedor', hex: '#d97706' },
                    { id: 'slate', name: 'Cinzento Minimal', desc: 'Industrial e limpo', hex: '#475569' },
                    { id: 'rose', name: 'Rosa Coral', desc: 'Vibrante e inovador', hex: '#e11d48' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('erp_theme', t.id);
                        }
                        if (typeof document !== 'undefined') {
                          document.documentElement.setAttribute('data-theme', t.id);
                          document.body?.setAttribute('data-theme', t.id);
                          const root = document.getElementById('main-root');
                          if (root) root.setAttribute('data-theme', t.id);
                        }
                        updateConfig({ theme: t.id });
                      }}
                      aria-pressed={theme === t.id || (theme === 'default' && t.id === 'domino')}
                      className={`flex items-center gap-3 p-3 rounded-control border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                        (theme === t.id || (theme === 'default' && t.id === 'domino'))
                          ? 'border-slate-800 bg-surface-muted/70 ring-2 ring-slate-100'
                          : 'border-border hover:border-slate-300 hover:bg-surface-muted/40'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs"
                        style={{ backgroundColor: t.hex }}
                      />
                      <div>
                        <div className="font-semibold text-text-primary text-body-sm leading-tight">{t.name}</div>
                        <div className="text-caption text-text-secondary font-medium mt-1">{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
            </section>
          </div>
        </Card>
      </form>
      )}

      <SpecialDaysSection active={activeConfigTab === 'dias'} specialDays={specialDays}
        addSpecialDay={addSpecialDay} updateSpecialDay={updateSpecialDay} deleteSpecialDay={deleteSpecialDay}
        canWriteConfig={canWriteConfig} askConfirmation={askConfirmation} />

      <DefaultTasksSection active={activeConfigTab === 'tarefas'} defaultTasks={defaultTasks} taskTypes={taskTypes}
        addDefaultTask={addDefaultTask} updateDefaultTask={updateDefaultTask} deleteDefaultTask={deleteDefaultTask}
        canWriteConfig={canWriteConfig} askConfirmation={askConfirmation} />

      <ReferenceDataSection active={activeConfigTab === 'campos'} canWriteConfig={canWriteConfig}
        state={state} projectCategories={projectCategories} projectStatuses={projectStatuses}
        taskStatuses={taskStatuses} taskTypes={taskTypes} projectRisks={projectRisks}
        projectPriorities={projectPriorities} projectTeams={projectTeams} projectPartners={projectPartners}
        addAuxRecord={addAuxRecord} updateAuxRecord={updateAuxRecord} deleteAuxRecord={deleteAuxRecord}
        reorderAuxRecords={reorderAuxRecords} askConfirmation={askConfirmation} />

      {/* NOTIFICAÇÕES E AUTOMAÇÕES */}
      {(activeConfigTab === 'notificacoes' || activeConfigTab === 'automacoes') && (
        <CommunicationSettingsSection
          activeConfigTab={activeConfigTab}
          notificationSettings={state.notificationSettings || []}
          updateNotificationSetting={updateNotificationSetting}
          automationRules={automationRules || state.automationRules || []}
          addAutomationRule={addAutomationRule}
          updateAutomationRule={updateAutomationRule}
          deleteAutomationRule={deleteAutomationRule}
          toggleAutomationRule={toggleAutomationRule}
          projectStatuses={state.projectStatuses || []}
          taskStatuses={state.taskStatuses || []}
          projects={state.projects || []}
          users={state.users || []}
          canWrite={canWriteConfig}
        />
      )}

      {activeConfigTab === 'importacao' && (
        <div className="space-y-6">
          {/* CSV Import Card */}
          <div className="bg-surface rounded-card border border-border p-6 text-xs font-bold text-text-secondary animate-fade-in" id="csv-import-card">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-control bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-text-primary">Importação de Projetos via CSV</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Cole o conteúdo CSV para criar múltiplos projetos de forma massiva.</p>
                </div>
              </div>
            </div>

            <p className="text-text-muted text-[11px] font-normal mb-4 leading-relaxed">
              Colunas obrigatórias: Nome de projeto, Cliente, Nº IP, Nº SF e Data início. O utilizador autenticado fica como Project Leader.
            </p>
            <div className="space-y-4">
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`Nome de projeto;Cliente;Nº IP;Nº SF;Data início\nProjeto A;Cliente X;IP-123;SF-456;2026-10-17`}
                rows={5}
                className="w-full p-3 border border-border rounded-control font-mono text-xs text-text-secondary focus:ring-2 focus:ring-blue-100 outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCsvImport}
                  disabled={importingCsv || !csvText.trim() || !hasPermission(currentUser, 'projects_write')}
                  className="px-5 py-2 bg-primary text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-xs"
                >
                  {importingCsv ? 'A importar...' : 'Importar Dados'}
                </button>
              </div>

              {csvResult && (
                <div className={`p-4 rounded-control border ${csvResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <h4 className="font-bold text-sm mb-2 text-text-primary">Resultado da Importação:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-text-secondary">
                    <li>Registos importados com sucesso: <span className="text-emerald-600 font-bold">{csvResult.success}</span></li>
                    {csvResult.failed > 0 && <li>Falhas: <span className="text-amber-600 font-bold">{csvResult.failed}</span></li>}
                  </ul>
                  {csvResult.errors.length > 0 && (
                    <div className="mt-3 p-3 bg-surface rounded-lg border border-amber-200 text-amber-700 h-32 overflow-y-auto">
                      {csvResult.errors.map((e, i) => (
                        <div key={i}>{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Estado da ligação à base de dados */}
          <div className="bg-surface rounded-card border border-border p-6 text-xs animate-fade-in" id="supabase-panel">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-subtle">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-extrabold text-text-primary">Ligação à base de dados</h3>
              </div>
              <button type="button" onClick={handleTestConnection} disabled={supabaseStatus === 'testing'}
                className="px-3 py-1.5 bg-surface-muted hover:bg-slate-200 border border-border text-text-secondary font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${supabaseStatus === 'testing' ? 'animate-spin' : ''}`} />
                Testar ligação
              </button>
            </div>
            <div role="status" className={`p-4 rounded-control border ${supabaseStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : supabaseStatus === 'failed' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-surface-muted border-border text-text-secondary'}`}>
              <div className="flex items-start gap-2.5">
                {supabaseStatus === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{supabaseStatus === 'testing' ? 'A testar a leitura da base de dados...' : supabaseMessage}</span>
              </div>
            </div>
          </div>

          {/* Auditoria de Consultas & Índices Card */}
          <div className="bg-surface rounded-card border border-border p-6 text-xs animate-fade-in" id="index-panel">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-control bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-text-primary">Auditoria de Consultas & Índices Supabase</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Índices B-Tree compostos e paginação no servidor para otimização de desempenho.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIndexSql(!showIndexSql)}
                className="px-3 py-1.5 bg-surface-muted hover:bg-slate-200 border border-border text-text-secondary font-bold rounded-lg transition-all flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-text-muted" />
                {showIndexSql ? 'Ocultar Script' : 'Ver Script de Índices'}
              </button>
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-surface-muted rounded-control border border-slate-150">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Índices de Projetos
              </div>
              <p className="text-[10px] text-text-muted mt-1 font-mono leading-tight">
                idx_projects_deleted_created_at, idx_projects_active_status
              </p>
            </div>

            <div className="p-3 bg-surface-muted rounded-control border border-slate-150">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Índices de Tarefas
              </div>
              <p className="text-[10px] text-text-muted mt-1 font-mono leading-tight">
                idx_tasks_project_deleted, idx_tasks_deleted_created_at
              </p>
            </div>

            <div className="p-3 bg-surface-muted rounded-control border border-slate-150">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Paginação e APIs
              </div>
              <p className="text-[10px] text-text-muted mt-1 font-mono leading-tight">
                /api/v1/projects & /api/v1/tasks (LIMIT/OFFSET ativo)
              </p>
            </div>
          </div>

          {showIndexSql && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted font-mono font-bold">SCRIPT SQL DE OTIMIZAÇÃO (supabase/optimize_indexes.sql)</span>
                <button
                  type="button"
                  onClick={copyIndexSqlToClipboard}
                  className="px-2.5 py-1 bg-surface border border-border hover:bg-surface-muted text-text-secondary font-bold rounded-lg text-[10px] flex items-center gap-1 transition-colors"
                >
                  <Copy className="w-3 h-3 text-text-muted" />
                  {indexSqlCopied ? 'Copiado para o clipboard!' : 'Copiar Script SQL'}
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-emerald-400 rounded-control font-mono text-[9px] overflow-x-auto max-h-[200px] leading-relaxed border border-slate-800">
                {SUPABASE_OPTIMIZE_INDEXES_SQL}
              </pre>
            </div>
          )}
        </div>
      </div>
      )}

      {/* AUDITORIA TAB */}
      {activeConfigTab === 'auditoria' && (
        auditStatus === 'loaded'
          ? <AuditLogSection auditLogs={state.auditLogs || []} currentUser={currentUser} />
          : <p role="status" className="text-body-sm text-text-secondary">{auditStatus === 'error' ? 'Não foi possível carregar a auditoria. Recarregue os dados para tentar novamente.' : 'A carregar auditoria…'}</p>
      )}

      {/* UTILIZADORES TAB */}
      <div hidden={activeConfigTab !== 'utilizadores'}><UserAdministrationSection
        config={config} state={state} currentUser={currentUser}
        addUser={addUser} updateUser={updateUser} deleteUser={deleteUser}
        onRefreshFromDatabase={onRefreshFromDatabase} updateConfig={updateConfig}
      /></div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
