import { createAdminClient } from '@/lib/supabase/server';

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
  | 'USER_ACCESS_ACTIVATED'
  | 'USER_OPERATION_FAILED'
  | 'PRESALES_ASSET_UPLOAD_FAILED'
  | 'USER_DELETED'
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
  | 'PLANNING_ALLOCATION_DELETED'
  | 'INTEGRATION_CREATED'
  | 'INTEGRATION_REVOKED';

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string | null;
  userName?: string;
  entity?: string;
  entityId?: string;
  requestId?: string;
  outcome?: 'succeeded' | 'failed' | 'partial';
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
  const forbiddenPatterns = [/pass/i, /token/i, /secret/i, /hash/i, /key/i, /auth/i, /credential/i, /email/i];

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
    const sb = adminSb;
    if (!sb) {
      console.warn('[AUDIT LOG SKIP] Supabase client not available for audit log:', entry.action);
      return;
    }

    const details = sanitizeDetails(entry.details) || {};
    const changes = Object.fromEntries(
      ['compensationCompleted', 'accessEnabled', 'field', 'method']
        .filter(field => typeof details[field] === 'boolean' || typeof details[field] === 'string')
        .map(field => [field, { after: details[field] }]),
    );
    const payload = {
      audit_version: 1,
      actor_id: entry.userId || null,
      source: 'application',
      outcome: entry.outcome || 'succeeded',
      request_id: entry.requestId || crypto.randomUUID(),
      action: entry.action,
      user_id: entry.userId || null,
      user_name: entry.userName || null,
      entity_type: entry.entity || 'SYSTEM',
      entity_id: entry.entityId || null,
      details: JSON.stringify(details),
      changes,
      created_at: new Date().toISOString(),
    };

    const { error } = await sb.from('audit_logs').insert([payload]);
    if (error) {
      console.warn('[AUDIT LOG NOTICE] Could not write to audit_logs:', error.message);
    }
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Unexpected exception logging audit event:', err);
  }
}
