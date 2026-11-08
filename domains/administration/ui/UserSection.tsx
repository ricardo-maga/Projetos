'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Users, UserCheck, Edit2, ShieldCheck } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { hasPermission } from '@/lib/permissions';

// UI Foundation Components
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { M3SectionHeader, M3SegmentedControl } from '@/components/M3';
import RolePermissionSection from './RolePermissionSection';
import { useAsyncAction } from '@/hooks/useAsyncAction';

interface UserSectionProps {
  users: any[];
  userGroups: any[];
  onRefreshFromDatabase?: () => Promise<boolean>;
  addUser: (user: any) => Promise<string | null> | string | null | void;
  updateUser: (id: string, updates: any) => Promise<boolean> | boolean | void;
  deleteUser: (id: string) => void;
  hideUsers?: boolean;
  hideRoles?: boolean;
  currentUser?: any;
}

export default function UserSection({
  users,
  userGroups,
  onRefreshFromDatabase,
  addUser,
  updateUser,
  deleteUser,
  hideUsers = false,
  hideRoles = false,
  currentUser,
}: UserSectionProps) {
  const canReadUsers = hasPermission(currentUser, 'users_read');
  const canWriteUsers = hasPermission(currentUser, 'users_write');
  const canDeleteUsers = hasPermission(currentUser, 'users_delete');

  const [subTab, setSubTab] = useState<'users' | 'roles'>('users');
  const { busy: isSavingUser, run: runUserAction } = useAsyncAction();
  const [filterRoleId, setFilterRoleId] = useState<string>('all');
  const [rbacRoles, setRbacRoles] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [rbacUserRoles, setRbacUserRoles] = useState<Array<{ user_id: string; role_id: string }>>([]);

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

  // User Form State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uPasswordConfirm, setUPasswordConfirm] = useState('');
  const [uType, setUType] = useState<'Team' | 'Sales' | 'Admin' | 'External' | 'Other'>('Team');
  const [uRoleIds, setURoleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!hasPermission(currentUser, 'roles_read' as any)) return;
    fetch('/api/rbac/catalog', {
      credentials: 'same-origin',
    }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível carregar as funções.');
      setRbacRoles((result.roles || []).filter((role: any) => role.is_active));
      setRbacUserRoles(result.userRoles || []);
    }).catch(error => console.error('Falha ao carregar funções RBAC:', error));
  }, [currentUser, userGroups]);

  const startAddUser = () => {
    setEditingUser(null);
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setUType('Team');
    setURoleIds([]);
    setIsAddingUser(true);
  };

  const startEditUser = (user: any) => {
    setIsAddingUser(false);
    setEditingUser(user);
    setUName(user.name);
    setUEmail(user.email);
    setUPassword('');
    setUPasswordConfirm('');
    setUType(user.type || 'Team');
    setURoleIds(rbacUserRoles.filter(assignment => assignment.user_id === user.id).map(assignment => assignment.role_id));
  };

  const assignUserRoles = async (targetUserId: string, roleIds: string[]) => {
    const response = await fetch(`/api/rbac/users/${targetUserId}/roles`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível guardar as funções atribuídas.');
    setRbacUserRoles(current => [...current.filter(assignment => assignment.user_id !== targetUserId), ...roleIds.map(role_id => ({ user_id: targetUserId, role_id }))]);
    const refreshed = await onRefreshFromDatabase?.();
    if (refreshed === false) alert('Funções atribuídas, mas não foi possível atualizar a lista de utilizadores. Recarregue a página.');
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runUserAction(async () => {
    if (!canWriteUsers) {
      alert('Não tem permissão para criar utilizadores.');
      return;
    }
    if (!uName || !uEmail) {
      alert('Por favor, preencha o nome e email do utilizador.');
      return;
    }
    if (!uPassword) {
      alert('Por favor, defina uma password para o novo utilizador.');
      return;
    }
    if (uPassword !== uPasswordConfirm) {
      alert('As passwords introduzidas não coincidem.');
      return;
    }
    if (canManageRoleAssignments && !uRoleIds.length) {
      alert('Atribua pelo menos uma função ao utilizador.');
      return;
    }
    let newUserId: string | null | void;
    try { newUserId = await addUser({
      name: uName,
      email: uEmail,
      password: uPassword,
      type: uType,
    }); } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível criar o utilizador.');
      return;
    }
    if (!newUserId) {
      alert('Não foi possível gravar o utilizador na base de dados.');
      return;
    }
    if (canManageRoleAssignments && uRoleIds.length) {
      try { await assignUserRoles(newUserId, uRoleIds); }
      catch (error) { alert(error instanceof Error ? `Utilizador criado, mas não foi possível atribuir funções: ${error.message}` : 'Utilizador criado, mas a atribuição de funções falhou.'); }
    }
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setURoleIds([]);
    setIsAddingUser(false);
    });
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runUserAction(async () => {
    if (!canWriteUsers) {
      alert('Não tem permissão para editar utilizadores.');
      return;
    }
    if (!editingUser) return;
    if (!uName || !uEmail) {
      alert('Por favor, preencha o nome e email do utilizador.');
      return;
    }
    if (canManageRoleAssignments && !uRoleIds.length) {
      alert('Atribua pelo menos uma função ao utilizador.');
      return;
    }

    const updates: any = {
      name: uName,
      email: uEmail,
      type: uType,
    };

    if (uPassword) {
      if (uPassword !== uPasswordConfirm) {
        alert('As passwords introduzidas não coincidem.');
        return;
      }
      updates.password = uPassword;
    }

    let userUpdated: boolean | void;
    try { userUpdated = await updateUser(editingUser.id, updates); }
    catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar o utilizador.');
      return;
    }
    if (userUpdated === false) {
      alert('Não foi possível guardar as alterações do utilizador.');
      return;
    }
    if (canManageRoleAssignments) {
      try { await assignUserRoles(editingUser.id, uRoleIds); }
      catch (error) { alert(error instanceof Error ? `Dados atualizados, mas não foi possível guardar as funções: ${error.message}` : 'Dados atualizados, mas a atribuição de funções falhou.'); }
    }
    setUName('');
    setUEmail('');
    setUPassword('');
    setUPasswordConfirm('');
    setEditingUser(null);
    });
  };

  const getAssignedRoleNames = (targetUserId: string) => rbacUserRoles
    .filter(assignment => assignment.user_id === targetUserId)
    .map(assignment => rbacRoles.find(role => role.id === assignment.role_id)?.name)
    .filter((name): name is string => !!name);

  const getUserInitials = (name: string) => name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase();

  const canManageRoleAssignments = hasPermission(currentUser, 'roles_manage' as any);
  const canReadRoleAdmin = canManageRoleAssignments;
  const managementTabs: Array<{ value: 'users' | 'roles'; label: string }> = [
    ...(!hideUsers ? [{ value: 'users' as const, label: 'Utilizadores' }] : []),
    ...(canReadRoleAdmin && !hideRoles ? [{ value: 'roles' as const, label: 'Funções e permissões' }] : []),
  ];

  return (
    <div className="space-y-6">

      {managementTabs.length > 1 && <M3SegmentedControl
        label="Secção de administração"
        value={subTab}
        options={managementTabs}
        onChange={value => setSubTab(value)}
        className="w-fit"
      />}
      {subTab === 'users' && (
        // USERS DIRECTORY SECTION
        <div className="space-y-6">
          {isAddingUser || editingUser ? (
            <form onSubmit={isAddingUser ? handleAddUserSubmit : handleEditUserSubmit} className="m3-card p-5 space-y-6 animate-fade-in text-sm text-text-primary">
              <div className="flex justify-between items-center pb-4 border-b border-border">
                <h2 className="text-heading-sm font-semibold text-text-primary">
                  {isAddingUser ? 'Adicionar utilizador' : 'Editar utilizador'}
                </h2>
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={() => {
                    setIsAddingUser(false);
                    setEditingUser(null);
                  }}
                  className="rounded-control border border-border bg-surface-muted px-3 py-1.5 text-text-secondary hover:text-text-primary"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="block text-slate-500">Nome *</label>
                  <input
                    type="text"
                    required
                    value={uName}
                    onChange={e => setUName(e.target.value)}
                    placeholder="Ex: António Pereira"
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">E-mail *</label>
                  <input
                    type="email"
                    required
                    value={uEmail}
                    onChange={e => setUEmail(e.target.value)}
                    placeholder="Ex: apereira@email.pt"
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Password {isAddingUser ? '*' : editingUser && !editingUser.authUserId ? '(Necessária para ativar a conta)' : '(Deixe em branco para manter a atual)'}</label>
                  {!isAddingUser && editingUser && !editingUser.authUserId && (
                    <p className="text-xs text-amber-700">Este perfil não tem conta de autenticação. Defina uma password para criar a conta e permitir o acesso.</p>
                  )}
                  <input
                    type="password"
                    required={isAddingUser || Boolean(editingUser && !editingUser.authUserId)}
                    minLength={12}
                    value={uPassword}
                    onChange={e => setUPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500">Confirmar Password {isAddingUser ? '*' : ''}</label>
                  <input
                    type="password"
                    required={isAddingUser && !!uPassword}
                    minLength={12}
                    value={uPasswordConfirm}
                    onChange={e => setUPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                {canManageRoleAssignments ? <fieldset className="md:col-span-2 rounded-xl border border-border bg-surface-muted/50 p-4 space-y-3">
                  <legend className="px-1 text-sm font-semibold text-text-primary">Funções na aplicação</legend>
                  <p className="text-xs font-normal text-text-secondary">As permissões efetivas são a união das funções selecionadas. A atribuição é auditada.</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rbacRoles.map(role => (
                      <label key={role.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${uRoleIds.includes(role.id) ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-muted'}`}>
                        <input type="checkbox" checked={uRoleIds.includes(role.id)} onChange={event => setURoleIds(ids => event.target.checked ? [...new Set([...ids, role.id])] : ids.filter(id => id !== role.id))} className="mt-0.5 accent-primary" />
                        <span className="min-w-0"><span className="block text-sm font-semibold text-text-primary">{role.name}</span><span className="block text-[11px] font-normal text-text-muted">{role.code}</span></span>
                      </label>
                    ))}
                  </div>
                  {!rbacRoles.length && <p className="text-sm font-medium text-warning">Não foi possível carregar as funções disponíveis.</p>}
                </fieldset> : <div className="md:col-span-2 rounded-xl border border-border bg-surface-muted/50 p-4">
                  <p className="text-sm font-semibold text-text-primary">Funções atribuídas</p>
                  <div className="mt-2 flex flex-wrap gap-2">{getAssignedRoleNames(editingUser?.id || '').length ? getAssignedRoleNames(editingUser?.id || '').map(name => <span key={name} className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-xs text-primary">{name}</span>) : <span className="text-sm text-text-secondary">Sem função atribuída. Solicite a um Super Administrador que configure o acesso.</span>}</div>
                </div>}
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingUser}
                  onClick={() => {
                    setIsAddingUser(false);
                    setEditingUser(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  isLoading={isSavingUser}
                >
                  {isAddingUser ? 'Adicionar Recurso' : 'Gravar Alterações'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="m3-card overflow-hidden text-sm animate-fade-in">

              <div className="flex flex-col justify-between gap-3 border-b border-border bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:p-5">
                <div>
                  <h2 className="text-heading-sm font-semibold text-text-primary">Utilizadores</h2>
                  <p className="mt-0.5 text-sm text-text-secondary">Utilizadores ativos na plataforma</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="whitespace-nowrap text-sm font-medium text-text-secondary">Função:</span>
                    <select
                      value={filterRoleId}
                      onChange={e => setFilterRoleId(e.target.value)}
                      className="cursor-pointer rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="all">Todas as funções</option>
                      {rbacRoles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    onClick={startAddUser}
                  >
                    <Plus className="w-4 h-4" /> Novo utilizador
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[700px] text-left border-collapse">
                  <thead className="select-none whitespace-nowrap border-b border-border bg-surface-muted/70 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Nome</th>
                    <th className="px-5 py-3.5 text-left">E-mail</th>
                    <th className="px-5 py-3.5 text-left">Funções / Permissões</th>
                    <th className="px-5 py-3.5 text-left">Estado</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {users
                    .filter(u => !u.deleted)
                    .filter(u => filterRoleId === 'all' || rbacUserRoles.some(assignment => assignment.user_id === u.id && assignment.role_id === filterRoleId))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
                    .map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-extrabold text-xs">
                            {getUserInitials(u.name)}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-800 text-sm">{u.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-slate-500">{u.email}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {getAssignedRoleNames(u.id).length ? getAssignedRoleNames(u.id).map(name => (
                            <span key={name} className="px-2 py-1 bg-primary/5 border border-primary/15 rounded-md text-[11px] font-medium text-primary">{name}</span>
                          )) : <span className="text-xs text-text-muted">Sem função atribuída</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                          <UserCheck className="w-3.5 h-3.5" /> Ativo
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEditUser(u)}
                            className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" /> Editar
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => askConfirmation(
                              'Confirmar Eliminação de Utilizador',
                              `Aviso: Isto irá remover permanentemente o utilizador ${u.name} (${u.email}) do diretório de colaboradores ativos. Pretende continuar?`,
                              () => deleteUser(u.id)
                            )}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            Apagar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

            </div>
          )}
        </div>
      )}

      {subTab === 'roles' && canReadRoleAdmin && <RolePermissionSection onRolesChanged={onRefreshFromDatabase} />}
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
