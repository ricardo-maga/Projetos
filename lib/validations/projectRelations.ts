import { SupabaseClient } from '@supabase/supabase-js';

export interface ProjectRelationParams {
  clientId?: string | null;
  statusId?: string | null;
  categoryId?: string | null;
  categoryIds?: string[] | null;
  projectManagerId?: string | null;
  fieldManagerId?: string | null;
  salesRepId?: string | null;
  teamsInvolvedIds?: string[] | null;
  partnersIds?: string[] | null;
  priorityId?: string | null;
  riskId?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  field?: string;
  resolvedStatusId?: string;
  resolvedCategoryId?: string;
  resolvedPriorityId?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(val: string): boolean {
  return UUID_REGEX.test(val.trim());
}

/**
 * Validates that all provided relational IDs strictly exist in the database and are active (not deleted).
 * Also resolves default status/category/priority if none were supplied.
 */
export async function validateProjectRelations(
  sb: SupabaseClient,
  params: ProjectRelationParams,
  isCreate: boolean = false
): Promise<ValidationResult> {
  // 1. Client ID
  if (params.clientId && params.clientId.trim()) {
    const cid = params.clientId.trim();
    if (!isValidUUID(cid)) {
      return { valid: false, field: 'clientId', message: `ID de cliente inválido: formato UUID esperado.` };
    }
    const { data: client, error } = await sb
      .from('clients')
      .select('id, deleted')
      .eq('id', cid)
      .maybeSingle();

    if (error || !client || client.deleted) {
      return { valid: false, field: 'clientId', message: `Cliente especificado (${cid}) não foi encontrado ou está inativo.` };
    }
  }

  // 2. Status ID
  let resolvedStatusId = params.statusId?.trim() || '';
  if (resolvedStatusId) {
    if (!isValidUUID(resolvedStatusId)) {
      return { valid: false, field: 'statusId', message: `ID de estado de projeto inválido: formato UUID esperado.` };
    }
    const { data: statusRow, error } = await sb
      .from('project_status')
      .select('id, deleted')
      .eq('id', resolvedStatusId)
      .maybeSingle();

    if (error || !statusRow || statusRow.deleted) {
      return { valid: false, field: 'statusId', message: `Estado de projeto especificado (${resolvedStatusId}) não existe ou está inativo.` };
    }
  } else if (isCreate) {
    // If not specified on create, resolve the default status from DB (lowest sort_order or scale)
    const { data: defaultStatus } = await sb
      .from('project_status')
      .select('id')
      .eq('deleted', false)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultStatus?.id) {
      resolvedStatusId = defaultStatus.id;
    }
  }

  // 3. Category ID & Category IDs
  const allCatIds = Array.from(
    new Set([
      ...(params.categoryId && params.categoryId.trim() ? [params.categoryId.trim()] : []),
      ...((params.categoryIds || []).map((c) => c.trim()).filter(Boolean)),
    ])
  );

