'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Plus, ShieldCheck } from 'lucide-react';
import { getClientToken } from '@/lib/clientAuth';
import Button from './ui/Button';
import { M3Card, M3SectionHeader } from './M3';

type Catalog = {
  roles: Array<{ id: string; code: string; name: string; description: string | null; is_system: boolean; is_active: boolean }>;
  permissions: Array<{ id: string; code: string; module: string; action: string; description: string | null }>;
  rolePermissions: Array<{ role_id: string; permission_id: string }>;
  users: Array<{ id: string; name: string; email: string; type: string; approved: boolean; deleted: boolean }>;
  userRoles: Array<{ user_id: string; role_id: string }>;
};

export default function RolePermissionSection() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [roleId, setRoleId] = useState('');
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<'permissions' | 'create-role' | 'deactivate-role' | null>(null);
  const [message, setMessage] = useState('');

  const request = useCallback(async (url: string, init?: RequestInit) => {
    const token = getClientToken();
    const response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível concluir a operação.');
    return result;
  }, []);

  const refresh = useCallback(async () => {
    const result = await request('/api/rbac/catalog');
    setCatalog(result);
    setRoleId((current: string) => result.roles.some((role: Catalog['roles'][number]) => role.id === current && role.is_active)
      ? current : result.roles.find((role: Catalog['roles'][number]) => role.is_active)?.id || '');
  }, [request]);

  useEffect(() => { refresh().catch(error => setMessage(error.message)); }, [refresh]);

  const activeRoles = useMemo(() => (catalog?.roles || []).filter(role => role.is_active), [catalog]);
  const editablePermissions = useMemo(() => (catalog?.permissions || []).filter(permission => !permission.code.startsWith('roles.')), [catalog]);
  const permissionById = useMemo(() => new Map((catalog?.permissions || []).map(permission => [permission.id, permission.code])), [catalog]);
  const modules = useMemo(() => [...new Set(editablePermissions.map(permission => permission.module))].sort(), [editablePermissions]);

  useEffect(() => {
    if (!catalog || !roleId) return;
    setPermissionCodes(catalog.rolePermissions.filter(grant => grant.role_id === roleId)
      .map(grant => permissionById.get(grant.permission_id)).filter((code): code is string => !!code && !code.startsWith('roles.')));
  }, [catalog, roleId, permissionById]);

  const savePermissions = async () => {
    if (!roleId) return;
    setBusy(true); setBusyAction('permissions'); setMessage('');
    try { await request(`/api/rbac/roles/${roleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionCodes }) }); await refresh(); setMessage('Permissões guardadas e registadas na auditoria.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao guardar permissões.'); }
    finally { setBusy(false); setBusyAction(null); }
  };

  const createRole = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setBusyAction('create-role'); setMessage('');
    try {
      const result = await request('/api/rbac/roles', { method: 'POST', body: JSON.stringify({ name: newRoleName, description: newRoleDescription }) });
      setNewRoleName(''); setNewRoleDescription(''); await refresh(); setRoleId(result.role.id); setMessage('Função criada. Defina as permissões na matriz.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar função.'); }
    finally { setBusy(false); setBusyAction(null); }
  };

  const deactivateRole = async () => {
    if (!roleId || !window.confirm('Desativar esta função? As atribuições existentes têm de ser removidas primeiro.')) return;
    setBusy(true); setBusyAction('deactivate-role'); setMessage('');
    try { await request(`/api/rbac/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) }); await refresh(); setMessage('Função desativada e auditada.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao desativar função.'); }
    finally { setBusy(false); setBusyAction(null); }
  };

  if (!catalog) return <div className="flex items-center gap-2 p-6 text-sm text-slate-600" role="status" aria-live="polite">
    <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-warning" />
    {message || 'A carregar o catálogo de permissões…'}
  </div>;

  return (
    <section className="space-y-5" aria-labelledby="rbac-title">
      <M3SectionHeader title="Funções e permissões" description="Selecione uma função para configurar a matriz. As alterações são aplicadas no servidor e registadas na auditoria." />

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
        <M3Card className="space-y-4 p-4 md:p-5">
          <div><h3 className="font-semibold text-text-primary">Funções</h3><p className="mt-1 text-sm text-text-secondary">Escolha uma função existente ou crie uma personalizada.</p></div>
          <div className="flex flex-wrap gap-3">
            <select aria-label="Função" className="min-w-56 flex-1 rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text-primary" value={roleId} onChange={event => setRoleId(event.target.value)}>
              {activeRoles.map(role => <option key={role.id} value={role.id}>{role.name}{role.is_system ? ' · sistema' : ''}</option>)}
            </select>
            {catalog.roles.find(role => role.id === roleId && !role.is_system) && <Button type="button" variant="outline" size="sm" disabled={busy} isLoading={busyAction === 'deactivate-role'} onClick={deactivateRole}>Desativar função</Button>}
          </div>
          <form onSubmit={createRole} className="space-y-3 border-t border-border pt-5">
            <h4 className="text-sm font-semibold text-text-primary">Criar função</h4>
            <input aria-label="Nome da função" required maxLength={80} value={newRoleName} onChange={event => setNewRoleName(event.target.value)} placeholder="Nome" className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text-primary" />
            <textarea aria-label="Descrição da função" maxLength={500} value={newRoleDescription} onChange={event => setNewRoleDescription(event.target.value)} placeholder="Descrição (opcional)" rows={3} className="w-full resize-y rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-text-primary" />
            <Button type="submit" disabled={busy || !newRoleName.trim()} isLoading={busyAction === 'create-role'}><Plus className="h-4 w-4" />Criar função</Button>
          </form>
        </M3Card>

        <M3Card className="space-y-4 p-4 md:p-5">
          <div className="border-b border-border pb-4"><h3 className="font-semibold text-text-primary">Matriz de permissões</h3><p className="mt-1 text-sm text-text-secondary">Permissões para: <span className="font-semibold text-primary">{activeRoles.find(role => role.id === roleId)?.name || 'Selecione uma função'}</span></p></div>
          {modules.map(module => (
            <fieldset key={module} className="rounded-xl border border-border bg-surface-muted/40 p-4">
              <legend className="px-1 text-sm font-semibold capitalize text-text-primary">{module}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {editablePermissions.filter(permission => permission.module === module).map(permission => (
                  <label key={permission.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm text-text-primary transition-colors hover:bg-surface">
                    <input type="checkbox" className="mt-0.5 accent-primary" checked={permissionCodes.includes(permission.code)} onChange={event => setPermissionCodes(codes => event.target.checked ? [...new Set([...codes, permission.code])] : codes.filter(code => code !== permission.code))} />
                    <span><span className="font-medium">{permission.action}</span><span className="block text-xs font-normal text-text-secondary">{permission.description || permission.code}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex justify-end border-t border-border pt-4"><Button type="button" disabled={!roleId || busy || catalog.roles.find(role => role.id === roleId)?.code === 'SUPER_ADMIN'} isLoading={busyAction === 'permissions'} onClick={savePermissions}>Guardar matriz</Button></div>
        </M3Card>
      </div>
      {message && <p role="status" className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-text-primary">{message}</p>}
    </section>
  );
}
