'use client';
import React, { useState } from 'react';
import type { SpecialDay } from '@/lib/types';
import { Plus, Check, Edit2, Trash2, Copy } from 'lucide-react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import { M3SectionHeader } from '@/components/M3';

interface Props {
  active: boolean;
  specialDays: SpecialDay[];
  addSpecialDay: (date: string, name: string) => Promise<{ success: boolean; message?: string }>;
  updateSpecialDay: (id: string, updates: Partial<SpecialDay>) => Promise<{ success: boolean; message?: string }>;
  deleteSpecialDay: (id: string) => void;
  canWriteConfig: boolean;
  askConfirmation: (title: string, message: string, onConfirm: () => void) => void;
}

export default function SpecialDaysSection({ active, specialDays, addSpecialDay, updateSpecialDay, deleteSpecialDay, canWriteConfig, askConfirmation }: Props) {
  // Special Days form state
  const [sdDate, setSdDate] = useState('');
  const [sdName, setSdName] = useState('');
  const [sdPage, setSdPage] = useState(0);
  const [sdPageSize, setSdPageSize] = useState(25);
  const [showSpecialDayForm, setShowSpecialDayForm] = useState(false);
  const [editingSpecialDayId, setEditingSpecialDayId] = useState<string | null>(null);
  const [specialDayError, setSpecialDayError] = useState<string | null>(null);
  const [savingSpecialDay, setSavingSpecialDay] = useState(false);

  const handleAddSpecialDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteConfig) {
      alert('Não tem permissão para alterar as configurações.');
      return;
    }
    if (!sdDate || !sdName.trim() || savingSpecialDay) return;

    const finishSave = async () => {
      setSavingSpecialDay(true);
      setSpecialDayError(null);
      const result = editingSpecialDayId
        ? await updateSpecialDay(editingSpecialDayId, { date: sdDate, name: sdName })
        : await addSpecialDay(sdDate, sdName);
      setSavingSpecialDay(false);
      if (!result.success) { setSpecialDayError(result.message || 'Não foi possível guardar o dia especial.'); return; }
      setSdDate('');
      setSdName('');
      setEditingSpecialDayId(null);
      setShowSpecialDayForm(false);
    };
    const existingDay = specialDays?.find(sd => sd.date === sdDate && sd.id !== editingSpecialDayId);
    if (existingDay) {
      askConfirmation(
        'Data Já Existente',
        `Já existe um dia especial registado para esta data (${existingDay.name}). Tem a certeza que deseja guardar outro registo na mesma data?`,
        finishSave
      );
      return;
    }
    finishSave();
  };

  return <div hidden={!active}>
