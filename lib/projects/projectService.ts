import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@/lib/types';

export interface GetProjectsServerDataOptions {
  page?: number;
  pageSize?: number;
  all?: boolean;
  includeDeleted?: boolean;
  search?: string;
  statusGroup?: string;
  statusId?: string;
  categoryId?: string;
  managerId?: string;
  clientId?: string;
}

export interface GetProjectsServerDataResult {
  data: Project[];
  total: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

const parseCommaSeparated = (val: any): string[] => {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

/**
 * Pure server-side function to query, filter, paginate and map Projects along with junction link tables.
 * Centralizes project fetching logic for both API endpoints (/api/v1/projects) and global sync.
 */
export async function getProjectsServerData(
  client: SupabaseClient,
  options: GetProjectsServerDataOptions = {}
): Promise<GetProjectsServerDataResult> {
  const includeDeleted = Boolean(options.includeDeleted);
  const fetchAll = Boolean(options.all);
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 20;

  let query = client.from('projects').select('*', { count: 'exact' });

  if (!includeDeleted) {
    query = query.eq('deleted', false);
  }

  // 1. Search Filter
  if (options.search && options.search.trim()) {
    const q = `%${options.search.trim()}%`;
    const { data: matchedClients } = await client
      .from('clients')
      .select('id')
      .or(`client_name.ilike.${q},short_name.ilike.${q}`);
    const clientIds = (matchedClients || []).map((c: any) => c.id);

    const { data: matchedUsers } = await client.from('users').select('id').ilike('name', q);
    const userIds = (matchedUsers || []).map((u: any) => u.id);

    let orClauses = [
      `project_title.ilike.${q}`,
      `project_description.ilike.${q}`,
      `install_project_no.ilike.${q}`,
      `sf_opportunity_no.ilike.${q}`,
    ];
    if (clientIds.length > 0) {
      clientIds.forEach(cid => orClauses.push(`client_id.eq.${cid}`));
    }
    if (userIds.length > 0) {
      userIds.forEach(uid => orClauses.push(`project_manager_id.eq.${uid}`));
    }
    query = query.or(orClauses.join(','));
  }

  // 2. Status Group Filter
  if (options.statusGroup && options.statusGroup !== 'all') {
    const { data: statusesData } = await client.from('project_status').select('id, scale, name');
    if (statusesData) {
      const matchingStatusIds = statusesData
        .filter((st: any) => {
          const scale = st.scale !== undefined ? Number(st.scale) : 1;
          const name = (st.name || '').toLowerCase();
          const isLvl5 = scale >= 5 || name.includes('conclu') || name.includes('suspen') || name.includes('cancel');
          const lvl = isLvl5 ? 5 : scale;
          if (options.statusGroup === 'active') return lvl >= 1 && lvl <= 4;
          if (options.statusGroup === 'implementation') return lvl === 4;
          if (options.statusGroup === 'completed') return lvl >= 5;
          return true;
        })
        .map((st: any) => st.id);

      if (matchingStatusIds.length > 0) {
        query = query.in('status_id', matchingStatusIds);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }
  }

  // 3. Exact Field Filters
  if (options.statusId) {
    query = query.eq('status_id', options.statusId);
  }
  if (options.categoryId) {
    query = query.eq('category_id', options.categoryId);
  }
  if (options.managerId) {
    query = query.or(
      `project_manager_id.eq.${options.managerId},field_manager_id.eq.${options.managerId},sales_rep_id.eq.${options.managerId}`
    );
  }
  if (options.clientId) {
    query = query.eq('client_id', options.clientId);
  }

  // 4. Order and Range Execution
  query = query.order('created_at', { ascending: false });

  if (!fetchAll) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data: projectsData, count, error } = await query;

  if (error) {
    throw error;
  }

  const total = count || (projectsData || []).length;
  const totalPages = fetchAll ? 1 : Math.ceil(total / pageSize);
  const projectIds = (projectsData || []).map((p: any) => p.id);

  if (projectIds.length === 0) {
    return {
      data: [],
      total: 0,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? 0 : pageSize,
      totalPages: 0,
    };
  }

  // 5. Fetch link relation tables in parallel
  const fetchLinkData = async (tableName: string, colName: string) => {
    const res = await client.from(tableName).select(`project_id, ${colName}`).in('project_id', projectIds);
    if (res.error) {
      throw res.error;
    }
    return res.data || [];
  };

  const [teamsRes, partnersRes, categoriesRes, priorityRes, riskRes] = await Promise.all([
    fetchLinkData('project_teams_link', 'team_id'),
    fetchLinkData('project_partners_link', 'partner_id'),
    fetchLinkData('project_category_link', 'category_id'),
    fetchLinkData('project_priority_link', 'priority_id'),
    fetchLinkData('project_risk_link', 'risk_id'),
  ]);

  const teamsByProject = new Map<string, string[]>();
  teamsRes.forEach((row: any) => {
    if (row.project_id && row.team_id) {
      const current = teamsByProject.get(row.project_id) || [];
      current.push(row.team_id);
      teamsByProject.set(row.project_id, current);
    }
  });

  const partnersByProject = new Map<string, string[]>();
  partnersRes.forEach((row: any) => {
    if (row.project_id && row.partner_id) {
      const current = partnersByProject.get(row.project_id) || [];
      current.push(row.partner_id);
      partnersByProject.set(row.project_id, current);
    }
  });

  const categoriesByProject = new Map<string, string[]>();
  categoriesRes.forEach((row: any) => {
    if (row.project_id && row.category_id) {
      const current = categoriesByProject.get(row.project_id) || [];
      current.push(row.category_id);
      categoriesByProject.set(row.project_id, current);
    }
  });

  const priorityByProject = new Map<string, string>();
  priorityRes.forEach((row: any) => {
    if (row.project_id && row.priority_id) {
      priorityByProject.set(row.project_id, row.priority_id);
    }
  });

  const riskByProject = new Map<string, string>();
  riskRes.forEach((row: any) => {
    if (row.project_id && row.risk_id) {
      riskByProject.set(row.project_id, row.risk_id);
    }
  });

  // 6. Map database rows to Project interface
  const data: Project[] = (projectsData || []).map((row: any) => {
    const categoryIds = categoriesByProject.get(row.id) || [];
    const teamsInvolvedIds = teamsByProject.get(row.id) || [];
    const partnersIds = partnersByProject.get(row.id) || [];

    return {
      id: row.id,
      demo: Boolean(row.demo),
      clientId: row.client_id || row.clientId || '',
      title: row.project_title || row.title || '',
      description: row.project_description || row.description || '',
      categoryId: row.category_id || row.categoryId || categoryIds[0] || '',
      categoryIds,
      statusId: row.status_id || row.statusId || '',
      priorityId: priorityByProject.get(row.id) || '',
      riskId: riskByProject.get(row.id) || '',
      projectManagerId: row.project_manager_id || row.projectManagerId || '',
      fieldManagerId: row.field_manager_id || row.fieldManagerId || '',
      salesRepId: row.sales_rep_id || row.salesRepId || '',
      teamsInvolvedIds,
      partnersIds,
      startDate: row.start_date || row.startDate || '',
      deliveryDate: row.delivery_date || row.deliveryDate || '',
      estimatedDate: row.estimated_date || row.estimatedDate || '',
      scheduledDate: row.scheduled_date || row.scheduledDate || '',
      completedDate: row.completed_date || row.completedDate || '',
      installProjectNo: row.install_project_no || row.installProjectNo || '',
      sfOpportunityNo: row.sf_opportunity_no || row.sfOpportunityNo || '',
      budgetValue: Number(row.budget_value ?? row.budgetValue ?? 0),
      isUrgent: Boolean(row.is_urgent),
      documents: parseCommaSeparated(row.documents),
      clientContactName: row.client_contact_name || row.clientContactName || '',
      clientContactEmail: row.client_contact_email || row.clientContactEmail || '',
      clientContactPhone: row.client_contact_phone || row.clientContactPhone || '',
      color: row.color || '',
      notes: row.notes || '',
      createdById: row.created_by || row.createdById || '',
      deleted: Boolean(row.deleted),
      createdDate: row.created_at || row.createdDate || '',
      updatedDate: row.updated_at || row.updatedDate || '',
      createdAt: row.created_at || row.createdAt || '',
      updatedAt: row.updated_at || row.updatedAt || '',
      createdBy: row.created_by || row.createdBy || '',
      updatedBy: row.updated_by || row.updatedBy || '',
      version: row.version !== undefined && row.version !== null ? Number(row.version) : row.version,
    } as any;
  });

  return {
    data,
    total,
    page: fetchAll ? 1 : page,
    pageSize: fetchAll ? data.length : pageSize,
    totalPages,
  };
}

/**
 * Creates a project along with all of its relations atomically via PostgreSQL RPC.
 */
export async function createProject(
  client: SupabaseClient,
  input: any,
  userId: string
): Promise<Project> {
  const pId = input.id || crypto.randomUUID();
  const effectiveTeams = Array.from(new Set([...(input.teamsInvolvedIds || []), ...(input.teamIds || [])]));
  const effectivePartners = Array.from(new Set([...(input.partnersIds || []), ...(input.partnerIds || [])]));
  const effectiveCategories = Array.from(new Set([...(input.categoryIds || []), ...(input.categoryId ? [input.categoryId] : [])]));

  const { error } = await client.rpc('create_project_transaction', {
    p_id: pId,
    p_demo: Boolean(input.demo),
    p_client_id: input.clientId?.trim() || null,
    p_project_title: input.title,
    p_project_description: input.description || '',
    p_status_id: input.statusId || null,
    p_project_manager_id: input.projectManagerId?.trim() || null,
    p_field_manager_id: input.fieldManagerId?.trim() || null,
    p_sales_rep_id: input.salesRepId?.trim() || null,
    p_start_date: input.startDate || null,
    p_delivery_date: input.deliveryDate || null,
    p_estimated_date: input.estimatedDate || null,
    p_scheduled_date: input.scheduledDate || null,
    p_install_project_no: input.installProjectNo || '',
    p_sf_opportunity_no: input.sfOpportunityNo || '',
    p_documents: Array.isArray(input.documents) ? input.documents.join(',') : (input.documents || ''),
    p_budget_value: Number(input.budgetValue || 0),
    p_client_contact_name: input.clientContactName || '',
    p_client_contact_email: input.clientContactEmail || '',
    p_client_contact_phone: input.clientContactPhone || '',
    p_color: input.color || '',
    p_notes: input.notes || '',
    p_created_by: userId,
    p_is_urgent: Boolean(input.isUrgent),
    p_priority_id: input.priorityId || null,
    p_risk_id: input.riskId || null,
    p_category_ids: effectiveCategories,
    p_teams_involved_ids: effectiveTeams,
    p_partners_ids: effectivePartners
  });

  if (error) {
    throw error;
  }

  const project = await getProject(client, pId);
  if (!project) {
    throw new Error('Project was created but could not be retrieved.');
  }
  return project;
}

/**
 * Updates a project along with all of its relations atomically via PostgreSQL RPC.
 */
export async function updateProject(
  client: SupabaseClient,
  id: string,
  input: any,
  userId: string,
  currentVersion?: number
): Promise<Project> {
  const current = await getProject(client, id);
  if (!current) {
    throw new Error('Project not found.');
  }

  if (currentVersion !== undefined && current.version !== undefined && current.version !== currentVersion) {
    const err = new Error('Conflito de concorrência.');
    (err as any).code = 'concurrency';
    (err as any).currentVersion = current.version;
    throw err;
  }

  // Sanitize input to eliminate any undefined fields so they do not overwrite current values via spread
  const sanitizedInput = { ...input };
  Object.keys(sanitizedInput).forEach((key) => {
    if (sanitizedInput[key] === undefined) {
      delete sanitizedInput[key];
    }
  });

  const merged = {
    ...current,
    ...sanitizedInput,
    categoryIds: sanitizedInput.categoryIds !== undefined ? sanitizedInput.categoryIds : current.categoryIds,
    teamsInvolvedIds: sanitizedInput.teamsInvolvedIds !== undefined ? sanitizedInput.teamsInvolvedIds : current.teamsInvolvedIds,
    partnersIds: sanitizedInput.partnersIds !== undefined ? sanitizedInput.partnersIds : current.partnersIds,
  };

  const effectiveTeams = merged.teamsInvolvedIds || [];
  const effectivePartners = merged.partnersIds || [];
  const effectiveCategories = merged.categoryIds || [];

  const { error } = await client.rpc('update_project_transaction', {
    p_id: id,
    p_demo: Boolean(merged.demo),
    p_client_id: merged.clientId?.trim() || null,
    p_project_title: merged.title,
    p_project_description: merged.description || '',
    p_status_id: merged.statusId || null,
    p_project_manager_id: merged.projectManagerId?.trim() || null,
    p_field_manager_id: merged.fieldManagerId?.trim() || null,
    p_sales_rep_id: merged.salesRepId?.trim() || null,
    p_start_date: merged.startDate || null,
    p_delivery_date: merged.deliveryDate || null,
    p_estimated_date: merged.estimatedDate || null,
    p_scheduled_date: merged.scheduledDate || null,
    p_completed_date: merged.completedDate || null,
    p_install_project_no: merged.installProjectNo || '',
    p_sf_opportunity_no: merged.sfOpportunityNo || '',
    p_documents: Array.isArray(merged.documents) ? merged.documents.join(',') : (merged.documents || ''),
    p_budget_value: Number(merged.budgetValue || 0),
    p_client_contact_name: merged.clientContactName || '',
    p_client_contact_email: merged.clientContactEmail || '',
    p_client_contact_phone: merged.clientContactPhone || '',
    p_color: merged.color || '',
    p_notes: merged.notes || '',
    p_is_urgent: Boolean(merged.isUrgent),
    p_updated_by: userId,
    p_expected_version: currentVersion !== undefined ? currentVersion : (current.version || 1),
    p_priority_id: merged.priorityId || null,
    p_risk_id: merged.riskId || null,
    p_category_ids: effectiveCategories,
    p_teams_involved_ids: effectiveTeams,
    p_partners_ids: effectivePartners
  });

  if (error) {
    if (error.code === 'P0001' || error.message?.includes('concurrency') || error.message?.includes('conflict') || error.message?.includes('Concurrency')) {
      const err = new Error('Conflito de concorrência.');
      (err as any).code = 'concurrency';
      (err as any).currentVersion = current.version;
      throw err;
    }
    throw error;
  }

  const project = await getProject(client, id);
  if (!project) {
    throw new Error('Project was updated but could not be retrieved.');
  }
  return project;
}

export async function getProject(
  client: SupabaseClient,
  id: string
): Promise<Project | null> {
  const result = await getProjectsServerData(client, { all: true, includeDeleted: true });
  const found = result.data.find(p => p.id === id);
  return found || null;
}

export async function listProjects(
  client: SupabaseClient,
  options: GetProjectsServerDataOptions = {}
): Promise<GetProjectsServerDataResult> {
  return getProjectsServerData(client, options);
}

export async function deleteProject(
  client: SupabaseClient,
  id: string,
  userId?: string
): Promise<void> {
  const current = await getProject(client, id);
  if (!current) {
    throw new Error('Project not found.');
  }

  const [tasksRes, quotesRes, materialsRes] = await Promise.all([
    client.from('tasks').select('id, deleted').eq('project_id', id),
    client.from('quotes').select('id, deleted').eq('project_id', id),
    client.from('project_materials').select('id, deleted').eq('project_id', id),
  ]);

  const activeTasksCount = (tasksRes.data || []).filter((t: any) => !t.deleted).length;
  const activeQuotesCount = (quotesRes.data || []).filter((q: any) => !q.deleted).length;
  const activeMaterialsCount = (materialsRes.data || []).filter((m: any) => !m.deleted).length;

  const dependencies: string[] = [];
  if (activeTasksCount > 0) dependencies.push(`${activeTasksCount} tarefa(s) ativa(s)`);
  if (activeQuotesCount > 0) dependencies.push(`${activeQuotesCount} orçamento(s)`);
  if (activeMaterialsCount > 0) dependencies.push(`${activeMaterialsCount} material(ais) associado(s)`);

  if (dependencies.length > 0) {
    const err = new Error(`Não é possível eliminar o projeto: ${dependencies.join(', ')}`);
    (err as any).code = 'dependency';
    throw err;
  }

  const nextVersion = (current.version || 1) + 1;
  const { error } = await client
    .from('projects')
    .update({
      deleted: true,
      version: nextVersion,
      updated_by: userId || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    throw error;
  }
}
