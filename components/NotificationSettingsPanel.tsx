'use client';

import { FlaskConical } from 'lucide-react';
import { authenticatedRequest, getAuthHeaders } from '@/lib/clientAuth';
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
  { title: 'Projetos', types: ['new_project', 'project_allocation', 'project_due_date', 'project_scheduled_date', 'project_comment', 'project_closed'] },
  { title: 'Tarefas', types: ['task_allocation', 'task_due_date'] },
  { title: 'Presales', types: ['presales_assignment', 'presales_due_date', 'presales_result'] },
  { title: 'Projetos mecânicos', types: ['mechanical_design_assignment', 'mechanical_design_due_date', 'mechanical_design_result'] },
];
const dateTypes = new Set(['task_due_date', 'project_due_date', 'project_scheduled_date', 'presales_due_date', 'mechanical_design_due_date']);

export default function NotificationSettingsPanel({ settings, canWrite, updateSetting }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const testNotification = async (setting: NotificationSetting) => {
    if (testingId) return;
    setTestingId(setting.id);
    setError(null);
    setFeedback(null);
    try {
      const response = await authenticatedRequest('/api/notifications/test', {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: setting.type }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Não foi possível enviar o teste.');
      setFeedback('Notificação de teste enviada para si.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível enviar o teste.');
    } finally { setTestingId(null); }
  };

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
              <th scope="col" className="w-32 px-3 py-3.5">Comandos</th>
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
                <td className="w-32 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={ns.enabled} disabled={!canWrite || savingId !== null}
                      ariaLabel={`Ativar/desativar ${ns.name}`}
                      onChange={enabled => { void save(ns.id, { enabled }); }} />
                    <button type="button" aria-label={`Testar ${ns.name}`} title={`Testar ${ns.name}`}
                      disabled={!canWrite || testingId !== null}
                      onClick={() => { void testNotification(ns); }}
                      className="flex h-11 w-11 items-center justify-center rounded-control text-text-secondary hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
                      <FlaskConical className={`h-4 w-4 ${testingId === ns.id ? 'animate-pulse' : ''}`} />
                    </button>
                  </div>
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
      {feedback && <p role="status" className="text-sm text-text-secondary">{feedback}</p>}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {sections.map(section => renderTable(section.title, section.types.flatMap(type => settings.filter(setting => setting.type === type))))}
      {otherSettings.length > 0 && renderTable('Outras notificações', otherSettings)}
    </div>
  );
}
