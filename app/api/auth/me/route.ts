import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authorization';
import { unauthorized, internalServerError } from '@/lib/apiErrors';
import { createClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.user) {
    return unauthorized('Sessão expirada ou utilizador não autenticado.', auth.requestId);
  }

  const { user } = auth;

  try {
    const sb = (await createClient()) || defaultSupabase;
    let permissions: string[] = [];

    // If role has granular permissions in role_permissions table, load them
    if (sb && user.roleId) {
      try {
        const { data: rolePerms } = await sb
          .from('role_permissions')
          .select('permissions(code)')
          .eq('role_id', user.roleId);

        if (rolePerms && rolePerms.length > 0) {
          permissions = rolePerms
            .map((rp: any) => rp.permissions?.code)
            .filter(Boolean);
        }
      } catch {
        // Fallback to role-based defaults
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        type: user.type,
        roleId: user.roleId,
        isAdmin: user.isAdmin,
        permissions: permissions.length > 0 ? permissions : undefined,
      },
    });
  } catch (error: any) {
    return internalServerError('Falha ao obter perfil do utilizador.', auth.requestId);
  }
}
