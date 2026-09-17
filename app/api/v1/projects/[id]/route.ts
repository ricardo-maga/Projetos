import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateProjectSchema } from '@/lib/validations/project';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const { id } = await params;
  const { requestId } = auth;

  try {
    const sb = (await createClient()) || defaultSupabase;
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

    return NextResponse.json({
      success: true,
      data: {
        id: project.id,
        title: project.project_title || project.title,
        clientId: project.client_id || project.clientId || '',
        installProjectNo: project.install_project_no || project.installProjectNo || '',
        sfOpportunityNo: project.sf_opportunity_no || project.sfOpportunityNo || '',
        description: project.project_description || project.description || '',
        statusId: project.status_id || project.statusId || 'ps-1',
        categoryId: project.category_id || project.categoryId || 'pc-1',
        categoryIds: project.category_ids || (project.category_id ? [project.category_id] : []),
        priorityId: project.priority_id || project.priorityId || 'pp-1',
        riskId: project.risk_id || project.riskId || 'pr-1',
        projectManagerId: project.project_manager_id || project.projectManagerId || '',
        fieldManagerId: project.field_manager_id || project.fieldManagerId || '',
        salesRepId: project.sales_rep_id || project.salesRepId || '',
        teamsInvolvedIds: project.teams_involved_ids || [],
        partnersIds: project.partners_ids || [],
        startDate: project.start_date || '',
        deliveryDate: project.delivery_date || '',
        estimatedDate: project.estimated_date || '',
        scheduledDate: project.scheduled_date || '',
        completedDate: project.completed_date || '',
        budgetValue: Number(project.budget_value ?? project.budgetValue ?? 0),
        isUrgent: Boolean(project.is_urgent),
        demo: Boolean(project.demo),
        documents: project.documents || [],
        clientContactName: project.client_contact_name || project.clientContactName || '',
        clientContactEmail: project.client_contact_email || project.clientContactEmail || '',
        clientContactPhone: project.client_contact_phone || project.clientContactPhone || '',
        color: project.color || '',
        notes: project.notes || '',
        version: project.version || 1,
        deleted: Boolean(project.deleted),
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        createdBy: project.created_by,
        updatedBy: project.updated_by,
      },
    });
  } catch (error: any) {
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
    const sb = (await createClient()) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    // 1. Fetch current record to verify existence and validate version for optimistic concurrency
    const { data: current, error: fetchError } = await sb
      .from('projects')
      .select('id, version, deleted')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return internalServerError(`Erro ao ler versão atual do projeto: ${fetchError.message}`, requestId);
    }
    if (!current || current.deleted) {
      return notFound('Projeto não encontrado.', requestId);
    }

    const currentVersion = current.version || 1;
    if (updates.version !== currentVersion) {
      return conflict(
        `Conflito de concorrência. O projeto foi alterado por outro utilizador (versão atual: ${currentVersion}, versão submetida: ${updates.version}). Recarregue os dados antes de gravar.`,
        requestId,
        { currentVersion, submittedVersion: updates.version }
      );
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      version: currentVersion + 1,
      updated_at: now,
      updated_by: user.id,
    };

    if (updates.title !== undefined) updatePayload.project_title = updates.title;
    if (updates.clientId !== undefined) updatePayload.client_id = updates.clientId || null;
    if (updates.description !== undefined) updatePayload.project_description = updates.description;
    if (updates.installProjectNo !== undefined) updatePayload.install_project_no = updates.installProjectNo;
    if (updates.sfOpportunityNo !== undefined) updatePayload.sf_opportunity_no = updates.sfOpportunityNo;
    if (updates.statusId !== undefined) updatePayload.status_id = updates.statusId;
    if (updates.categoryId !== undefined) updatePayload.category_id = updates.categoryId;
    if (updates.categoryIds !== undefined) updatePayload.category_ids = updates.categoryIds;
    if (updates.priorityId !== undefined) updatePayload.priority_id = updates.priorityId;
    if (updates.riskId !== undefined) updatePayload.risk_id = updates.riskId;
    if (updates.projectManagerId !== undefined) updatePayload.project_manager_id = updates.projectManagerId || null;
    if (updates.fieldManagerId !== undefined) updatePayload.field_manager_id = updates.fieldManagerId || null;
    if (updates.salesRepId !== undefined) updatePayload.sales_rep_id = updates.salesRepId || null;
    if (updates.teamsInvolvedIds !== undefined || updates.teamIds !== undefined) {
      updatePayload.teams_involved_ids = updates.teamsInvolvedIds || updates.teamIds || [];
    }
    if (updates.partnersIds !== undefined || updates.partnerIds !== undefined) {
      updatePayload.partners_ids = updates.partnersIds || updates.partnerIds || [];
    }
    if (updates.startDate !== undefined) updatePayload.start_date = updates.startDate || null;
    if (updates.deliveryDate !== undefined) updatePayload.delivery_date = updates.deliveryDate || null;
    if (updates.estimatedDate !== undefined) updatePayload.estimated_date = updates.estimatedDate || null;
    if (updates.scheduledDate !== undefined) updatePayload.scheduled_date = updates.scheduledDate || null;
    if (updates.completedDate !== undefined) updatePayload.completed_date = updates.completedDate || null;
    if (updates.budgetValue !== undefined) updatePayload.budget_value = Number(updates.budgetValue || 0);
    if (updates.isUrgent !== undefined) updatePayload.is_urgent = updates.isUrgent;
    if (updates.demo !== undefined) updatePayload.demo = Boolean(updates.demo);
    if (updates.documents !== undefined) updatePayload.documents = updates.documents;
    if (updates.clientContactName !== undefined) updatePayload.client_contact_name = updates.clientContactName;
    if (updates.clientContactEmail !== undefined) updatePayload.client_contact_email = updates.clientContactEmail;
    if (updates.clientContactPhone !== undefined) updatePayload.client_contact_phone = updates.clientContactPhone;
    if (updates.color !== undefined) updatePayload.color = updates.color;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;

    const { error: updateError } = await sb
      .from('projects')
      .update(updatePayload)
      .eq('id', id)
      .eq('version', currentVersion);

    if (updateError) {
      console.error('[API PROJECT UPDATE ERROR]', updateError);
      return badRequest(`Erro ao atualizar projeto: ${updateError.message}`, requestId);
    }

    // Update relational links if passed
    if (updates.teamsInvolvedIds !== undefined || updates.teamIds !== undefined) {
      const teams = updates.teamsInvolvedIds || updates.teamIds || [];
      try {
        await sb.from('project_teams_link').delete().eq('project_id', id);
        if (teams.length > 0) {
          await sb.from('project_teams_link').insert(teams.map((t: string) => ({ project_id: id, team_id: t })));
        }
      } catch {}
    }

    if (updates.partnersIds !== undefined || updates.partnerIds !== undefined) {
      const partners = updates.partnersIds || updates.partnerIds || [];
      try {
        await sb.from('project_partners_link').delete().eq('project_id', id);
        if (partners.length > 0) {
          await sb.from('project_partners_link').insert(partners.map((p: string) => ({ project_id: id, partner_id: p })));
        }
      } catch {}
    }

    if (updates.categoryIds !== undefined || updates.categoryId !== undefined) {
      const cats = Array.from(new Set([...(updates.categoryIds || []), ...(updates.categoryId ? [updates.categoryId] : [])]));
      try {
        await sb.from('project_category_link').delete().eq('project_id', id);
        if (cats.length > 0) {
          await sb.from('project_category_link').insert(cats.map((c: string) => ({ project_id: id, category_id: c })));
        }
      } catch {}
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
    const sb = (await createClient()) || defaultSupabase;
    if (!sb) return internalServerError('Base de dados Supabase não disponível.', requestId);

    // Fetch current version for optimistic lock
    const { data: current } = await sb.from('projects').select('id, version, deleted').eq('id', id).maybeSingle();
    if (!current || current.deleted) {
      return notFound('Projeto não encontrado.', requestId);
    }

    const currentVersion = current.version || 1;
    const now = new Date().toISOString();

    // Soft delete
    const { error: deleteError } = await sb
      .from('projects')
      .update({
        deleted: true,
        version: currentVersion + 1,
        updated_at: now,
        updated_by: user.id,
      })
      .eq('id', id);

    if (deleteError) {
      return badRequest(`Erro ao eliminar projeto: ${deleteError.message}`, requestId);
    }

    await logAuditEvent({
      action: 'PROJECT_DELETED',
      userId: user.id,
      entity: 'projects',
      entityId: id,
      details: { softDelete: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Projeto eliminado com sucesso.',
    });
  } catch (error: any) {
    return internalServerError('Falha inesperada ao eliminar projeto.', requestId);
  }
}
