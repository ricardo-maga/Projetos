import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const cursorSchema = z.tuple([z.iso.datetime({ offset: true }), z.guid()]);
const code = z.string().regex(/^[a-z0-9_.:-]{1,80}$/i);
export const auditFilters = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  actor: z.guid().optional(),
  entity: z.guid().optional(),
  module: code.optional(),
  action: code.optional(),
  source: z.enum(['application', 'automation', 'system', 'legacy']).optional(),
  outcome: z.enum(['succeeded', 'failed', 'partial']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).refine(input => !input.from || !input.to || Date.parse(input.from) < Date.parse(input.to));

export type AuditFilters = z.infer<typeof auditFilters>;

export function decodeAuditCursor(value?: string) {
  if (!value) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

interface ProjectScope {
  id: string;
  modules: string[];
}

export async function queryAudit(db: SupabaseClient, filters: AuditFilters, scope?: ProjectScope) {
  const cursor = decodeAuditCursor(filters.cursor);
  const { data, error } = await db.rpc('query_application_audit', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_actor: filters.actor ?? null,
    p_entity: filters.entity ?? null,
    p_module: filters.module ?? null,
    p_action: filters.action ?? null,
    p_source: filters.source ?? null,
    p_outcome: filters.outcome ?? null,
    p_search: filters.search ?? null,
    p_cursor_time: cursor?.[0] ?? null,
    p_cursor_id: cursor?.[1] ?? null,
    p_limit: filters.limit + 1,
    p_project: scope?.id ?? null,
    p_modules: scope?.modules ?? null,
  });
  if (error) throw error;

  const rows = data as AuditRow[];
  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);
  return {
    data: page.map(row => ({
      id: row.id, timestamp: row.created_at, createdDate: row.created_at,
      userId: row.actor_id || row.user_id, userName: row.user_name,
      action: row.action, entityType: row.entity_type, entityId: row.entity_id,
      entityName: row.entity_name, projectId: row.project_id,
      changes: scope && row.changes?.project_id?.before && row.changes.project_id.after
        ? null : row.changes,
      source: row.source || 'legacy', outcome: row.outcome,
      requestId: row.request_id,
    })),
    nextCursor: rows.length > filters.limit && last
      ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString('base64url')
      : null,
  };
}

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string | null;
  actor_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string | null;
  source: string | null;
  outcome: string | null;
  request_id: string | null;
  changes: Record<string, { before?: unknown; after?: unknown; changed?: boolean }> | null;
}

export function auditCsvCell(value: unknown): string {
  const cell = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  const safe = /^[\s\uFEFF]*[=+\-@\t\r\n]/u.test(cell) ? "'" + cell : cell;
  return '"' + safe.replaceAll('"', '""') + '"';
}
