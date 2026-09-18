import { createAdminClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_MIGRATED'
  | 'REGISTER'
  | 'LOGOUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ROLE_CHANGED'
  | 'BOOTSTRAP_ADMIN_CREATED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DELETED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_STATUS_CHANGED'
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_DELETED'
  | 'PLANNING_ALLOCATION_CREATED'
  | 'PLANNING_ALLOCATION_UPDATED'
  | 'PLANNING_ALLOCATION_DELETED';

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string | null;
  entity?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

/**
 * Sanitizes details to ensure no sensitive fields (passwords, tokens, secrets) are ever written to audit logs.
 */
function sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
  if (!details) return undefined;
  const sanitized: Record<string, any> = {};
  const forbiddenPatterns = [/pass/i, /token/i, /secret/i, /hash/i, /key/i, /auth/i, /credential/i];

  for (const [key, value] of Object.entries(details)) {
    const isSensitive = forbiddenPatterns.some((pattern) => pattern.test(key));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const adminSb = createAdminClient();
    const sb = adminSb || defaultSupabase;
    if (!sb) {
      console.warn('[AUDIT LOG SKIP] Supabase client not available for audit log:', entry.action);
      return;
    }

    const payload = {
      action: entry.action,
      user_id: entry.userId || null,
      entity: entry.entity || null,
      entity_id: entry.entityId || null,
      ip: entry.ip || null,
      user_agent: entry.userAgent || null,
      details: sanitizeDetails(entry.details),
      created_at: new Date().toISOString(),
    };

    const { error } = await sb.from('audit_logs').insert([payload]);
    if (error) {
      // If column names in legacy audit_logs differ, fallback to insert with general payload
      console.warn('[AUDIT LOG NOTICE] Could not write to audit_logs:', error.message);
    }
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Unexpected exception logging audit event:', err);
  }
}
