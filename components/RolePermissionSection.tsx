'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getClientToken } from '@/lib/clientAuth';
import Button from './ui/Button';

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
  const [userId, setUserId] = useState('');
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [userRoleIds, setUserRoleIds] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [busy, setBusy] = useState(false);
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
    setUserId((current: string) => result.users.some((user: Catalog['users'][number]) => user.id === current && user.type !== 'External')
      ? current : result.users.find((user: Catalog['users'][number]) => user.type !== 'External')?.id || '');
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

  useEffect(() => {
    if (!catalog || !userId) return;
    setUserRoleIds(catalog.userRoles.filter(assignment => assignment.user_id === userId).map(assignment => assignment.role_id));
  }, [catalog, userId]);

  const savePermissions = async () => {
    if (!roleId) return;
    setBusy(true); setMessage('');
    try { await request(`/api/rbac/roles/${roleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionCodes }) }); await refresh(); setMessage('Permissões guardadas e registadas na auditoria.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao guardar permissões.'); }
    finally { setBusy(false); }
  };

  const saveUserRoles = async () => {
    if (!userId) return;
    setBusy(true); setMessage('');
    try { await request(`/api/rbac/users/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds: userRoleIds }) }); await refresh(); setMessage('Funções do utilizador atualizadas e auditadas.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao guardar funções.'); }
    finally { setBusy(false); }
  };

  const createRole = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const result = await request('/api/rbac/roles', { method: 'POST', body: JSON.stringify({ name: newRoleName, description: newRoleDescription }) });
      setNewRoleName(''); setNewRoleDescription(''); await refresh(); setRoleId(result.role.id); setMessage('Função criada. Defina as permissões na matriz.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar função.'); }
    finally { setBusy(false); }
  };

  const deactivateRole = async () => {
    if (!roleId || !window.confirm('Desativar esta função? As atribuições existentes têm de ser removidas primeiro.')) return;
    setBusy(true); setMessage('');
    try { await request(`/api/rbac/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) }); await refresh(); setMessage('Função desativada e auditada.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao desativar função.'); }
    finally { setBusy(false); }
  };

  if (!catalog) return <div className="p-6 text-sm text-slate-600">{message || 'A carregar o catálogo de permissões…'}</div>;

  return (
    <section className="space-y-6 p-4 md:p-6" aria-labelledby="rbac-title">
      <header>
        <h2 id="rbac-title" className="text-lg font-semibold text-slate-900">Funções e permissões</h2>
        <p className="mt-1 text-sm text-slate-600">A autorização é aplicada no servidor. O catálogo técnico é gerido por migrações; aqui configura-se a matriz e as atribuições.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <h3 className="font-semibold text-slate-900">Matriz por função</h3>
          <div className="flex flex-wrap gap-3">
            <select aria-label="Função" className="min-w-56 rounded-lg border border-slate-300 px-3 py-2" value={roleId} onChange={event => setRoleId(event.target.value)}>
              {activeRoles.map(role => <option key={role.id} value={role.id}>{role.name}{role.is_system ? ' · sistema' : ''}</option>)}
            </select>
            {catalog.roles.find(role => role.id === roleId && !role.is_system) && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={deactivateRole}>Desativar função</Button>}
          </div>
          {modules.map(module => (
            <fieldset key={module} className="rounded-lg border border-slate-100 p-3">
              <legend className="px-1 text-sm font-semibold capitalize text-slate-700">{module}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {editablePermissions.filter(permission => permission.module === module).map(permission => (
                  <label key={permission.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={permissionCodes.includes(permission.code)} onChange={event => setPermissionCodes(codes => event.target.checked ? [...new Set([...codes, permission.code])] : codes.filter(code => code !== permission.code))} />
                    <span><span className="font-medium">{permission.action}</span><span className="block text-xs text-slate-500">{permission.description || permission.code}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <Button type="button" disabled={!roleId || busy || catalog.roles.find(role => role.id === roleId)?.code === 'SUPER_ADMIN'} onClick={savePermissions}>Guardar matriz</Button>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <h3 className="font-semibold text-slate-900">Funções por utilizador</h3>
            <select aria-label="Utilizador" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={userId} onChange={event => setUserId(event.target.value)}>
              {(catalog.users || []).filter(user => user.type !== 'External').map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
            </select>
            <div className="space-y-2">
              {activeRoles.map(role => <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={userRoleIds.includes(role.id)} onChange={event => setUserRoleIds(ids => event.target.checked ? [...new Set([...ids, role.id])] : ids.filter(id => id !== role.id))} />
                <span>{role.name}</span>
              </label>)}
            </div>
            <Button type="button" disabled={!userId || busy} onClick={saveUserRoles}>Guardar atribuições</Button>
          </div>

          <form onSubmit={createRole} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="font-semibold text-slate-900">Criar função personalizada</h3>
            <input aria-label="Nome da função" required maxLength={80} value={newRoleName} onChange={event => setNewRoleName(event.target.value)} placeholder="Nome" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            <textarea aria-label="Descrição da função" maxLength={500} value={newRoleDescription} onChange={event => setNewRoleDescription(event.target.value)} placeholder="Descrição (opcional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            <Button type="submit" disabled={busy || !newRoleName.trim()}>Criar função</Button>
          </form>
        </div>
      </div>
      {message && <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
    </section>
  );
}
