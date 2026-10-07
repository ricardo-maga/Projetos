import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/lib/rbac/admin';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const { id } = await params;
    const body = await req.json();
    if (!Array.isArray(body?.roleIds) || body.roleIds.length > 32 || body.roleIds.some((roleId: unknown) => typeof roleId !== 'string')) {
      return NextResponse.json({ success: false, message: 'Lista de funções inválida.' }, { status: 400 });
    }
    const roleIds = [...new Set<string>(body.roleIds)];
    const forwarded = req.headers.get('x-forwarded-for');
    const { error } = await db.rpc('admin_replace_user_roles', {
      p_user_id: id, p_role_ids: roleIds, p_actor_id: user.id,
      p_ip: forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip'),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true });
  } catch (error) { return rbacError(error); }
}
