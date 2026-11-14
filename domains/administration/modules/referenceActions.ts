import { getAuthHeaders } from '@/lib/clientAuth';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';
import type { ReferenceCollection } from '../data/referenceData';

type Row = { id: string; syncVersion?: number; sync_version?: number; deleted?: boolean };
const versionOf = (row: Row) => Number(row.syncVersion ?? row.sync_version) || 0;

export function createReferenceActions({ state, setState, refreshFromDatabase }: Pick<LegacyActionContext, 'state' | 'setState' | 'refreshFromDatabase'>) {
  const write = async (method: 'POST' | 'PATCH' | 'DELETE', collection: ReferenceCollection, body: Record<string, unknown>, reorder = false) => {
    try {
      const response = await fetch(reorder ? '/api/v1/reference-data/reorder' : '/api/v1/reference-data', {
        method: reorder ? 'POST' : method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, ...body }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        if (response.status === 409) void refreshFromDatabase();
        return { success: false, message: result.message || 'Não foi possível guardar a opção.' };
      }
      setState(prev => {
        if (!prev) return prev;
        const rows = (prev[collection] || []) as Row[];
        const saved = reorder ? result.data as Row[] : method === 'DELETE' ? [{ id: result.id, deleted: true }] : [result.data as Row];
        const byId = new Map(saved.map(row => [row.id, row]));
        const next = rows.map(row => byId.has(row.id) ? { ...row, ...byId.get(row.id) } : row);
        if (method === 'POST' && !reorder) next.push(result.data as Row);
        return { ...prev, [collection]: next };
      });
      return { success: true };
    } catch { return { success: false, message: 'Falha de comunicação ao guardar a opção.' }; }
  };
  const addAuxRecord = (collection: ReferenceCollection, name: string, extra?: { scale?: number; color?: string }) =>
    write('POST', collection, { fields: { name, ...extra } });
  const updateAuxRecord = (collection: ReferenceCollection, id: string, updates: { name?: string; scale?: number; color?: string }) => {
    const row = ((state?.[collection] || []) as Row[]).find(item => item.id === id);
    if (!row || !versionOf(row)) return Promise.resolve({ success: false, message: 'Recarregue as opções antes de alterar.' });
    return write('PATCH', collection, { id, syncVersion: versionOf(row), fields: updates });
  };
  const deleteAuxRecord = (collection: ReferenceCollection, id: string) => {
    const row = ((state?.[collection] || []) as Row[]).find(item => item.id === id);
    if (!row || !versionOf(row)) return Promise.resolve({ success: false, message: 'Recarregue as opções antes de eliminar.' });
    return write('DELETE', collection, { id, syncVersion: versionOf(row) });
  };
  const reorderAuxRecords = (collection: ReferenceCollection, newItems: Row[]) => {
    const rows = newItems.map((row, index) => ({ id: row.id, syncVersion: versionOf(row), sortOrder: index }));
    if (rows.some(row => !row.syncVersion)) return Promise.resolve({ success: false, message: 'Recarregue as opções antes de reordenar.' });
    return write('POST', collection, { rows }, true);
  };
  return { addAuxRecord, updateAuxRecord, deleteAuxRecord, reorderAuxRecords };
}
