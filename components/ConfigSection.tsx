'use client';

import React, { useState, useEffect } from 'react';
import { AppConfiguration, SpecialDay, DefaultTask, ERPState } from '../lib/types';
import { 
  Settings, RefreshCw, Key, Info, Calendar, Plus, Trash2, ListTodo, Edit2, Check, X,
  Database, UploadCloud, DownloadCloud, CheckCircle, AlertCircle, Terminal, Copy, ExternalLink, ShieldCheck,
  Users, GripVertical, Zap, Clock
} from 'lucide-react';
import AutomationEditor from './AutomationEditor';
import AuditLogSection from './AuditLogSection';
import AppLogo from './AppLogo';
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
import ConfirmModal from './ConfirmModal';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { 
  testSupabaseConnection, 
  saveSnapshotToSupabase, 
  listBackupsFromSupabase, 
  deleteBackupFromSupabase, 
  SUPABASE_SETUP_SQL, 
  SUPABASE_OPTIMIZE_INDEXES_SQL,
  checkAndCreateAutoDailyBackup,
  SupabaseBackup 
} from '../lib/supabaseSync';
// import Papa from 'papaparse';
import UserSection from './UserSection';

import { hasPermission } from '../lib/permissions';

interface ConfigSectionProps {
  activeConfigTab?: string;
  onChangeConfigTab?: (tab: string) => void;
  config: AppConfiguration;
  specialDays: SpecialDay[];
  updateConfig: (updates: Partial<AppConfiguration>) => void;
  onResetDemoData?: () => void;
  onClearDemoData?: () => void;
  addSpecialDay: (date: string, name: string) => void;
  deleteSpecialDay: (id: string) => void;
  defaultTasks?: DefaultTask[];
  addDefaultTask?: (title: string, description: string, estimatedHours: string, taskTypeId?: string) => void;
  updateDefaultTask?: (id: string, updates: Partial<DefaultTask>) => void;
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
  updateNotificationSetting?: (id: string, updates: any) => void;
  reorderAuxRecords?: (tableName: any, newItems: any[]) => void;
  state: ERPState;
  importState: (jsonStr: string) => boolean;
  addProject?: any;
  clients?: import('../lib/types').Client[];
  addClient?: any;
  addAbsence?: any;
  deleteAbsence?: any;
  addUser?: any;
  updateUser?: any;
  deleteUser?: any;
  currentUser?: any;
  userGroups?: any[];
  automationRules?: import('../lib/types').AutomationRule[];
  addAutomationRule?: any;
  updateAutomationRule?: any;
  deleteAutomationRule?: any;
  toggleAutomationRule?: any;
  runAutomationRule?: any;
  onRefreshFromDatabase?: () => Promise<boolean>;
}

export const PASTEL_COLORS = [
  { id: 'vermelho', name: 'Vermelho', hex: '#fca5a5', bgClass: 'bg-red-200', textClass: 'text-red-900', borderClass: 'border-red-300' },
  { id: 'amarelo', name: 'Amarelo', hex: '#fef08a', bgClass: 'bg-yellow-200', textClass: 'text-yellow-900', borderClass: 'border-yellow-300' },
  { id: 'verde', name: 'Verde', hex: '#bbf7d0', bgClass: 'bg-green-200', textClass: 'text-green-900', borderClass: 'border-green-300' },
  { id: 'azul', name: 'Azul', hex: '#bfdbfe', bgClass: 'bg-blue-200', textClass: 'text-blue-900', borderClass: 'border-blue-300' },
  { id: 'laranja', name: 'Laranja', hex: '#fed7aa', bgClass: 'bg-orange-200', textClass: 'text-orange-900', borderClass: 'border-orange-300' },
  { id: 'cinza', name: 'Cinza', hex: '#e2e8f0', bgClass: 'bg-slate-200', textClass: 'text-slate-800', borderClass: 'border-slate-300' },
];

export function getPastelColor(colorInput?: string) {
  if (!colorInput) return PASTEL_COLORS[3];
  const lower = colorInput.toLowerCase().trim();
  if (lower.includes('vermelho') || lower === '#fca5a5' || lower.includes('red') || lower.includes('danger')) return PASTEL_COLORS[0];
  if (lower.includes('amarelo') || lower === '#fef08a' || lower.includes('yellow') || lower.includes('warning')) return PASTEL_COLORS[1];
  if (lower.includes('verde') || lower === '#bbf7d0' || lower.includes('green') || lower.includes('success')) return PASTEL_COLORS[2];
  if (lower.includes('azul') || lower === '#bfdbfe' || lower.includes('blue') || lower.includes('info')) return PASTEL_COLORS[3];
  if (lower.includes('laranja') || lower === '#fed7aa' || lower.includes('orange')) return PASTEL_COLORS[4];
  if (lower.includes('cinza') || lower === '#e2e8f0' || lower.includes('gray') || lower.includes('slate') || lower.includes('secondary')) return PASTEL_COLORS[5];
  const exact = PASTEL_COLORS.find(c => c.hex.toLowerCase() === lower);
  return exact || PASTEL_COLORS[3];
}

interface SortableAuxRowProps {
  item: any;
  isEditingThis: boolean;
  activeAuxTab: string;
  isColorAuxTab: boolean;
  editAuxName: string;
  setEditAuxName: (val: string) => void;
  editAuxScale: number;
  setEditAuxScale: (val: number) => void;
  editAuxColor: string;
  setEditAuxColor: (val: string) => void;
  setEditingAuxId: (id: string | null) => void;
  handleSaveEditAuxRecord: (id: string) => void;
  handleDeleteAuxRecord: (id: string) => void;
}

