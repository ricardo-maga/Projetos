export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateProjectSchema } from '@/lib/validations/project';
import { validateProjectRelations } from '@/lib/validations/projectRelations';
import { notFound, conflict, validationError, internalServerError, badRequest } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { getProject, updateProject, deleteProject } from '@/lib/projects/projectService';

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

    const project = await getProject(sb, id);
    if (!project || project.deleted) {
      return notFound('Projeto não encontrado.', requestId);
    }

    return NextResponse.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    console.error('[API PROJECT GET ID EXCEPTION]', error);
    return internalServerError('Erro ao consultar projeto.', requestId);
  }
}

export async function PUT(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: any) {
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
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const currentProject = await getProject(sb, id);
    if (!currentProject || currentProject.deleted) {
      return notFound('Projeto não encontrado ou já eliminado.', requestId);
    }

    // Version concurrency check if provided
    if (updates.version !== undefined && currentProject.version !== undefined && currentProject.version !== updates.version) {
      return conflict('Conflito de concorrência. O projeto foi modificado por outro utilizador.', requestId, {
        currentVersion: currentProject.version,
      });
    }

    const effectiveTeams = updates.teamsInvolvedIds !== undefined
      ? updates.teamsInvolvedIds
      : (updates.teamIds !== undefined ? updates.teamIds : undefined);

    const effectivePartners = updates.partnersIds !== undefined
      ? updates.partnersIds
      : (updates.partnerIds !== undefined ? updates.partnerIds : undefined);

    const effectiveCategories = updates.categoryIds !== undefined
      ? updates.categoryIds
      : (updates.categoryId ? [updates.categoryId] : undefined);

    // Validate relational fields if updated
    const validation = await validateProjectRelations(
      sb,
      {
        clientId: updates.clientId,
        statusId: updates.statusId,
        categoryId: updates.categoryId,
        categoryIds: effectiveCategories,
        projectManagerId: updates.projectManagerId,
        fieldManagerId: updates.fieldManagerId,
        salesRepId: updates.salesRepId,
        teamsInvolvedIds: effectiveTeams,
        partnersIds: effectivePartners,
        priorityId: updates.priorityId,
        riskId: updates.riskId,
      },
      false
    );

    if (!validation.valid) {
      return badRequest(validation.message || 'Dados relacionais de projeto inválidos.', requestId);
    }

    const updateInput = {
      ...updates,
      statusId: updates.statusId ? (validation.resolvedStatusId || updates.statusId) : undefined,
      categoryId: updates.categoryId ? (validation.resolvedCategoryId || updates.categoryId) : undefined,
      categoryIds: effectiveCategories,
      teamsInvolvedIds: effectiveTeams,
      partnersIds: effectivePartners,
      priorityId: updates.priorityId !== undefined ? (validation.resolvedPriorityId || updates.priorityId) : undefined,
      riskId: updates.riskId,
    };

    // Eliminate undefined keys so they are completely absent from updateInput
    Object.keys(updateInput).forEach((key) => {
      if ((updateInput as any)[key] === undefined) {
        delete (updateInput as any)[key];
      }
    });

    try {
      const updatedProject = await updateProject(sb, id, updateInput, user.id, updates.version);

      await logAuditEvent({
        action: 'PROJECT_UPDATED',
        userId: user.id,
        entity: 'projects',
        entityId: id,
        details: { updatedFields: Object.keys(updates) },
      });

      return NextResponse.json({
        success: true,
        message: 'Projeto atualizado com sucesso.',
        data: updatedProject,
      });
    } catch (err: any) {
      if (err?.code === 'concurrency' || err?.message?.includes('Conflito de concorrência') || err?.message?.includes('Concurrency')) {
        return conflict('Conflito de concorrência. O projeto foi modificado por outro utilizador.', requestId, {
          currentVersion: err.currentVersion || currentProject.version,
        });
      }
      return badRequest(err?.message || 'Erro ao atualizar projeto.', requestId);
    }
  } catch (error: any) {
    console.error('[API PROJECT UPDATE EXCEPTION]', error);
    return internalServerError('Erro inesperado ao atualizar projeto.', requestId);
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_delete');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { user, requestId } = auth;

  try {
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    try {
      await deleteProject(sb, id, user.id);

      await logAuditEvent({
        action: 'PROJECT_DELETED',
        userId: user.id,
        entity: 'projects',
        entityId: id,
      });

      return NextResponse.json({
        success: true,
        message: 'Projeto eliminado com sucesso.',
      });
    } catch (err: any) {
      if (err?.code === 'dependency' || err?.message?.includes('Não é possível eliminar')) {
        return conflict(err.message, requestId);
      }
      if (err?.message === 'Project not found.') {
        return notFound('Projeto não encontrado ou já eliminado.', requestId);
      }
      throw err;
    }
  } catch (error: any) {
    console.error('[API PROJECT DELETE EXCEPTION]', error);
    return internalServerError('Erro inesperado ao eliminar projeto.', requestId);
  }
}
