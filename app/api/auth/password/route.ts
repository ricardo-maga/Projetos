import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/requireAuth';
import { createClient } from '@/lib/supabase/server';
import { passwordResetConfirmSchema } from '@/lib/validations/auth';

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const parsed = passwordResetConfirmSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: 'A password deve ter no mínimo 12 caracteres.' }, { status: 400 });
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return NextResponse.json({ success: false, message: 'Não foi possível alterar a password.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: 'Sessão inválida ou expirada.' }, { status });
  }
}
