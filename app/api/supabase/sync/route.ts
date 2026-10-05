export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getActiveStateFromSupabase, saveActiveStateToSupabase, formatSupabaseError } from '@/lib/supabaseSync';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { requireAuth, AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { requireServerDbClient } from '@/lib/supabase/requireServerDbClient';
import { normalizeRoleId, CANONICAL_ROLE_IDS } from '@/lib/permissions';
import { ADMIN_SYNC_FIELDS, stripAdministrativeSyncFields, SYNC_DOMAIN_PERMISSIONS, changedSyncRecords, isOwnNotificationReadChange } from '@/lib/supabase/syncPayload';
import { SYNC_READ_PERMISSIONS, projectSyncRead } from '@/lib/supabase/syncReadProjection';
import { prepareCommentChanges } from '@/lib/supabase/commentIdentity';
import { stable } from '@/lib/supabase/syncPayload';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ 
      success: false, 
      message: 'Supabase não está configurado no servidor.' 
    }, { status: 500 });
  }

  try {
    const user = await requireAuth(req);

    const clientToUse = requireServerDbClient();
    const result = await getActiveStateFromSupabase(clientToUse);

    if (!result.success || !result.data) {
      return NextResponse.json({ 
        success: false, 
        message: result.message || 'Falha ao sincronizar com a base de dados.' 
      }, { status: 500 });
    }

    const codes = [...new Set([...Object.values(SYNC_READ_PERMISSIONS), 'users:read'])];
    const decisions = await Promise.all(codes.map(async code => {
      const { data, error } = await clientToUse.rpc('has_permission', { p_permission_code: code, p_user_id: user.id });
      if (error) throw new AuthError('Não foi possível validar permissões de leitura.', 503);
      return [code, data === true] as const;
    }));
    result.data = projectSyncRead(result.data, user.id, new Map(decisions));

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

    const clientToUse = requireServerDbClient();
    const state = await req.json();
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return NextResponse.json({ success: false, message: 'Payload de sincronização inválido.' }, { status: 400 });
    }

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
    // Ensure all roleId values in state.users are normalized to canonical role UUIDs.
    if (state.users && Array.isArray(state.users)) {
      state.users = state.users.map(({ password, ...u }: any) => ({
        ...u,
        roleId: normalizeRoleId(u.roleId || u.role_id) || CANONICAL_ROLE_IDS.TECHNICIAN,
      }));
    }

    const userNormalizedRole = normalizeRoleId(user.role_id);
    const isAdmin = user.is_admin || 
      userNormalizedRole === CANONICAL_ROLE_IDS.SUPER_ADMIN || 
      userNormalizedRole === CANONICAL_ROLE_IDS.ADMIN;

    // FASE 26: Prevenção de Privilege Escalation.
    // Utilizadores não-admin não podem alterar configurações globais, utilizadores ou grupos.
    if (!isAdmin) {
      const hasAdminPayload = ADMIN_SYNC_FIELDS.some(field => state[field] !== undefined);

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

      stripAdministrativeSyncFields(state);

      // Protect other users' absences from being modified or deleted by non-admin users (BOLA/IDOR protection)
      if (state.userAbsences && Array.isArray(state.userAbsences)) {
        if (!clientToUse) {
          throw new Error('Database client unavailable');
        }

        const { data: dbOtherAbsences, error: absenceError } = await clientToUse
          .from('user_absences')
          .select('*')
          .neq('user_id', user.id);

        if (absenceError || !Array.isArray(dbOtherAbsences)) {
          throw new AuthError('Não foi possível validar a proteção das ausências.', 503);
        }

        if (dbOtherAbsences) {
          const myAbsences = state.userAbsences.filter((a: any) => a.userId === user.id || a.user_id === user.id);
          // Omitted foreign rows are not deletions. Never re-submit them without
          // their canonical revision or silently alter their ownership.
          state.userAbsences = myAbsences;
        }
      }
    }

    // Authorize every submitted domain before the first write. Unchanged cached
    // rows are not writes; omitted rows are never interpreted as deletions.
    const baseline = await getActiveStateFromSupabase(clientToUse);
    if (!baseline.success || !baseline.data) throw new AuthError('Não foi possível validar o snapshot atual.', 503);
    const writableFields = new Set<string>([...ADMIN_SYNC_FIELDS, ...Object.keys(SYNC_DOMAIN_PERMISSIONS)]);
    for (const field of Object.keys(state)) if (!writableFields.has(field)) delete state[field];
    if (isAdmin) {
      for (const field of ADMIN_SYNC_FIELDS) {
        if (state[field] === undefined) continue;
        if (field === 'appConfig') {
          if (stable(state[field]) === stable(baseline.data.appConfig)) delete state[field];
        } else {
          try { state[field] = changedSyncRecords(state[field], (baseline.data as any)[field]); }
          catch { return NextResponse.json({ success: false, message: `Coleção inválida: ${field}.` }, { status: 400 }); }
        }
      }
    }
    const allowed = new Map<string, boolean>();
    const can = async (code: string) => {
      if (!allowed.has(code)) {
        const { data, error } = await clientToUse.rpc('has_permission', { p_permission_code: code, p_user_id: user.id });
        if (error) throw new AuthError('Não foi possível validar permissões de sincronização.', 503);
        allowed.set(code, data === true);
      }
      return allowed.get(code) === true;
    };
    for (const [field, [write, remove]] of Object.entries(SYNC_DOMAIN_PERMISSIONS)) {
      if (state[field] === undefined) continue;
      let changes;
      try { changes = changedSyncRecords(state[field], (baseline.data as any)[field]); }
      catch { return NextResponse.json({ success: false, message: `Coleção inválida: ${field}.` }, { status: 400 }); }
      const ownReadOnly = field === 'notifications' && changes.every(row => isOwnNotificationReadChange(row, baseline.data!.notifications, user.id));
      if (changes.length && !ownReadOnly && !(await can(write))) throw new ForbiddenError(`Sem permissão para alterar ${field}.`);
      if (changes.some(row => row.deleted === true) && !(await can(remove))) throw new ForbiddenError(`Sem permissão para eliminar em ${field}.`);
      if (field === 'comments' && changes.length) {
        try { changes = prepareCommentChanges(changes, baseline.data.comments, user.id, new Date().toISOString()); }
        catch (error) { throw new ForbiddenError(error instanceof Error ? error.message : 'Comentário inválido.'); }
        const projectIds = [...new Set(changes.map(row => row.projectId))];
        const { data: projects, error } = await clientToUse.from('projects').select('id').in('id', projectIds).eq('deleted', false);
        if (error) throw new AuthError('Não foi possível validar os projetos dos comentários.', 503);
        const activeIds = new Set((projects || []).map(project => project.id));
        if (projectIds.some(id => !activeIds.has(id))) throw new ForbiddenError('Projeto do comentário inexistente ou eliminado.');
      }
      state[field] = changes;
    }

    // 4. Save state
    const result = await saveActiveStateToSupabase(state, clientToUse);
    if (!result.success) {
      return NextResponse.json(result, { status: result.status || 400 });
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
