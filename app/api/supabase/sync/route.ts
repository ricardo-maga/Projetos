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

    let authClient = null;
    try {
      authClient = await createClient(token);
    } catch {
      authClient = supabase;
    }
    const clientToUse = createAdminClient() || authClient || supabase;
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

    let token: string | undefined;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    let authClient = null;
    try {
      authClient = await createClient(token);
    } catch {
      authClient = supabase;
    }
    const clientToUse = createAdminClient() || authClient || supabase;
    const state = await req.json();

    // FASE 26: As entidades com APIs próprias dedicadas e robustas (/api/v1/projects, /api/v1/tasks,
    // /api/v1/clients, /api/v1/planning-allocations) são server-authoritative e NÃO devem
    // ser alteradas via Global Sync para evitar concorrência, sobreposição de estado e inconsistências.
    delete state.projects;
    delete state.tasks;
    delete state.clients;
    delete (state as any).planningAllocations;
    delete (state as any).planningCapacity;
    delete (state as any).planningResourceLoad;

    // Passwords live exclusively in Supabase Auth and are never part of ERP state.
    if (state.users) state.users = state.users.map(({ password, ...u }: any) => u);

    const isAdmin = user.is_admin || user.role_id === 'ug-1' || user.role_id === '00000000-0000-0000-0000-000000000001';

    // FASE 26: Prevenção de Privilege Escalation.
    // Utilizadores não-admin não podem alterar configurações globais, utilizadores ou grupos.
    if (!isAdmin) {
      const hasAdminPayload = Boolean(
        state.userGroups !== undefined || 
        state.appConfig !== undefined || 
        state.users !== undefined || 
        state.ticketStatuses !== undefined || 
        state.automationRules !== undefined
      );

      const hasNonAdminPayload = Boolean(
        (state.comments && state.comments.length > 0) ||
        (state.userAbsences && state.userAbsences.length > 0) ||
        (state.materials && state.materials.length > 0) ||
        (state.quotes && state.quotes.length > 0) ||
        (state.equipment && state.equipment.length > 0) ||
        (state.projectMaterials && state.projectMaterials.length > 0) ||
        (state.projectRiskItems && state.projectRiskItems.length > 0) ||
        (state.notifications && state.notifications.length > 0) ||
        (state.tickets && state.tickets.length > 0)
      );

      // Se a chamada submete exclusivamente entidades administrativas sem dados de utilizador normal, rejeitar categoricamente com 403
      if (hasAdminPayload && !hasNonAdminPayload) {
        return NextResponse.json({
          success: false,
          message: 'Sem permissão para alterar grupos de utilizadores, permissões, utilizadores ou configurações administrativas.',
        }, { status: 403 });
      }

      delete state.userGroups;
      delete state.appConfig;
      delete state.users;
      delete state.ticketStatuses;
      delete state.automationRules;

      // Protect other users' absences from being modified or deleted by non-admin users (BOLA/IDOR protection)
      if (state.userAbsences && Array.isArray(state.userAbsences)) {
        const { data: dbOtherAbsences } = await clientToUse
          .from('user_absences')
          .select('*')
          .neq('user_id', user.id);

        if (dbOtherAbsences) {
          const otherAbsencesMapped = dbOtherAbsences.map((a: any) => ({
            id: a.id,
            userId: a.user_id,
            absenceStartDate: a.absence_start_date,
            absenceEndDate: a.absence_end_date,
            type: a.type || 'ferias',
            reason: a.reason || '',
            isFullDay: a.is_full_day ?? true,
            startTime: a.start_time || '',
            endTime: a.end_time || '',
            status: a.status || 'aprovado',
            createdDate: a.created_at,
          }));

          const myAbsences = state.userAbsences.filter((a: any) => a.userId === user.id || a.user_id === user.id);
          state.userAbsences = [...otherAbsencesMapped, ...myAbsences];
        }
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
