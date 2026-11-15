import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/domains/administration/modules/rbacAdmin';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { z } from 'zod';
import { isUuid } from '@/lib/security/identifiers';
import { clientIp } from '@/lib/security/clientIp';

export const dynamic = 'force-dynamic';

async function updateRole(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
    const parsed = z.object({ name: z.string().trim().min(1).max(80).optional(),
      description: z.string().max(500).optional(), is_active: z.boolean().optional() }).strict()
      .refine(value => Object.keys(value).length > 0).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: 'Indique campos válidos a alterar.' }, { status: 400 });
    const { data, error } = await db.rpc('admin_update_role', {
      p_role_id: id, p_changes: parsed.data, p_actor_id: user.id,
      p_ip: clientIp(req),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true, role: data });
  } catch (error) { return rbacError(error); }
}

export const PATCH = withCanonicalErrors(updateRole);
