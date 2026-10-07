import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/lib/rbac/admin';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const { id } = await params;
    const body = await req.json();
    if (!Array.isArray(body?.permissionCodes) || body.permissionCodes.length > 300 || body.permissionCodes.some((code: unknown) => typeof code !== 'string')) {
      return NextResponse.json({ success: false, message: 'Lista de permissões inválida.' }, { status: 400 });
    }
    const { data: role, error: roleError } = await db.from('roles').select('id,code').eq('id', id).maybeSingle();
    if (roleError) throw roleError;
    if (!role) return NextResponse.json({ success: false, message: 'Função não encontrada.' }, { status: 404 });
    const { data: permissions, error: permissionError } = await db.from('permissions').select('id,code').eq('is_active', true).in('code', body.permissionCodes);
    if (permissionError) throw permissionError;
    if ((permissions || []).length !== new Set(body.permissionCodes).size) return NextResponse.json({ success: false, message: 'O catálogo mudou; atualize e tente novamente.' }, { status: 409 });
    const forwarded = req.headers.get('x-forwarded-for');
    const { error } = await db.rpc('admin_replace_role_permissions', {
      p_role_id: id, p_permission_ids: (permissions || []).map(item => item.id), p_actor_id: user.id,
      p_ip: forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip'),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true });
  } catch (error) { return rbacError(error); }
}
