import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/lib/rbac/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (!name || name.length > 80 || description.length > 500) {
      return NextResponse.json({ success: false, message: 'Indique um nome (máximo 80 caracteres) e uma descrição até 500 caracteres.' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'ROLE';
    const code = `CUSTOM_${slug}_${id.slice(0, 8).replace(/-/g, '').toUpperCase()}`;
    const forwarded = req.headers.get('x-forwarded-for');
    const { data, error } = await db.rpc('admin_create_role', {
      p_id: id, p_code: code, p_name: name, p_description: description, p_actor_id: user.id,
      p_ip: forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip'),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true, role: data }, { status: 201 });
  } catch (error) { return rbacError(error); }
}
