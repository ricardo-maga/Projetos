import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { updateProjectSchema } from '@/domains/projects/contracts/project';
import { validateProjectRelations } from '@/domains/projects/contracts/projectRelations';
import { notFound, conflict, validationError, internalServerError, badRequest, serviceUnavailable } from '@/lib/apiErrors';
import { createClient, getServerDbClient } from '@/lib/supabase/server';
import { getProject, getScopedProject, updateProject, deleteProject } from '@/domains/projects/modules/projectService';
import { isUuid } from '@/lib/security/identifiers';
import { isNotModified, mutationPrecondition, preconditionFailed, resourceTag, validationHeaders, warnMissingPrecondition } from '@/lib/security/resourceVersion';

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

async function handleGet(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { requestId } = auth;
  if (!isUuid(id)) return badRequest('ID de projeto inválido.', requestId);

  try {
    const useRls = process.env.API_PROJECT_RLS_READ === 'true'
      || (process.env.VERCEL === '1' && process.env.API_PROJECT_RLS_READ !== 'false');
    let project;
    if (useRls) {
      const token = req.headers.get('authorization')?.slice(7).trim();
      project = await getScopedProject(await createClient(token), id);
    } else {
      const sb = await getServerDbClient(req, auth.user);
      if (!sb) return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
      project = await getProject(sb, id);
    }
    if (!project || project.deleted) {
      return notFound('Projeto não encontrado.', requestId);
    }

    const etag = resourceTag(project);
    const headers = validationHeaders(etag);
    if (isNotModified(req, etag)) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({
      success: true,
      data: project,
    }, { headers });
  } catch (error: any) {
    console.error('[API PROJECT GET ID EXCEPTION]', error);
    return internalServerError('Erro ao consultar projeto.', requestId);
  }
}

async function handlePut(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

async function handlePatch(req: NextRequest, ctx: any) {
  return handleUpdate(req, ctx);
}

async function handleUpdate(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { user, requestId } = auth;
  if (!isUuid(id)) return badRequest('ID de projeto inválido.', requestId);

  try {
    let rawBody: unknown;
    try { rawBody = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parseResult = updateProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para atualização do projeto.', requestId, parseResult.error.flatten());
    }

    const updates = parseResult.data;
    const sb = await getServerDbClient(req, auth.user);
    if (!sb) {
      return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    }

    const currentProject = await getProject(sb, id);
    if (!currentProject || currentProject.deleted) {
      return notFound('Projeto não encontrado ou já eliminado.', requestId);
    }

    const precondition = mutationPrecondition(req, resourceTag(currentProject), updates.version, currentProject.version, requestId);
    if (precondition) return precondition;

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
      const updatedProject = await updateProject(sb, id, updateInput, user.id, currentProject.version);

      const response = NextResponse.json({
        success: true,
        message: 'Projeto atualizado com sucesso.',
        data: updatedProject,
      }, { headers: validationHeaders(resourceTag(updatedProject)) });
      return warnMissingPrecondition(req, updates.version, response);
    } catch (err: any) {
      if (err?.code === 'concurrency' || err?.message?.includes('Conflito de concorrência') || err?.message?.includes('Concurrency')) {
        if (req.headers.has('if-match')) return preconditionFailed(requestId);
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

async function handleDelete(req: NextRequest, ctx: any) {
  const auth = await requirePermission(req, 'projects_delete');
  if (!auth.success) return auth.response;

  const id = await getIdFromParams(ctx);
  const { user, requestId } = auth;
  if (!isUuid(id)) return badRequest('ID de projeto inválido.', requestId);

  try {
    const sb = await getServerDbClient(req, auth.user);
    if (!sb) {
      return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
    }

    try {
      await deleteProject(sb, id, user.id);

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

export const GET = createApiHandler(handleGet);

export const PUT = createApiHandler(handlePut);

export const PATCH = createApiHandler(handlePatch);

export const DELETE = createApiHandler(handleDelete);
