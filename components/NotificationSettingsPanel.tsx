'use client';

import { useState } from 'react';
import type { NotificationSetting } from '../lib/types';
import Input from './ui/Input';
import Select from './ui/Select';
import Switch from './ui/Switch';

interface Props {
  settings: NotificationSetting[];
  canWrite: boolean;
  updateSetting?: (id: string, updates: Partial<NotificationSetting>) => Promise<{ success: boolean; message?: string }>;
}

const sections = [
  { title: 'Projetos', types: ['new_project', 'project_allocation', 'project_due_date', 'project_scheduled_date'] },
  { title: 'Presales', types: ['presales_assignment', 'presales_due_date', 'presales_result'] },
  { title: 'Tarefas', types: ['task_allocation', 'task_due_date'] },
];
const dateTypes = new Set(['task_due_date', 'project_due_date', 'project_scheduled_date', 'presales_due_date']);

export default function NotificationSettingsPanel({ settings, canWrite, updateSetting }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (id: string, updates: Partial<NotificationSetting>) => {
    if (!updateSetting || savingId) return;
    setSavingId(id);
    setError(null);
    try {
      const result = await updateSetting(id, updates);
      if (!result.success) setError(result.message || 'Não foi possível guardar a definição.');
    } catch {
      setError('Não foi possível guardar a definição.');
    } finally {
      setSavingId(null);
    }
  };

  const renderTable = (title: string, rows: NotificationSetting[]) => (
    <section key={title} className="m3-card overflow-hidden">
      <div className="border-b border-border bg-surface-muted/50 px-5 py-4">
        <h3 className="text-heading-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-surface-muted/70 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            <tr>
              <th scope="col" className="px-5 py-3.5">Notificação</th>
              <th scope="col" className="px-5 py-3.5">Dias de antecedência</th>
              <th scope="col" className="px-5 py-3.5">Utilizadores</th>
              <th scope="col" className="px-5 py-3.5">Ativar/desativar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map(ns => (
              <tr key={ns.id} className="transition-colors hover:bg-surface-muted/50">
                <th scope="row" className="px-5 py-4 font-semibold text-text-primary">{ns.name}</th>
                <td className="px-5 py-3">
                  {dateTypes.has(ns.type) ? (
                    <Input aria-label={`Dias de antecedência para ${ns.name}`} type="number" min="0" max="30" value={ns.daysBefore}
                      className="max-w-24" disabled={!ns.enabled || !canWrite || savingId !== null}
                      onChange={e => { void save(ns.id, { daysBefore: parseInt(e.target.value, 10) || 0 }); }} />
                  ) : <span className="text-text-muted">—</span>}
                </td>
                <td className="px-5 py-3">
                  <Select aria-label={`Utilizadores para ${ns.name}`} value={ns.targetGroup} className="max-w-56"
                    disabled={!ns.enabled || !canWrite || savingId !== null}
                    onChange={e => { void save(ns.id, { targetGroup: e.target.value as NotificationSetting['targetGroup'] }); }}>
                    <option value="all">Todos os utilizadores</option>
                    <option value="allocated">Utilizadores alocados</option>
                    <option value="managers">Gestores</option>
                  </Select>
                </td>
                <td className="px-5 py-3">
                  <Switch checked={ns.enabled} disabled={!canWrite || savingId !== null}
                    label={`Ativar ${ns.name}`}
                    onChange={enabled => { void save(ns.id, { enabled }); }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const knownTypes = new Set(sections.flatMap(section => section.types));
  const otherSettings = settings.filter(setting => !knownTypes.has(setting.type));

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">Configure os destinatários e a antecedência. Os avisos por data são enviados antes, no próprio dia e uma vez no dia seguinte.</p>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {sections.map(section => renderTable(section.title, section.types.flatMap(type => settings.filter(setting => setting.type === type))))}
      {otherSettings.length > 0 && renderTable('Outras notificações', otherSettings)}
    </div>
  );
}
