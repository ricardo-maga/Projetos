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
 * Creates a project along with all of its relations atomically via RPC.
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

  let rpcSuccess = false;
  if (typeof client.rpc === 'function') {
    try {
      const { data, error } = await client.rpc('create_project_transaction', {
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

      if (!error) {
        rpcSuccess = true;
      } else if (error.code === 'P0001' || error.message?.includes('concurrency') || error.message?.includes('conflict')) {
        throw error;
      }
    } catch (err: any) {
      if (err?.code === 'P0001' || err?.message?.includes('concurrency') || err?.message?.includes('conflict')) {
        throw err;
      }
      rpcSuccess = false;
    }
  }

  // Fallback sequential insert for non-RPC or Mock environments
  if (!rpcSuccess) {
    const now = new Date().toISOString();
    const docString = Array.isArray(input.documents) ? input.documents.join(',') : (input.documents || '');

    const coreInsertPayload: Record<string, any> = {
      id: pId,
      project_title: input.title,
      client_id: input.clientId?.trim() || null,
      project_description: input.description || '',
      install_project_no: input.installProjectNo || '',
      sf_opportunity_no: input.sfOpportunityNo || '',
      status_id: input.statusId || null,
      category_id: effectiveCategories[0] || null,
      project_manager_id: input.projectManagerId?.trim() || null,
      field_manager_id: input.fieldManagerId?.trim() || null,
      sales_rep_id: input.salesRepId?.trim() || null,
      start_date: input.startDate || null,
      delivery_date: input.deliveryDate || null,
      estimated_date: input.estimatedDate || null,
      scheduled_date: input.scheduledDate || null,
      completed_date: input.completedDate || null,
      budget_value: Number(input.budgetValue || 0),
      demo: Boolean(input.demo),
      documents: docString,
      client_contact_name: input.clientContactName || '',
      client_contact_email: input.clientContactEmail || '',
      client_contact_phone: input.clientContactPhone || '',
      deleted: false,
      version: 1,
      created_by: userId,
      updated_by: userId,
      created_at: now,
      updated_at: now,
      is_urgent: Boolean(input.isUrgent),
      color: input.color || null,
      notes: input.notes || null,
    };

    const { error: insertError } = await client.from('projects').insert([coreInsertPayload]);
    if (insertError) throw insertError;

    try {
      if (input.priorityId) {
        const { error: prioErr } = await client.from('project_priority_link').insert([{ project_id: pId, priority_id: input.priorityId }]);
        if (prioErr) throw prioErr;
      }
      if (input.riskId) {
        const { error: riskErr } = await client.from('project_risk_link').insert([{ project_id: pId, risk_id: input.riskId }]);
        if (riskErr) throw riskErr;
      }
      if (effectiveTeams.length > 0) {
        const teamLinks = effectiveTeams.map((tid) => ({ project_id: pId, team_id: tid }));
        const { error: teamErr } = await client.from('project_teams_link').insert(teamLinks);
        if (teamErr) throw teamErr;
      }
      if (effectivePartners.length > 0) {
        const partnerLinks = effectivePartners.map((pid) => ({ project_id: pId, partner_id: pid }));
        const { error: partErr } = await client.from('project_partners_link').insert(partnerLinks);
        if (partErr) throw partErr;
      }
      if (effectiveCategories.length > 0) {
        const categoryLinks = effectiveCategories.map((cid) => ({ project_id: pId, category_id: cid }));
        const { error: catErr } = await client.from('project_category_link').insert(categoryLinks);
        if (catErr) throw catErr;
      }
    } catch (linkErr) {
      await client.from('projects').delete().eq('id', pId);
      throw linkErr;
    }
  }

  const project = await getProject(client, pId);
  if (!project) {
    throw new Error('Project was created but could not be retrieved.');
  }
  return project;
}

/**
 * Updates a project along with all of its relations atomically via RPC.
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

  const merged = {
    ...current,
    ...input,
    categoryIds: input.categoryIds !== undefined ? input.categoryIds : current.categoryIds,
    teamsInvolvedIds: input.teamsInvolvedIds !== undefined ? input.teamsInvolvedIds : current.teamsInvolvedIds,
    partnersIds: input.partnersIds !== undefined ? input.partnersIds : current.partnersIds,
  };

  const effectiveTeams = merged.teamsInvolvedIds || [];
  const effectivePartners = merged.partnersIds || [];
  const effectiveCategories = merged.categoryIds || [];

  let rpcSuccess = false;
  if (typeof client.rpc === 'function') {
    try {
      const { data: nextV, error } = await client.rpc('update_project_transaction', {
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

      if (!error) {
        rpcSuccess = true;
      } else if (error.code === 'P0001' || error.message?.includes('concurrency') || error.message?.includes('conflict') || error.message?.includes('Concurrency')) {
        const err = new Error('Conflito de concorrência.');
        (err as any).code = 'concurrency';
        (err as any).currentVersion = current.version;
        throw err;
      }
    } catch (err: any) {
      if (err?.code === 'concurrency' || err?.message?.includes('Conflito de concorrência') || err?.message?.includes('Concurrency')) {
        throw err;
      }
      rpcSuccess = false;
    }
  }

  // Fallback sequential update for non-RPC or Mock environments
  if (!rpcSuccess) {
    const now = new Date().toISOString();
    const docString = Array.isArray(merged.documents) ? merged.documents.join(',') : (merged.documents || '');
    const nextVersion = (current.version || 1) + 1;

    const updatePayload: Record<string, any> = {
      demo: Boolean(merged.demo),
      client_id: merged.clientId?.trim() || null,
      project_title: merged.title,
      project_description: merged.description || '',
      status_id: merged.statusId || null,
      category_id: effectiveCategories[0] || null,
      project_manager_id: merged.projectManagerId?.trim() || null,
      field_manager_id: merged.fieldManagerId?.trim() || null,
      sales_rep_id: merged.salesRepId?.trim() || null,
      start_date: merged.startDate || null,
      delivery_date: merged.deliveryDate || null,
      estimated_date: merged.estimatedDate || null,
      scheduled_date: merged.scheduledDate || null,
      completed_date: merged.completedDate || null,
      budget_value: Number(merged.budgetValue || 0),
      documents: docString,
      client_contact_name: merged.clientContactName || '',
      client_contact_email: merged.clientContactEmail || '',
      client_contact_phone: merged.clientContactPhone || '',
      color: merged.color || '',
      notes: merged.notes || '',
      is_urgent: Boolean(merged.isUrgent),
      version: nextVersion,
      updated_by: userId,
      updated_at: now,
    };

    let updateQuery = client.from('projects').update(updatePayload).eq('id', id);
    if (current.version !== undefined) {
      updateQuery = updateQuery.eq('version', current.version);
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select('id');
    if (updateError) throw updateError;

    if (current.version !== undefined && (!updatedRows || updatedRows.length === 0)) {
      const err = new Error('Conflito de concorrência.');
      (err as any).code = 'concurrency';
      (err as any).currentVersion = current.version;
      throw err;
    }

    if (input.teamsInvolvedIds !== undefined || input.teamIds !== undefined) {
      const { error: delTeamsErr } = await client.from('project_teams_link').delete().eq('project_id', id);
      if (delTeamsErr) throw delTeamsErr;
      if (effectiveTeams.length > 0) {
        const { error: insTeamsErr } = await client.from('project_teams_link').insert(effectiveTeams.map((t: string) => ({ project_id: id, team_id: t })));
        if (insTeamsErr) throw insTeamsErr;
      }
    }

    if (input.partnersIds !== undefined || input.partnerIds !== undefined) {
      const { error: delPartnersErr } = await client.from('project_partners_link').delete().eq('project_id', id);
      if (delPartnersErr) throw delPartnersErr;
      if (effectivePartners.length > 0) {
        const { error: insPartnersErr } = await client.from('project_partners_link').insert(effectivePartners.map((p: string) => ({ project_id: id, partner_id: p })));
        if (insPartnersErr) throw insPartnersErr;
      }
    }

    if (input.categoryIds !== undefined || input.categoryId !== undefined) {
      const { error: delCatsErr } = await client.from('project_category_link').delete().eq('project_id', id);
      if (delCatsErr) throw delCatsErr;
      if (effectiveCategories.length > 0) {
        const { error: insCatsErr } = await client.from('project_category_link').insert(effectiveCategories.map((c: string) => ({ project_id: id, category_id: c })));
        if (insCatsErr) throw insCatsErr;
      }
    }

    if (input.priorityId !== undefined) {
      const { error: delPrioErr } = await client.from('project_priority_link').delete().eq('project_id', id);
      if (delPrioErr) throw delPrioErr;
      if (merged.priorityId) {
        const { error: insPrioErr } = await client.from('project_priority_link').insert([{ project_id: id, priority_id: merged.priorityId }]);
        if (insPrioErr) throw insPrioErr;
      }
    }

    if (input.riskId !== undefined) {
      const { error: delRiskErr } = await client.from('project_risk_link').delete().eq('project_id', id);
      if (delRiskErr) throw delRiskErr;
      if (merged.riskId) {
        const { error: insRiskErr } = await client.from('project_risk_link').insert([{ project_id: id, risk_id: merged.riskId }]);
        if (insRiskErr) throw insRiskErr;
      }
    }
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
