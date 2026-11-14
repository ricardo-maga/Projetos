import type { User } from '@/lib/types';
import { getAuthHeaders } from '@/lib/clientAuth';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createUserActions({ state, refreshFromDatabase }: Pick<LegacyActionContext, 'state' | 'refreshFromDatabase'>) {
  // ==================== USERS CRUD ====================
  const addUser = async (user: Pick<User, 'name' | 'email' | 'type'> & { password: string }) => {
    const response = await fetch('/api/users', {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ name: user.name, email: user.email, type: user.type, password: user.password }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível criar o utilizador.');
    await refreshFromDatabase();
    return result.id as string;
  };

  const updateUser = async (id: string, updates: Partial<Omit<User, 'id' | 'createdDate'>> & { password?: string }) => {
    const existing = state?.users?.find(u => u.id === id);
    if (!existing) throw new Error('Utilizador não encontrado.');
    const response = await fetch('/api/users', {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ id, name: updates.name ?? existing.name, email: updates.email ?? existing.email,
        type: updates.type ?? existing.type, password: updates.password }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível atualizar o utilizador.');
    await refreshFromDatabase();
    return true;
  };

  const deleteUser = async (id: string) => {
    const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.message || 'Não foi possível eliminar o utilizador.');
    await refreshFromDatabase();
    return { success: true };
  };

  return { addUser, updateUser, deleteUser };
}
