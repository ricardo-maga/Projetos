'use client';

import React, { useState } from 'react';
import { GripVertical, ShieldCheck, Users } from 'lucide-react';
import type { AppConfiguration, ERPState } from '@/lib/types';
import { hasPermission } from '@/lib/permissions';
import { configuredRoleIds } from '@/lib/roleAssociations';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import Tabs from '@/components/ui/Tabs';
import { M3Button, M3SectionHeader } from '@/components/M3';
import UserSection from './UserSection';
import RolePermissionSection from './RolePermissionSection';

type AssociationKey = 'salesRepGroupIds' | 'projManagerGroupIds' | 'fieldManagerGroupIds' | 'taskAssigneeGroupIds';
const groups: { key: AssociationKey; legacy: 'salesRepGroupId' | 'projManagerGroupId' | 'fieldManagerGroupId' | 'taskAssigneeGroupId'; label: string; description: string }[] = [
  { key: 'salesRepGroupIds', legacy: 'salesRepGroupId', label: 'Grupos para "Gestor de Vendas"', description: 'Selecione os grupos de utilizadores que poderão ser atribuídos como "Gestor de Vendas" no formulário dos projetos.' },
  { key: 'projManagerGroupIds', legacy: 'projManagerGroupId', label: 'Grupos para "Project Leader"', description: 'Selecione os grupos de utilizadores que poderão ser atribuídos como "Project Leader" no formulário dos projetos.' },
  { key: 'fieldManagerGroupIds', legacy: 'fieldManagerGroupId', label: 'Grupos para "Técnico Responsável"', description: 'Selecione os grupos de utilizadores que poderão ser atribuídos como "Técnico responsável" no formulário dos projetos.' },
  { key: 'taskAssigneeGroupIds', legacy: 'taskAssigneeGroupId', label: 'Grupos associados a tarefas', description: 'Selecione os grupos de utilizadores que poderão aparecer na seleção de Utilizadores na criação e edição de tarefas em toda a aplicação.' },
];

interface Props {
  config: AppConfiguration;
  state: ERPState;
  currentUser?: any;
  addUser?: any;
  updateUser?: any;
  deleteUser?: any;
  onRefreshFromDatabase?: () => Promise<boolean>;
  updateConfig: (updates: Partial<AppConfiguration>) => Promise<{ success: boolean; message?: string }>;
}

export default function UserAdministrationSection({ config, state, currentUser, addUser, updateUser, deleteUser, onRefreshFromDatabase, updateConfig }: Props) {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'associacoes'>('users');
  const [selected, setSelected] = useState<Record<AssociationKey, string[]>>(() => Object.fromEntries(groups.map(group => [group.key, configuredRoleIds(config[group.key], config[group.legacy])])) as Record<AssociationKey, string[]>);
  const configKey = JSON.stringify(groups.map(group => configuredRoleIds(config[group.key], config[group.legacy])));
  const [prevConfigKey, setPrevConfigKey] = useState(configKey);
  if (prevConfigKey !== configKey) {
    setPrevConfigKey(configKey);
    setSelected(Object.fromEntries(groups.map(group => [group.key, configuredRoleIds(config[group.key], config[group.legacy])])) as Record<AssociationKey, string[]>);
  }
  const { busy, run } = useAsyncAction();
  const canWriteConfig = hasPermission(currentUser, 'config_write');

  const saveAssociations = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWriteConfig || !state.activeRoles) return;
    await run(async () => {
      const activeIds = new Set(state.activeRoles!.map(role => role.id));
      const updates: Partial<AppConfiguration> = {};
      for (const group of groups) {
        const ids = selected[group.key].filter(id => activeIds.has(id));
        (updates as any)[group.key] = ids;
        (updates as any)[group.legacy] = ids[0] || '';
      }
      const result = await updateConfig(updates);
      if (result.success) alert('Associação de grupos gravada com sucesso!');
      else alert(result.message || 'Não foi possível gravar a associação de grupos.');
    });
  };

  return <div className="space-y-5" id="users-tab">
    <M3SectionHeader title="Utilizadores" description="Gerir utilizadores, funções e associação de grupos." />
    <Tabs tabs={[
      { id: 'users', label: 'Utilizadores', icon: <Users className="w-4 h-4" /> },
      ...(hasPermission(currentUser, 'roles_manage' as any) ? [{ id: 'roles', label: 'Funções e permissões', icon: <ShieldCheck className="w-4 h-4" /> }] : []),
      { id: 'associacoes', label: 'Associação de grupos', icon: <GripVertical className="w-4 h-4" /> },
    ]} activeTabId={activeTab} onChange={tab => setActiveTab(tab as typeof activeTab)} />
    {activeTab === 'roles' && hasPermission(currentUser, 'roles_manage' as any) && <RolePermissionSection onRolesChanged={onRefreshFromDatabase} />}
    {activeTab === 'associacoes' && <form onSubmit={saveAssociations} className="space-y-4">
      <div className="bg-surface rounded-card border border-border p-6 animate-fade-in text-xs font-bold text-text-secondary" id="managers-config-card">
        <h2 className="text-base font-bold text-text-primary mb-5 flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Associação de grupos</h2>
        <p className="mb-5 text-sm font-normal text-text-secondary">As opções abaixo correspondem às funções ativas atribuídas aos utilizadores.</p>
        <div className="space-y-6">{groups.map(group => <div key={group.key} className={group.key === 'taskAssigneeGroupIds' ? 'space-y-2 pt-2 border-t border-border-subtle' : 'space-y-2'} id={group.key === 'taskAssigneeGroupIds' ? 'task-assignee-groups-config' : undefined}>
          <label className="block text-text-muted">{group.label}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 border border-border rounded-control bg-surface-muted/50">
            {(state.activeRoles || []).length === 0 ? <span className="text-slate-400 font-medium">Nenhuma função ativa criada</span> : state.activeRoles!.map(role => {
              const checked = selected[group.key].includes(role.id);
              return <label key={role.id} className="flex items-center gap-2.5 p-2 bg-surface border border-border-subtle rounded-lg cursor-pointer select-none hover:bg-surface-muted transition-colors">
                <input type="checkbox" disabled={!canWriteConfig || busy} checked={checked} onChange={() => setSelected(prev => ({ ...prev, [group.key]: checked ? prev[group.key].filter(id => id !== role.id) : [...prev[group.key], role.id] }))} className="rounded border-slate-300 text-primary focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                <span className="text-text-secondary font-semibold text-xs">{role.name}</span>
              </label>;
            })}
          </div>
          <p className="text-[10px] text-slate-400 font-medium font-sans">{group.description}</p>
        </div>)}</div>
      </div>
      <div className="flex justify-end"><M3Button type="submit" disabled={!canWriteConfig || busy || !state.activeRoles}>{busy ? 'A gravar...' : 'Gravar associações'}</M3Button></div>
    </form>}
    {activeTab === 'users' && state.users && state.userGroups && <UserSection users={state.users} userGroups={state.userGroups} onRefreshFromDatabase={onRefreshFromDatabase} addUser={addUser!} updateUser={updateUser!} deleteUser={deleteUser!} hideRoles={true} currentUser={currentUser} />}
  </div>;
}
