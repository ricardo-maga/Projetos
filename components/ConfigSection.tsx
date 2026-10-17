'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AppConfiguration, SpecialDay, DefaultTask, ERPState } from '../lib/types';
import { 
  Settings, RefreshCw, Key, Info, Calendar, Plus, Trash2, ListTodo, Edit2, Check, X,
  Database, UploadCloud, CheckCircle, AlertCircle, Terminal, Copy, ShieldCheck,
  Users, GripVertical, Zap, Bell
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
import { 
  testSupabaseConnection, 
  SUPABASE_OPTIMIZE_INDEXES_SQL,
} from '../lib/supabaseSync';
// import Papa from 'papaparse';
import UserSection from './UserSection';
import RolePermissionSection from './RolePermissionSection';
import { useAsyncAction } from '../hooks/useAsyncAction';
import Tabs from './ui/Tabs';
import Card from './ui/Card';
import Input from './ui/Input';
import Select from './ui/Select';
import Switch from './ui/Switch';
import { M3SectionHeader, M3Button } from './M3';

import { hasPermission } from '../lib/permissions';
import { configuredRoleIds } from '../lib/roleAssociations';

interface ConfigSectionProps {
  activeConfigTab?: string;
  onChangeConfigTab?: (tab: string) => void;
  config: AppConfiguration;
  specialDays: SpecialDay[];
  updateConfig: (updates: Partial<AppConfiguration>) => Promise<{ success: boolean; message?: string }>;
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
  updateNotificationSetting?: (id: string, updates: Partial<import('../lib/types').NotificationSetting>) => Promise<{ success: boolean; message?: string }>;
  reorderAuxRecords?: (tableName: any, newItems: any[]) => void;
  state: ERPState;
  databaseStatus: 'idle' | 'syncing' | 'synced' | 'error';
  databaseError?: string | null;
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
  onRefreshFromDatabase?: () => Promise<boolean>;
}

export const PASTEL_COLORS = [
  { id: 'vermelho', name: 'Vermelho', hex: '#fca5a5', bgClass: 'bg-red-200', textClass: 'text-red-900', borderClass: 'border-red-300' },
  { id: 'amarelo', name: 'Amarelo', hex: '#fef08a', bgClass: 'bg-yellow-200', textClass: 'text-yellow-900', borderClass: 'border-yellow-300' },
  { id: 'verde', name: 'Verde', hex: '#bbf7d0', bgClass: 'bg-green-200', textClass: 'text-green-900', borderClass: 'border-green-300' },
  { id: 'azul', name: 'Azul', hex: '#38bdf8', bgClass: 'bg-sky-200', textClass: 'text-sky-900', borderClass: 'border-sky-300' },
  { id: 'laranja', name: 'Laranja', hex: '#fed7aa', bgClass: 'bg-orange-200', textClass: 'text-orange-900', borderClass: 'border-orange-300' },
  { id: 'cinza', name: 'Cinza', hex: '#e2e8f0', bgClass: 'bg-slate-200', textClass: 'text-text-primary', borderClass: 'border-slate-300' },
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
      className={`border-b border-border-subtle hover:bg-surface-muted/50 text-xs transition-colors ${isDragging ? 'bg-surface-muted' : ''}`}
    >
      <td className="p-3.5 w-10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-slate-400 hover:text-text-secondary cursor-grab active:cursor-grabbing"
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
            className="w-full p-1 px-2 border border-border rounded-md font-semibold text-xs text-text-primary focus:ring-2 focus:ring-blue-100 outline-none"
          />
        ) : (
          <span className="text-text-primary font-bold">{item.name}</span>
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
              className="w-16 p-1 px-2 border border-border rounded-md font-semibold text-xs text-text-primary focus:ring-2 focus:ring-blue-100 outline-none"
            />
          ) : (
            <span className="px-2 py-0.5 bg-surface-muted border border-border rounded text-[10px] font-bold text-text-secondary font-mono">
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
                        : 'bg-surface text-text-secondary border-border hover:bg-surface-muted'
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
                className="p-1 px-2 text-[10px] font-bold text-text-muted hover:bg-surface-muted rounded-md transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
              <button 
                type="button"
                onClick={() => handleSaveEditAuxRecord(item.id)}
                className="p-1 px-2 text-[10px] font-bold text-white bg-primary hover:bg-blue-700 rounded-md transition-colors flex items-center gap-1"
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
                className="p-1 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-md transition-colors flex items-center justify-center"
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
  databaseStatus,
  databaseError,
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
  onRefreshFromDatabase,
}: ConfigSectionProps) {
  const canReadConfig = hasPermission(currentUser, 'config_read', userGroups);
  const canWriteConfig = hasPermission(currentUser, 'config_write', userGroups);
  const [appName, setAppName] = useState(config.appName);
  const [appDesc, setAppDesc] = useState(config.appDescription);
  const [logo, setLogo] = useState(config.logoImagePath || config.logo || '');
  const [footer, setFooter] = useState(config.footerCopyrightText);
  const [theme, setTheme] = useState(config.theme || 'default');
  const [salesRepGroupIds, setSalesRepGroupIds] = useState<string[]>(configuredRoleIds(config.salesRepGroupIds, config.salesRepGroupId));
  const [projManagerGroupIds, setProjManagerGroupIds] = useState<string[]>(configuredRoleIds(config.projManagerGroupIds, config.projManagerGroupId));
  const [fieldManagerGroupIds, setFieldManagerGroupIds] = useState<string[]>(configuredRoleIds(config.fieldManagerGroupIds, config.fieldManagerGroupId));
  const [taskAssigneeGroupIds, setTaskAssigneeGroupIds] = useState<string[]>(configuredRoleIds(config.taskAssigneeGroupIds, config.taskAssigneeGroupId));

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
    setSalesRepGroupIds(configuredRoleIds(config.salesRepGroupIds, config.salesRepGroupId));
    setProjManagerGroupIds(configuredRoleIds(config.projManagerGroupIds, config.projManagerGroupId));
    setFieldManagerGroupIds(configuredRoleIds(config.fieldManagerGroupIds, config.fieldManagerGroupId));
    setTaskAssigneeGroupIds(configuredRoleIds(config.taskAssigneeGroupIds, config.taskAssigneeGroupId));
  }

  const activeConfigTab = activeConfigTabProp || 'sistema';
  const [usersConfigTab, setUsersConfigTab] = useState<'users' | 'roles' | 'associacoes'>('users');
  const [notificationTab, setNotificationTab] = useState<'notificacoes' | 'automacoes'>(activeConfigTab === 'automacoes' ? 'automacoes' : 'notificacoes');
  const [savingNotificationId, setSavingNotificationId] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const saveNotificationSetting = async (id: string, updates: Partial<import('../lib/types').NotificationSetting>) => {
    if (!updateNotificationSetting || savingNotificationId) return;
    setSavingNotificationId(id);
    setNotificationError(null);
    try {
      const result = await updateNotificationSetting(id, updates);
      if (!result.success) setNotificationError(result.message || 'Não foi possível guardar a definição.');
    } catch {
      setNotificationError('Não foi possível guardar a definição.');
    } finally {
      setSavingNotificationId(null);
    }
  };
  useEffect(() => {
    if (activeConfigTab === 'automacoes') setNotificationTab('automacoes');
  }, [activeConfigTab]);
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

  const handleSaveAssociations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig || !state.activeRoles) return;
    await runConfigAction(async () => {
      const activeIds = new Set(state.activeRoles!.map(role => role.id));
      const salesIds = salesRepGroupIds.filter(id => activeIds.has(id));
      const projectIds = projManagerGroupIds.filter(id => activeIds.has(id));
      const fieldIds = fieldManagerGroupIds.filter(id => activeIds.has(id));
      const taskIds = taskAssigneeGroupIds.filter(id => activeIds.has(id));
      const result = await updateConfig({
        salesRepGroupIds: salesIds,
        projManagerGroupIds: projectIds,
        fieldManagerGroupIds: fieldIds,
        taskAssigneeGroupIds: taskIds,
        salesRepGroupId: salesIds[0] || '',
        projManagerGroupId: projectIds[0] || '',
        fieldManagerGroupId: fieldIds[0] || '',
        taskAssigneeGroupId: taskIds[0] || '',
      });
      if (result.success) alert('Associação de grupos gravada com sucesso!');
      else alert(result.message || 'Não foi possível gravar a associação de grupos.');
    });
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
    try {
      if (!addProject || !currentUser?.id || !hasPermission(currentUser, 'projects_write', userGroups)) {
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
            if (!addClient || !hasPermission(currentUser, 'clients_write', userGroups)) throw new Error(`Cliente "${clientName}" inexistente e sem permissão para o criar.`);
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
      
      {/* SISTEMA TAB */}
      {activeConfigTab === 'sistema' && (
      <form onSubmit={handleSubmit} className="w-full">
        <div className="grid grid-cols-1 gap-6 items-start">
          {/* Card 1: Configuração do Sistema */}
          <div className="bg-surface rounded-card border border-border p-6 animate-fade-in text-xs font-bold text-text-secondary" id="core-config-card">
            <h2 className="text-base font-bold text-text-primary mb-5 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Configurações da aplicação
            </h2>

            <div className="space-y-5">
              <div className="space-y-1">
                <label className="block text-text-muted">Nome do portal</label>
                <input 
                  type="text" 
                  required
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control font-bold text-text-primary focus:ring-2 focus:ring-blue-100 outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-text-muted">Descrição do portal</label>
                <input 
                  type="text" 
                  value={appDesc}
                  onChange={e => setAppDesc(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control font-medium text-text-secondary focus:ring-2 focus:ring-blue-100 outline-none font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-text-secondary font-bold">Caminho da imagem do logótipo</label>
                <input 
                  type="text" 
                  value={logo}
                  onChange={e => setLogo(e.target.value)}
                  placeholder="https://exemplo.com/logo.svg, /logo.png, data:image/svg+xml;... ou <svg...>"
                  className="w-full p-2.5 border border-border rounded-control font-mono text-xs focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <p className="text-[11px] text-slate-400 font-normal">
                  Suporta URLs de imagens (SVG, PNG, JPG, WebP), ficheiros locais (/logo.svg), Data URIs (base64) e código SVG inline.
                </p>

                {/* Live Preview */}
                <div className="flex items-center gap-3 p-3 bg-surface-muted border border-border/80 rounded-control mt-2">
                  <span className="text-xs font-semibold text-text-muted shrink-0">Pré-visualização:</span>
                  <AppLogo 
                    logoUrl={logo} 
                    appName={appName} 
                    className="w-72 max-w-full h-10 rounded-control bg-surface border border-border shadow-2xs p-1"
                  />

                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-text-muted">Texto de rodapé</label>
                <input 
                  type="text" 
                  value={footer}
                  onChange={e => setFooter(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-control font-medium focus:ring-2 focus:ring-blue-100 outline-none font-sans"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-text-muted">Esquema de cores</label>
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
                      className={`flex items-center gap-3 p-3 rounded-control border text-left transition-all cursor-pointer ${
                        theme === t.id
                          ? 'border-slate-800 bg-surface-muted/70 ring-2 ring-slate-100'
                          : 'border-border hover:border-slate-300 hover:bg-surface-muted/40'
                      }`}
                    >
                      <span 
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs" 
                        style={{ backgroundColor: t.hex }}
                      />
                      <div>
                        <div className="font-bold text-text-primary text-[11px] leading-tight font-sans">{t.name}</div>
                        <div className="text-[9px] text-slate-400 font-medium leading-none mt-0.5 font-sans">{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 flex justify-end">
          <M3Button type="submit" disabled={!canWriteConfig || isSavingConfig}>{isSavingConfig ? 'A guardar...' : 'Gravar configurações'}</M3Button>
        </div>
      </form>
      )}

      {/* DIAS ESPECIAIS TAB */}
      {activeConfigTab === 'dias' && (
        <div className="space-y-6">
          <div className="bg-surface rounded-card border border-border p-6 animate-fade-in text-xs font-bold text-text-secondary" id="special-days-card">
          <h2 className="text-base font-bold text-text-primary mb-5 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Dias especiais
          </h2>

          <form onSubmit={handleAddSpecialDay} className="flex flex-col sm:flex-row gap-3 items-end mb-6 bg-surface-muted/50 p-4 rounded-control border border-border-subtle">
            <div className="w-full sm:w-48 space-y-1">
              <label className="block text-[11px] text-text-muted">Dia</label>
              <input 
                type="date"
                required
                value={sdDate}
                onChange={e => setSdDate(e.target.value)}
                className="w-full p-2 border border-border rounded-lg text-text-primary focus:ring-2 focus:ring-blue-100 outline-none bg-surface"
              />
            </div>
            <div className="flex-1 w-full space-y-1">
              <label className="block text-[11px] text-text-muted">Nome</label>
              <input 
                type="text"
                required
                placeholder="Ex: Natal"
                value={sdName}
                onChange={e => setSdName(e.target.value)}
                className="w-full p-2 border border-border rounded-lg text-text-primary font-medium focus:ring-2 focus:ring-blue-100 outline-none bg-surface"
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
                <div className="p-6 bg-surface-muted text-slate-400 text-center rounded-control font-medium border border-border-subtle">
                  Nenhum dia especial configurado.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {visibleSd.map(sd => (
                      <div key={sd.id} className="flex flex-col items-start justify-between p-3 bg-surface-muted border border-border-subtle rounded-control relative group transition-colors">
                        <div className="flex flex-col gap-2 w-full pr-6">
                          <span className="px-2 py-1 bg-surface text-indigo-700 border border-indigo-100 rounded text-[10px] uppercase font-black tracking-wider self-start">
                            {new Date(sd.date + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-text-secondary font-bold text-[11px] truncate w-full" title={sd.name}>{sd.name}</span>
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
                    <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                      <span className="text-text-muted font-medium text-[10px]">
                        A mostrar {visibleSd.length} de {specialDays.length} registos (Página {currentSdPage + 1} de {totalSdPages})
                      </span>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setSdPage(p => Math.max(0, p - 1))} 
                          disabled={currentSdPage === 0} 
                          className="px-3 py-1.5 bg-surface-muted text-text-secondary hover:bg-slate-200 rounded disabled:opacity-50 transition-colors"
                        >
                          Anterior
                        </button>
                        <button 
                          type="button"
                          onClick={() => setSdPage(p => Math.min(totalSdPages - 1, p + 1))} 
                          disabled={currentSdPage >= totalSdPages - 1} 
                          className="px-3 py-1.5 bg-surface-muted text-text-secondary hover:bg-slate-200 rounded disabled:opacity-50 transition-colors"
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
      <div className="bg-surface rounded-card border border-border p-6 animate-fade-in text-xs font-bold text-text-secondary" id="default-tasks-card">
        <h2 className="text-base font-bold text-text-primary mb-2 flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-emerald-600" />
          Templates de tarefas
        </h2>
        <p className="text-slate-400 text-[11px] font-medium mb-5 leading-relaxed">
          Configure modelos de tarefas padronizadas (ex: Instalação mecânica, FAT, Automação). Ao criar ou editar um projeto, poderá selecionar e clonar estas tarefas de forma automática e instantânea.
        </p>

        <form onSubmit={handleAddDefaultTask} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-surface-muted/50 p-4 rounded-card border border-border-subtle mb-6">
          <div className="md:col-span-2 space-y-1">
            <label className="block text-[11px] text-text-muted">Título da tarefa *</label>
            <input 
              type="text"
              required
              placeholder="Ex: Eletrificação de sistema"
              value={dtTitle}
              onChange={e => setDtTitle(e.target.value)}
              className="w-full p-2 border border-border rounded-lg text-text-primary bg-surface font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-text-muted">Tipo de Tarefa</label>
            <select
              value={dtTypeId}
              onChange={e => setDtTypeId(e.target.value)}
              className="w-full p-2 border border-border rounded-lg text-text-primary bg-surface font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="">Por defeito</option>
              {taskTypes.filter((s: any) => !s.deleted).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} (Nível {s.scale ?? 1})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-text-muted">Duração prevista (HH:MM)</label>
            <input 
              type="text"
              required
              placeholder="02:00"
              value={dtHours}
              onChange={e => setDtHours(e.target.value)}
              className="w-full p-2 border border-border rounded-lg text-text-primary bg-surface font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
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
            <label className="block text-[11px] text-text-muted">Descrição Técnica do Modelo</label>
            <textarea 
              placeholder="Descreva as instruções padrão que o técnico deverá cumprir..."
              value={dtDesc}
              onChange={e => setDtDesc(e.target.value)}
              rows={2}
              className="w-full p-2 border border-border rounded-lg text-text-primary bg-surface font-medium focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        </form>

        {defaultTasks.length === 0 ? (
          <div className="p-6 bg-surface-muted text-slate-400 text-center rounded-card font-medium border border-border-subtle">
            Nenhuma tarefa por defeito configurada. Introduza uma no formulário acima.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {defaultTasks.map(dt => {
              const isEditingThis = editingDtId === dt.id;
              const typeName = dt.taskTypeId ? taskTypes.find((tt: any) => tt.id === dt.taskTypeId)?.name : null;
              return (
                <div key={dt.id} className="p-4 bg-surface border border-border/80 rounded-card space-y-3 transition-colors hover:border-primary/30 flex flex-col justify-between">
                  {isEditingThis ? (
                    // Inline Edit Mode
                    <div className="space-y-3 flex-1">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block font-bold">Título da Tarefa</label>
                        <input 
                          type="text"
                          value={editDtTitle}
                          onChange={e => setEditDtTitle(e.target.value)}
                          className="w-full p-1.5 border border-border rounded-md font-semibold text-xs text-text-primary"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400 block font-bold">Tipo de Tarefa</label>
                          <select
                            value={editDtTypeId}
                            onChange={e => setEditDtTypeId(e.target.value)}
                            className="w-full p-1.5 border border-border rounded-md font-semibold text-xs text-text-primary bg-surface"
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
                            className="w-full p-1.5 border border-border rounded-md font-semibold text-xs text-text-primary"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 block font-bold">Instruções Técnicas</label>
                        <textarea 
                          value={editDtDesc}
                          onChange={e => setEditDtDesc(e.target.value)}
                          rows={2}
                          className="w-full p-1.5 border border-border rounded-md text-xs text-text-secondary font-medium"
                        />
                      </div>
                    </div>
                  ) : (
                    // Standard View Mode
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-text-primary tracking-tight leading-snug">{dt.title}</h4>
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
                      <p className="text-[11px] text-text-muted font-medium leading-relaxed">
                        {dt.description || <span className="italic text-slate-400">Sem instruções de modelo fornecidas.</span>}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle mt-2">
                    {isEditingThis ? (
                      <>
                        <button 
                          onClick={() => setEditingDtId(null)}
                          className="p-1 px-2 text-[10px] font-bold text-text-muted hover:bg-surface-muted rounded-md transition-colors flex items-center gap-1"
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
                          className="p-1 px-2 text-[10px] font-bold text-text-muted hover:text-primary hover:bg-blue-50 rounded-md transition-colors flex items-center gap-1"
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
                          className="p-1 px-2 text-[10px] font-bold text-text-muted hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center gap-1"
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
      <div className="bg-surface rounded-card border border-border p-6 animate-fade-in text-xs font-bold text-text-secondary" id="aux-tables-card">
        <h2 className="text-base font-bold text-text-primary mb-2 flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Opções e tabelas de apoio
        </h2>
        <p className="text-slate-400 text-[11px] font-medium mb-5 leading-relaxed">
          Personalize as opções disponíveis nos formulários e quadros (Categorias, Estados do Projeto, Tipos de Tarefa, Estados de Tarefa, Graus de Risco, Prioridades, Equipas e Parceiros).
        </p>

        {/* Tab Selector */}
        <div className="overflow-x-auto w-full border-b border-border pb-3 mb-5 scrollbar-thin">
          <div className="flex gap-1.5 min-w-max">
            {[
              { id: 'projectCategories', label: 'Categorias' },
              { id: 'projectStatuses', label: 'Estados do projeto' },
              { id: 'taskTypes', label: 'Tipos de tarefa' },
              { id: 'taskStatuses', label: 'Estados de tarefa' },
              { id: 'ticketStatuses', label: 'Estados de tickets' },
              { id: 'projectPriorities', label: 'Prioridades' },
              { id: 'projectTeams', label: 'Equipas internas' },
              { id: 'projectPartners', label: 'Parceiros externos' },
              { id: 'riskCategories', label: 'Categorias de risco' },
              { id: 'riskStatuses', label: 'Estados de risco' },
              { id: 'riskPriorities', label: 'Prioridades de risco' },
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
                    ? 'bg-primary text-white'
                    : 'bg-surface-muted text-text-secondary hover:bg-slate-200 hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Addition form */}
        <form onSubmit={handleAddAuxRecord} className="flex flex-col gap-3 bg-surface-muted/50 p-4 rounded-card border border-border-subtle mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className={`${(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') ? 'md:col-span-2' : 'md:col-span-3'} space-y-1`}>
              <label className="block text-[11px] text-text-muted font-bold">Nome da opção *</label>
              <input 
                type="text" 
                required
                placeholder={`Introduza o nome...`}
                value={newAuxName}
                onChange={e => setNewAuxName(e.target.value)}
                className="w-full p-2 border border-border rounded-lg text-text-primary bg-surface font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses' || activeAuxTab === 'riskPriorities') && (
              <div className="space-y-1">
                <label className="block text-[11px] text-text-muted font-bold">Nível ({activeAuxTab === 'projectStatuses' ? '0 a 5' : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses') ? '1 a 10' : '1 a 3'})</label>
                <input 
                  type="number"
                  min={activeAuxTab === 'projectStatuses' ? 0 : 1}
                  max={activeAuxTab === 'projectStatuses' ? 5 : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'ticketStatuses') ? 10 : 3}
                  required
                  value={newAuxScale}
                  onChange={e => setNewAuxScale(Number(e.target.value))}
                  className="w-full p-2 border border-border rounded-lg text-text-primary bg-surface font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2 bg-primary hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Adicionar opção
            </button>
          </div>

          {isColorAuxTab && (
            <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[11px] font-bold text-text-muted whitespace-nowrap">Cor:</span>
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
                          : 'bg-surface text-text-secondary border-border hover:bg-surface-muted'
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
          <div className="p-4 bg-surface-muted text-slate-400 text-center rounded-control font-medium border border-border-subtle">
            Nenhuma opção configurada nesta tabela auxiliar.
          </div>
        ) : (
          <div className="bg-surface rounded-card border border-border shadow-2xs overflow-hidden mb-6">
            <div className="overflow-x-auto w-full">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndAux}
              >
                <table className="w-full min-w-[520px] text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-muted/90 border-b border-border/80 text-[11px] uppercase text-text-muted font-bold tracking-wider whitespace-nowrap">
                    <th className="p-3.5 w-10"></th>
                    <th className="p-3.5">Nome da Opção</th>
                    {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities') && (
                      <th className="p-3.5 w-32">Nível</th>
                    )}
                    {isColorAuxTab && (
                      <th className="p-3.5 w-48">Cor</th>
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

      {/* NOTIFICAÇÕES E AUTOMAÇÕES */}
      {(activeConfigTab === 'notificacoes' || activeConfigTab === 'automacoes') && (
        <div className="space-y-5">
          <M3SectionHeader title="Notificações e Automações" description="Configure os avisos e as regras automáticas da aplicação." />
          <Tabs
            tabs={[
              { id: 'notificacoes', label: 'Notificações', icon: <Bell className="w-4 h-4" /> },
              { id: 'automacoes', label: 'Automações', icon: <Zap className="w-4 h-4" /> },
            ]}
            activeTabId={notificationTab}
            onChange={tab => setNotificationTab(tab as 'notificacoes' | 'automacoes')}
          />
          {notificationTab === 'notificacoes' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-text-primary mb-1 uppercase tracking-tight">Notificações In-App</h3>
            <p className="text-xs text-text-muted font-medium mb-4">Configure os destinatários e a antecedência. Os avisos por data são enviados antes, no próprio dia e uma vez no dia seguinte.</p>
            {notificationError && <p role="alert" className="mb-4 text-sm text-error">{notificationError}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(state.notificationSettings || []).map(ns => (
                <Card key={ns.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-sm text-text-primary">{ns.name}</h4>
                    <Switch
                      checked={ns.enabled}
                      disabled={!canWriteConfig || savingNotificationId !== null}
                      label={`Ativar ${ns.name}`}
                      onChange={enabled => { void saveNotificationSetting(ns.id, { enabled }); }}
                    />
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {['task_due_date', 'project_due_date', 'project_scheduled_date'].includes(ns.type) && (
                      <div className="space-y-1 flex-1">
                        <Input
                          label="Dias de antecedência"
                          type="number"
                          min="0"
                          max="30"
                          value={ns.daysBefore}
                          disabled={!ns.enabled || !canWriteConfig || savingNotificationId !== null}
                          onChange={(e) => { void saveNotificationSetting(ns.id, { daysBefore: parseInt(e.target.value, 10) || 0 }); }}
                        />
                      </div>
                    )}
                    
                    <div className="space-y-1 flex-1">
                      <Select
                        label="Destinatários"
                        value={ns.targetGroup}
                        disabled={!ns.enabled || !canWriteConfig || savingNotificationId !== null}
                        onChange={(e) => { void saveNotificationSetting(ns.id, { targetGroup: e.target.value as 'all' | 'allocated' | 'managers' }); }}
                      >
                        <option value="all">Todos os utilizadores</option>
                        <option value="allocated">Utilizadores alocados</option>
                        <option value="managers">Gestores</option>
                      </Select>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            

          </div>
        </div>
          )}
          {notificationTab === 'automacoes' && (
            <AutomationEditor
              automationRules={automationRules || state.automationRules || []}
              addAutomationRule={addAutomationRule}
              updateAutomationRule={updateAutomationRule}
              deleteAutomationRule={deleteAutomationRule}
              toggleAutomationRule={toggleAutomationRule}
              projectStatuses={state.projectStatuses || []}
              taskStatuses={state.taskStatuses || []}
              canWrite={canWriteConfig}
            />
          )}
        </div>
      )}

      {activeConfigTab === 'importacao' && (
        <div className="space-y-6">
          {/* CSV Import Card */}
          <div className="bg-surface rounded-card border border-border p-6 text-xs font-bold text-text-secondary animate-fade-in" id="csv-import-card">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-subtle">
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
                  disabled={importingCsv || !csvText.trim() || !hasPermission(currentUser, 'projects_write', userGroups)}
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
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-border-subtle">
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
        <AuditLogSection auditLogs={state.auditLogs || []} currentUser={currentUser} />
      )}

      {/* UTILIZADORES TAB */}
      {activeConfigTab === 'utilizadores' && (
        <div className="space-y-5" id="users-tab">
          <M3SectionHeader title="Utilizadores" description="Gerir utilizadores, funções e associação de grupos." />
          <Tabs
            tabs={[
              { id: 'users', label: 'Utilizadores', icon: <Users className="w-4 h-4" /> },
              ...(hasPermission(currentUser, 'roles_manage' as any, userGroups)
                ? [{ id: 'roles', label: 'Funções e permissões', icon: <ShieldCheck className="w-4 h-4" /> }]
                : []),
              { id: 'associacoes', label: 'Associação de grupos', icon: <GripVertical className="w-4 h-4" /> },
            ]}
            activeTabId={usersConfigTab}
            onChange={tab => setUsersConfigTab(tab as 'users' | 'roles' | 'associacoes')}
          />
          {usersConfigTab === 'roles' && hasPermission(currentUser, 'roles_manage' as any, userGroups) && (
            <RolePermissionSection onRolesChanged={onRefreshFromDatabase} />
          )}
      {/* ASSOCIAÇÃO DE GRUPOS, NO SUBMENU UTILIZADORES */}
      {activeConfigTab === 'utilizadores' && usersConfigTab === 'associacoes' && (
        <form onSubmit={handleSaveAssociations} className="space-y-4">
          <div className="bg-surface rounded-card border border-border p-6 animate-fade-in text-xs font-bold text-text-secondary" id="managers-config-card">
            <h2 className="text-base font-bold text-text-primary mb-5 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Associação de grupos
            </h2>
            <p className="mb-5 text-sm font-normal text-text-secondary">As opções abaixo correspondem às funções ativas atribuídas aos utilizadores.</p>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-text-muted">Grupos para &quot;Gestor de Vendas&quot; (Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-border rounded-control bg-surface-muted/50">
                  {(state.activeRoles || []).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhuma função ativa criada</span>
                  ) : (
                    state.activeRoles!.map(g => {
                      const isChecked = salesRepGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-surface border border-border-subtle rounded-lg cursor-pointer select-none hover:bg-surface-muted transition-colors">
                          <input
                            type="checkbox"
                            disabled={!canWriteConfig || isSavingConfig}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSalesRepGroupIds(salesRepGroupIds.filter(id => id !== g.id));
                              } else {
                                setSalesRepGroupIds([...salesRepGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-text-secondary font-semibold text-xs">{g.name}</span>
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
                <label className="block text-text-muted">Grupos para &quot;Project Leader&quot; (Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-border rounded-control bg-surface-muted/50">
                  {(state.activeRoles || []).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhuma função ativa criada</span>
                  ) : (
                    state.activeRoles!.map(g => {
                      const isChecked = projManagerGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-surface border border-border-subtle rounded-lg cursor-pointer select-none hover:bg-surface-muted transition-colors">
                          <input
                            type="checkbox"
                            disabled={!canWriteConfig || isSavingConfig}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setProjManagerGroupIds(projManagerGroupIds.filter(id => id !== g.id));
                              } else {
                                setProjManagerGroupIds([...projManagerGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-text-secondary font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão ser atribuídos como &quot;Project Leader&quot; no formulário dos projetos.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-text-muted">Grupos para &quot;Técnico Responsável&quot; (Escolha Múltipla)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-border rounded-control bg-surface-muted/50">
                  {(state.activeRoles || []).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhuma função ativa criada</span>
                  ) : (
                    state.activeRoles!.map(g => {
                      const isChecked = fieldManagerGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-surface border border-border-subtle rounded-lg cursor-pointer select-none hover:bg-surface-muted transition-colors">
                          <input
                            type="checkbox"
                            disabled={!canWriteConfig || isSavingConfig}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setFieldManagerGroupIds(fieldManagerGroupIds.filter(id => id !== g.id));
                              } else {
                                setFieldManagerGroupIds([...fieldManagerGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-text-secondary font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão ser atribuídos como &quot;Técnico responsável&quot; no formulário dos projetos.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-border-subtle" id="task-assignee-groups-config">
                <label className="block text-text-secondary font-bold">Grupos associados a tarefas</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-border rounded-control bg-surface-muted/50">
                  {(state.activeRoles || []).length === 0 ? (
                    <span className="text-slate-400 font-medium">Nenhuma função ativa criada</span>
                  ) : (
                    state.activeRoles!.map(g => {
                      const isChecked = taskAssigneeGroupIds.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2.5 p-2 bg-surface border border-border-subtle rounded-lg cursor-pointer select-none hover:bg-surface-muted transition-colors">
                          <input
                            type="checkbox"
                            disabled={!canWriteConfig || isSavingConfig}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setTaskAssigneeGroupIds(taskAssigneeGroupIds.filter(id => id !== g.id));
                              } else {
                                setTaskAssigneeGroupIds([...taskAssigneeGroupIds, g.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-text-secondary font-semibold text-xs">{g.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  Selecione os grupos de utilizadores que poderão aparecer na seleção de Utilizadores na criação e edição de tarefas em toda a aplicação.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <M3Button type="submit" disabled={!canWriteConfig || isSavingConfig || !state.activeRoles}>{isSavingConfig ? 'A gravar...' : 'Gravar associações'}</M3Button>
          </div>
        </form>
      )}

          {usersConfigTab === 'users' && state.users && state.userGroups && (
            <UserSection 
              absences={state.userAbsences || []}
              users={state.users}
              userGroups={state.userGroups}
              activeRoles={state.activeRoles}
              appConfig={config}
              onRefreshFromDatabase={onRefreshFromDatabase}
              addAbsence={addAbsence!}
              deleteAbsence={deleteAbsence!}
              addUser={addUser!}
              updateUser={updateUser!}
              deleteUser={deleteUser!}
              hideAbsences={true}
              hideRoles={true}
              specialDays={state.specialDays || []}
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
