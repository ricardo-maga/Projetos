export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authorization';
import { unauthorized, internalServerError } from '@/lib/apiErrors';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return unauthorized('Sessão expirada ou utilizador não autenticado.', auth.requestId);
  }

  const { user } = auth;

  try {
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        preferredTheme: user.preferredTheme ?? null,
        type: user.type,
        approved: user.approved,
        deleted: false,
        roleId: user.roleId,
        roleIds: user.roleIds,
        isSuperAdmin: user.isSuperAdmin,
        isAdmin: user.isAdmin,
        permissions: user.permissions,
      },
    });
  } catch (error: any) {
    return internalServerError('Falha ao obter perfil do utilizador.', auth.requestId);
  }
}
