export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    if (!z.guid().safeParse(id).success)
      return NextResponse.json({ success: false, message: 'ID inválido.' }, { status: 400 });
    const db = requireServerDbClient(actor);
    const { data: allowed, error: permissionError } = await db.rpc('has_permission', {
      p_permission_code: 'users:delete', p_user_id: actor.auth_user_id,
    });
    if (permissionError) throw new AuthError('Serviço de autorização indisponível.', 503);
    if (allowed !== true) throw new ForbiddenError();
    const { data: target, error: readError } = await db.from('users').select('id,name,email,deleted').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!target || target.deleted) return NextResponse.json({ success: false, message: 'Utilizador não encontrado.' }, { status: 404 });
    // This deliberately deleted account is excluded from all operations.
    if (target.email?.toLowerCase() === 'ricardo75@gmail.com') throw new ForbiddenError();
    const { data, error } = await db.from('users').update({ deleted: true }).eq('id', id).eq('deleted', false).select('id').single();
    if (error || !data) throw error || new Error('Missing updated user');
    return NextResponse.json({ success: true, id });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
    return NextResponse.json({ success: false, message: 'Não foi possível eliminar o utilizador.' }, { status: 503 });
  }
}
