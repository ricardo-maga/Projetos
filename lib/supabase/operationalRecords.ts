import type { ProjectMaterial } from '@/lib/types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);

export function mapProjectMaterial(row: any): ProjectMaterial {
  return {
    id: row.id,
    syncVersion: row.sync_version,
    projectId: row.project_id || '',
    description: row.description || '',
    supplier: row.supplier || '',
    quantity: Number(row.quantity) || 1,
    reference: row.reference || '',
    budget: row.budget == null ? '' : String(row.budget),
    costPrice: Number(row.cost_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    expectedDeliveryDate: row.expected_delivery_date || '',
    status: row.status === 'em_stock' ? 'em_armazem' : row.status || 'por_encomendar',
    deleted: Boolean(row.deleted),
    createdDate: row.created_at || '',
  };
}

export async function getOperationalRecord<T>(
  db: any, table: 'project_materials', id: string,
  map: (row: any) => T,
): Promise<T | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from(table).select('*').eq('id', id).eq('deleted', false).maybeSingle();
  if (error) throw error;
  return data ? map(data) : null;
}

export async function activeRelationExists(db: any, table: 'clients' | 'users' | 'projects', id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  let query = db.from(table).select('id').eq('id', id).eq('deleted', false);
  if (table === 'users') query = query.eq('approved', true);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function parsePage(searchParams: URLSearchParams): { page: number; pageSize: number } | null {
  const rawPage = searchParams.get('page') || '1';
  const rawSize = searchParams.get('pageSize') || '50';
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawSize)) return null;
  const page = Number(rawPage);
  const pageSize = Number(rawSize);
  return Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100
    && Number.isSafeInteger((page - 1) * pageSize)
    ? { page, pageSize } : null;
}
