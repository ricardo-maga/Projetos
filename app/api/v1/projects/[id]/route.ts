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
        clientId: project.client_id || project.clientId,
        installProjectNo: project.install_project_no || project.installProjectNo || '',
        description: project.description || '',
        statusId: project.status_id || project.statusId || 'ps-1',
        categoryId: project.category_id || project.categoryId || 'pc-1',
        priorityId: project.priority_id || project.priorityId || 'pp-1',
        riskId: project.risk_id || project.riskId || 'pr-1',
        projectManagerId: project.project_manager_id || project.projectManagerId || '',
        startDate: project.start_date || '',
        deliveryDate: project.delivery_date || '',
        scheduledDate: project.scheduled_date || '',
        completedDate: project.completed_date || '',
        isUrgent: Boolean(project.is_urgent),
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
    if (updates.clientId !== undefined) updatePayload.client_id = updates.clientId;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.installProjectNo !== undefined) updatePayload.install_project_no = updates.installProjectNo;
    if (updates.statusId !== undefined) updatePayload.status_id = updates.statusId;
    if (updates.categoryId !== undefined) updatePayload.category_id = updates.categoryId;
    if (updates.priorityId !== undefined) updatePayload.priority_id = updates.priorityId;
    if (updates.riskId !== undefined) updatePayload.risk_id = updates.riskId;
    if (updates.projectManagerId !== undefined) updatePayload.project_manager_id = updates.projectManagerId;
    if (updates.startDate !== undefined) updatePayload.start_date = updates.startDate;
    if (updates.deliveryDate !== undefined) updatePayload.delivery_date = updates.deliveryDate;
    if (updates.scheduledDate !== undefined) updatePayload.scheduled_date = updates.scheduledDate;
    if (updates.completedDate !== undefined) updatePayload.completed_date = updates.completedDate;
    if (updates.isUrgent !== undefined) updatePayload.is_urgent = updates.isUrgent;
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
