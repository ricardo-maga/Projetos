import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { verifySession } from '@/lib/serverAuth';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ 
      success: false, 
      message: 'Supabase não está configurado no servidor. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nas definições/segredos.' 
    });
  }

  try {
    // 1. Parse Authorization header
    const authHeader = req.headers.get('Authorization');
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    const session = verifySession(token);
    const result = await getActiveStateFromSupabase();

    if (!result.success || !result.data) {
      return NextResponse.json(result);
    }

    // 2. Strip passwords for EVERYONE (including authenticated users) for maximum security
    if (result.data.users) {
      result.data.users = result.data.users.map((u: any) => {
        const { password, ...rest } = u;
        return rest;
      });
    }

    // 3. If there is no valid session, return ONLY non-confidential configuration and user profiles (with passwords stripped)
    if (!session) {
      return NextResponse.json({
        success: true,
        data: {
          appConfig: result.data.appConfig,
          userGroups: result.data.userGroups,
          users: result.data.users || [], // passwords already stripped above
          // Empty arrays for confidential info to prevent leaks
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
        }
      });
    }

    return NextResponse.json(result);
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
    }, { status: 400 });
  }

  try {
    // 1. Verify Session Token
    const authHeader = req.headers.get('Authorization');
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    const session = verifySession(token);
    if (!session) {
      return NextResponse.json({ 
        success: false, 
        message: 'Não autorizado. Faça login novamente.' 
      }, { status: 401 });
    }

    // 2. Extract state
    const state = await req.json();

    // 3. Preserve existing password hashes from DB so we don't overwrite them with nulls/empty strings
    if (state.users && state.users.length > 0 && supabase) {
      try {
        const { data: dbUsers, error: dbUsersError } = await supabase.from('users').select('id, password');
        if (dbUsersError) {
          console.warn('Could not query users table for password preservation:', dbUsersError);
        } else if (dbUsers) {
          const passwordMap = new Map(dbUsers.map((u: any) => [u.id, u.password]));
          state.users = state.users.map((u: any) => {
            if (!u.password && passwordMap.has(u.id)) {
              return { ...u, password: passwordMap.get(u.id) };
            }
            return u;
          });
        }
      } catch (e) {
        console.warn('Network error while querying users for password preservation:', e);
      }
    }

    // 4. Save state
    const result = await saveActiveStateToSupabase(state);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      message: formatSupabaseError(error) 
    }, { status: 500 });
  }
}
