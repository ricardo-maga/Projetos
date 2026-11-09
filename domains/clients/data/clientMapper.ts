export interface ClientRow {
  id: string;
  client_name?: string | null;
  short_name?: string | null;
  location?: string | null;
  tax_id?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  color?: string | null;
  version?: number | null;
  deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function mapClientRow(row: ClientRow, fallbackVersion = 1) {
  return {
    id: row.id,
    clientName: row.client_name || '',
    shortName: row.short_name || '',
    location: row.location || '',
    taxId: row.tax_id || '',
    contactPerson: row.contact_person || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    notes: row.notes || '',
    color: row.color || '#3b82f6',
    version: row.version || fallbackVersion,
    deleted: Boolean(row.deleted),
    createdAt: row.created_at,
    createdDate: row.created_at,
    updatedAt: row.updated_at,
  };
}
