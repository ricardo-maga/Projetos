import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ 
      success: false, 
      message: 'Supabase não está configurado no servidor.' 
    }, { status: 500 });
  }

  try {
    const user = await requireAuth(req);

    let token: string | undefined;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    const authClient = (await createClient(token)) || supabase;
    const clientToUse = createAdminClient() || authClient;
    const result = await getActiveStateFromSupabase(clientToUse);

    if (!result.success || !result.data) {
      return NextResponse.json({ 
        success: false, 
        message: result.message || 'Falha ao sincronizar com a base de dados.' 
      }, { status: 500 });
    }

    // Strip passwords for EVERYONE for maximum security
    if (result.data.users) {
      result.data.users = result.data.users.map((u: any) => {
        const { password, ...rest } = u;
        return rest;
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({
        success: false,
        message: error.message || 'Sem permissão para realizar esta operação.',
      }, { status: 403 });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ 
        success: false, 
        message: error.message || 'Sessão inválida ou expirada.' 
      }, { status: error.statusCode || 401 });
    }
    return NextResponse.json({ 
      success: false, 
      message: formatSupabaseError(error) 
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ 
      success: false, 
      message: 'Supabase não está configurado no servidor.' 
    }, { status: 500 });
  }

  try {
    const user = await requireAuth(req);

    // Extract state
    const state = await req.json();

    // Passwords live exclusively in Supabase Auth and are never part of ERP state.
    if (state.users) state.users = state.users.map(({ password, ...u }: any) => u);

    const isAdmin = user.is_admin || user.role_id === 'ug-1' || user.role_id === '00000000-0000-0000-0000-000000000001';

    // Non-admin users cannot alter userGroups, appConfiguration, or modify administrative user attributes
    if (!isAdmin) {
      delete state.userGroups;
      delete state.appConfig;
      // Protect users list from non-admin privilege escalation
      if (state.users) {
        delete state.users;
      }
    }

    // 4. Save state
    const result = await saveActiveStateToSupabase(state);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({
        success: false,
        message: error.message || 'Sem permissão para realizar esta operação.',
      }, { status: 403 });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ 
        success: false, 
        message: error.message || 'Não autorizado. Faça login novamente.' 
      }, { status: error.statusCode || 401 });
    }
    return NextResponse.json({ 
      success: false, 
      message: formatSupabaseError(error) 
    }, { status: 500 });
  }
}
