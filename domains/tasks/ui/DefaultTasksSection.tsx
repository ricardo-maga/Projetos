'use client';
import React, { useState } from 'react';
import type { DefaultTask } from '@/lib/types';
import { Plus, Check, Edit2, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { M3SectionHeader } from '@/components/M3';
import { formatHoursToHHMM, parseTimeToHours } from '@/lib/utils';

interface Props {
  active: boolean;
  defaultTasks: DefaultTask[];
  taskTypes: Array<{ id: string; name: string; deleted?: boolean }>;
  addDefaultTask?: (title: string, description: string, estimatedHours: string, taskTypeId?: string) => Promise<{ success: boolean; message?: string }>;
  updateDefaultTask?: (id: string, updates: Partial<DefaultTask>) => Promise<{ success: boolean; message?: string }>;
  deleteDefaultTask?: (id: string) => void;
  canWriteConfig: boolean;
  askConfirmation: (title: string, message: string, onConfirm: () => void) => void;
}

export default function DefaultTasksSection({ active, defaultTasks, taskTypes, addDefaultTask, updateDefaultTask, deleteDefaultTask, canWriteConfig, askConfirmation }: Props) {
  // Default Tasks form state
  const [dtTitle, setDtTitle] = useState('');
  const [dtDesc, setDtDesc] = useState('');
  const [dtHours, setDtHours] = useState('08:00');
  const [dtTypeId, setDtTypeId] = useState('');
  const [dtPage, setDtPage] = useState(0);
  const [dtPageSize, setDtPageSize] = useState(12);
  const [showDefaultTaskForm, setShowDefaultTaskForm] = useState(false);
  const [defaultTaskError, setDefaultTaskError] = useState<string | null>(null);
  const [savingDefaultTask, setSavingDefaultTask] = useState(false);

  // Inline editing state for default tasks
  const [editingDtId, setEditingDtId] = useState<string | null>(null);
  const [editDtTitle, setEditDtTitle] = useState('');
  const [editDtDesc, setEditDtDesc] = useState('');
  const [editDtHours, setEditDtHours] = useState('');
  const [editDtTypeId, setEditDtTypeId] = useState('');

  const handleAddDefaultTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!dtTitle.trim() || !addDefaultTask || savingDefaultTask) return;
    setSavingDefaultTask(true);
    setDefaultTaskError(null);
    const result = await addDefaultTask(dtTitle.trim(), dtDesc.trim(), formatHoursToHHMM(parseTimeToHours(dtHours)), dtTypeId || undefined);
    setSavingDefaultTask(false);
    if (!result.success) {
      setDefaultTaskError(result.message || 'Não foi possível guardar o template de tarefa.');
      return;
    }
    setDtTitle('');
    setDtDesc('');
    setDtHours('08:00');
    setDtTypeId('');
    setShowDefaultTaskForm(false);
  };

  const startEditingDefaultTask = (dt: DefaultTask) => {
    setEditingDtId(dt.id);
    setEditDtTitle(dt.title);
    setEditDtDesc(dt.description);
    setEditDtHours(formatHoursToHHMM(parseTimeToHours(dt.estimatedHours)));
    setEditDtTypeId(dt.taskTypeId || '');
  };

  const handleSaveEditDefaultTask = async (id: string) => {
    if (!editDtTitle.trim() || !updateDefaultTask || savingDefaultTask) return;
    setSavingDefaultTask(true);
    setDefaultTaskError(null);
    const result = await updateDefaultTask(id, {
      title: editDtTitle.trim(),
      description: editDtDesc.trim(),
      estimatedHours: formatHoursToHHMM(parseTimeToHours(editDtHours)),
      taskTypeId: editDtTypeId || undefined
    });
    setSavingDefaultTask(false);
    if (!result.success) {
      setDefaultTaskError(result.message || 'Não foi possível alterar o template de tarefa.');
      return;
    }
    setEditingDtId(null);
  };

  const filteredDefaultTasks = defaultTasks;
  const defaultTaskTotalPages = Math.max(1, Math.ceil(filteredDefaultTasks.length / dtPageSize));
  const currentDefaultTaskPage = Math.min(dtPage, defaultTaskTotalPages - 1);
  const defaultTaskStartIndex = currentDefaultTaskPage * dtPageSize;
  const visibleDefaultTasks = filteredDefaultTasks.slice(defaultTaskStartIndex, defaultTaskStartIndex + dtPageSize);

  return <div hidden={!active}>
