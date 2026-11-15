import { NextRequest, NextResponse } from 'next/server';
import { authorizeRbac, databaseError, rbacError } from '@/domains/administration/modules/rbacAdmin';
import { withCanonicalErrors } from '@/lib/apiErrors';
import { clientIp } from '@/lib/security/clientIp';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const roleInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(''),
});

async function createRole(req: NextRequest) {
  try {
    const { user, db } = await authorizeRbac(req, 'roles.manage');
    const parsed = roleInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Indique um nome (máximo 80 caracteres) e uma descrição até 500 caracteres.' }, { status: 400 });
    }
    const { name, description } = parsed.data;
    const id = crypto.randomUUID();
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'ROLE';
    const code = `CUSTOM_${slug}_${id.slice(0, 8).replace(/-/g, '').toUpperCase()}`;
    const { data, error } = await db.rpc('admin_create_role', {
      p_id: id, p_code: code, p_name: name, p_description: description, p_actor_id: user.id,
      p_ip: clientIp(req),
      p_user_agent: req.headers.get('user-agent'), p_request_id: req.headers.get('x-request-id'),
    });
    if (error) return databaseError(error);
    return NextResponse.json({ success: true, role: data }, { status: 201 });
  } catch (error) { return rbacError(error); }
}

export const POST = withCanonicalErrors(createRole);
