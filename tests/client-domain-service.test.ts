import { describe, expect, it } from 'bun:test';
import { ClientFailure, createClient, editClient } from '../domains/clients/modules/clientService';

function clientDb() {
  const rows: Record<string, any> = {};
  const db = {
    from(table: string) {
      expect(table).toBe('clients');
      let id = '';
      let expectedVersion: number | undefined;
      let pendingUpdate: Record<string, unknown> | undefined;
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          if (column === 'id') id = String(value);
          if (column === 'version') expectedVersion = Number(value);
          return query;
        },
        maybeSingle: async () => ({ data: rows[id] || null, error: null }),
        insert: async (items: any[]) => { rows[items[0].id] = { ...items[0] }; return { error: null }; },
        update: (payload: Record<string, unknown>) => { pendingUpdate = payload; return query; },
        then: (resolve: (value: unknown) => void) => {
          if (pendingUpdate && rows[id] && (expectedVersion === undefined || rows[id].version === expectedVersion)) {
            rows[id] = { ...rows[id], ...pendingUpdate };
          }
          resolve({ error: null });
        },
      };
      return query;
    },
  };
  return { db, rows };
}

describe('Clientes — serviço de escrita', () => {
  it('cria, relê e atualiza com a versão submetida', async () => {
    const { db, rows } = clientDb();
    const id = 'e644203e-7dd9-4469-b0b9-46dc212946b3';
    const created = await createClient(db, {
      id, clientName: 'Cliente Inicial', shortName: '', location: 'Lisboa', taxId: '123',
      contactPerson: '', contactEmail: '', contactPhone: '', notes: '', color: '#123456',
    }, 'user-1');
    expect(created).toMatchObject({ id, clientName: 'Cliente Inicial', version: 1, deleted: false });
    expect(rows[id]).toMatchObject({ client_name: 'Cliente Inicial', created_by: 'user-1' });

    const updated = await editClient(db, id, { clientName: 'Cliente Atualizado', version: 1 }, 'user-2');
    expect(updated).toMatchObject({ clientName: 'Cliente Atualizado', version: 2 });
    expect(rows[id]).toMatchObject({ client_name: 'Cliente Atualizado', updated_by: 'user-2', version: 2 });
  });

  it('rejeita a atualização com uma versão antiga', async () => {
    const { db, rows } = clientDb();
    rows['c1'] = { id: 'c1', client_name: 'Cliente', version: 3, deleted: false };
    await expect(editClient(db, 'c1', { clientName: 'Novo', version: 2 }, 'user-1')).rejects.toMatchObject({
      status: 409, details: { currentVersion: 3, submittedVersion: 2 },
    } satisfies Partial<ClientFailure>);
    expect(rows['c1'].client_name).toBe('Cliente');
  });
});
