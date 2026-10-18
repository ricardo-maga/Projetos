import { randomBytes, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError } from '@/lib/auth/requireAuth';
import { authorizeRbac } from '@/lib/rbac/admin';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.enum(['projects:read', 'tasks:read'])).min(1),
  clientIds: z.array(z.uuid()).max(100).default([]),
  projectIds: z.array(z.uuid()).max(100).default([]),
  expiresAt: z.iso.datetime({ offset: true }),
  rateLimitPerMinute: z.number().int().min(1).max(600).default(60),
}).refine(value => value.clientIds.length + value.projectIds.length > 0, 'Indique clientes ou projetos autorizados.');

async function authorize(req: NextRequest) {
  return authorizeRbac(req, 'roles.manage');
}

function failure(error: unknown) {
  const status = error instanceof AuthError ? error.statusCode : 503;
  return NextResponse.json({ error: { code: status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
    message: status === 503 ? 'Serviço de integração indisponível.' : (error as Error).message } }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { db } = await authorize(req);
    const { data, error } = await db.from('api_integrations')
      .select('id,name,key_prefix,permissions,client_ids,project_ids,rate_limit_per_minute,expires_at,revoked_at,created_at,last_used_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await authorize(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success || (parsed.success && new Date(parsed.data.expiresAt).getTime() <= Date.now()))
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Dados ou validade da integração inválidos.' } }, { status: 422 });
    if (parsed.data.clientIds.length) {
      const { data: clients, error } = await db.from('clients').select('id').in('id', parsed.data.clientIds).eq('deleted', false);
      if (error) throw error;
      if (new Set((clients || []).map(row => row.id)).size !== new Set(parsed.data.clientIds).size)
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Cliente autorizado inexistente ou eliminado.' } }, { status: 422 });
    }
    if (parsed.data.projectIds.length) {
      const { data: projects, error } = await db.from('projects').select('id').in('id', parsed.data.projectIds).eq('deleted', false);
      if (error) throw error;
      if (new Set((projects || []).map(row => row.id)).size !== new Set(parsed.data.projectIds).size)
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Projeto autorizado inexistente ou eliminado.' } }, { status: 422 });
    }
    const key = `erp_int_${randomBytes(32).toString('base64url')}`;
    const { data, error } = await db.from('api_integrations').insert({
      name: parsed.data.name,
      key_hash: createHash('sha256').update(key).digest('hex'),
      key_prefix: key.slice(0, 16),
      permissions: parsed.data.permissions,
      client_ids: parsed.data.clientIds,
      project_ids: parsed.data.projectIds,
      rate_limit_per_minute: parsed.data.rateLimitPerMinute,
      expires_at: parsed.data.expiresAt,
      created_by: user.id,
    }).select('id,name,key_prefix,permissions,client_ids,project_ids,rate_limit_per_minute,expires_at').single();
    if (error) throw error;
    await logAuditEvent({ action: 'INTEGRATION_CREATED', userId: user.id, entity: 'api_integrations', entityId: data.id,
      details: { name: data.name, permissions: data.permissions, clientIds: data.client_ids, projectIds: data.project_ids } });
    return NextResponse.json({ data, key }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