function SortableAuxRow({
  item,
  isEditingThis,
  activeAuxTab,
  isColorAuxTab,
  editAuxName,
  setEditAuxName,
  editAuxScale,
  setEditAuxScale,
  editAuxColor,
  setEditAuxColor,
  setEditingAuxId,
  handleSaveEditAuxRecord,
  handleDeleteAuxRecord
}: SortableAuxRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <tr 
      ref={setNodeRef} 
      style={style} 
      className={`border-b border-slate-100 hover:bg-slate-50/50 text-xs transition-colors ${isDragging ? 'bg-slate-100' : ''}`}
    >
      <td className="p-3.5 w-10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="p-3.5">
        {isEditingThis ? (
          <input 
            type="text"
            value={editAuxName}
            onChange={e => setEditAuxName(e.target.value)}
            className="w-full p-1 px-2 border border-slate-200 rounded-md font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        ) : (
          <span className="text-slate-800 font-bold">{item.name}</span>
        )}
      </td>

      {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities') && (
        <td className="p-3.5">
          {isEditingThis ? (
            <input 
              type="number"
              min={activeAuxTab === 'projectStatuses' ? 0 : 1}
              max={activeAuxTab === 'projectStatuses' ? 5 : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes') ? 10 : 3}
              value={editAuxScale}
              onChange={e => setEditAuxScale(Number(e.target.value))}
              className="w-16 p-1 px-2 border border-slate-200 rounded-md font-semibold text-xs text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          ) : (
            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-bold text-slate-600 font-mono">
              Nível {item.scale ?? (activeAuxTab === 'projectStatuses' ? 0 : 1)}
            </span>
          )}
        </td>
      )}

      {isColorAuxTab && (
        <td className="p-3.5">
          {isEditingThis ? (
            <div className="flex items-center gap-1 flex-wrap">
              {PASTEL_COLORS.map(c => {
                const isSelected = editAuxColor === c.hex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEditAuxColor(c.hex)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 transition-all cursor-pointer ${
                      isSelected 
                        ? `${c.bgClass} ${c.textClass} ${c.borderClass} ring-2 ring-slate-400 shadow-2xs` 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                    title={c.name}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${c.bgClass} border ${c.borderClass} inline-block`} />
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            (() => {
              const c = getPastelColor(item.color);
              return (
                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 ${c.bgClass} ${c.textClass} ${c.borderClass}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${c.bgClass} border ${c.borderClass} inline-block`} />
                  <span>{c.name}</span>
                </span>
              );
            })()
          )}
        </td>
      )}

      <td className="p-3.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {isEditingThis ? (
            <>
              <button 
                type="button"
                onClick={() => setEditingAuxId(null)}
                className="p-1 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
              <button 
                type="button"
                onClick={() => handleSaveEditAuxRecord(item.id)}
                className="p-1 px-2 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Gravar
              </button>
            </>
          ) : (
            <>
              <button 
                type="button"
                onClick={() => {
                  setEditingAuxId(item.id);
                  setEditAuxName(item.name);
                  setEditAuxScale(item.scale || 1);
                  setEditAuxColor(item.color || '#bfdbfe');
                }}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex items-center justify-center"
                title="Editar"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button 
                type="button"
                onClick={() => handleDeleteAuxRecord(item.id)}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center justify-center"
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function ConfigSection({
  activeConfigTab: activeConfigTabProp = 'sistema',
  onChangeConfigTab,
  config,
  specialDays = [],
  updateConfig,
  onResetDemoData,
  onClearDemoData,
  addSpecialDay,
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
  importState,
  addProject,
  clients = [],
  addClient,
  addAbsence,
  deleteAbsence,
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
  runAutomationRule,
  onRefreshFromDatabase,
}: ConfigSectionProps) {
  const canReadConfig = hasPermission(currentUser, 'config_read', userGroups);
  const canWriteConfig = hasPermission(currentUser, 'config_write', userGroups);
  const [appName, setAppName] = useState(config.appName);
  const [appDesc, setAppDesc] = useState(config.appDescription);
  const [logo, setLogo] = useState(config.logoImagePath || config.logo || '');
  const [footer, setFooter] = useState(config.footerCopyrightText);
  const [theme, setTheme] = useState(config.theme || 'default');
  const [salesRepGroupIds, setSalesRepGroupIds] = useState<string[]>(config.salesRepGroupIds || (config.salesRepGroupId ? [config.salesRepGroupId] : []));
  const [projManagerGroupIds, setProjManagerGroupIds] = useState<string[]>(config.projManagerGroupIds || (config.projManagerGroupId ? [config.projManagerGroupId] : []));
  const [fieldManagerGroupIds, setFieldManagerGroupIds] = useState<string[]>(config.fieldManagerGroupIds || (config.fieldManagerGroupId ? [config.fieldManagerGroupId] : []));
  const [taskAssigneeGroupIds, setTaskAssigneeGroupIds] = useState<string[]>(config.taskAssigneeGroupIds || (config.taskAssigneeGroupId ? [config.taskAssigneeGroupId] : []));

  const configKey = JSON.stringify({
    appName: config.appName,
    appDescription: config.appDescription,
    logo: config.logoImagePath || config.logo || '',
    footer: config.footerCopyrightText,
    theme: config.theme || 'default',
    salesRepGroupIds: config.salesRepGroupIds || (config.salesRepGroupId ? [config.salesRepGroupId] : []),
    projManagerGroupIds: config.projManagerGroupIds || (config.projManagerGroupId ? [config.projManagerGroupId] : []),
    fieldManagerGroupIds: config.fieldManagerGroupIds || (config.fieldManagerGroupId ? [config.fieldManagerGroupId] : []),
    taskAssigneeGroupIds: config.taskAssigneeGroupIds || (config.taskAssigneeGroupId ? [config.taskAssigneeGroupId] : []),
  });

  const [prevConfigKey, setPrevConfigKey] = useState(configKey);
  if (prevConfigKey !== configKey) {
    setPrevConfigKey(configKey);
    setAppName(config.appName);
    setAppDesc(config.appDescription);
    setLogo(config.logoImagePath || config.logo || '');
    setFooter(config.footerCopyrightText);
    setTheme(config.theme || 'default');
    setSalesRepGroupIds(config.salesRepGroupIds || (config.salesRepGroupId ? [config.salesRepGroupId] : []));
    setProjManagerGroupIds(config.projManagerGroupIds || (config.projManagerGroupId ? [config.projManagerGroupId] : []));
    setFieldManagerGroupIds(config.fieldManagerGroupIds || (config.fieldManagerGroupId ? [config.fieldManagerGroupId] : []));
    setTaskAssigneeGroupIds(config.taskAssigneeGroupIds || (config.taskAssigneeGroupId ? [config.taskAssigneeGroupId] : []));
  }

  const activeConfigTab = activeConfigTabProp || 'sistema';
  const setActiveConfigTab = (tab: string) => {
    if (onChangeConfigTab) onChangeConfigTab(tab);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEndAux = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && reorderAuxRecords) {
      const oldIndex = activeAuxItems.findIndex((item: any) => item.id === active.id);
      const newIndex = activeAuxItems.findIndex((item: any) => item.id === over.id);

      const newOrderedItems = arrayMove(activeAuxItems, oldIndex, newIndex);
      reorderAuxRecords(activeAuxTab, newOrderedItems);
    }
  };

  // Supabase state management
  const [supabaseStatus, setSupabaseStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>(isSupabaseConfigured ? 'idle' : 'failed');
  const [supabaseMessage, setSupabaseMessage] = useState(isSupabaseConfigured ? 'Pronto para testar ligação.' : 'Supabase não está configurado. Configure as variáveis ambientais.');
  const [backups, setBackups] = useState<SupabaseBackup[]>([]);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [newBackupName, setNewBackupName] = useState('');
  const [sqlCopied, setSqlCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [showIndexSql, setShowIndexSql] = useState(false);
  const [indexSqlCopied, setIndexSqlCopied] = useState(false);

  const copyIndexSqlToClipboard = () => {
    navigator.clipboard.writeText(SUPABASE_OPTIMIZE_INDEXES_SQL);
    setIndexSqlCopied(true);
    setTimeout(() => setIndexSqlCopied(false), 2000);
  };

  const handleTestConnection = async () => {
    setSupabaseStatus('testing');
    setSupabaseMessage('A testar ligação com o Supabase...');
    const result = await testSupabaseConnection();
    if (result.success) {
      setSupabaseStatus('success');
      setSupabaseMessage(result.message);
      fetchBackups();
    } else {
      setSupabaseStatus('failed');
      setSupabaseMessage(result.message);
    }
  };

  const fetchBackups = async () => {
    if (!isSupabaseConfigured) return;
    setLoadingBackups(true);
    setBackupsError(null);
    const result = await listBackupsFromSupabase();
    if (result.success && result.data) {
      setBackups(result.data);
    } else {
      setBackupsError(result.message || 'Erro ao carregar backups do Supabase.');
    }
    setLoadingBackups(false);
  };

  // Auto-test connection on load if configured
  useEffect(() => {
    if (isSupabaseConfigured) {
      const timer = setTimeout(() => {
        handleTestConnection();
        fetchBackups();
      }, 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleSaveBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBackupName.trim()) return;
    setSavingBackup(true);
    const result = await saveSnapshotToSupabase(state, newBackupName.trim());
    if (result.success) {
      alert('Cópia de segurança criada com sucesso no Supabase!');
      setNewBackupName('');
      fetchBackups();
    } else {
      alert(result.message);
    }
    setSavingBackup(false);
  };

  const handleRestoreBackup = async (backup: SupabaseBackup) => {
    askConfirmation(
      'Restaurar Cópia de Segurança',
      `Aviso: Isto irá substituir todos os dados atuais do portal pelos dados da cópia "${backup.name}" criada em ${new Date(backup.created_at).toLocaleString('pt-PT')}. Deseja continuar?`,
      () => {
        const success = importState(JSON.stringify(backup.state));
        if (success) {
          alert('Cópia de segurança restaurada com sucesso!');
          window.location.reload();
        } else {
          alert('Erro ao restaurar a cópia de segurança. Formato de dados inválido.');
        }
      }
    );
  };

  const handleDeleteBackup = async (id: string) => {
    askConfirmation(
      'Eliminar Cópia de Segurança',
      'Tem a certeza que deseja eliminar esta cópia de segurança do Supabase permanentemente?',
      async () => {
        const result = await deleteBackupFromSupabase(id);
        if (result.success) {
          alert('Cópia de segurança eliminada com sucesso.');
          fetchBackups();
        } else {
          alert(result.message);
        }
      }
    );
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  };


  // Special Days form state
  const [sdDate, setSdDate] = useState('');
  const [sdName, setSdName] = useState('');
  const [sdPage, setSdPage] = useState(0);

  // Default Tasks form state
  const [dtTitle, setDtTitle] = useState('');
  const [dtDesc, setDtDesc] = useState('');
  const [dtHours, setDtHours] = useState('08:00');
  const [dtTypeId, setDtTypeId] = useState('');

  // Inline editing state for default tasks
  const [editingDtId, setEditingDtId] = useState<string | null>(null);
  const [editDtTitle, setEditDtTitle] = useState('');
  const [editDtDesc, setEditDtDesc] = useState('');
  const [editDtHours, setEditDtHours] = useState('');
  const [editDtTypeId, setEditDtTypeId] = useState('');

  // Aux tables state
  const [activeAuxTab, setActiveAuxTab] = useState<'projectCategories' | 'projectStatuses' | 'taskStatuses' | 'taskTypes' | 'ticketStatuses' | 'projectRisks' | 'projectPriorities' | 'projectTeams' | 'projectPartners' | 'riskCategories' | 'riskStatuses' | 'riskPriorities'>('projectCategories');
  const [newAuxName, setNewAuxName] = useState('');
  const [newAuxScale, setNewAuxScale] = useState(1);
  const [newAuxColor, setNewAuxColor] = useState('#bfdbfe');
  const [editingAuxId, setEditingAuxId] = useState<string | null>(null);
  const [editAuxName, setEditAuxName] = useState('');
  const [editAuxScale, setEditAuxScale] = useState(1);
  const [editAuxColor, setEditAuxColor] = useState('#bfdbfe');

  const isColorAuxTab = activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectRisks' || activeAuxTab === 'riskStatuses' || activeAuxTab === 'riskPriorities';

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

  const handleAddAuxRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!newAuxName.trim() || !addAuxRecord) return;
    
    const extra: any = {};
    if (activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') {
      extra.scale = Number(newAuxScale);
    }
    if (isColorAuxTab) {
      extra.color = newAuxColor;
    }
    
    addAuxRecord(activeAuxTab, newAuxName.trim(), extra);
    setNewAuxName('');
    setNewAuxScale(1);
    setNewAuxColor('#bfdbfe');
  };

  const handleSaveEditAuxRecord = (id: string) => {
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!editAuxName.trim() || !updateAuxRecord) return;
    
    const updates: any = { name: editAuxName.trim() };
    if (activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') {
      updates.scale = Number(editAuxScale);
    }
    if (isColorAuxTab) {
      updates.color = editAuxColor;
    }
    
    updateAuxRecord(activeAuxTab, id, updates);
    setEditingAuxId(null);
  };

  const handleDeleteAuxRecord = (id: string) => {
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!deleteAuxRecord) return;
    askConfirmation(
      'Confirmar Eliminação de Opção',
      'Tem a certeza que deseja eliminar esta opção? Todas as seleções associadas a esta opção ficarão vazias.',
      () => deleteAuxRecord(activeAuxTab, id)
    );
  };

  const getAuxItems = () => {
    switch (activeAuxTab) {
      case 'projectCategories': return projectCategories;
      case 'projectStatuses': return projectStatuses;
      case 'taskStatuses': return (taskStatuses && taskStatuses.length > 0) ? taskStatuses : (state.taskStatuses || []);
      case 'taskTypes': return (taskTypes && taskTypes.length > 0) ? taskTypes : (state.taskTypes || []);
      case 'ticketStatuses': return (state.ticketStatuses && state.ticketStatuses.length > 0) ? state.ticketStatuses : [];
      case 'projectRisks': return projectRisks;
      case 'projectPriorities': return projectPriorities;
      case 'projectTeams': return projectTeams;
      case 'projectPartners': return projectPartners;
      case 'riskCategories': return state.riskCategories;
      case 'riskStatuses': return state.riskStatuses;
      case 'riskPriorities': return state.riskPriorities;
      default: return [];
    }
  };

  const activeAuxItems = (() => {
    const raw = (getAuxItems() || []).filter((item: any) => !item.deleted);
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const item of raw) {
      const key = (item.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped.sort((a: any, b: any) => {
      if (a.sort_order !== undefined && b.sort_order !== undefined && a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      if (activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') {
        return (a.scale ?? 0) - (b.scale ?? 0);
      }
      return 0;
    });
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    updateConfig({
      appName,
      appDescription: appDesc,
      logoImagePath: logo,
      logo: logo,
      footerCopyrightText: footer,
      theme,
      salesRepGroupIds,
      projManagerGroupIds,
      fieldManagerGroupIds,
      taskAssigneeGroupIds,
      salesRepGroupId: salesRepGroupIds[0] || '',
      projManagerGroupId: projManagerGroupIds[0] || '',
      fieldManagerGroupId: fieldManagerGroupIds[0] || '',
      taskAssigneeGroupId: taskAssigneeGroupIds[0] || '',
    });
    alert('Configurações da aplicação gravadas com sucesso!');
  };

  const handleAddSpecialDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!sdDate || !sdName) return;

    const existingDay = specialDays?.find(sd => sd.date === sdDate);
    if (existingDay) {
      askConfirmation(
        'Data Já Existente',
        `Já existe um dia especial registado para esta data (${existingDay.name}). Tem a certeza que deseja inserir um novo registo na mesma data?`,
        () => {
          addSpecialDay(sdDate, sdName);
          setSdDate('');
          setSdName('');
        }
      );
      return;
    }

    addSpecialDay(sdDate, sdName);
    setSdDate('');
    setSdName('');
  };

  const handleAddDefaultTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!dtTitle.trim() || !addDefaultTask) return;
    addDefaultTask(dtTitle.trim(), dtDesc.trim(), dtHours, dtTypeId || undefined);
    setDtTitle('');
    setDtDesc('');
    setDtHours('08:00');
    setDtTypeId('');
  };

  const startEditingDefaultTask = (dt: DefaultTask) => {
    setEditingDtId(dt.id);
    setEditDtTitle(dt.title);
    setEditDtDesc(dt.description);
    setEditDtHours(dt.estimatedHours);
    setEditDtTypeId(dt.taskTypeId || '');
  };

  const handleSaveEditDefaultTask = (id: string) => {
    if (!editDtTitle.trim() || !updateDefaultTask) return;
    updateDefaultTask(id, {
      title: editDtTitle.trim(),
      description: editDtDesc.trim(),
      estimatedHours: editDtHours,
      taskTypeId: editDtTypeId || undefined
    });
    setEditingDtId(null);
  };

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setImportingCsv(true);
    setCsvResult(null);

    const PapaModule = await import('papaparse');
    const Papa = PapaModule.default || PapaModule;

    Papa.parse(csvText.trim(), {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        let failedCount = 0;
        let errors: string[] = [];

        for (let index = 0; index < results.data.length; index++) {
          const row: any = results.data[index];
          try {
            const getCol = (possibleNames: string[]) => {
              const key = Object.keys(row).find(k => 
                possibleNames.some(pn => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(pn))
              );
              return key ? row[key] : '';
            };

            const title = getCol(['titulo', 'projeto', 'title', 'nome']);
            const clientName = getCol(['cliente', 'entidade', 'client']);
            const budgetStr = getCol(['orcamento', 'budget', 'valor']);
            const startDate = getCol(['inicio', 'start']);
            const deliveryDate = getCol(['limite', 'entrega', 'delivery']);
            const installProjNo = getCol(['install', 'ip']);
            const sfOppNo = getCol(['oportunidade', 'sf', 'opp']);

            if (!title) {
              failedCount++;
              errors.push(`Linha ${index + 2}: Título do projeto é obrigatório.`);
              continue;
            }

            let clientId = '';
            if (clientName) {
              const existingClient = clients.find(c => c.clientName.toLowerCase() === clientName.toLowerCase() || c.shortName.toLowerCase() === clientName.toLowerCase());
              if (existingClient) {
                clientId = existingClient.id;
              } else if (addClient) {
                const newClient = await addClient({
                  clientName: clientName,
                  shortName: clientName.split(' ')[0] || clientName,
                  location: '',
                  notes: '',
                });
                if (newClient && newClient.id) {
                  clientId = newClient.id;
                }
              }
            } else {
               if (addClient) {
                 failedCount++;
                 errors.push(`Linha ${index + 2}: Cliente é obrigatório.`);
                 continue;
               }
            }

            const budget = parseFloat(budgetStr.replace(/[^0-9.-]+/g, '')) || 0;

            if (addProject) {
              await addProject({
                demo: false,
                title: title,
                clientId: clientId,
                description: 'Importado por CSV',
                categoryId: projectCategories[0]?.id || '',
                categoryIds: [projectCategories[0]?.id || ''],
                statusId: projectStatuses[0]?.id || '',
                projectManagerId: '',
                fieldManagerId: '',
                salesRepId: '',
                startDate: startDate || new Date().toISOString().split('T')[0],
                deliveryDate: deliveryDate || '',
                estimatedDate: '',
                scheduledDate: '',
                installProjectNo: installProjNo || '',
                sfOpportunityNo: sfOppNo || '',
                riskId: projectRisks[0]?.id || '',
                priorityId: projectPriorities[0]?.id || '',
                teamsInvolvedIds: [],
                partnersIds: [],
                documents: [],
                budgetValue: budget,
                deleted: false
              });
              successCount++;
            }
          } catch (e: any) {
            failedCount++;
            errors.push(`Linha ${index + 2}: Erro inesperado - ${e.message}`);
          }
        }

        setCsvResult({ success: successCount, failed: failedCount, errors });
        setImportingCsv(false);
        if (successCount > 0) {
           setCsvText('');
        }
      },
      error: (err: any) => {
        setCsvResult({ success: 0, failed: 1, errors: [err.message] });
        setImportingCsv(false);
      }
    });
  };

  return (
    <div className="space-y-6" id="config-section-root">
      
      {/* SISTEMA TAB */}
      {activeConfigTab === 'sistema' && (
      <form onSubmit={handleSubmit} className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Card 1: Configuração do Sistema */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm animate-fade-in text-xs font-bold text-slate-700" id="core-config-card">
            <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              Configurações da aplicação
            </h2>

            <div className="space-y-5">
              <div className="space-y-1">
                <label className="block text-slate-500">Nome do portal</label>
                <input 
                  type="text" 
                  required
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Descrição do portal</label>
                <input 
                  type="text" 
                  value={appDesc}
                  onChange={e => setAppDesc(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-600 font-bold">Caminho da imagem do logótipo</label>
                <input 
                  type="text" 
                  value={logo}
                  onChange={e => setLogo(e.target.value)}
                  placeholder="https://exemplo.com/logo.svg, /logo.png, data:image/svg+xml;... ou <svg...>"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <p className="text-[11px] text-slate-400 font-normal">
                  Suporta URLs de imagens (SVG, PNG, JPG, WebP), ficheiros locais (/logo.svg), Data URIs (base64) e código SVG inline.
                </p>

                {/* Live Preview */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-xl mt-2">
                  <span className="text-xs font-semibold text-slate-500 shrink-0">Pré-visualização:</span>
                  <AppLogo 
                    logoUrl={logo} 
                    appName={appName} 
                    className="w-72 max-w-full h-10 rounded-xl bg-white border border-slate-200 shadow-2xs p-1"
                  />

                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500">Texto de rodapé</label>
                <input 
                  type="text" 
                  value={footer}
                  onChange={e => setFooter(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-100 outline-none font-sans"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-slate-500">Esquema de cores</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'default', name: 'Azul Clássico', desc: 'Padrão original azul', hex: '#2563eb' },
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
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        theme === t.id
                          ? 'border-slate-800 bg-slate-50/70 -sm ring-2 ring-slate-100'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/40'
                      }`}
                    >
                      <span 
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs" 
                        style={{ backgroundColor: t.hex }}
                      />
                      <div>
                        <div className="font-bold text-slate-800 text-[11px] leading-tight font-sans">{t.name}</div>
                        <div className="text-[9px] text-slate-400 font-medium leading-none mt-0.5 font-sans">{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Escolha de Grupos / Gestores */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm animate-fade-in text-xs font-bold text-slate-700" id="managers-config-card">
            <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Associação de grupos
            </h2>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-slate-500">Grupos para &quot;Gestor de Vendas&quot; (Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                  {state.userGroups?.filter(g => !g.deleted).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhum grupo de utilizadores criado</span>
                  ) : (
                    state.userGroups?.filter(g => !g.deleted).map(g => {
                      const isChecked = salesRepGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-white border border-slate-100 rounded-lg cursor-pointer select-none hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSalesRepGroupIds(salesRepGroupIds.filter(id => id !== g.id));
                              } else {
                                setSalesRepGroupIds([...salesRepGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-slate-700 font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão ser atribuídos como &quot;Gestor de Vendas&quot; no formulário dos projetos.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-500">Grupos para &quot;Project Leader&quot; (Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                  {state.userGroups?.filter(g => !g.deleted).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhum grupo de utilizadores criado</span>
                  ) : (
                    state.userGroups?.filter(g => !g.deleted).map(g => {
                      const isChecked = projManagerGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-white border border-slate-100 rounded-lg cursor-pointer select-none hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setProjManagerGroupIds(projManagerGroupIds.filter(id => id !== g.id));
                              } else {
                                setProjManagerGroupIds([...projManagerGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-slate-700 font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão ser atribuídos como &quot;Project Lader&quot; no formulário dos projetos.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-500">Grupos para &quot;Técnico Responsável&quot; (Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                  {state.userGroups?.filter(g => !g.deleted).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhum grupo de utilizadores criado</span>
                  ) : (
                    state.userGroups?.filter(g => !g.deleted).map(g => {
                      const isChecked = fieldManagerGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-white border border-slate-100 rounded-lg cursor-pointer select-none hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setFieldManagerGroupIds(fieldManagerGroupIds.filter(id => id !== g.id));
                              } else {
                                setFieldManagerGroupIds([...fieldManagerGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-slate-700 font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão ser atribuídos como &quot;Técnico responsável&quot; no formulário dos projetos.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100" id="task-assignee-groups-config">
                <label className="block text-slate-700 font-bold">Grupos Associados Tarefas (Técnicos Alocados - Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                  {state.userGroups?.filter(g => !g.deleted).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhum grupo de utilizadores criado</span>
                  ) : (
                    state.userGroups?.filter(g => !g.deleted).map(g => {
                      const isChecked = taskAssigneeGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-white border border-slate-100 rounded-lg cursor-pointer select-none hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setTaskAssigneeGroupIds(taskAssigneeGroupIds.filter(id => id !== g.id));
                              } else {
                                setTaskAssigneeGroupIds([...taskAssigneeGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-slate-700 font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão aparecer na seleção de Técnicos Alocados na criação e edição de tarefas em toda a aplicação.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            type="submit"
            className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors -sm cursor-pointer font-sans text-xs"
          >
            Gravar Configurações
          </button>
        </div>
      </form>
      )}

      {/* DIAS ESPECIAIS TAB */}
      {activeConfigTab === 'dias' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm animate-fade-in text-xs font-bold text-slate-700" id="special-days-card">
          <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Dias especiais
          </h2>

          <form onSubmit={handleAddSpecialDay} className="flex flex-col sm:flex-row gap-3 items-end mb-6 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <div className="w-full sm:w-48 space-y-1">
              <label className="block text-[11px] text-slate-500">Dia</label>
              <input 
                type="date"
                required
                value={sdDate}
                onChange={e => setSdDate(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
              />
            </div>
            <div className="flex-1 w-full space-y-1">
              <label className="block text-[11px] text-slate-500">Nome</label>
              <input 
                type="text"
                required
                placeholder="Ex: Natal"
                value={sdName}
                onChange={e => setSdName(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-blue-100 outline-none bg-white"
              />
            </div>
            <button 
              type="submit"
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              title="Adicionar Dia Especial"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </form>

          {(() => {
            const sortedSd = [...specialDays].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const totalSdPages = Math.ceil(sortedSd.length / 12);
            const currentSdPage = Math.min(sdPage, Math.max(0, totalSdPages - 1));
            const visibleSd = sortedSd.slice(currentSdPage * 12, (currentSdPage + 1) * 12);

            return (
              specialDays.length === 0 ? (
                <div className="p-6 bg-slate-50 text-slate-400 text-center rounded-xl font-medium border border-slate-100">
                  Nenhum dia especial configurado.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {visibleSd.map(sd => (
                      <div key={sd.id} className="flex flex-col items-start justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl relative group -sm hover: transition-">
                        <div className="flex flex-col gap-2 w-full pr-6">
                          <span className="px-2 py-1 bg-white text-indigo-700 border border-indigo-100 rounded text-[10px] uppercase font-black tracking-wider self-start">
                            {new Date(sd.date + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-slate-700 font-bold text-[11px] truncate w-full" title={sd.name}>{sd.name}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            askConfirmation(
                              'Confirmar eliminação de dia especial',
                              'Tem a certeza que deseja eliminar este dia? Esta ação terá um efeito permanente.',
                              () => deleteSpecialDay(sd.id)
                            );
                          }}
                          className="absolute top-2 right-2 p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {totalSdPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <span className="text-slate-500 font-medium text-[10px]">
                        A mostrar {visibleSd.length} de {specialDays.length} registos (Página {currentSdPage + 1} de {totalSdPages})
                      </span>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setSdPage(p => Math.max(0, p - 1))} 
                          disabled={currentSdPage === 0} 
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded disabled:opacity-50 transition-colors"
                        >
                          Anterior
                        </button>
                        <button 
                          type="button"
                          onClick={() => setSdPage(p => Math.min(totalSdPages - 1, p + 1))} 
                          disabled={currentSdPage >= totalSdPages - 1} 
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded disabled:opacity-50 transition-colors"
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            );
          })()}
        </div>
      </div>
      )}

      {/* TAREFAS TAB */}
      {activeConfigTab === 'tarefas' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm animate-fade-in text-xs font-bold text-slate-700" id="default-tasks-card">
        <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-emerald-600" />
          Templates de tarefas
        </h2>
        <p className="text-slate-400 text-[11px] font-medium mb-5 leading-relaxed">
          Configure modelos de tarefas padronizadas (ex: Instalação mecânica, FAT, Automação). Ao criar ou editar um projeto, poderá selecionar e clonar estas tarefas de forma automática e instantânea.
        </p>

        <form onSubmit={handleAddDefaultTask} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100 mb-6">
          <div className="md:col-span-2 space-y-1">
            <label className="block text-[11px] text-slate-500">Título da tarefa *</label>
            <input 
              type="text"
              required
              placeholder="Ex: Eletrificação de sistema"
              value={dtTitle}
              onChange={e => setDtTitle(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-slate-500">Tipo de Tarefa</label>
            <select
              value={dtTypeId}
              onChange={e => setDtTypeId(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="">Por defeito</option>
              {taskTypes.filter((s: any) => !s.deleted).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} (Nível {s.scale ?? 1})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-slate-500">Duração prevista (HH:MM)</label>
            <input 
              type="text"
              required
              placeholder="02:00"
              value={dtHours}
              onChange={e => setDtHours(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <button 
            type="submit"
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Adicionar Modelo
          </button>
          
          <div className="md:col-span-5 space-y-1 mt-2">
            <label className="block text-[11px] text-slate-500">Descrição Técnica do Modelo</label>
            <textarea 
              placeholder="Descreva as instruções padrão que o técnico deverá cumprir..."
              value={dtDesc}
              onChange={e => setDtDesc(e.target.value)}
              rows={2}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white font-medium focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        </form>

        {defaultTasks.length === 0 ? (
          <div className="p-6 bg-slate-50 text-slate-400 text-center rounded-2xl font-medium border border-slate-100">
            Nenhuma tarefa por defeito configurada. Introduza uma no formulário acima.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {defaultTasks.map(dt => {
              const isEditingThis = editingDtId === dt.id;
              const typeName = dt.taskTypeId ? taskTypes.find((tt: any) => tt.id === dt.taskTypeId)?.name : null;
              return (
                <div key={dt.id} className="p-4 bg-white border border-slate-200/80 rounded-2xl -sm space-y-3 transition- hover:-md flex flex-col justify-between">
                  {isEditingThis ? (
                    // Inline Edit Mode
                    <div className="space-y-3 flex-1">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block font-bold">Título da Tarefa</label>
                        <input 
                          type="text"
                          value={editDtTitle}
                          onChange={e => setEditDtTitle(e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded-md font-semibold text-xs text-slate-800"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400 block font-bold">Tipo de Tarefa</label>
                          <select
                            value={editDtTypeId}
                            onChange={e => setEditDtTypeId(e.target.value)}
                            className="w-full p-1.5 border border-slate-200 rounded-md font-semibold text-xs text-slate-800 bg-white"
                          >
                            <option value="">Por defeito</option>
                            {taskTypes.filter((s: any) => !s.deleted).map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400 block font-bold">Horas Estimadas</label>
                          <input 
                            type="text"
                            value={editDtHours}
                            onChange={e => setEditDtHours(e.target.value)}
                            className="w-full p-1.5 border border-slate-200 rounded-md font-semibold text-xs text-slate-800"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block font-bold">Instruções Técnicas</label>
                        <textarea 
                          value={editDtDesc}
                          onChange={e => setEditDtDesc(e.target.value)}
                          rows={2}
                          className="w-full p-1.5 border border-slate-200 rounded-md text-xs text-slate-600 font-medium"
                        />
                      </div>
                    </div>
                  ) : (
                    // Standard View Mode
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-slate-800 tracking-tight leading-snug">{dt.title}</h4>
                          {typeName && (
                            <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded text-[9px] font-bold">
                              {typeName}
                            </span>
                          )}
                        </div>
                        <span className="flex-shrink-0 px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black font-mono">
                          {dt.estimatedHours}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        {dt.description || <span className="italic text-slate-400">Sem instruções de modelo fornecidas.</span>}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
                    {isEditingThis ? (
                      <>
                        <button 
                          onClick={() => setEditingDtId(null)}
                          className="p-1 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                        <button 
                          onClick={() => handleSaveEditDefaultTask(dt.id)}
                          className="p-1 px-2 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Gravar
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => startEditingDefaultTask(dt)}
                          className="p-1 px-2 text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Editar
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            if (deleteDefaultTask) {
                              askConfirmation(
                                'Confirmar eliminação de template de Tarefa',
                                'Tem a certeza que deseja eliminar esta tarefa modelo? Esta ação terá um efeito permanente.',
                                () => deleteDefaultTask(dt.id)
                              );
                            }
                          }}
                          className="p-1 px-2 text-[10px] font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Opções e Tabelas Auxiliares de Projeto (Full Width Card) */}
      {activeConfigTab === 'campos' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm animate-fade-in text-xs font-bold text-slate-700" id="aux-tables-card">
        <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          Opções e tabelas de apoio
        </h2>
        <p className="text-slate-400 text-[11px] font-medium mb-5 leading-relaxed">
          Personalize as opções disponíveis nos formulários e quadros (Categorias, Estados do Projeto, Tipos de Tarefa, Estados de Tarefa, Graus de Risco, Prioridades, Equipas e Parceiros).
        </p>

        {/* Tab Selector */}
        <div className="overflow-x-auto w-full border-b border-slate-200 pb-3 mb-5 scrollbar-thin">
          <div className="flex gap-1.5 min-w-max">
            {[
              { id: 'projectCategories', label: 'Categorias' },
              { id: 'projectStatuses', label: 'Estados do Projeto' },
              { id: 'taskTypes', label: 'Tipos de Tarefa' },
              { id: 'taskStatuses', label: 'Estados de Tarefa' },
              { id: 'ticketStatuses', label: 'Estados de Tickets' },
              { id: 'projectPriorities', label: 'Prioridades' },
              { id: 'projectTeams', label: 'Equipas Internas' },
              { id: 'projectPartners', label: 'Parceiros Externos' },
              { id: 'riskCategories', label: 'Categorias de Risco' },
              { id: 'riskStatuses', label: 'Estados de Risco' },
              { id: 'riskPriorities', label: 'Prioridades de Risco' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveAuxTab(tab.id as any);
                  setEditingAuxId(null);
                  setNewAuxName('');
                  setNewAuxScale(1);
                  setNewAuxColor('#bfdbfe');
                  setEditAuxColor('#bfdbfe');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                  activeAuxTab === tab.id
                    ? 'bg-blue-600 text-white -sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Addition form */}
        <form onSubmit={handleAddAuxRecord} className="flex flex-col gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className={`${(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') ? 'md:col-span-2' : 'md:col-span-3'} space-y-1`}>
              <label className="block text-[11px] text-slate-500 font-bold">Nome da Nova Opção *</label>
              <input 
                type="text" 
                required
                placeholder={`Introduza o nome...`}
                value={newAuxName}
                onChange={e => setNewAuxName(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') && (
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-500 font-bold">Escala / Nível ({activeAuxTab === 'projectStatuses' ? '0 a 5' : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses') ? '1 a 10' : '1 a 3'})</label>
                <input 
                  type="number"
                  min={activeAuxTab === 'projectStatuses' ? 0 : 1}
                  max={activeAuxTab === 'projectStatuses' ? 5 : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses') ? 10 : 3}
                  required
                  value={newAuxScale}
                  onChange={e => setNewAuxScale(Number(e.target.value))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Adicionar Opção
            </button>
          </div>

          {isColorAuxTab && (
            <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Cor Pastel Associada:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PASTEL_COLORS.map(c => {
                  const isSelected = newAuxColor === c.hex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewAuxColor(c.hex)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected 
                          ? `${c.bgClass} ${c.textClass} ${c.borderClass} ring-2 ring-slate-400 shadow-xs` 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${c.bgClass} border ${c.borderClass} inline-block`} />
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        {/* Option List Table / Row */}
        {activeAuxItems.length === 0 ? (
          <div className="p-4 bg-slate-50 text-slate-400 text-center rounded-xl font-medium border border-slate-100">
            Nenhuma opção configurada nesta tabela auxiliar.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden mb-6">
            <div className="overflow-x-auto w-full">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndAux}
              >
                <table className="w-full min-w-[520px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] uppercase text-slate-500 font-bold tracking-wider whitespace-nowrap">
                    <th className="p-3.5 w-10"></th>
                    <th className="p-3.5">Nome da Opção</th>
                    {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities') && (
                      <th className="p-3.5 w-32">Escala / Nível</th>
                    )}
                    {isColorAuxTab && (
                      <th className="p-3.5 w-48">Cor Pastel</th>
                    )}
                    <th className="p-3.5 w-36 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext 
                    items={activeAuxItems.map(i => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {activeAuxItems.map(item => (
                      <SortableAuxRow
                        key={item.id}
                        item={item}
                        isEditingThis={editingAuxId === item.id}
                        activeAuxTab={activeAuxTab}
                        isColorAuxTab={isColorAuxTab}
                        editAuxName={editAuxName}
                        setEditAuxName={setEditAuxName}
                        editAuxScale={editAuxScale}
                        setEditAuxScale={setEditAuxScale}
                        editAuxColor={editAuxColor}
                        setEditAuxColor={setEditAuxColor}
                        setEditingAuxId={setEditingAuxId}
                        handleSaveEditAuxRecord={handleSaveEditAuxRecord}
                        handleDeleteAuxRecord={handleDeleteAuxRecord}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
            </DndContext>
            </div>
          </div>
        )}
      </div>
      )}

      {/* IMPORTAÇÃO TAB */}
      {activeConfigTab === 'notificacoes' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1 uppercase tracking-tight">Notificações In-App</h3>
            <p className="text-xs text-slate-500 font-medium mb-4">Configure que notificações o sistema gera e quantos dias antes (quando aplicável).</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(state.notificationSettings || []).map(ns => (
                <div key={ns.id} className="bg-white p-4 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-sm text-slate-800">{ns.name}</h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={ns.enabled}
                        onChange={(e) => updateNotificationSetting && updateNotificationSetting(ns.id, { enabled: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {['task_due_date', 'project_due_date', 'project_scheduled_date'].includes(ns.type) && (
                      <div className="space-y-1 flex-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Dias de antecedência</label>
                        <input 
                          type="number"
                          min="0"
                          max="30"
                          value={ns.daysBefore}
                          disabled={!ns.enabled}
                          onChange={(e) => updateNotificationSetting && updateNotificationSetting(ns.id, { daysBefore: parseInt(e.target.value) || 0 })}
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                        />
                      </div>
                    )}
                    
                    <div className="space-y-1 flex-1">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Destinatários</label>
                      <select 
                        value={ns.targetGroup}
                        disabled={!ns.enabled}
                        onChange={(e) => updateNotificationSetting && updateNotificationSetting(ns.id, { targetGroup: e.target.value as any })}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 font-medium text-slate-700"
                      >
                        <option value="all">Todos os utilizadores</option>
                        <option value="allocated">Utilizadores alocados</option>
                        <option value="managers">Gestores</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-4 bg-slate-800 text-slate-300 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre">
              <div className="font-bold text-white mb-2 text-sm sans-serif">Em desenvolvimento:</div>
              {`Em desenvolvimento`}
            </div>
          </div>
        </div>
      )}

      {activeConfigTab === 'importacao' && (
        <div className="space-y-6">
          {/* CSV Import Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm text-xs font-bold text-slate-700 animate-fade-in" id="csv-import-card">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Importação de Projetos via CSV</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Cole o conteúdo CSV para criar múltiplos projetos de forma massiva.</p>
                </div>
              </div>
            </div>

            <p className="text-slate-500 text-[11px] font-normal mb-4 leading-relaxed">
              Certifique-se de que o CSV inclui colunas para: Título do Projeto, Cliente, Orçamento, Data de Início, Data Limite, Install Project e Oportunidade SF.
            </p>
            <div className="space-y-4">
              <textarea 
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`Exemplo:\nTítulo, Cliente, Orçamento, Data Início\nProjeto A, Cliente X, 50000, 2024-01-01`}
                rows={5}
                className="w-full p-3 border border-slate-200 rounded-xl font-mono text-xs text-slate-600 focus:ring-2 focus:ring-blue-100 outline-none"
              />
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCsvImport}
                  disabled={importingCsv || !csvText.trim()}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-xs"
                >
                  {importingCsv ? 'A importar...' : 'Importar Dados'}
                </button>
              </div>

              {csvResult && (
                <div className={`p-4 rounded-xl border ${csvResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <h4 className="font-bold text-sm mb-2 text-slate-800">Resultado da Importação:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    <li>Registos importados com sucesso: <span className="text-emerald-600 font-bold">{csvResult.success}</span></li>
                    {csvResult.failed > 0 && <li>Falhas: <span className="text-amber-600 font-bold">{csvResult.failed}</span></li>}
                  </ul>
                  {csvResult.errors.length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200 text-amber-700 h-32 overflow-y-auto">
                      {csvResult.errors.map((e, i) => (
                        <div key={i}>{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Automatic Daily Backup Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm text-xs font-bold text-slate-700 animate-fade-in" id="auto-backup-card">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Gravação Automática Diária</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Política de retenção: até 10 snapshots diários e 10 snapshots semanais.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.autoDailyBackupEnabled !== false}
                  onChange={e => updateConfig({ autoDailyBackupEnabled: e.target.checked })}
                />
                <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3 text-slate-600 font-medium leading-relaxed">
                <p className="text-xs">
                  Quando ativada, a aplicação efetua automaticamente um snapshot diário completo da base de dados no Supabase.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 shadow-2xs">
                    <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>10 Diários:</strong> Mantém sempre os últimos 10 snapshots diários.</span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-2.5 shadow-2xs">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span><strong>10 Semanais:</strong> Mantém 1 snapshot de cada semana das últimas 10 semanas.</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 space-y-1 pt-1">
                  <p>• O nome dos snapshots automáticos inclui a data e a hora de criação (ex: <code className="font-mono bg-slate-200/60 px-1.5 py-0.5 rounded text-slate-800">[Auto-Diário] 2026-09-12 12:30:00</code>).</p>
                  <p>• À medida que novos snapshots são gravados, os mais antigos que não se enquadrem na regra são eliminados automaticamente.</p>
                  <p>• Esta regra <strong>não influencia</strong> de todo os snapshots criados manualmente por si.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    setLoadingBackups(true);
                    const res = await checkAndCreateAutoDailyBackup(state);
                    alert(res.message);
                    fetchBackups();
                    setLoadingBackups(false);
                  }}
                  disabled={loadingBackups || !isSupabaseConfigured || config.autoDailyBackupEnabled === false}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all flex items-center gap-2 text-xs disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
                  Executar Cópia Automática Diária Agora
                </button>
                <span className="text-[11px] text-slate-400 font-semibold">
                  Estado: {config.autoDailyBackupEnabled !== false ? '✅ Gravação Automática Ativa' : '⏸️ Gravação Automática Pausada'}
                </span>
              </div>
            </div>
          </div>

          {/* Supabase Integration & Backups List Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm text-xs animate-fade-in" id="supabase-panel">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Integração Supabase Cloud & Restauro</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Grave snapshots manuais ou restaure cópias guardadas na nuvem.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSupabaseConfigured ? (
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold rounded-lg transition-all flex items-center gap-1.5 text-xs"
                    title="Testar ligação à base de dados"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${supabaseStatus === 'testing' ? 'animate-spin' : ''}`} />
                    Testar Ligação
                  </button>
                ) : (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 font-extrabold rounded-lg text-[10px] tracking-wide">
                    NÃO CONFIGURADO
                  </span>
                )}
              </div>
            </div>

        {/* Status Indicator Bar */}
        <div className={`p-4 rounded-xl mb-6 border ${
          supabaseStatus === 'success' 
            ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
            : supabaseStatus === 'testing'
            ? 'bg-blue-50/50 border-blue-100 text-blue-800'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-start gap-2.5">
            {supabaseStatus === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : supabaseStatus === 'testing' ? (
              <RefreshCw className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{supabaseMessage}</p>
              {supabaseStatus === 'success' && (
                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                  A sua aplicação está a usar ativamente o Supabase como base de dados principal. Todos os dados são guardados em tempo real na nuvem e o armazenamento local foi desativado.
                </p>
              )}
              {supabaseStatus === 'failed' && !isSupabaseConfigured && (
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                  Atenção: O sistema não está a gravar dados localmente. Sem o Supabase, perderá os dados ao atualizar a página. Siga as instruções abaixo para ligar a sua instância do Supabase ao portal.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Instructions block for non-configured states */}
        {!isSupabaseConfigured && (
          <div className="space-y-4 bg-slate-50/50 rounded-2xl border border-slate-200 p-4 mb-6">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Como configurar o Supabase:
            </h4>
            
            <ol className="list-decimal list-inside space-y-2.5 text-slate-600 font-semibold pl-1">
              <li>
                Crie um projeto gratuito no <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">Supabase.com <ExternalLink className="w-3 h-3" /></a>.
              </li>
              <li>
                Abra a barra lateral de <strong>Configurações do AI Studio</strong> (Menu Secrets / Chaves de API).
              </li>
              <li>
                Adicione as duas seguintes variáveis de ambiente secretas:
                <div className="mt-1.5 p-2.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-[10px] space-y-1 block select-all">
                  <div>NEXT_PUBLIC_SUPABASE_URL = <span className="text-slate-400">{'"o URL do seu projeto Supabase"'}</span></div>
                  <div>NEXT_PUBLIC_SUPABASE_ANON_KEY = <span className="text-slate-400">{'"a chave ANON_KEY do seu projeto"'}</span></div>
                </div>
              </li>
              <li>
                Execute o script de criação de tabela no editor SQL do Supabase. Clique no botão abaixo para copiar o script necessário:
              </li>
            </ol>

            <div className="pt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowSql(!showSql)}
                className="px-3.5 py-2 bg-slate-800 text-white hover:bg-slate-700 font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                {showSql ? 'Ocultar Script SQL' : 'Mostrar Script SQL de Instalação'}
              </button>
            </div>

            {showSql && (
              <div className="mt-3 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-bold font-mono">SCRIPT SQL RECOMENDADO</span>
                  <button
                    type="button"
                    onClick={copySqlToClipboard}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-100 rounded transition-all flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    {sqlCopied ? 'Copiado!' : 'Copiar Script'}
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] overflow-x-auto max-h-[250px] leading-relaxed border border-slate-800">
                  {SUPABASE_SETUP_SQL}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Backup operations for configured states */}
        {isSupabaseConfigured && (
          <div className="space-y-6">
            <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4">
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                Criar Nova Cópia de Segurança na Nuvem
              </h4>

              <form onSubmit={handleSaveBackup} className="flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1 w-full space-y-1">
                  <label className="block text-[10px] text-slate-500">Nome identificador da cópia</label>
                  <input
                    type="text"
                    required
                    disabled={savingBackup || supabaseStatus !== 'success'}
                    placeholder="Ex: Cópia Completa - Linha de Montagem 3"
                    value={newBackupName}
                    onChange={e => setNewBackupName(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-blue-100 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingBackup || supabaseStatus !== 'success' || !newBackupName.trim()}
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 -sm disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <UploadCloud className={`w-4 h-4 ${savingBackup ? 'animate-bounce' : ''}`} />
                  {savingBackup ? 'A Gravar...' : 'Gravar no Supabase'}
                </button>
              </form>
            </div>

            {/* Backups List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4 text-indigo-600" />
                  Cópias de Segurança Disponíveis no Supabase ({backups.length})
                </h4>
                <button
                  type="button"
                  onClick={fetchBackups}
                  disabled={loadingBackups || supabaseStatus !== 'success'}
                  className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md font-bold text-slate-600 transition-all flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />
                  Atualizar Lista
                </button>
              </div>

              {loadingBackups ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span className="font-bold text-slate-500">A carregar registos do Supabase...</span>
                </div>
              ) : backupsError ? (
                <div className="p-6 bg-red-50/50 border border-red-200 rounded-2xl text-red-800">
                  <div className="flex gap-2.5 items-start">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-xs">Erro ao ler registos do Supabase</p>
                      <p className="font-semibold text-[10px] text-red-600 font-mono mt-1 break-all bg-red-100/40 p-2 rounded border border-red-100">{backupsError}</p>
                      <p className="font-semibold text-[10px] text-slate-600 mt-2">
                        Isto geralmente ocorre se a conectividade com o Supabase estiver indisponível ou se as permissões estiverem incorretas.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-red-100 pt-3">
                    <button 
                      type="button"
                      onClick={() => setShowSql(!showSql)}
                      className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      {showSql ? 'Ocultar Script SQL de Configuração' : 'Ver Script SQL de Configuração'}
                    </button>

                    {showSql && (
                      <div className="mt-3 text-left space-y-2 max-w-xl">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-mono">SCRIPT SQL DO SUPABASE</span>
                          <button
                            type="button"
                            onClick={copySqlToClipboard}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded text-[9px]"
                          >
                            {sqlCopied ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                        <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl font-mono text-[9px] overflow-x-auto max-h-[150px] leading-relaxed border border-slate-850">
                          {SUPABASE_SETUP_SQL}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : backups.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 text-slate-400 font-bold border border-slate-150 rounded-2xl">
                  Nenhuma cópia de segurança encontrada. As cópias de segurança da base de dados são mantidas e geridas automaticamente pelo PostgreSQL.
                  <button 
                    type="button"
                    onClick={() => setShowSql(!showSql)}
                    className="block mx-auto mt-3 text-blue-600 hover:underline cursor-pointer"
                  >
                    {showSql ? 'Ocultar Script SQL' : 'Ver Script SQL de Configuração de Tabelas'}
                  </button>

                  {showSql && (
                    <div className="mt-4 text-left space-y-2 max-w-xl mx-auto">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-mono">SCRIPT SQL DO SUPABASE</span>
                        <button
                          type="button"
                          onClick={copySqlToClipboard}
                          className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded text-[9px]"
                        >
                          {sqlCopied ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl font-mono text-[9px] overflow-x-auto max-h-[150px] leading-relaxed">
                        {SUPABASE_SETUP_SQL}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-[520px] text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] uppercase text-slate-500 font-bold tracking-wider whitespace-nowrap">
                        <th className="p-3.5">Nome da Cópia</th>
                        <th className="p-3.5">Data de Gravação</th>
                        <th className="p-3.5 text-right">Ações de Restauro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {backups.map(backup => (
                        <tr key={backup.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3.5">
                            <span className="text-slate-800 font-bold font-mono">{backup.name}</span>
                          </td>
                          <td className="p-3.5 text-slate-500 font-medium font-mono">
                            {new Date(backup.created_at).toLocaleString('pt-PT')}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRestoreBackup(backup)}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-indigo-700 font-extrabold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                                title="Carregar esta cópia de segurança"
                              >
                                <DownloadCloud className="w-3.5 h-3.5" />
                                Restaurar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBackup(backup.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Eliminar cópia permanentemente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

          {/* Auditoria de Consultas & Índices Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm text-xs animate-fade-in" id="index-panel">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Auditoria de Consultas & Índices Supabase</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Índices B-Tree compostos e paginação no servidor para otimização de desempenho.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIndexSql(!showIndexSql)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold rounded-lg transition-all flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-slate-500" />
                {showIndexSql ? 'Ocultar Script' : 'Ver Script de Índices'}
              </button>
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Índices de Projetos
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono leading-tight">
                idx_projects_deleted_created_at, idx_projects_active_status
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Índices de Tarefas
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono leading-tight">
                idx_tasks_project_deleted, idx_tasks_deleted_created_at
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Paginação e APIs
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono leading-tight">
                /api/v1/projects & /api/v1/tasks (LIMIT/OFFSET ativo)
              </p>
            </div>
          </div>

          {showIndexSql && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono font-bold">SCRIPT SQL DE OTIMIZAÇÃO (supabase/optimize_indexes.sql)</span>
                <button
                  type="button"
                  onClick={copyIndexSqlToClipboard}
                  className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-[10px] flex items-center gap-1 transition-colors"
                >
                  <Copy className="w-3 h-3 text-slate-500" />
                  {indexSqlCopied ? 'Copiado para o clipboard!' : 'Copiar Script SQL'}
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-emerald-400 rounded-xl font-mono text-[9px] overflow-x-auto max-h-[200px] leading-relaxed border border-slate-800">
                {SUPABASE_OPTIMIZE_INDEXES_SQL}
              </pre>
            </div>
          )}
        </div>
      </div>
      </div>
      )}

      {/* AUTOMAÇÕES TAB */}
      {activeConfigTab === 'automacoes' && (
        <AutomationEditor
          automationRules={automationRules || state.automationRules || []}
          addAutomationRule={addAutomationRule}
          updateAutomationRule={updateAutomationRule}
          deleteAutomationRule={deleteAutomationRule}
          toggleAutomationRule={toggleAutomationRule}
          runAutomationRule={runAutomationRule}
          projectStatuses={state.projectStatuses || []}
          taskStatuses={state.taskStatuses || []}
          projects={state.projects || []}
          users={state.users || []}
          canWrite={canWriteConfig}
        />
      )}

      {/* AUDITORIA TAB */}
      {activeConfigTab === 'auditoria' && (
        <AuditLogSection auditLogs={state.auditLogs || []} currentUser={currentUser} />
      )}

      {/* UTILIZADORES TAB */}
      {activeConfigTab === 'utilizadores' && (
        <div className="bg-white rounded-2xl border border-slate-200 -sm animate-fade-in text-xs" id="users-tab">
          {state.users && state.userGroups && (
            <UserSection 
              absences={state.userAbsences || []}
              users={state.users}
              userGroups={state.userGroups}
              addAbsence={addAbsence!}
              deleteAbsence={deleteAbsence!}
              addUser={addUser!}
              updateUser={updateUser!}
              deleteUser={deleteUser!}
              hideAbsences={true}
              specialDays={state.specialDays || []}
              updateAuxRecord={updateAuxRecord}
              currentUser={currentUser}
            />
          )}
        </div>
      )}

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
