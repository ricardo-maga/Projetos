import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/lib/rbac/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const { id } = await params;
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) return NextResponse.json({ success: false, message: 'Indique os campos a alterar.' }, { status: 400 });
    const forwarded = req.headers.get('x-forwarded-for');
    const { data, error } = await db.rpc('admin_update_role', {
      p_role_id: id, p_changes: body, p_actor_id: user.id,
      p_ip: forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip'),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true, role: data });
  } catch (error) { return rbacError(error); }
}