<Card className="bg-surface rounded-card border border-border overflow-hidden animate-fade-in" id="default-tasks-card">
        <div className="p-4 sm:p-5 border-b border-border bg-surface-muted/60 space-y-4">
          <M3SectionHeader title="Templates de tarefas" description="Crie e organize modelos reutilizáveis para as tarefas dos projetos."
            actions={canWriteConfig ? <Button type="button" onClick={() => { setDtTitle(''); setDtDesc(''); setDtHours('08:00'); setDtTypeId(''); setShowDefaultTaskForm(visible => !visible); }}><Plus aria-hidden="true" className="w-4 h-4" /> Nova tarefa</Button> : undefined} />
        </div>
        {defaultTaskError && <p role="alert" className="p-4 text-body-sm text-error">{defaultTaskError}</p>}
        {canWriteConfig && showDefaultTaskForm && <form id="default-task-form" onSubmit={handleAddDefaultTask} className="p-4 sm:p-5 border-b border-border-subtle grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4"><Input label="Título da tarefa" type="text" required placeholder="Ex.: Eletrificação de sistema" value={dtTitle} onChange={e => setDtTitle(e.target.value)} /></div>
          <div className="lg:col-span-3"><Select label="Tipo de tarefa" value={dtTypeId} onChange={e => setDtTypeId(e.target.value)}><option value="">Por defeito</option>{taskTypes.filter((type: any) => !type.deleted).map((type: any) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></div>
          <div className="lg:col-span-2"><Input label="Duração prevista" type="text" required inputMode="numeric" pattern="[0-9]{1,3}:[0-5][0-9]" placeholder="HH:MM" value={dtHours} onChange={e => setDtHours(e.target.value)} onBlur={() => setDtHours(formatHoursToHHMM(parseTimeToHours(dtHours)))} /></div>
          <div className="lg:col-span-3"><Input label="Instruções técnicas" type="text" placeholder="Instruções padrão…" value={dtDesc} onChange={e => setDtDesc(e.target.value)} /></div>
          <div className="lg:col-span-12 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowDefaultTaskForm(false)}>Cancelar</Button>
            <Button type="submit" disabled={savingDefaultTask}><Check aria-hidden="true" className="w-4 h-4" /> Guardar</Button>
          </div>
        </form>}

        {visibleDefaultTasks.length === 0 ? (
          <div role="status" className="p-10 text-center text-body-sm text-text-secondary space-y-3">
            <p>{defaultTasks.length === 0 ? 'Nenhuma tarefa por defeito configurada.' : 'Nenhum template encontrado para os filtros selecionados.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {visibleDefaultTasks.map(dt => {
              const isEditingThis = editingDtId === dt.id;
              const typeName = dt.taskTypeId ? taskTypes.find((tt: any) => tt.id === dt.taskTypeId)?.name : null;
              return (
                <article key={dt.id} className="p-4 sm:p-5 hover:bg-surface-muted/50 transition-colors">
                  {isEditingThis ? (
                    // Inline Edit Mode
                    <div className="space-y-3 flex-1">
                      <div className="space-y-1">
                        <label className="text-label text-text-secondary block font-semibold">Título da tarefa</label>
                        <input
                          type="text"
                          value={editDtTitle}
                          onChange={e => setEditDtTitle(e.target.value)}
                          className="w-full h-11 px-3.5 border border-border rounded-control font-semibold text-body text-text-primary bg-surface"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-label text-text-secondary block font-semibold">Tipo de tarefa</label>
                          <select
                            value={editDtTypeId}
                            onChange={e => setEditDtTypeId(e.target.value)}
                            className="w-full h-11 px-3.5 border border-border rounded-control font-semibold text-body text-text-primary bg-surface"
                          >
                            <option value="">Por defeito</option>
                            {taskTypes.filter((s: any) => !s.deleted).map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-label text-text-secondary block font-semibold">Horas estimadas</label>
                          <input
                            type="text"
                            value={editDtHours}
                            onChange={e => setEditDtHours(e.target.value)}
                            className="w-full h-11 px-3.5 border border-border rounded-control font-semibold text-body text-text-primary bg-surface"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-label text-text-secondary block font-semibold">Instruções técnicas</label>
                        <textarea
                          value={editDtDesc}
                          onChange={e => setEditDtDesc(e.target.value)}
                          rows={2}
                          className="w-full px-3.5 py-3 border border-border rounded-control text-body text-text-secondary font-medium bg-surface"
                        />
                      </div>
                    </div>
                  ) : (
                    // Standard View Mode
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-body font-bold text-text-primary leading-snug">{dt.title}</h4>
                          {typeName && (
                            <span className="px-2 py-1 bg-blue-50 border border-blue-100 text-blue-700 rounded-control text-label font-semibold">
                              {typeName}
                            </span>
                          )}
                        </div>
                        <span className="flex-shrink-0 px-3 py-1.5 bg-surface-muted border border-border text-text-secondary rounded-control text-label font-semibold font-mono" aria-label={`Duração prevista: ${formatHoursToHHMM(parseTimeToHours(dt.estimatedHours))}`}>
                          {formatHoursToHHMM(parseTimeToHours(dt.estimatedHours))}
                        </span>
                      </div>
                      <p className="text-body-sm text-text-muted font-medium leading-relaxed">
                        {dt.description || <span className="italic text-slate-400">Sem instruções de modelo fornecidas.</span>}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle mt-2">
                    {isEditingThis ? (
                      <>
                        <button
                          onClick={() => setEditingDtId(null)}
                          className="px-2 py-1 text-label font-semibold text-text-muted hover:bg-surface-muted rounded-control transition-colors flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleSaveEditDefaultTask(dt.id)}
                          disabled={savingDefaultTask}
                          className="px-2 py-1 text-label font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-control transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Gravar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEditingDefaultTask(dt)}
                          className="px-2 py-1 text-label font-semibold text-text-muted hover:text-primary hover:bg-blue-50 rounded-control transition-colors flex items-center gap-1"
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
                          className="px-2 py-1 text-label font-semibold text-text-muted hover:text-red-600 hover:bg-red-50 rounded-control transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-surface-muted/70 border-t border-border text-body-sm text-text-secondary">
          <div className="flex flex-wrap items-center gap-3"><span role="status" aria-live="polite">A mostrar {filteredDefaultTasks.length ? defaultTaskStartIndex + 1 : 0} a {defaultTaskStartIndex + visibleDefaultTasks.length} de {filteredDefaultTasks.length} templates</span><div className="flex items-center gap-2"><label htmlFor="default-tasks-page-size" className="whitespace-nowrap">Por página:</label><Select id="default-tasks-page-size" value={dtPageSize} onChange={e => { setDtPageSize(Number(e.target.value)); setDtPage(0); }} className="h-9 py-0"><option value={12}>12</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></Select></div></div>
          <nav aria-label="Paginação dos templates de tarefas" className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" disabled={currentDefaultTaskPage === 0} onClick={() => setDtPage(currentDefaultTaskPage - 1)}><ChevronLeft aria-hidden="true" className="w-4 h-4" />Anterior</Button><span className="text-label font-semibold">Página {currentDefaultTaskPage + 1} de {defaultTaskTotalPages}</span><Button type="button" variant="ghost" size="sm" disabled={currentDefaultTaskPage >= defaultTaskTotalPages - 1} onClick={() => setDtPage(currentDefaultTaskPage + 1)}>Seguinte<ChevronRight aria-hidden="true" className="w-4 h-4" /></Button></nav>
        </div>
      </Card>
  </div>;
}
