'use client';

import { useState } from 'react';
import type { NotificationSetting } from '../lib/types';
import Card from './ui/Card';
import Input from './ui/Input';
import Select from './ui/Select';
import Switch from './ui/Switch';

interface Props {
  settings: NotificationSetting[];
  canWrite: boolean;
  updateSetting?: (id: string, updates: Partial<NotificationSetting>) => Promise<{ success: boolean; message?: string }>;
}

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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-1 uppercase tracking-tight">Notificações In-App</h3>
        <p className="text-xs text-text-muted font-medium mb-4">Configure os destinatários e a antecedência. Os avisos por data são enviados antes, no próprio dia e uma vez no dia seguinte.</p>
        {error && <p role="alert" className="mb-4 text-sm text-error">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settings.map(ns => (
            <Card key={ns.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm text-text-primary">{ns.name}</h4>
                <Switch checked={ns.enabled} disabled={!canWrite || savingId !== null}
                  label={`Ativar ${ns.name}`}
                  onChange={enabled => { void save(ns.id, { enabled }); }} />
              </div>
              <div className="flex items-center gap-4">
                {['task_due_date', 'project_due_date', 'project_scheduled_date', 'presales_due_date'].includes(ns.type) && (
                  <div className="space-y-1 flex-1">
                    <Input label="Dias de antecedência" type="number" min="0" max="30" value={ns.daysBefore}
                      disabled={!ns.enabled || !canWrite || savingId !== null}
                      onChange={e => { void save(ns.id, { daysBefore: parseInt(e.target.value, 10) || 0 }); }} />
                  </div>
                )}
                <div className="space-y-1 flex-1">
                  <Select label="Destinatários" value={ns.targetGroup}
                    disabled={!ns.enabled || !canWrite || savingId !== null}
                    onChange={e => { void save(ns.id, { targetGroup: e.target.value as NotificationSetting['targetGroup'] }); }}>
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
  );
}
