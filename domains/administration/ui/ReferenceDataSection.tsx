'use client';
import React, { useState } from 'react';
import { Settings, Plus, Trash2, Edit2, Check, X, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import type { ERPState } from '@/lib/types';

interface Props {
  active: boolean;
  canWriteConfig: boolean;
  state: ERPState;
  projectCategories: any[];
  projectStatuses: any[];
  taskStatuses: any[];
  taskTypes: any[];
  projectRisks: any[];
  projectPriorities: any[];
  projectTeams: any[];
  projectPartners: any[];
  addAuxRecord?: (tableName: any, name: string, extra?: { scale?: number }) => void;
  updateAuxRecord?: (tableName: any, id: string, updates: Partial<{ name: string; scale: number; deleted: boolean }>) => void;
  deleteAuxRecord?: (tableName: any, id: string) => void;
  reorderAuxRecords?: (tableName: any, newItems: any[]) => void;
  askConfirmation: (title: string, message: string, onConfirm: () => void) => void;
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

      {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') && (
        <td className="p-3.5">
          {isEditingThis ? (
            <input
              type="number"
              min={activeAuxTab === 'projectStatuses' ? 0 : 1}
              max={activeAuxTab === 'projectStatuses' ? 5 : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskStatuses') ? 10 : 3}
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

export default function ReferenceDataSection({
  active, canWriteConfig, state, projectCategories, projectStatuses, taskStatuses, taskTypes,
  projectRisks, projectPriorities, projectTeams, projectPartners,
  addAuxRecord, updateAuxRecord, deleteAuxRecord, reorderAuxRecords, askConfirmation,
}: Props) {
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

  // Aux tables state
  const [activeAuxTab, setActiveAuxTab] = useState<'projectCategories' | 'projectStatuses' | 'taskStatuses' | 'taskTypes' | 'projectRisks' | 'projectPriorities' | 'projectTeams' | 'projectPartners' | 'riskCategories' | 'riskStatuses' | 'riskPriorities'>('projectCategories');
  const [newAuxName, setNewAuxName] = useState('');
  const [newAuxScale, setNewAuxScale] = useState(1);
  const [newAuxColor, setNewAuxColor] = useState('#bfdbfe');
  const [editingAuxId, setEditingAuxId] = useState<string | null>(null);
  const [editAuxName, setEditAuxName] = useState('');
  const [editAuxScale, setEditAuxScale] = useState(1);
  const [editAuxColor, setEditAuxColor] = useState('#bfdbfe');

  const isColorAuxTab = activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectRisks' || activeAuxTab === 'riskStatuses' || activeAuxTab === 'riskPriorities';

  const handleAddAuxRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!newAuxName.trim() || !addAuxRecord) return;

    const extra: any = {};
    if (activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') {
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
    if (activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') {
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
      if (activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') {
        return (a.scale ?? 0) - (b.scale ?? 0);
      }
      return 0;
    });
  })();

  return <div hidden={!active}>
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
            <div className={`${(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') ? 'md:col-span-2' : 'md:col-span-3'} space-y-1`}>
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

            {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') && (
              <div className="space-y-1">
                <label className="block text-[11px] text-text-muted font-bold">Nível ({activeAuxTab === 'projectStatuses' ? '0 a 5' : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskStatuses') ? '1 a 10' : '1 a 3'})</label>
                <input
                  type="number"
                  min={activeAuxTab === 'projectStatuses' ? 0 : 1}
                  max={activeAuxTab === 'projectStatuses' ? 5 : (activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskStatuses') ? 10 : 3}
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
                    {(activeAuxTab === 'projectRisks' || activeAuxTab === 'projectPriorities' || activeAuxTab === 'projectStatuses' || activeAuxTab === 'taskStatuses' || activeAuxTab === 'taskTypes' || activeAuxTab === 'riskPriorities' || activeAuxTab === 'riskStatuses') && (
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
  </div>;
}
