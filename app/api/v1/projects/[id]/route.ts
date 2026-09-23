import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateProjectSchema } from '@/lib/validations/project';
import { validateProjectRelations } from '@/lib/validations/projectRelations';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

function parseCommaSeparated(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').filter(Boolean);
  return [];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const { id } = await params;
  const { requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: project, error } = await sb
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('deleted', false)
      .maybeSingle();

    if (error) {
      return internalServerError(`Erro ao consultar projeto: ${error.message}`, requestId);
    }
    if (!project) {
      return notFound('Projeto não encontrado.', requestId);
    }

    const [teamsRes, partnersRes, categoriesRes, riskRes, priorityRes] = await Promise.all([
      sb.from('project_teams_link').select('team_id').eq('project_id', id),
      sb.from('project_partners_link').select('partner_id').eq('project_id', id),
      sb.from('project_category_link').select('category_id').eq('project_id', id),
      sb.from('project_risk_link').select('risk_id').eq('project_id', id),
      sb.from('project_priority_link').select('priority_id').eq('project_id', id),
    ]);

    const dbTeams = teamsRes.data ? teamsRes.data.map((r: any) => r.team_id) : [];
    const dbPartners = partnersRes.data ? partnersRes.data.map((r: any) => r.partner_id) : [];
    const dbCategories = categoriesRes.data ? categoriesRes.data.map((r: any) => r.category_id) : [];
    const dbRisk = riskRes.data?.[0]?.risk_id;
    const dbPriority = priorityRes.data?.[0]?.priority_id;

    const teamsInvolvedIds = Array.from(new Set([...dbTeams, ...parseCommaSeparated(project.teams_involved_ids)]));
    const partnersIds = Array.from(new Set([...dbPartners, ...parseCommaSeparated(project.partners_ids)]));
    const categoryIds = Array.from(new Set([...dbCategories, ...parseCommaSeparated(project.category_ids || (project.category_id ? [project.category_id] : []))]));

    return NextResponse.json({
      success: true,
      data: {
        id: project.id,
        title: project.project_title || project.title || '',
        clientId: project.client_id || project.clientId || '',
        installProjectNo: project.install_project_no || project.installProjectNo || '',
        sfOpportunityNo: project.sf_opportunity_no || project.sfOpportunityNo || '',
        description: project.project_description || project.description || '',
        statusId: project.status_id || project.statusId || '',
        categoryId: project.category_id || project.categoryId || categoryIds[0] || '',
        categoryIds,
        priorityId: dbPriority || project.priority_id || project.priorityId || '',
        riskId: dbRisk || project.risk_id || project.riskId || '',
        projectManagerId: project.project_manager_id || project.projectManagerId || '',
        fieldManagerId: project.field_manager_id || project.fieldManagerId || '',
        salesRepId: project.sales_rep_id || project.salesRepId || '',
        teamsInvolvedIds,
        partnersIds,
        startDate: project.start_date || '',
        deliveryDate: project.delivery_date || '',
        estimatedDate: project.estimated_date || '',
        scheduledDate: project.scheduled_date || '',
        completedDate: project.completed_date || '',
        budgetValue: Number(project.budget_value ?? project.budgetValue ?? 0),
        isUrgent: Boolean(project.is_urgent),
        demo: Boolean(project.demo),
        documents: parseCommaSeparated(project.documents),
        clientContactName: project.client_contact_name || project.clientContactName || '',
        clientContactEmail: project.client_contact_email || project.clientContactEmail || '',
        clientContactPhone: project.client_contact_phone || project.clientContactPhone || '',
        color: project.color || '',
        notes: project.notes || '',
        version: typeof project.version === 'number' ? project.version : 1,
        deleted: Boolean(project.deleted),
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        createdBy: project.created_by,
        updatedBy: project.updated_by,
      },
    });
  } catch (error: any) {
    console.error('[API PROJECT GET ID EXCEPTION]', error);
    return internalServerError('Falha inesperada ao consultar projeto.', requestId);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(req, params);
}

