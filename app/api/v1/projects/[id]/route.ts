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

async function getIdFromParams(input: any): Promise<string> {
  if (!input) return '';
  const resolved = typeof input.then === 'function' ? await input : input;
  if (typeof resolved === 'string') return resolved;
  if (resolved?.params) {
    const paramsResolved = typeof resolved.params.then === 'function' ? await resolved.params : resolved.params;
    return paramsResolved?.id || '';
  }
  return resolved?.id || '';
}

export async function GET(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
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

export async function PATCH(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

export async function PUT(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

async function handleUpdate(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
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
    const updatePayload: Record<string, any> = {
      updated_at: now,
      updated_by: user.id,
    };

    if (hasVersionColumn) {
      updatePayload.version = currentVersion + 1;
    }

    if (updates.title !== undefined) updatePayload.project_title = updates.title;
    if (updates.clientId !== undefined) updatePayload.client_id = updates.clientId ? updates.clientId.trim() : null;
    if (updates.description !== undefined) updatePayload.project_description = updates.description;
    if (updates.installProjectNo !== undefined) updatePayload.install_project_no = updates.installProjectNo;
    if (updates.sfOpportunityNo !== undefined) updatePayload.sf_opportunity_no = updates.sfOpportunityNo;
    if (updates.statusId !== undefined) updatePayload.status_id = validation.resolvedStatusId || updates.statusId;
    if (updates.categoryId !== undefined) updatePayload.category_id = validation.resolvedCategoryId || updates.categoryId;
    if (updates.priorityId !== undefined) updatePayload.priority_id = validation.resolvedPriorityId || updates.priorityId;
    if (updates.riskId !== undefined) updatePayload.risk_id = updates.riskId;
    if (updates.projectManagerId !== undefined) updatePayload.project_manager_id = updates.projectManagerId ? updates.projectManagerId.trim() : null;
    if (updates.fieldManagerId !== undefined) updatePayload.field_manager_id = updates.fieldManagerId ? updates.fieldManagerId.trim() : null;
    if (updates.salesRepId !== undefined) updatePayload.sales_rep_id = updates.salesRepId ? updates.salesRepId.trim() : null;
    if (updates.startDate !== undefined) updatePayload.start_date = updates.startDate || null;
    if (updates.deliveryDate !== undefined) updatePayload.delivery_date = updates.deliveryDate || null;
    if (updates.estimatedDate !== undefined) updatePayload.estimated_date = updates.estimatedDate || null;
    if (updates.scheduledDate !== undefined) updatePayload.scheduled_date = updates.scheduledDate || null;
    if (updates.completedDate !== undefined) updatePayload.completed_date = updates.completedDate || null;
    if (updates.budgetValue !== undefined) updatePayload.budget_value = updates.budgetValue;
    if (updates.isUrgent !== undefined) updatePayload.is_urgent = updates.isUrgent;
    if (updates.demo !== undefined) updatePayload.demo = updates.demo;
    if (updates.documents !== undefined) updatePayload.documents = Array.isArray(updates.documents) ? updates.documents.join(',') : updates.documents;
    if (updates.clientContactName !== undefined) updatePayload.client_contact_name = updates.clientContactName;
    if (updates.clientContactEmail !== undefined) updatePayload.client_contact_email = updates.clientContactEmail;
    if (updates.clientContactPhone !== undefined) updatePayload.client_contact_phone = updates.clientContactPhone;
    if (updates.color !== undefined) updatePayload.color = updates.color;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;

    let updateQuery = sb.from('projects').update(updatePayload).eq('id', id);
    if (hasVersionColumn) {
      updateQuery = updateQuery.eq('version', currentVersion);
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select('id');
    if (updateError) {
      console.error('[API PROJECT UPDATE ERROR]', updateError);
      return badRequest(`Erro ao atualizar projeto: ${updateError.message}`, requestId);
    }

    // OCC Check: Verify that the UPDATE actually affected the row
    if (hasVersionColumn && (!updatedRows || updatedRows.length === 0)) {
      return conflict(
        `Conflito de concorrência. O projeto foi alterado por outro utilizador (versão esperada: ${currentVersion}). Recarregue os dados antes de gravar.`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    // 3. Update relations and strictly verify errors
    if (teamsInvolved !== undefined) {
      const { error: delTeamsErr } = await sb.from('project_teams_link').delete().eq('project_id', id);
      if (delTeamsErr) {
        console.error('[API PROJECT UPDATE TEAMS DELETE ERROR]', delTeamsErr);
        return badRequest(`Erro ao atualizar equipas do projeto: ${delTeamsErr.message}`, requestId);
      }
      if (teamsInvolved.length > 0) {
        const { error: insTeamsErr } = await sb.from('project_teams_link').insert(teamsInvolved.map((t: string) => ({ project_id: id, team_id: t })));
        if (insTeamsErr) {
          console.error('[API PROJECT UPDATE TEAMS INSERT ERROR]', insTeamsErr);
          return badRequest(`Erro ao associar equipas ao projeto: ${insTeamsErr.message}`, requestId);
        }
      }
    }

    if (partnersInvolved !== undefined) {
      const { error: delPartnersErr } = await sb.from('project_partners_link').delete().eq('project_id', id);
      if (delPartnersErr) {
        console.error('[API PROJECT UPDATE PARTNERS DELETE ERROR]', delPartnersErr);
        return badRequest(`Erro ao atualizar parceiros do projeto: ${delPartnersErr.message}`, requestId);
      }
      if (partnersInvolved.length > 0) {
        const { error: insPartnersErr } = await sb.from('project_partners_link').insert(partnersInvolved.map((p: string) => ({ project_id: id, partner_id: p })));
        if (insPartnersErr) {
          console.error('[API PROJECT UPDATE PARTNERS INSERT ERROR]', insPartnersErr);
          return badRequest(`Erro ao associar parceiros ao projeto: ${insPartnersErr.message}`, requestId);
        }
      }
    }

    if (categoriesInvolved !== undefined) {
      const { error: delCatsErr } = await sb.from('project_category_link').delete().eq('project_id', id);
      if (delCatsErr) {
        console.error('[API PROJECT UPDATE CATEGORIES DELETE ERROR]', delCatsErr);
        return badRequest(`Erro ao atualizar categorias do projeto: ${delCatsErr.message}`, requestId);
      }
      if (categoriesInvolved.length > 0) {
        const { error: insCatsErr } = await sb.from('project_category_link').insert(categoriesInvolved.map((c: string) => ({ project_id: id, category_id: c })));
        if (insCatsErr) {
          console.error('[API PROJECT UPDATE CATEGORIES INSERT ERROR]', insCatsErr);
          return badRequest(`Erro ao associar categorias ao projeto: ${insCatsErr.message}`, requestId);
        }
      }
    }

    if (updates.priorityId !== undefined) {
      const { error: delPrioErr } = await sb.from('project_priority_link').delete().eq('project_id', id);
      if (delPrioErr) {
        console.error('[API PROJECT UPDATE PRIORITY DELETE ERROR]', delPrioErr);
        return badRequest(`Erro ao atualizar prioridade do projeto: ${delPrioErr.message}`, requestId);
      }
      const finalPriorityId = validation.resolvedPriorityId || updates.priorityId;
      if (finalPriorityId) {
        const { error: insPrioErr } = await sb.from('project_priority_link').insert([{ project_id: id, priority_id: finalPriorityId }]);
        if (insPrioErr) {
          console.error('[API PROJECT UPDATE PRIORITY INSERT ERROR]', insPrioErr);
          return badRequest(`Erro ao associar prioridade ao projeto: ${insPrioErr.message}`, requestId);
        }
      }
    }

    if (updates.riskId !== undefined) {
      const { error: delRiskErr } = await sb.from('project_risk_link').delete().eq('project_id', id);
      if (delRiskErr) {
        console.error('[API PROJECT UPDATE RISK DELETE ERROR]', delRiskErr);
        return badRequest(`Erro ao atualizar risco do projeto: ${delRiskErr.message}`, requestId);
      }
      if (updates.riskId) {
        const { error: insRiskErr } = await sb.from('project_risk_link').insert([{ project_id: id, risk_id: updates.riskId }]);
        if (insRiskErr) {
          console.error('[API PROJECT UPDATE RISK INSERT ERROR]', insRiskErr);
          return badRequest(`Erro ao associar risco ao projeto: ${insRiskErr.message}`, requestId);
        }
      }
    }

    await logAuditEvent({
      action: 'PROJECT_UPDATED',
      userId: user.id,
      entity: 'projects',
      entityId: id,
      details: { version: currentVersion + 1 },
    });

    const { data: refreshedProject, error: refreshError } = await sb
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (refreshError || !refreshedProject) {
      return internalServerError('Erro ao carregar os dados atualizados do projeto.', requestId);
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

    const finalTeamsInvolvedIds = Array.from(new Set([...dbTeams, ...parseCommaSeparated(refreshedProject.teams_involved_ids)]));
    const finalPartnersIds = Array.from(new Set([...dbPartners, ...parseCommaSeparated(refreshedProject.partners_ids)]));
    const finalCategoryIds = Array.from(new Set([...dbCategories, ...parseCommaSeparated(refreshedProject.category_ids || (refreshedProject.category_id ? [refreshedProject.category_id] : []))]));

    const serverData = {
      id: refreshedProject.id,
      title: refreshedProject.project_title || refreshedProject.title || '',
      clientId: refreshedProject.client_id || '',
      installProjectNo: refreshedProject.install_project_no || '',
      sfOpportunityNo: refreshedProject.sf_opportunity_no || '',
      description: refreshedProject.project_description || refreshedProject.description || '',
      statusId: refreshedProject.status_id || '',
      categoryId: refreshedProject.category_id || finalCategoryIds[0] || '',
      categoryIds: finalCategoryIds,
      priorityId: dbPriority || refreshedProject.priority_id || '',
      riskId: dbRisk || refreshedProject.risk_id || '',
      projectManagerId: refreshedProject.project_manager_id || '',
      fieldManagerId: refreshedProject.field_manager_id || '',
      salesRepId: refreshedProject.sales_rep_id || '',
      teamsInvolvedIds: finalTeamsInvolvedIds,
      partnersIds: finalPartnersIds,
      startDate: refreshedProject.start_date || '',
      deliveryDate: refreshedProject.delivery_date || '',
      estimatedDate: refreshedProject.estimated_date || '',
      scheduledDate: refreshedProject.scheduled_date || '',
      completedDate: refreshedProject.completed_date || '',
      budgetValue: Number(refreshedProject.budget_value ?? 0),
      isUrgent: Boolean(refreshedProject.is_urgent),
      demo: Boolean(refreshedProject.demo),
      documents: parseCommaSeparated(refreshedProject.documents),
      clientContactName: refreshedProject.client_contact_name || '',
      clientContactEmail: refreshedProject.client_contact_email || '',
      clientContactPhone: refreshedProject.client_contact_phone || '',
      color: refreshedProject.color || '',
      notes: refreshedProject.notes || '',
      version: typeof refreshedProject.version === 'number' ? refreshedProject.version : (currentVersion + 1),
      deleted: Boolean(refreshedProject.deleted),
      createdAt: refreshedProject.created_at,
      updatedAt: refreshedProject.updated_at,
      createdBy: refreshedProject.created_by,
      updatedBy: refreshedProject.updated_by,
    };

    return NextResponse.json({
      success: true,
      message: 'Projeto atualizado com sucesso.',
      data: serverData,
    });
  } catch (error: any) {
    console.error('[API PROJECT UPDATE EXCEPTION]', error);
    return internalServerError('Falha inesperada ao atualizar projeto.', requestId);
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_delete');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { user, requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    const { data: current, error: fetchErr } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
    if (fetchErr) {
      return internalServerError(`Erro ao verificar projeto: ${fetchErr.message}`, requestId);
    }
    if (!current || current.deleted) {
      return notFound('Projeto não encontrado ou já eliminado.', requestId);
    }

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