<Card className="bg-surface rounded-card border border-border overflow-hidden animate-fade-in" id="special-days-card">
          <div className="p-4 sm:p-5 border-b border-border bg-surface-muted/60 space-y-4">
            <M3SectionHeader title="Dias especiais" description="Consulte e organize as datas especiais do calendário."
              actions={canWriteConfig ? <Button type="button" onClick={() => {
                if (showSpecialDayForm) {
                  setShowSpecialDayForm(false);
                  setEditingSpecialDayId(null);
                  setSpecialDayError(null);
                  return;
                }
                setSdDate('');
                setSdName('');
                setEditingSpecialDayId(null);
                setSpecialDayError(null);
                setShowSpecialDayForm(true);
              }}><Plus aria-hidden="true" className="w-4 h-4" /> Novo dia especial</Button> : undefined} />
          </div>
          {canWriteConfig && showSpecialDayForm && (
            <form id="special-day-form" onSubmit={handleAddSpecialDay} className="p-4 sm:p-5 border-b border-border-subtle grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)] gap-3 items-end">
              <Input label="Dia" type="date" required value={sdDate} onChange={e => setSdDate(e.target.value)} />
              <Input label="Nome" type="text" required placeholder="Ex.: Natal" value={sdName} onChange={e => setSdName(e.target.value)} />
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setShowSpecialDayForm(false); setEditingSpecialDayId(null); }}>Cancelar</Button>
                <Button type="submit" disabled={savingSpecialDay}><Check aria-hidden="true" className="w-4 h-4" /> Guardar</Button>
              </div>
              {specialDayError && <p role="alert" className="sm:col-span-2 text-error text-body-sm">{specialDayError}</p>}
            </form>
          )}
          {(() => {
            const sortedSd = specialDays.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const totalSdPages = Math.max(1, Math.ceil(sortedSd.length / sdPageSize));
            const currentSdPage = Math.min(sdPage, totalSdPages - 1);
            const startIndex = currentSdPage * sdPageSize;
            const visibleSd = sortedSd.slice(startIndex, startIndex + sdPageSize);
            return <>
              {visibleSd.length === 0 ? (
                <div role="status" className="p-10 text-center text-body-sm text-text-secondary space-y-3">
                  <p>Nenhum dia especial configurado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <caption className="sr-only">Dias especiais, ordenados por data decrescente</caption>
                    <thead className="bg-surface-muted/90 text-caption uppercase tracking-wider text-text-secondary border-b border-border">
                      <tr><th scope="col" className="px-4 sm:px-5 py-3.5">Data</th><th scope="col" className="px-4 sm:px-5 py-3.5">Nome</th>{canWriteConfig && <th scope="col" className="px-4 sm:px-5 py-3.5 text-right">Ações</th>}</tr>
                    </thead>
                    <tbody className="text-body-sm divide-y divide-border-subtle">
                      {visibleSd.map(sd => (
                        <tr key={sd.id} className="hover:bg-surface-muted transition-colors">
                          <td className="px-4 sm:px-5 py-4 text-text-secondary whitespace-nowrap">
                            <time dateTime={sd.date}>{new Date(sd.date + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}</time>
                          </td>
                          <td className="px-4 sm:px-5 py-4 font-medium text-text-primary break-words [overflow-wrap:anywhere]">{sd.name}</td>
                          {canWriteConfig && <td className="px-4 sm:px-5 py-4 text-right">
                            <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => {
                              setEditingSpecialDayId(null);
                              setSdDate(sd.date);
                              setSdName(sd.name);
                              setSpecialDayError(null);
                              setShowSpecialDayForm(true);
                            }}><Copy aria-hidden="true" className="w-4 h-4" />Duplicar</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => {
                              setEditingSpecialDayId(sd.id);
                              setSdDate(sd.date);
                              setSdName(sd.name);
                              setSpecialDayError(null);
                              setShowSpecialDayForm(true);
                            }}><Edit2 aria-hidden="true" className="w-4 h-4" />Editar</Button>
                            <IconButton type="button" variant="ghost" aria-label={`Eliminar dia especial: ${sd.name}, ${sd.date}`} className="text-text-secondary hover:text-error hover:bg-error/10"
                              onClick={() => askConfirmation('Confirmar eliminação de dia especial', 'Tem a certeza que deseja eliminar este dia? Esta ação terá um efeito permanente.', () => deleteSpecialDay(sd.id))}>
                              <Trash2 aria-hidden="true" className="w-4 h-4" />
                            </IconButton>
                            </div>
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-surface-muted/70 border-t border-border text-body-sm text-text-secondary">
                <div className="flex flex-wrap items-center gap-3">
                  <span role="status" aria-live="polite">A mostrar {sortedSd.length ? startIndex + 1 : 0} a {startIndex + visibleSd.length} de {sortedSd.length} registos</span>
                  <div className="flex items-center gap-2">
                    <label htmlFor="special-days-page-size" className="whitespace-nowrap">Por página:</label>
                    <Select id="special-days-page-size" value={sdPageSize} onChange={e => { setSdPageSize(Number(e.target.value)); setSdPage(0); }}>
                      {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                    </Select>
                  </div>
                </div>
                <nav aria-label="Paginação dos dias especiais" className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" disabled={currentSdPage === 0} onClick={() => setSdPage(currentSdPage - 1)}>Anterior</Button>
                  <span className="text-label font-semibold">Página {currentSdPage + 1} de {totalSdPages}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={currentSdPage >= totalSdPages - 1} onClick={() => setSdPage(currentSdPage + 1)}>Seguinte</Button>
                </nav>
              </div>
            </>;
          })()}
        </Card>
  </div>;
}
