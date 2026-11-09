import type { ClientRow } from './clientMapper';

// The repository is the only Clients module that knows table and column names.
// The existing server client has multiple runtime variants, hence this narrow
// structural boundary keeps its query builder details out of the use cases.
export type ClientDatabase = {
  from(table: string): any;
};

export async function findClients(db: ClientDatabase, page: number, pageSize: number, search: string) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = db.from('clients').select('*', { count: 'exact' }).eq('deleted', false);
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`client_name.ilike.${q},short_name.ilike.${q},contact_person.ilike.${q},contact_email.ilike.${q},contact_phone.ilike.${q},tax_id.ilike.${q},location.ilike.${q}`);
  }
  return query.order('client_name', { ascending: true }).range(from, to) as Promise<{
    data: ClientRow[] | null; count: number | null; error: { message: string } | null;
  }>;
}

export async function findClient(db: ClientDatabase, id: string, activeOnly = false) {
  let query = db.from('clients').select('*').eq('id', id);
  if (activeOnly) query = query.eq('deleted', false);
  return query.maybeSingle() as Promise<{ data: ClientRow | null; error: { message: string } | null }>;
}

export async function insertClient(db: ClientDatabase, payload: Record<string, unknown>) {
  return db.from('clients').insert([payload]) as Promise<{ error: { message: string } | null }>;
}

export async function updateClientRow(db: ClientDatabase, id: string, payload: Record<string, unknown>, version?: number) {
  let query = db.from('clients').update(payload).eq('id', id);
  if (version !== undefined) query = query.eq('version', version);
  return query as Promise<{ error: { message: string } | null }>;
}

export async function findActiveProjects(db: ClientDatabase, clientId: string) {
  return db.from('projects').select('id, project_title, deleted').eq('client_id', clientId).eq('deleted', false) as Promise<{
    data: Array<{ id: string }> | null; error: { message: string } | null;
  }>;
}