async function handleUpdate(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;

  const { id } = await paramsPromise;
  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = updateProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para atualização do projeto.', requestId, parseResult.error.flatten());
    }

    const updates = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    // 1. Fetch current record to verify existence and validate version for optimistic concurrency
    const { data: current, error: fetchError } = await sb
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[API PROJECT FETCH ERROR]', fetchError);
      return internalServerError(`Erro ao ler versão atual do projeto: ${fetchError.message}`, requestId);
    }
    if (!current || current.deleted) {
      return notFound('Projeto não encontrado ou já eliminado.', requestId);
    }

    const hasVersionColumn = typeof current.version === 'number';
    const currentVersion = hasVersionColumn ? current.version : (updates.version || 1);
    if (hasVersionColumn && updates.version !== undefined && updates.version !== currentVersion) {
      return conflict(
        `Conflito de concorrência. O projeto foi alterado por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}). Recarregue os dados antes de gravar.`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    const hasTeamsUpdate = updates.teamsInvolvedIds !== undefined || updates.teamIds !== undefined;
    const teamsInvolved = hasTeamsUpdate
      ? Array.from(new Set([...(updates.teamsInvolvedIds || []), ...(updates.teamIds || [])]))
      : undefined;

    const hasPartnersUpdate = updates.partnersIds !== undefined || updates.partnerIds !== undefined;
    const partnersInvolved = hasPartnersUpdate
      ? Array.from(new Set([...(updates.partnersIds || []), ...(updates.partnerIds || [])]))
      : undefined;

    const hasCategoriesUpdate = updates.categoryIds !== undefined || updates.categoryId !== undefined;
    const categoriesInvolved = hasCategoriesUpdate
      ? Array.from(new Set([...(updates.categoryIds || []), ...(updates.categoryId ? [updates.categoryId] : [])]))
      : undefined;

    // 2. Validate any updated relational IDs
    const validation = await validateProjectRelations(
      sb,
      {
        clientId: updates.clientId,
        statusId: updates.statusId,
        categoryId: updates.categoryId,
        categoryIds: categoriesInvolved,
        projectManagerId: updates.projectManagerId,
        fieldManagerId: updates.fieldManagerId,
        salesRepId: updates.salesRepId,
        teamsInvolvedIds: teamsInvolved,
        partnersIds: partnersInvolved,
        priorityId: updates.priorityId,
        riskId: updates.riskId,
      },
      false
    );

    if (!validation.valid) {
      return badRequest(validation.message || 'Dados relacionais de projeto inválidos.', requestId);
    }

    const now = new Date().toISOString();

    // Core guaranteed columns on projects table
    const coreUpdatePayload: Record<string, any> = {
      updated_at: now,
      updated_by: user.id,
    };
    if (hasVersionColumn) {
      coreUpdatePayload.version = currentVersion + 1;
    }

    if (updates.title !== undefined) coreUpdatePayload.project_title = updates.title;
    if (updates.clientId !== undefined) coreUpdatePayload.client_id = updates.clientId.trim() || null;
    if (updates.description !== undefined) coreUpdatePayload.project_description = updates.description;
    if (updates.installProjectNo !== undefined) coreUpdatePayload.install_project_no = updates.installProjectNo;
    if (updates.sfOpportunityNo !== undefined) coreUpdatePayload.sf_opportunity_no = updates.sfOpportunityNo;
    if (updates.statusId !== undefined) coreUpdatePayload.status_id = updates.statusId.trim() || null;
    if (updates.categoryId !== undefined) coreUpdatePayload.category_id = updates.categoryId.trim() || null;
    if (updates.projectManagerId !== undefined) coreUpdatePayload.project_manager_id = updates.projectManagerId?.trim() || null;
    if (updates.fieldManagerId !== undefined) coreUpdatePayload.field_manager_id = updates.fieldManagerId?.trim() || null;
    if (updates.salesRepId !== undefined) coreUpdatePayload.sales_rep_id = updates.salesRepId?.trim() || null;
    if (updates.startDate !== undefined) coreUpdatePayload.start_date = updates.startDate || null;
    if (updates.deliveryDate !== undefined) coreUpdatePayload.delivery_date = updates.deliveryDate || null;
    if (updates.estimatedDate !== undefined) coreUpdatePayload.estimated_date = updates.estimatedDate || null;
    if (updates.scheduledDate !== undefined) coreUpdatePayload.scheduled_date = updates.scheduledDate || null;
    if (updates.budgetValue !== undefined) coreUpdatePayload.budget_value = Number(updates.budgetValue || 0);
    if (updates.demo !== undefined) coreUpdatePayload.demo = Boolean(updates.demo);
    if (updates.documents !== undefined) {
      coreUpdatePayload.documents = Array.isArray(updates.documents) ? updates.documents.join(',') : (updates.documents || '');
    }
    if (updates.clientContactName !== undefined) coreUpdatePayload.client_contact_name = updates.clientContactName;
    if (updates.clientContactEmail !== undefined) coreUpdatePayload.client_contact_email = updates.clientContactEmail;
    if (updates.clientContactPhone !== undefined) coreUpdatePayload.client_contact_phone = updates.clientContactPhone;

    // Extended payload for optional direct columns
    const extendedPayload: Record<string, any> = { ...coreUpdatePayload };
    if (updates.priorityId !== undefined) extendedPayload.priority_id = updates.priorityId.trim() || null;
    if (updates.riskId !== undefined) extendedPayload.risk_id = updates.riskId.trim() || null;
    if (updates.completedDate !== undefined) extendedPayload.completed_date = updates.completedDate || null;
    if (updates.isUrgent !== undefined) extendedPayload.is_urgent = updates.isUrgent;
    if (updates.color !== undefined) extendedPayload.color = updates.color;
    if (updates.notes !== undefined) extendedPayload.notes = updates.notes;
    if (categoriesInvolved !== undefined) extendedPayload.category_ids = categoriesInvolved.length > 0 ? categoriesInvolved.join(',') : null;
    if (teamsInvolved !== undefined) extendedPayload.teams_involved_ids = teamsInvolved.length > 0 ? teamsInvolved.join(',') : null;
    if (partnersInvolved !== undefined) extendedPayload.partners_ids = partnersInvolved.length > 0 ? partnersInvolved.join(',') : null;

    let updateQuery = sb.from('projects').update(extendedPayload).eq('id', id);
    if (hasVersionColumn) {
      updateQuery = updateQuery.eq('version', currentVersion);
    }
    let { data: updatedRows, error: updateError } = await updateQuery.select('id, version');

    if (updateError && (updateError.code === '42703' || updateError.message?.includes('column') || updateError.message?.includes('schema cache'))) {
      console.warn('[API PROJECT UPDATE] Retrying update with core payload due to missing schema column:', updateError.message);
      let retryQuery = sb.from('projects').update(coreUpdatePayload).eq('id', id);
      if (hasVersionColumn) {
        retryQuery = retryQuery.eq('version', currentVersion);
      }
      const retryRes = await retryQuery.select('id, version');
      updateError = retryRes.error;
      updatedRows = retryRes.data;
    }

    if (updateError) {
      console.error('[API PROJECT UPDATE ERROR]', updateError);
      return badRequest(`Erro ao atualizar projeto: ${updateError.message}`, requestId);
    }

    if (hasVersionColumn && (!updatedRows || updatedRows.length === 0)) {
      return conflict(
        `Conflito de concorrência. O projeto foi alterado ou eliminado por outro utilizador (versão não coincide: ${currentVersion}). Recarregue os dados antes de gravar.`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    // Update relational links safely
    if (updates.priorityId !== undefined) {
      await sb.from('project_priority_link').delete().eq('project_id', id);
      if (updates.priorityId.trim()) {
        await sb.from('project_priority_link').insert([{ project_id: id, priority_id: updates.priorityId.trim() }]);
      }
    }

    if (updates.riskId !== undefined) {
      await sb.from('project_risk_link').delete().eq('project_id', id);
      if (updates.riskId.trim()) {
        await sb.from('project_risk_link').insert([{ project_id: id, risk_id: updates.riskId.trim() }]);
      }
    }

    if (teamsInvolved !== undefined) {
      await sb.from('project_teams_link').delete().eq('project_id', id);
      if (teamsInvolved.length > 0) {
        await sb.from('project_teams_link').insert(teamsInvolved.map((t: string) => ({ project_id: id, team_id: t })));
      }
    }

    if (partnersInvolved !== undefined) {
      await sb.from('project_partners_link').delete().eq('project_id', id);
      if (partnersInvolved.length > 0) {
        await sb.from('project_partners_link').insert(partnersInvolved.map((p: string) => ({ project_id: id, partner_id: p })));
      }
    }

    if (categoriesInvolved !== undefined) {
      await sb.from('project_category_link').delete().eq('project_id', id);
      if (categoriesInvolved.length > 0) {
        await sb.from('project_category_link').insert(categoriesInvolved.map((c: string) => ({ project_id: id, category_id: c })));
      }
    }

    await logAuditEvent({
      action: 'PROJECT_UPDATED',
      userId: user.id,
      entity: 'projects',
      entityId: id,
      details: { version: currentVersion + 1 },
    });

    return NextResponse.json({
      success: true,
      message: 'Projeto atualizado com sucesso.',
      data: {
        id,
        ...updates,
        teamsInvolvedIds: teamsInvolved !== undefined ? teamsInvolved : (updates.teamsInvolvedIds || updates.teamIds || []),
        partnersIds: partnersInvolved !== undefined ? partnersInvolved : (updates.partnersIds || updates.partnerIds || []),
        categoryIds: categoriesInvolved !== undefined ? categoriesInvolved : (updates.categoryIds || (updates.categoryId ? [updates.categoryId] : (current.category_id ? [current.category_id] : []))),
        version: currentVersion + 1,
        updatedAt: now,
      },
    });
  } catch (error: any) {
    console.error('[API PROJECT UPDATE EXCEPTION]', error);
    return internalServerError('Falha inesperada ao atualizar projeto.', requestId);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'projects_delete');
  if (!auth.success) return auth.response;

  const { id } = await params;
  const { user, requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    // 1. Fetch current project to verify existence
    const { data: current, error: fetchErr } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
    if (fetchErr) {
      return internalServerError(`Erro ao verificar projeto: ${fetchErr.message}`, requestId);
    }
    if (!current || current.deleted) {
      return notFound('Projeto não encontrado ou já eliminado.', requestId);
    }

    // 2. Strict dependency checks: active tasks, planning allocations, quotes, project materials
    const [tasksRes, quotesRes, materialsRes] = await Promise.all([
      sb.from('tasks').select('id, task_title, deleted').eq('project_id', id),
      sb.from('quotes').select('id, deleted').eq('project_id', id),
      sb.from('project_materials').select('id, deleted').eq('project_id', id),
    ]);

    const allProjectTasks = tasksRes.data || [];
    const activeTasks = allProjectTasks.filter((t: any) => !t.deleted);
    const activeTasksCount = activeTasks.length;
    const taskIds = allProjectTasks.map((t: any) => t.id);

    let activeAllocationsCount = 0;
    if (taskIds.length > 0) {
      const { data: allocations } = await sb
        .from('planning_allocations')
        .select('id, status')
        .in('task_id', taskIds);

      if (allocations && allocations.length > 0) {
        activeAllocationsCount = allocations.filter((a: any) => a.status !== 'CANCELLED').length;
      }
    }

    const activeQuotesCount = (quotesRes.data || []).filter((q: any) => !q.deleted).length;
    const activeMaterialsCount = (materialsRes.data || []).filter((m: any) => !m.deleted).length;

    const dependencies: string[] = [];
    if (activeTasksCount > 0) dependencies.push(`${activeTasksCount} tarefa(s) ativa(s)`);
    if (activeAllocationsCount > 0) dependencies.push(`${activeAllocationsCount} alocação(ões) de planeamento ativa(s)`);
    if (activeQuotesCount > 0) dependencies.push(`${activeQuotesCount} orçamento(s)`);
    if (activeMaterialsCount > 0) dependencies.push(`${activeMaterialsCount} material(ais) associado(s)`);

    if (dependencies.length > 0) {
      return conflict(
        `Não é possível eliminar o projeto "${current.project_title || current.title || id}" porque existem dados dependentes: ${dependencies.join(', ')}. Conclua ou remova primeiro as dependências associadas.`,
        requestId,
        {
          activeTasksCount,
          activeAllocationsCount,
          activeQuotesCount,
          activeMaterialsCount,
        }
      );
    }

    const hasVersionColumn = typeof current.version === 'number';
    const currentVersion = hasVersionColumn ? current.version : 1;
    const now = new Date().toISOString();

    // Soft delete safely
    const deletePayload: Record<string, any> = {
      deleted: true,
      updated_at: now,
    };
    if (hasVersionColumn) {
      deletePayload.version = currentVersion + 1;
      deletePayload.updated_by = user.id;
    }

    let { error: deleteError } = await sb
      .from('projects')
      .update(deletePayload)
      .eq('id', id);

    if (deleteError && (deleteError.code === '42703' || deleteError.message?.includes('column'))) {
      const fallbackRes = await sb.from('projects').update({ deleted: true }).eq('id', id);
      deleteError = fallbackRes.error;
    }

    if (deleteError) {
      return badRequest(`Erro ao eliminar projeto: ${deleteError.message}`, requestId);
    }

    await logAuditEvent({
      action: 'PROJECT_DELETED',
      userId: user.id,
      entity: 'projects',
      entityId: id,
      details: { softDelete: true, title: current.project_title || current.title },
    });

    return NextResponse.json({
      success: true,
      message: 'Projeto eliminado com sucesso.',
    });
  } catch (error: any) {
    console.error('[API PROJECT DELETE EXCEPTION]', error);
    return internalServerError('Falha inesperada ao eliminar projeto.', requestId);
  }
}
