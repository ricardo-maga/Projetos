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
    const directCatIds = parseCommaSeparated(row.category_ids || (row.category_id ? [row.category_id] : []));
    const linkCatIds = categoriesByProject.get(row.id) || [];
    const categoryIds = Array.from(new Set([...linkCatIds, ...directCatIds]));

    const directTeamIds = parseCommaSeparated(row.teams_involved_ids || row.teams_ids);
    const linkTeamIds = teamsByProject.get(row.id) || [];
    const teamsInvolvedIds = Array.from(new Set([...linkTeamIds, ...directTeamIds]));

    const directPartnerIds = parseCommaSeparated(row.partners_ids);
    const linkPartnerIds = partnersByProject.get(row.id) || [];
    const partnersIds = Array.from(new Set([...linkPartnerIds, ...directPartnerIds]));

    return {
      id: row.id,
      demo: Boolean(row.demo),
      clientId: row.client_id || row.clientId || '',
      title: row.project_title || row.title || '',
      description: row.project_description || row.description || '',
      categoryId: row.category_id || row.categoryId || categoryIds[0] || '',
      categoryIds,
      statusId: row.status_id || row.statusId || '',
      priorityId: priorityByProject.get(row.id) || row.priority_id || row.priorityId || '',
      riskId: riskByProject.get(row.id) || row.risk_id || row.riskId || '',
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
