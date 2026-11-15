import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/domains/administration/modules/rbacAdmin';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { isUuid } from '@/lib/security/identifiers';
import { clientIp } from '@/lib/security/clientIp';

export const dynamic = 'force-dynamic';

async function updateUserRoles(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
    const body = await req.json().catch(() => null);
    if (!Array.isArray(body?.roleIds) || body.roleIds.length > 32 || body.roleIds.some((roleId: unknown) => !isUuid(roleId))) {
      return NextResponse.json({ success: false, message: 'Lista de funções inválida.' }, { status: 400 });
    }
    const roleIds = [...new Set<string>(body.roleIds)];
    const { data: target, error: targetError } = await db.from('users').select('id,deleted').eq('id', id).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.deleted) return NextResponse.json({ success: false, message: 'Utilizador não encontrado.' }, { status: 404 });
    const { error } = await db.rpc('admin_replace_user_roles', {
      p_user_id: id, p_role_ids: roleIds, p_actor_id: user.id,
      p_ip: clientIp(req),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true });
  } catch (error) { return rbacError(error); }
}

export const PUT = withCanonicalErrors(updateUserRoles);