  let resolvedCategoryId = params.categoryId?.trim() || '';
  if (allCatIds.length > 0) {
    for (const catId of allCatIds) {
      if (!isValidUUID(catId)) {
        return { valid: false, field: 'categoryIds', message: `ID de categoria inválido: "${catId}". Formato UUID esperado.` };
      }
    }
    const { data: validCats, error } = await sb
      .from('project_category')
      .select('id, deleted')
      .in('id', allCatIds);

    if (error || !validCats) {
      return { valid: false, field: 'categoryIds', message: 'Erro ao validar categorias do projeto na base de dados.' };
    }
    const activeValidSet = new Set(validCats.filter((c: any) => !c.deleted).map((c: any) => c.id));
    for (const catId of allCatIds) {
      if (!activeValidSet.has(catId)) {
        return { valid: false, field: 'categoryIds', message: `Categoria de projeto "${catId}" não existe ou está inativa.` };
      }
    }
    if (!resolvedCategoryId && allCatIds.length > 0) {
      resolvedCategoryId = allCatIds[0];
    }
  } else if (isCreate) {
    // Resolve default category from DB
    const { data: defaultCat } = await sb
      .from('project_category')
      .select('id')
      .eq('deleted', false)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultCat?.id) {
      resolvedCategoryId = defaultCat.id;
    }
  }

  // 4. Users: Project Manager, Field Manager, Sales Rep
  const usersToCheck: { field: string; id: string; roleName: string }[] = [];
  if (params.projectManagerId && params.projectManagerId.trim()) {
    usersToCheck.push({ field: 'projectManagerId', id: params.projectManagerId.trim(), roleName: 'Gestor de projeto' });
  }
  if (params.fieldManagerId && params.fieldManagerId.trim()) {
    usersToCheck.push({ field: 'fieldManagerId', id: params.fieldManagerId.trim(), roleName: 'Responsável de campo' });
  }
  if (params.salesRepId && params.salesRepId.trim()) {
    usersToCheck.push({ field: 'salesRepId', id: params.salesRepId.trim(), roleName: 'Comercial' });
  }

  for (const item of usersToCheck) {
    if (!isValidUUID(item.id)) {
      return { valid: false, field: item.field, message: `ID de utilizador inválido para ${item.roleName}: "${item.id}". Formato UUID esperado.` };
    }
  }

  if (usersToCheck.length > 0) {
    const userIds = usersToCheck.map((u) => u.id);
    const { data: dbUsers, error } = await sb
      .from('users')
      .select('id, deleted')
      .in('id', userIds);

    if (error || !dbUsers) {
      return { valid: false, message: 'Erro ao validar utilizadores responsáveis na base de dados.' };
    }

    const activeUserMap = new Map(dbUsers.map((u: any) => [u.id, !u.deleted]));
    for (const item of usersToCheck) {
      const isActive = activeUserMap.get(item.id);
      if (isActive === undefined || !isActive) {
        return { valid: false, field: item.field, message: `${item.roleName} (${item.id}) não existe ou está inativo.` };
      }
    }
  }

  // 5. Teams
  const teamsToCheck = (params.teamsInvolvedIds || []).map((t) => t.trim()).filter(Boolean);
  if (teamsToCheck.length > 0) {
    for (const teamId of teamsToCheck) {
      if (!isValidUUID(teamId)) {
        return { valid: false, field: 'teamsInvolvedIds', message: `ID de equipa inválido: "${teamId}". Formato UUID esperado.` };
      }
    }
    const { data: dbTeams, error } = await sb
      .from('project_teams')
      .select('id, deleted')
      .in('id', teamsToCheck);

    if (error || !dbTeams) {
      return { valid: false, field: 'teamsInvolvedIds', message: 'Erro ao validar equipas na base de dados.' };
    }
    const activeTeamSet = new Set(dbTeams.filter((t: any) => !t.deleted).map((t: any) => t.id));
    for (const teamId of teamsToCheck) {
      if (!activeTeamSet.has(teamId)) {
        return { valid: false, field: 'teamsInvolvedIds', message: `Equipa "${teamId}" não existe ou está inativa.` };
      }
    }
  }

  // 6. Partners
  const partnersToCheck = (params.partnersIds || []).map((p) => p.trim()).filter(Boolean);
  if (partnersToCheck.length > 0) {
    for (const partnerId of partnersToCheck) {
      if (!isValidUUID(partnerId)) {
        return { valid: false, field: 'partnersIds', message: `ID de parceiro inválido: "${partnerId}". Formato UUID esperado.` };
      }
    }
    const { data: dbPartners, error } = await sb
      .from('project_partners')
      .select('id, deleted')
      .in('id', partnersToCheck);

    if (error || !dbPartners) {
      return { valid: false, field: 'partnersIds', message: 'Erro ao validar parceiros na base de dados.' };
    }
    const activePartnerSet = new Set(dbPartners.filter((p: any) => !p.deleted).map((p: any) => p.id));
    for (const partnerId of partnersToCheck) {
      if (!activePartnerSet.has(partnerId)) {
        return { valid: false, field: 'partnersIds', message: `Parceiro "${partnerId}" não existe ou está inativo.` };
      }
    }
  }

  // 7. Priority
  let resolvedPriorityId = params.priorityId?.trim() || '';
  if (resolvedPriorityId) {
    if (!isValidUUID(resolvedPriorityId)) {
      return { valid: false, field: 'priorityId', message: `ID de prioridade inválido: formato UUID esperado.` };
    }
    const { data: prioRow, error } = await sb
      .from('project_priority')
      .select('id, deleted')
      .eq('id', resolvedPriorityId)
      .maybeSingle();

    if (error || !prioRow || prioRow.deleted) {
      return { valid: false, field: 'priorityId', message: `Prioridade especificada (${resolvedPriorityId}) não existe ou está inativa.` };
    }
  } else if (isCreate) {
    const { data: defaultPrio } = await sb
      .from('project_priority')
      .select('id')
      .eq('deleted', false)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultPrio?.id) {
      resolvedPriorityId = defaultPrio.id;
    }
  }

  // 8. Risk
  if (params.riskId && params.riskId.trim()) {
    const rid = params.riskId.trim();
    if (!isValidUUID(rid)) {
      return { valid: false, field: 'riskId', message: `ID de risco inválido: formato UUID esperado.` };
    }
    const { data: riskRow, error } = await sb
      .from('project_risk')
      .select('id, deleted')
      .eq('id', rid)
      .maybeSingle();

    if (error || !riskRow || riskRow.deleted) {
      return { valid: false, field: 'riskId', message: `Risco especificado (${rid}) não existe ou está inativo.` };
    }
  }

  return {
    valid: true,
    resolvedStatusId,
    resolvedCategoryId,
    resolvedPriorityId,
  };
}
