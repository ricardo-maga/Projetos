import { createApiHandler } from '@/lib/apiErrors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requirePermission } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { auditFilters, decodeAuditCursor, queryAudit } from '@/domains/administration/modules/auditQuery';

export const dynamic = 'force-dynamic';

async function handleGet(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = auditFilters.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!z.guid().safeParse(id).success || !parsed.success ||
      (parsed.data.cursor && !decodeAuditCursor(parsed.data.cursor))) {
    return NextResponse.json({ success: false, message: 'Parâmetros inválidos.' }, { status: 400 });
  }
  try {
    const user = await requirePermission(req, 'projects:read');
    const db = requireServerDbClient(user);
    const { data: project, error } = await db.from('projects').select('id').eq('id', id).eq('deleted', false).maybeSingle();
    if (error) throw error;
    if (!project) return NextResponse.json({ success: false, message: 'Projeto não encontrado.' }, { status: 404 });
    const modules = ['project', 'risk', 'comment'];
    await Promise.all([['tasks:read', 'task'], ['project_materials:read', 'material']].map(async ([code, module]) => {
      const { data, error } = await db.rpc('has_permission', { p_permission_code: code, p_user_id: user.auth_user_id });
      if (error) throw error;
      if (data === true) modules.push(module);
    }));
    const page = await queryAudit(db, parsed.data, { id, modules });
    return NextResponse.json({ success: true, ...page }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
    console.error('[PROJECT HISTORY]', error);
    return NextResponse.json({ success: false, message: 'Não foi possível consultar o histórico.' }, { status: 503 });
  }
}

export const GET = createApiHandler(handleGet);
