import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ 
      success: false, 
      message: 'Supabase não está configurado no servidor. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nas definições/segredos.' 
    });
  }

  try {
    let user = null;
    let authClient = supabase;
    let debugInfo: any = null;

    try {
      let token: string | undefined;
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }

      user = await requireAuth(req);
      authClient = await createClient(token);

      const { data: authCheck, error: authCheckError } =
        await authClient.auth.getUser();

      debugInfo = {
        authentication: {
          requireAuthSuccess: !!user,
          applicationUserId: user?.id ?? null,
          authUserId: user?.auth_user_id ?? null,
          email: user?.email ?? null
        },
        supabaseSession: {
          hasUser: !!authCheck?.user,
          authUserId: authCheck?.user?.id ?? null,
          email: authCheck?.user?.email ?? null,
          error: authCheckError
            ? {
                message: authCheckError.message,
                code: authCheckError.code ?? null
              }
            : null
        }
      };

      const { data: debugUsers, error: debugUsersError } =
        await authClient
          .from('users')
          .select('id, auth_user_id, name, email, deleted')
          .limit(10);

      debugInfo.users = {
        count: debugUsers?.length ?? 0,
        rows: debugUsers ?? [],
        error: debugUsersError
          ? {
              message: debugUsersError.message,
              code: debugUsersError.code ?? null,
              details: debugUsersError.details ?? null,
              hint: debugUsersError.hint ?? null
            }
          : null
      };

      const { data: debugProjects, error: debugProjectsError } =
        await authClient
          .from('projects')
          .select('id')
          .limit(10);

      debugInfo.projects = {
        count: debugProjects?.length ?? 0,
        error: debugProjectsError
          ? {
              message: debugProjectsError.message,
              code: debugProjectsError.code ?? null,
              details: debugProjectsError.details ?? null,
              hint: debugProjectsError.hint ?? null
            }
          : null
      };

      const { data: debugClients, error: debugClientsError } =
        await authClient
          .from('clients')
          .select('id')
          .limit(10);

      debugInfo.clients = {
        count: debugClients?.length ?? 0,
        error: debugClientsError
          ? {
              message: debugClientsError.message,
              code: debugClientsError.code ?? null,
              details: debugClientsError.details ?? null,
              hint: debugClientsError.hint ?? null
            }
          : null
      };

      const { data: debugTasks, error: debugTasksError } =
        await authClient
          .from('tasks')
          .select('id')
          .limit(10);

      debugInfo.tasks = {
        count: debugTasks?.length ?? 0,
        error: debugTasksError
          ? {
              message: debugTasksError.message,
              code: debugTasksError.code ?? null,
              details: debugTasksError.details ?? null,
              hint: debugTasksError.hint ?? null
            }
          : null
      };
    } catch (authError: any) {
      const authHeader = req.headers.get('authorization');
      const hasAuthHeader = !!(authHeader && authHeader.startsWith('Bearer '));

      if (hasAuthHeader) {
        return NextResponse.json(
          {
            success: false,
            message: authError?.message || 'Não autorizado.',
            debug: {
              authentication: {
                requireAuthSuccess: false,
                error: {
                  message: authError?.message || 'Authentication failed'
                }
              }
            }
          },
          { status: 401 }
        );
      }

      user = null;
      debugInfo = {
        authentication: {
          requireAuthSuccess: false,
          applicationUserId: null,
          authUserId: null,
          email: null
        },
        supabaseSession: {
          hasUser: false,
          authUserId: null,
          email: null,
          error: null
        }
      };
    }

    let result;
    try {
      const clientToUse = user ? (createAdminClient() || authClient) : authClient;
      result = await getActiveStateFromSupabase(clientToUse);
    } catch (error: any) {
      console.error('Exception in getActiveStateFromSupabase:', error);
      return NextResponse.json({ success: false, message: error?.message || 'Database error', debug: debugInfo }, { status: 500 });
    }

    if (!result.success || !result.data) {
      console.error('getActiveStateFromSupabase failed:', result.message);
      return NextResponse.json({ success: false, message: result.message || 'Database sync failed', debug: debugInfo }, { status: 500 });
    }

    // Strip passwords for EVERYONE for maximum security
    if (result.data.users) {
      result.data.users = result.data.users.map((u: any) => {
        const { password, ...rest } = u;
        return rest;
      });
    }

    // If there is no valid session, return ONLY non-confidential configuration and user profiles (with passwords stripped)
    if (!user) {
      return NextResponse.json({
        success: true,
        data: {
          appConfig: result.data.appConfig,
          userGroups: result.data.userGroups,
          users: result.data.users || [],
          projects: [],
          tasks: [],
          clients: [],
          comments: [],
          userAbsences: [],
          materials: [],
          quotes: [],
          billOfMaterials: [],
          equipmentList: [],
          specialDays: [],
          defaultTasks: [],
        },
        debug: debugInfo
      });
    }

    return NextResponse.json({
      ...result,
      debug: debugInfo
    });
  } catch (error: any) {
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
    });
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
