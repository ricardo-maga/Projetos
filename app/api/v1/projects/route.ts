export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, queryProjectSchema } from '@/lib/validations/project';
import { validateProjectRelations } from '@/lib/validations/projectRelations';
import { validationError, badRequest, internalServerError } from '@/lib/apiErrors';
import { logAuditEvent } from '@/lib/audit';
import { getServerDbClient } from '@/lib/supabase/server';
import { supabase as defaultSupabase } from '@/lib/supabaseClient';
import { createProject, listProjects } from '@/lib/projects/projectService';

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;

  const { requestId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const queryResult = queryProjectSchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!queryResult.success) {
      return validationError('Parâmetros de consulta inválidos.', requestId, queryResult.error.flatten());
    }

    const { page, pageSize, search, statusId, categoryId, managerId, clientId, statusGroup } = queryResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;

    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const result = await listProjects(sb, {
      page,
      pageSize,
      search,
      statusId,
      categoryId,
      managerId,
      clientId,
      statusGroup,
      includeDeleted: false,
    });

    return NextResponse.json({
      success: true,
      count: result.data.length,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[API PROJECTS GET EXCEPTION]', error);
    return internalServerError('Falha inesperada ao obter projetos.', requestId);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    const rawBody = await req.json();
    const parseResult = createProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para criação do projeto.', requestId, parseResult.error.flatten());
    }

    const p = parseResult.data;
    const sb = (await getServerDbClient(req)) || defaultSupabase;
    if (!sb) {
      return internalServerError('Base de dados Supabase não disponível.', requestId);
    }

    const effectiveTeams = Array.from(new Set([...(p.teamsInvolvedIds || []), ...(p.teamIds || [])]));
    const effectivePartners = Array.from(new Set([...(p.partnersIds || []), ...(p.partnerIds || [])]));
    const effectiveCategories = Array.from(new Set([...(p.categoryIds || []), ...(p.categoryId ? [p.categoryId] : [])]));

    // Strict validation of all foreign keys & relational IDs before database modification
    const validation = await validateProjectRelations(
      sb,
      {
        clientId: p.clientId,
        statusId: p.statusId,
        categoryId: p.categoryId,
        categoryIds: effectiveCategories,
        projectManagerId: p.projectManagerId,
        fieldManagerId: p.fieldManagerId,
        salesRepId: p.salesRepId,
        teamsInvolvedIds: effectiveTeams,
        partnersIds: effectivePartners,
        priorityId: p.priorityId,
        riskId: p.riskId,
      },
      true
    );

    if (!validation.valid) {
      return badRequest(validation.message || 'Dados relacionais de projeto inválidos.', requestId);
    }

    const finalInput = {
      ...p,
      statusId: validation.resolvedStatusId || p.statusId || '',
      categoryId: validation.resolvedCategoryId || p.categoryId || (effectiveCategories[0] || ''),
      categoryIds: effectiveCategories,
      teamsInvolvedIds: effectiveTeams,
      partnersIds: effectivePartners,
      priorityId: validation.resolvedPriorityId || p.priorityId || '',
      riskId: p.riskId || '',
    };

    const newProject = await createProject(sb, finalInput, user.id);

    await logAuditEvent({
      action: 'PROJECT_CREATED',
      userId: user.id,
      entity: 'projects',
      entityId: newProject.id,
      details: { title: newProject.title, clientId: newProject.clientId },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Projeto criado com sucesso.',
        data: newProject,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API PROJECT POST EXCEPTION]', error);
    return internalServerError('Erro inesperado na criação do projeto.', requestId);
  }
}
