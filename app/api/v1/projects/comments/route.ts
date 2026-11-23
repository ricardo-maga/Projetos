import { createApiHandler } from '@/lib/apiErrors';
import { createProjectCommentSchema } from '@/lib/validations/apiInputs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';


async function handlePost(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;
  if (!(await checkRateLimit(`comment-create:${auth.user.id}`, { limit: 30, windowSeconds: 60 })).success)
    return NextResponse.json({ success: false, message: 'Demasiados pedidos.' }, { status: 429, headers: { 'Retry-After': '60' } });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: 'Pedido JSON inválido.' }, { status: 400 }); }
  const parsed = createProjectCommentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Comentário inválido.' }, { status: 400 });
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) return NextResponse.json({ success: false, message: 'Base de dados indisponível.' }, { status: 503 });
    const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', parsed.data.projectId).eq('deleted', false).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return NextResponse.json({ success: false, message: 'Projeto não encontrado.' }, { status: 404 });
    const { data, error } = await db.from('comments').insert({
      project_id: parsed.data.projectId, author_id: auth.user.id, comment: parsed.data.comment,
    }).select('id,project_id,author_id,comment,created_at').single();
    if (error || !data) throw error || new Error('Missing comment');
    return NextResponse.json({ success: true, data: {
      id: data.id, projectId: data.project_id, authorId: data.author_id,
      comment: data.comment, createdDate: data.created_at,
    } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, message: 'Não foi possível gravar o comentário.' }, { status: 503 });
  }
}

export const POST = createApiHandler(handlePost);
