import { createApiHandler } from '@/lib/apiErrors';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { createProjectSchema, projectListSchema } from '@/domains/projects/contracts/project';
import { decodeProjectCursor } from '@/domains/projects/contracts/projectListCursor';
import { isNotModified, resourceTag, validationHeaders } from '@/lib/security/resourceVersion';
import { validateProjectRelations } from '@/domains/projects/contracts/projectRelations';
import { validationError, badRequest, internalServerError, serviceUnavailable } from '@/lib/apiErrors';
import { getServerDbClient } from '@/lib/supabase/server';
import { createProject, listProjects } from '@/domains/projects/modules/projectService';
import { getIdempotentEntityId, withUserIdempotency } from '@/lib/apiIdempotency';

const relationFields = {
  teams: 'teamsInvolvedIds', partners: 'partnersIds', categories: 'categoryIds', priority: 'priorityId', risk: 'riskId',
} as const;

async function handleGet(req: NextRequest) {
  const startedAt = performance.now();
  const auth = await requirePermission(req, 'projects_read');
  if (!auth.success) return auth.response;
  const authorizedAt = performance.now();

  const { requestId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const queryResult = projectListSchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!queryResult.success) {
      return validationError('Parâmetros de consulta inválidos.', requestId, queryResult.error.flatten());
    }

    const { page, pageSize, search, statusId, categoryId, managerId, clientId, statusGroup,
      pagination, cursor: cursorParam, fields, include, sort = '-createdAt' } = queryResult.data;
    const cursorPagination = pagination === 'cursor' || Boolean(cursorParam);
    const cursor = cursorParam ? decodeProjectCursor(cursorParam, sort) : null;
    if (cursorParam && (!cursor || pagination === 'offset'))
      return badRequest('Cursor inválido para a ordenação ou paginação indicada.', requestId);
    const sb = await getServerDbClient(req, auth.user);

    if (!sb) {
      return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
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
      sort,
      cursorPagination,
      cursor: cursor || undefined,
      includeDeleted: false,
    });

    const queriedAt = performance.now();

    const included = include?.split(',').map(key => relationFields[key as keyof typeof relationFields]);
    const selected = fields ? new Set(['id', ...fields.split(','), ...(included || [])]) : null;
    const excluded = included && new Set<string>(Object.values(relationFields).filter(field => !included.includes(field)));
    const data = selected || excluded ? result.data.map(project => Object.fromEntries(
      Object.entries(project).filter(([field]) => selected ? selected.has(field) : !excluded?.has(field)),
    )) : result.data;
    const payload = {
      success: true,
      count: result.data.length,
      pageSize: result.pageSize,
      ...(cursorPagination ? { nextCursor: result.nextCursor } :
        { total: result.total, page: result.page, totalPages: result.totalPages }),
      data,
    };
    const etag = resourceTag(payload);
    const headers = {
      ...validationHeaders(etag),
      'Server-Timing': `auth;dur=${(authorizedAt - startedAt).toFixed(1)}, projects;dur=${(queriedAt - authorizedAt).toFixed(1)}`,
    };
    if (isNotModified(req, etag)) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json(payload, { headers });
  } catch (error: any) {
    console.error('[API PROJECTS GET EXCEPTION]', error);
    return internalServerError('Falha inesperada ao obter projetos.', requestId);
  }
}

async function createProjectHandler(req: NextRequest) {
  const auth = await requirePermission(req, 'projects_write');
  if (!auth.success) return auth.response;

  const { user, requestId } = auth;

  try {
    let rawBody: unknown;
    try { rawBody = await req.json(); }
    catch { return badRequest('Corpo JSON inválido.', requestId); }
    const parseResult = createProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationError('Dados inválidos para criação do projeto.', requestId, parseResult.error.flatten());
    }

    const p = parseResult.data;
    const sb = await getServerDbClient(req, auth.user);
    if (!sb) {
      return serviceUnavailable('Base de dados Supabase não disponível.', requestId);
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
      ...(getIdempotentEntityId(req) ? { id: getIdempotentEntityId(req) } : {}),
      statusId: validation.resolvedStatusId || p.statusId || '',
      categoryId: validation.resolvedCategoryId || p.categoryId || (effectiveCategories[0] || ''),
      categoryIds: effectiveCategories,
      teamsInvolvedIds: effectiveTeams,
      partnersIds: effectivePartners,
      priorityId: validation.resolvedPriorityId || p.priorityId || '',
      riskId: p.riskId || '',
    };

    const newProject = await createProject(sb, finalInput, user.id);

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

export const POST = withUserIdempotency(createProjectHandler, 'projects:create', 'projects_write');

export const GET = createApiHandler(handleGet);
