import { supabase, isSupabaseConfigured } from './supabaseClient';
import { ERPState, Project, Task, Comment, UserAbsence, User, Client, Material, Quote, BillOfMaterial, Equipment, SpecialDay, DefaultTask, UserGroup, RiskCategory, RiskStatus, RiskPriority, ProjectRiskItem } from './types';
import { INITIAL_ERP_STATE } from './mockData';

export interface SupabaseBackup {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  state: ERPState;
}

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Formats and handles Supabase errors, translating network/connection timeouts into user-friendly messages
 */
export function formatSupabaseError(error: any): string {
  if (!error) return 'Erro desconhecido no Supabase';
  const msg = String(error.message || error.details || error).toLowerCase();
  
  if (
    msg.includes('fetch failed') || 
    msg.includes('timeout') || 
    msg.includes('connecttimeout') || 
    msg.includes('und_err_connect_timeout')
  ) {
    return 'Erro de Ligação: Não foi possível ligar ao servidor do Supabase (Tempo de espera esgotado / Timeout). Verifique se o URL do projeto e a chave Anon nas definições estão corretos e se o servidor tem ligação à internet.';
  }
  
  return error.message || JSON.stringify(error);
}

/**
 * Maps legacy/short/demonstration IDs into standard valid UUIDs
 */
export const stringToUUID = (str: string): string => {
  if (!str) return '';
  if (isUUID(str)) return str;
  
  const mappings: Record<string, string> = {
    // Groups
    'ug-1': '00000000-0000-0000-0000-000000000001',
    'ug-2': '00000000-0000-0000-0000-000000000002',
    'ug-3': '00000000-0000-0000-0000-000000000003',
    'ug-4': '00000000-0000-0000-0000-000000000004',
    
    // Statuses
    'ps-1': '33333333-3333-3333-3333-333333333301',
    'ps-2': '33333333-3333-3333-3333-333333333302',
    'ps-3': '33333333-3333-3333-3333-333333333303',
    'ps-4': '33333333-3333-3333-3333-333333333304',
    'ps-5': '33333333-3333-3333-3333-333333333305',
    'ps-6': '33333333-3333-3333-3333-333333333306',
    'ps-7': '33333333-3333-3333-3333-333333333307',
    'ps-8': '33333333-3333-3333-3333-333333333308',
    
    // Categories
    'pc-1': '44444444-4444-4444-4444-444444444401',
    'pc-2': '44444444-4444-4444-4444-444444444402',
    'pc-3': '44444444-4444-4444-4444-444444444403',
    'pc-4': '44444444-4444-4444-4444-444444444404',
    'pc-5': '44444444-4444-4444-4444-444444444405',
    'pc-6': '44444444-4444-4444-4444-444444444406',
    'pc-7': '44444444-4444-4444-4444-444444444407',
    
    // Risks
    'pr-1': '55555555-5555-5555-5555-555555555501',
    'pr-2': '55555555-5555-5555-5555-555555555502',
    'pr-3': '55555555-5555-5555-5555-555555555503',
    
    // Priorities
    'pp-1': '66666666-6666-6666-6666-666666666601',
    'pp-2': '66666666-6666-6666-6666-666666666602',
    'pp-3': '66666666-6666-6666-6666-666666666603',
    
    // Teams
    'pt-1': '77777777-7777-7777-7777-777777777701',
    'pt-2': '77777777-7777-7777-7777-777777777702',
    'pt-3': '77777777-7777-7777-7777-777777777703',
    'pt-4': '77777777-7777-7777-7777-777777777704',
    
    // Partners
    'par-1': '88888888-8888-8888-8888-888888888801',
    'par-2': '88888888-8888-8888-8888-888888888802',
    'par-3': '88888888-8888-8888-8888-888888888803',
    'par-4': '88888888-8888-8888-8888-888888888804',
    'par-5': '88888888-8888-8888-8888-888888888805',
    'par-6': '88888888-8888-8888-8888-888888888806',
    'par-7': '88888888-8888-8888-8888-888888888807',
    'par-8': '88888888-8888-8888-8888-888888888808',
    
    // Task Status
    'ts-1': '99999999-9999-9999-9999-999999999901',
    'ts-2': '99999999-9999-9999-9999-999999999902',
    'ts-3': '99999999-9999-9999-9999-999999999903',
    'ts-4': '99999999-9999-9999-9999-999999999904',
    
    // Task Types
    'tt-1': '33333333-3333-3333-3333-333333333301',
    'tt-2': '33333333-3333-3333-3333-333333333302',
    'tt-3': '33333333-3333-3333-3333-333333333303',
    'tt-4': '33333333-3333-3333-3333-333333333304',
    'tt-5': '33333333-3333-3333-3333-333333333305',
    'tt-6': '33333333-3333-3333-3333-333333333306',
    'tt-7': '33333333-3333-3333-3333-333333333307',
    
    // Users
    'u-1': '11111111-1111-1111-1111-111111111111',
    'u-2': '11111111-1111-1111-1111-111111111112',
    'u-3': '11111111-1111-1111-1111-111111111113',
    'u-4': '11111111-1111-1111-1111-111111111114',
    'u-5': '11111111-1111-1111-1111-111111111115',
    
    // Clients
    'c-1': '22222222-2222-2222-2222-222222222221',
    'c-2': '22222222-2222-2222-2222-222222222222',
    'c-3': '22222222-2222-2222-2222-222222222223',
    
    // Projects
    'p-1': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'p-2': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
    
    // Tasks
    't-1': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba',
    't-2': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    't-3': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc',
  };

  if (mappings[str]) return mappings[str];

  // Deterministic conversion based on simple numeric hash to build standard hex values
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = (hash1 * 31 + char) | 0;
    hash2 = (hash2 * 37 + char) | 0;
  }

  // Ensure unsigned hex values for standard UUID segments
  const h1 = Math.abs(hash1).toString(16).padEnd(8, '0').slice(0, 8);
  const h2 = Math.abs(hash2).toString(16).padEnd(4, '4').slice(0, 4);
  const h3 = Math.abs(hash1 ^ hash2).toString(16).padEnd(4, '8').slice(0, 4);
  const h4 = Math.abs(hash1 & hash2).toString(16).padEnd(4, '9').slice(0, 4);
  const h5 = Math.abs(hash1 + hash2).toString(16).padEnd(12, 'a').slice(0, 12);

  return `${h1}-${h2}-${h3}-${h4}-${h5}`;
};

/**
 * Transforms an ERPState ensuring all IDs and reference relations are strict valid UUIDs.
 */
export function mapStateToUUIDs(state: ERPState): ERPState {
  return {
    ...state,
    userGroups: (state.userGroups || []).map(g => ({ ...g, id: stringToUUID(g.id) })),
    projectStatuses: (state.projectStatuses || []).map(s => ({ ...s, id: stringToUUID(s.id) })),
    projectCategories: (state.projectCategories || []).map(c => ({ ...c, id: stringToUUID(c.id) })),
    projectRisks: (state.projectRisks || []).map(r => ({ ...r, id: stringToUUID(r.id) })),
    projectPriorities: (state.projectPriorities || []).map(p => ({ ...p, id: stringToUUID(p.id) })),
    projectTeams: (state.projectTeams || []).map(t => ({ ...t, id: stringToUUID(t.id) })),
    projectPartners: (state.projectPartners || []).map(p => ({ ...p, id: stringToUUID(p.id) })),
    taskStatuses: (state.taskStatuses || []).map(s => ({ ...s, id: stringToUUID(s.id) })),
    taskTypes: (state.taskTypes || []).map(tt => ({ ...tt, id: stringToUUID(tt.id) })),
    users: (state.users || []).map(u => ({
      ...u,
      id: stringToUUID(u.id),
      roleId: stringToUUID(u.roleId),
    })),
    clients: (state.clients || []).map(c => ({
      ...c,
      id: stringToUUID(c.id),
    })),
    projects: (state.projects || []).map(p => ({
      ...p,
      id: stringToUUID(p.id),
      clientId: stringToUUID(p.clientId),
      categoryId: stringToUUID(p.categoryId),
      categoryIds: (p.categoryIds || []).map(stringToUUID),
      statusId: stringToUUID(p.statusId),
      projectManagerId: stringToUUID(p.projectManagerId),
      fieldManagerId: stringToUUID(p.fieldManagerId),
      salesRepId: stringToUUID(p.salesRepId),
      riskId: p.riskId ? stringToUUID(p.riskId) : undefined,
      priorityId: stringToUUID(p.priorityId),
      teamsInvolvedIds: (p.teamsInvolvedIds || []).map(stringToUUID),
      partnersIds: (p.partnersIds || []).map(stringToUUID),
      createdById: stringToUUID(p.createdById),
    })),
    tasks: (state.tasks || []).map(t => ({
      ...t,
      id: stringToUUID(t.id),
      projectId: stringToUUID(t.projectId),
      statusId: stringToUUID(t.statusId),
      taskTypeId: t.taskTypeId ? stringToUUID(t.taskTypeId) : undefined,
      assigneeIds: (t.assigneeIds || []).map(stringToUUID),
    })),
    comments: (state.comments || []).map(c => ({
      ...c,
      id: stringToUUID(c.id),
      projectId: stringToUUID(c.projectId),
      authorId: stringToUUID(c.authorId),
    })),
    userAbsences: (state.userAbsences || []).map(a => ({
      ...a,
      id: stringToUUID(a.id),
      userId: stringToUUID(a.userId),
    })),
    materials: (state.materials || []).map(m => ({
      ...m,
      id: stringToUUID(m.id),
    })),
    quotes: (state.quotes || []).map(q => ({
      ...q,
      id: stringToUUID(q.id),
      projectId: stringToUUID(q.projectId),
      clientId: stringToUUID(q.clientId),
      responsibleId: stringToUUID(q.responsibleId),
    })),
    billOfMaterials: (state.billOfMaterials || []).map(b => ({
      ...b,
      id: stringToUUID(b.id),
      quoteId: stringToUUID(b.quoteId),
      materialId: stringToUUID(b.materialId),
    })),
    equipmentList: (state.equipmentList || []).map(e => ({
      ...e,
      id: stringToUUID(e.id),
      projectId: stringToUUID(e.projectId),
      clientId: stringToUUID(e.clientId),
    })),
    specialDays: (state.specialDays || []).map(sd => ({
      ...sd,
      id: stringToUUID(sd.id),
    })),
    defaultTasks: (state.defaultTasks || []).map(dt => ({
      ...dt,
      id: stringToUUID(dt.id),
      taskTypeId: dt.taskTypeId ? stringToUUID(dt.taskTypeId) : undefined,
    })),
    riskCategories: (state.riskCategories || []).map(rc => ({
      ...rc,
      id: stringToUUID(rc.id),
    })),
    riskStatuses: (state.riskStatuses || []).map(rs => ({
      ...rs,
      id: stringToUUID(rs.id),
    })),
    riskPriorities: (state.riskPriorities || []).map(rp => ({
      ...rp,
      id: stringToUUID(rp.id),
    })),
    projectRiskItems: (state.projectRiskItems || []).map(pri => ({
      ...pri,
      id: stringToUUID(pri.id),
      projectId: stringToUUID(pri.projectId),
      categoryId: stringToUUID(pri.categoryId),
      ownerId: stringToUUID(pri.ownerId),
      statusId: stringToUUID(pri.statusId),
      priorityId: stringToUUID(pri.priorityId),
    })),
  };
}

/**
 * Test the connection to Supabase
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      message: 'Supabase não está configurado. Insira as credenciais no menu "Settings / Secrets" da plataforma.'
    };
  }

  try {
    const { error } = await supabase.from('projects').select('id').limit(1);
    
    if (error) {
      return {
        success: false,
        message: `Erro na ligação: ${formatSupabaseError(error)} (Verifique se as tabelas foram criadas com o script SQL)`
      };
    }

    return {
      success: true,
      message: 'Ligação direta ao banco de dados SQL bem-sucedida!'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Erro ao conectar: ${formatSupabaseError(error)}`
    };
  }
}

/**
 * Save full ERP State snapshot to Supabase as backup (Legacy helper kept for backwards compatibility)
 */
function formatDbDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).replace(/['"]/g, '').trim();
  if (!s) return null;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return s;
}

export async function saveSnapshotToSupabase(state: ERPState, name: string = 'Automático'): Promise<{ success: boolean; message: string; data?: any }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase não está configurado.' };
  }

  try {
    const { data, error } = await supabase
      .from('portal_erp_snapshots')
      .insert([
        {
          name,
          state: mapStateToUUIDs(state),
          updated_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    return {
      success: true,
      message: 'Snapshot de segurança gravado no Supabase com sucesso!',
      data
    };
  } catch (error: any) {
    console.error('Supabase backup error:', error);
    return {
      success: false,
      message: `Erro ao gravar backup: ${error.message || error}`
    };
  }
}

/**
 * Load list of backups from Supabase (Legacy helper kept for compatibility)
 */
export async function listBackupsFromSupabase(): Promise<{ success: boolean; data?: SupabaseBackup[]; message?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase não está configurado.' };
  }

  try {
    const { data, error } = await supabase
      .from('portal_erp_snapshots')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      data: data as SupabaseBackup[]
    };
  } catch (error: any) {
    console.error('Supabase list error:', error);
    return {
      success: false,
      message: error.message || error
    };
  }
}

/**
 * Delete a backup from Supabase (Legacy helper kept for compatibility)
 */
export async function deleteBackupFromSupabase(id: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase não está configurado.' };
  }

  try {
    const { error } = await supabase
      .from('portal_erp_snapshots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return {
      success: true,
      message: 'Cópia de segurança eliminada do Supabase.'
    };
  } catch (error: any) {
    console.error('Supabase delete error:', error);
    return {
      success: false,
      message: `Erro ao eliminar: ${error.message || error}`
    };
  }
}

/**
 * Get the active real-time state from Supabase by fetching from all individual SQL tables
 */
export async function getActiveStateFromSupabase(): Promise<{ success: boolean; data?: ERPState; message?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase não está configurado.' };
  }

  try {
    // Fetch all individual tables in parallel
    const [
      resUserGroups,
      resProjectStatuses,
      resProjectCategories,
      resProjectRisks,
      resProjectPriorities,
      resProjectTeams,
      resProjectPartners,
      resTaskStatuses,
      resTaskTypes,
      resUsers,
      resClients,
      resProjects,
      resTasks,
      resComments,
      resUserAbsences,
      resMaterials,
      resQuotes,
      resBOMs,
      resEquipment,
      resConfig,
      resSpecialDays,
      resDefaultTasks,
      resRiskCategories,
      resRiskStatuses,
      resRiskPriorities,
      resProjectRiskItems,
    ] = await Promise.all([
      supabase.from('user_groups').select('*'),
      supabase.from('project_status').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_category').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_risk').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_priority').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_teams').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_partners').select('*').order('sort_order', { ascending: true }),
      supabase.from('task_status').select('*').order('scale', { ascending: true }),
      supabase.from('task_types').select('*').order('sort_order', { ascending: true }),
      supabase.from('users').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('comments').select('*'),
      supabase.from('user_absences').select('*'),
      supabase.from('material').select('*'),
      supabase.from('quotes').select('*'),
      supabase.from('bill_of_materials').select('*'),
      supabase.from('equipment').select('*'),
      supabase.from('app_configuration').select('*').limit(1),
      supabase.from('special_days').select('*'),
      supabase.from('default_tasks').select('*'),
      supabase.from('risk_categories').select('*').order('sort_order', { ascending: true }),
      supabase.from('risk_statuses').select('*').order('sort_order', { ascending: true }),
      supabase.from('risk_priorities').select('*').order('sort_order', { ascending: true }),
      supabase.from('project_risk_items').select('*').order('created_at', { ascending: false }),
    ]);

    // Check for schema issues
    if (resProjects.error) {
      console.warn('Could not query projects table, possibly missing schema. SQL error:', resProjects.error);
      throw resProjects.error;
    }

    // Fetch relational link tables with safe queries
    const fetchLinkData = async (tableName: string) => {
      try {
        const res = await supabase!.from(tableName).select('*');
        if (res.error) {
          console.warn(`Link table ${tableName} query notice:`, res.error.message);
          return [];
        }
        return res.data || [];
      } catch (err) {
        console.warn(`Exception fetching link table ${tableName}:`, err);
        return [];
      }
    };

    const [riskLinkRows, priorityLinkRows, teamLinkRows, partnerLinkRows, assigneeLinkRows, categoryLinkRows, projectMaterialsRows] = await Promise.all([
      fetchLinkData('project_risk_link'),
      fetchLinkData('project_priority_link'),
      fetchLinkData('project_teams_link'),
      fetchLinkData('project_partners_link'),
      fetchLinkData('task_assignees'),
      fetchLinkData('project_category_link'),
      fetchLinkData('project_materials'),
    ]);

    // Build lookup maps for fast association
    const riskMap: Record<string, string> = {};
    riskLinkRows.forEach(link => {
      if (link.project_id && link.risk_id) riskMap[link.project_id] = link.risk_id;
    });

    const priorityMap: Record<string, string> = {};
    priorityLinkRows.forEach(link => {
      if (link.project_id && link.priority_id) priorityMap[link.project_id] = link.priority_id;
    });

    const teamsMap: Record<string, string[]> = {};
    teamLinkRows.forEach(link => {
      if (link.project_id && link.team_id) {
        if (!teamsMap[link.project_id]) teamsMap[link.project_id] = [];
        teamsMap[link.project_id].push(link.team_id);
      }
    });

    const partnersMap: Record<string, string[]> = {};
    partnerLinkRows.forEach(link => {
      if (link.project_id && link.partner_id) {
        if (!partnersMap[link.project_id]) partnersMap[link.project_id] = [];
        partnersMap[link.project_id].push(link.partner_id);
      }
    });

    const assigneesMap: Record<string, string[]> = {};
    assigneeLinkRows.forEach(link => {
      if (link.task_id && link.user_id) {
        if (!assigneesMap[link.task_id]) assigneesMap[link.task_id] = [];
        assigneesMap[link.task_id].push(link.user_id);
      }
    });

    const categoriesMap: Record<string, string[]> = {};
    categoryLinkRows.forEach(link => {
      if (link.project_id && link.category_id) {
        if (!categoriesMap[link.project_id]) categoriesMap[link.project_id] = [];
        categoriesMap[link.project_id].push(link.category_id);
      }
    });

    // Handle App Config
    const configRow = resConfig.data?.[0];
    const appConfig = configRow ? {
      appName: configRow.app_name || 'Gestão de projetos e planeamento',
      appDescription: configRow.app_description || '',
      footerText: configRow.footer_text || '',
      logo: configRow.logo_url || '',
      footerCopyrightText: configRow.footer_copyright_text || configRow.footer_text || '',
      logoImagePath: configRow.logo_image_path || configRow.logo_url || '',
      theme: configRow.theme_name || 'default',
      salesRepGroupId: configRow.sales_rep_group_id || '',
      projManagerGroupId: configRow.proj_manager_group_id || '',
      fieldManagerGroupId: configRow.field_manager_group_id || '',
      salesRepGroupIds: configRow.sales_rep_group_id ? configRow.sales_rep_group_id.split(',').filter(Boolean) : [],
      projManagerGroupIds: configRow.proj_manager_group_id ? configRow.proj_manager_group_id.split(',').filter(Boolean) : [],
      fieldManagerGroupIds: configRow.field_manager_group_id ? configRow.field_manager_group_id.split(',').filter(Boolean) : [],
    } : {
      appName: 'Gestão de Projetos Planeamento',
      appDescription: 'Plataforma integrada de planeamento, orçamentação e gestão de projetos.',
      footerText: '© 2026 Gestão de projetos e planeamento. Todos os direitos reservados.',
      logo: '',
      footerCopyrightText: '© 2026 Gestão de projetos e planeamento. Todos os direitos reservados.',
      logoImagePath: '',
      theme: 'default',
      salesRepGroupId: '',
      projManagerGroupId: '',
      fieldManagerGroupId: '',
      salesRepGroupIds: [],
      projManagerGroupIds: [],
      fieldManagerGroupIds: [],
    };

    // Map database structures to React types
    const projects: Project[] = (resProjects.data || []).map(p => ({
      id: p.id,
      demo: p.demo || false,
      clientId: p.client_id || '',
      title: p.project_title || '',
      description: p.project_description || '',
      categoryId: p.category_id || '',
      categoryIds: categoriesMap[p.id] && categoriesMap[p.id].length > 0 ? categoriesMap[p.id] : (p.category_id ? [p.category_id] : []),
      statusId: p.status_id || '',
      projectManagerId: p.project_manager_id || '',
      fieldManagerId: p.field_manager_id || '',
      salesRepId: p.sales_rep_id || '',
      startDate: p.start_date || '',
      deliveryDate: p.delivery_date || '',
      estimatedDate: p.estimated_date || '',
      scheduledDate: p.scheduled_date || '',
      installProjectNo: p.install_project_no || '',
      sfOpportunityNo: p.sf_opportunity_no || '',
      riskId: riskMap[p.id] || p.risk_id || '',
      priorityId: priorityMap[p.id] || p.priority_id || '',
      teamsInvolvedIds: (teamsMap[p.id] && teamsMap[p.id].length > 0)
        ? teamsMap[p.id]
        : (p.teams_involved_ids ? (typeof p.teams_involved_ids === 'string' ? p.teams_involved_ids.split(',').filter(Boolean) : p.teams_involved_ids) : (p.teams_ids ? (typeof p.teams_ids === 'string' ? p.teams_ids.split(',').filter(Boolean) : p.teams_ids) : [])),
      partnersIds: (partnersMap[p.id] && partnersMap[p.id].length > 0)
        ? partnersMap[p.id]
        : (p.partners_ids ? (typeof p.partners_ids === 'string' ? p.partners_ids.split(',').filter(Boolean) : p.partners_ids) : []),
      documents: p.documents ? p.documents.split(',').filter(Boolean) : [],
      budgetValue: Number(p.budget_value) || 0,
      createdById: p.created_by || '',
      deleted: p.deleted || false,
      createdDate: p.created_at || '',
      updatedDate: p.updated_at || '',
      clientContactName: p.client_contact_name || '',
      clientContactEmail: p.client_contact_email || '',
      clientContactPhone: p.client_contact_phone || '',
    }));

    const milestoneTaskType = (resTaskTypes?.data || []).find((tt: any) => tt.name?.toLowerCase().includes('marco'));
    const defaultTaskType = (resTaskTypes?.data || []).find((tt: any) => !tt.deleted);

    const tasks: Task[] = (resTasks.data || []).map(t => {
      let resolvedTaskTypeId = t.task_type_id;
      if (!resolvedTaskTypeId && t.is_milestone && milestoneTaskType) {
        resolvedTaskTypeId = milestoneTaskType.id;
      }
      return {
        id: t.id,
        projectId: t.project_id || '',
        title: t.task_title || '',
        statusId: t.status_id || '',
        taskTypeId: resolvedTaskTypeId || (defaultTaskType ? defaultTaskType.id : undefined),
        assigneeIds: assigneesMap[t.id] || [],
        estimatedDate: t.estimated_date || '',
        description: t.task_description || '',
        estimatedHours: t.estimated_hours || '',
        actualHours: t.actual_hours || '',
        startDate: t.start_date || '',
        startTime: t.start_time || '',
        endDate: t.end_date || '',
        endTime: t.end_time || '',
        notes: t.notes || '',
        deleted: t.deleted || false,
        createdDate: t.created_at || '',
        isMilestone: t.is_milestone || false,
      };
    });

    const clients: Client[] = (resClients.data || []).map(c => ({
      id: c.id,
      clientName: c.client_name,
      shortName: c.short_name || '',
      location: c.location || '',
      taxId: c.tax_id || '',
      contactPerson: c.contact_person || '',
      contactEmail: c.contact_email || '',
      contactPhone: c.contact_phone || '',
      notes: c.notes || '',
      deleted: c.deleted || false,
      createdDate: c.created_at || '',
    }));

    const users: User[] = (resUsers.data || []).map(u => ({
      id: u.id,
      type: u.type as any,
      name: u.name,
      email: u.email || '',
      password: u.password || '',
      roleId: u.role_id || '',
      approved: u.approved || false,
      deleted: u.deleted || false,
      createdDate: u.created_at || '',
      isAdmin: u.is_admin || false,
    }));

    const comments: Comment[] = (resComments.data || []).map(c => ({
      id: c.id,
      projectId: c.project_id || '',
      authorId: c.author_id || '',
      comment: c.comment || '',
      createdDate: c.created_at || '',
    }));

    const userAbsences: UserAbsence[] = (resUserAbsences.data || []).map(a => ({
      id: a.id,
      userId: a.user_id || '',
      absenceStartDate: a.absence_start_date || '',
      absenceEndDate: a.absence_end_date || '',
      reason: a.reason || '',
      createdDate: a.created_at || '',
    }));

    const materials: Material[] = (resMaterials.data || []).map(m => ({
      id: m.id,
      name: m.name,
      reference: m.reference || '',
      manufacturerReference: m.manufacturer_reference || '',
      unit: m.unit || '',
      unitCost: Number(m.unit_cost) || 0,
      supplier: m.supplier || '',
      deleted: m.deleted || false,
      createdDate: m.created_at || '',
    }));

    const quotes: Quote[] = (resQuotes.data || []).map(q => ({
      id: q.id,
      projectId: q.project_id || '',
      clientId: '',
      status: q.status || '',
      version: q.version || 1,
      totalValue: Number(q.total_value) || 0,
      validUntil: q.valid_until || '',
      responsibleId: q.responsible_id || '',
      deleted: q.deleted || false,
      createdDate: q.created_at || '',
    }));

    const billOfMaterials: BillOfMaterial[] = (resBOMs.data || []).map(b => ({
      id: b.id,
      quoteId: b.quote_id || '',
      materialId: b.material_id || '',
      quantity: Number(b.quantity) || 1,
      deleted: b.deleted || false,
      createdDate: b.created_at || '',
    }));

    const equipmentList: Equipment[] = (resEquipment.data || []).map(e => ({
      id: e.id,
      serialNumber: e.serial_number || '',
      brand: e.brand || '',
      model: e.model || '',
      projectId: e.project_id || '',
      clientId: '',
      status: e.status || '',
      installationDate: e.installation_date || '',
      deleted: e.deleted || false,
      createdDate: e.created_at || '',
    }));

    const specialDays: SpecialDay[] = (resSpecialDays.data || []).map(sd => ({
      id: sd.id,
      date: sd.date || '',
      name: sd.name || '',
    }));

    const defaultTasks: DefaultTask[] = (resDefaultTasks.data || []).map(dt => ({
      id: dt.id,
      title: dt.title || '',
      description: dt.description || '',
      estimatedHours: dt.estimated_hours || '',
    }));

    const userGroupsMapped: UserGroup[] = (resUserGroups.data || []).map(g => ({
      id: g.id,
      name: g.name,
      deleted: g.deleted || false,
      permissions: g.permissions ? (typeof g.permissions === 'string' ? JSON.parse(g.permissions) : g.permissions) : undefined
    }));

    const projectMaterials: import('./types').ProjectMaterial[] = (projectMaterialsRows || []).map((pm: any) => ({
      id: pm.id,
      projectId: pm.project_id || '',
      description: pm.description || '',
      supplier: pm.supplier || '',
      quantity: Number(pm.quantity) || 1,
      reference: pm.reference || '',
      budget: pm.budget !== null && pm.budget !== undefined ? String(pm.budget) : '',
      costPrice: Number(pm.cost_price) || 0,
      salePrice: Number(pm.sale_price) || 0,
      expectedDeliveryDate: pm.expected_delivery_date || '',
      status: (pm.status === 'em_armazem' || pm.status === 'em_stock') ? 'em_armazem' : (pm.status === 'por_encomendar' ? 'por_encomendar' : (pm.status || 'por_encomendar')),
      deleted: pm.deleted || false,
      createdDate: pm.created_at || '',
    }));

    const riskCategories: RiskCategory[] = (resRiskCategories.data || []).map(rc => ({
      id: rc.id,
      name: rc.name,
      deleted: rc.deleted || false,
      sort_order: rc.sort_order || 0,
    }));

    const riskStatuses: RiskStatus[] = (resRiskStatuses.data || []).map(rs => ({
      id: rs.id,
      name: rs.name,
      deleted: rs.deleted || false,
      sort_order: rs.sort_order || 0,
    }));

    const riskPriorities: RiskPriority[] = (resRiskPriorities.data || []).map(rp => ({
      id: rp.id,
      name: rp.name,
      scale: rp.scale || 1,
      deleted: rp.deleted || false,
      sort_order: rp.sort_order || 0,
    }));

    const projectRiskItems: ProjectRiskItem[] = (resProjectRiskItems.data || []).map(pri => ({
      id: pri.id,
      projectId: pri.project_id || '',
      title: pri.title || '',
      categoryId: pri.category_id || '',
      identificationDate: pri.identification_date || '',
      ownerId: pri.owner_id || '',
      description: pri.description || '',
      consequence: pri.consequence || '',
      probability: Number(pri.probability) || 1,
      impact: Number(pri.impact) || 1,
      mitigationPlan: pri.mitigation_plan || '',
      contingencyPlan: pri.contingency_plan || '',
      reviewDate: pri.review_date || '',
      statusId: pri.status_id || '',
      priorityId: pri.priority_id || '',
      deleted: pri.deleted || false,
      createdDate: pri.created_at || '',
    }));

    const loadedState: ERPState = {
      userGroups: userGroupsMapped,
      projectStatuses: (resProjectStatuses.data || []).map((s: any) => ({ ...s, deleted: s.deleted === true || s.deleted === 1 || s.deleted === 'true' })),
      projectCategories: (resProjectCategories.data || []).map((c: any) => ({ ...c, deleted: c.deleted === true || c.deleted === 1 || c.deleted === 'true' })),
      projectRisks: (resProjectRisks.data || []).map((r: any) => ({ ...r, deleted: r.deleted === true || r.deleted === 1 || r.deleted === 'true' })),
      projectPriorities: (resProjectPriorities.data || []).map((p: any) => ({ ...p, deleted: p.deleted === true || p.deleted === 1 || p.deleted === 'true' })),
      projectTeams: (resProjectTeams.data || []).map((t: any) => ({ ...t, deleted: t.deleted === true || t.deleted === 1 || t.deleted === 'true' })),
      projectPartners: (resProjectPartners.data || []).map((pt: any) => ({ ...pt, deleted: pt.deleted === true || pt.deleted === 1 || pt.deleted === 'true' })),
      taskStatuses: (resTaskStatuses.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        scale: s.scale ?? 1,
        deleted: s.deleted || false,
        sort_order: s.sort_order ?? s.scale ?? 0,
      })),
      taskTypes: (() => {
        const rawTypes = (resTaskTypes.data && resTaskTypes.data.length > 0)
          ? resTaskTypes.data.map((tt: any) => ({
              id: tt.id,
              name: tt.name,
              scale: tt.scale ?? 1,
              deleted: tt.deleted || false,
              sort_order: tt.sort_order ?? tt.scale ?? 0,
            }))
          : (INITIAL_ERP_STATE.taskTypes || []);
        
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const item of rawTypes) {
          const key = (item.name || '').trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
        }
        return deduped;
      })(),
      users,
      clients,
      projects,
      tasks,
      comments,
      userAbsences,
      appConfig,
      materials,
      projectMaterials,
      quotes,
      billOfMaterials,
      equipmentList,
      specialDays,
      defaultTasks,
      riskCategories: riskCategories.length > 0 ? riskCategories : INITIAL_ERP_STATE.riskCategories,
      riskStatuses: riskStatuses.length > 0 ? riskStatuses : INITIAL_ERP_STATE.riskStatuses,
      riskPriorities: riskPriorities.length > 0 ? riskPriorities : INITIAL_ERP_STATE.riskPriorities,
      projectRiskItems: projectRiskItems.length > 0 ? projectRiskItems : (INITIAL_ERP_STATE.projectRiskItems || []),
    };

    // If completely empty database (unseeded), return undefined to let /hooks/useERP seed defaults.
    // If a configuration row exists, we MUST NOT treat it as unseeded, otherwise custom system name is overwritten.
    if (projects.length === 0 && clients.length === 0 && users.length === 0 && !configRow) {
      return { success: true, data: undefined };
    }

    return { success: true, data: loadedState };
  } catch (error: any) {
    console.error('Relational load error from Supabase:', error);
    return { success: false, message: `Erro ao ler dados do Supabase SQL: ${formatSupabaseError(error)}` };
  }
}

/**
 * Saves/Synchronizes the full state directly and relational-wise into the corresponding SQL tables in Supabase
 */
export async function saveActiveStateToSupabase(rawState: ERPState): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase não está configurado.' };
  }

  try {
    // 1. Ensure all IDs and keys in state are formatted as valid UUIDs for PostgreSQL compatibility
    const state = mapStateToUUIDs(rawState);

    // 1.5. Perform parallel upserts for reference tables to prevent foreign key errors in primary tables
    const refUpserts = [
      supabase.from('user_groups').upsert((state.userGroups || []).map(g => ({
        id: g.id,
        name: g.name,
        deleted: g.deleted || false,
        permissions: g.permissions ? (typeof g.permissions === 'object' ? JSON.stringify(g.permissions) : g.permissions) : null
      }))).then(res => {
        if (res.error && (res.error.message.includes('permissions') || res.error.code === '42703')) {
          console.warn('user_groups permissions column is missing, falling back to basic save.');
          return supabase!.from('user_groups').upsert((state.userGroups || []).map(g => ({
            id: g.id,
            name: g.name,
            deleted: g.deleted || false
          })));
        }
        return res;
      }),
      supabase.from('project_status').upsert((state.projectStatuses || []).map(s => ({
        id: s.id,
        name: s.name,
        scale: s.scale || 1,
        deleted: s.deleted || false,
        sort_order: s.sort_order || 0
      }))),
      supabase.from('project_category').upsert((state.projectCategories || []).map(c => ({
        id: c.id,
        name: c.name,
        deleted: c.deleted || false,
        sort_order: c.sort_order || 0
      }))),
      supabase.from('project_risk').upsert((state.projectRisks || []).map(r => ({
        id: stringToUUID(r.id),
        name: r.name,
        scale: r.scale || 1,
        deleted: r.deleted || false,
        sort_order: r.sort_order || 0
      }))),
      supabase.from('project_priority').upsert((state.projectPriorities || []).map(p => ({
        id: stringToUUID(p.id),
        name: p.name,
        scale: p.scale || 1,
        deleted: p.deleted || false,
        sort_order: p.sort_order || 0
      }))),
      supabase.from('project_teams').upsert((state.projectTeams || []).map(t => ({
        id: stringToUUID(t.id),
        name: t.name,
        deleted: t.deleted || false,
        sort_order: t.sort_order || 0
      }))),
      supabase.from('project_partners').upsert((state.projectPartners || []).map(p => ({
        id: stringToUUID(p.id),
        name: p.name,
        deleted: p.deleted || false,
        sort_order: p.sort_order || 0
      }))),
      supabase.from('task_status').upsert((state.taskStatuses || []).map(s => ({
        id: stringToUUID(s.id),
        name: s.name,
        scale: s.scale ?? 1,
        deleted: s.deleted ?? false,
        sort_order: s.sort_order ?? (s as any).sortOrder ?? s.scale ?? 0,
      }))),
      supabase.from('task_types').upsert((state.taskTypes || []).map(tt => ({
        id: stringToUUID(tt.id),
        name: tt.name,
        scale: tt.scale ?? 1,
        deleted: tt.deleted ?? false,
        sort_order: tt.sort_order ?? tt.scale ?? 0,
      }))),
      supabase.from('risk_categories').upsert((state.riskCategories || []).map(rc => ({
        id: stringToUUID(rc.id),
        name: rc.name,
        deleted: rc.deleted || false,
        sort_order: rc.sort_order || 0
      }))),
      supabase.from('risk_statuses').upsert((state.riskStatuses || []).map(rs => ({
        id: stringToUUID(rs.id),
        name: rs.name,
        deleted: rs.deleted || false,
        sort_order: rs.sort_order || 0
      }))),
      supabase.from('risk_priorities').upsert((state.riskPriorities || []).map(rp => ({
        id: stringToUUID(rp.id),
        name: rp.name,
        scale: rp.scale || 1,
        deleted: rp.deleted || false,
        sort_order: rp.sort_order || 0
      }))),
    ];

    const refResults = await Promise.all(refUpserts);
    const refError = refResults.find(r => r && r.error);
    if (refError && refError.error) {
      console.error('Error saving reference tables:', refError.error);
      return { success: false, message: `Erro a gravar tabelas de referência: ${formatSupabaseError(refError.error)}` };
    }

    // 2. Perform parallel upserts for primary entities
    const upserts = [
      // App Configuration with theme, sales_rep_group_id, proj_manager_group_id and field_manager_group_id support with backward compatibility fallbacks
      supabase.from('app_configuration').upsert([{
        id: '33333333-4444-5555-6666-777777777777',
        app_name: state.appConfig.appName,
        app_description: state.appConfig.appDescription,
        footer_text: state.appConfig.footerText,
        logo_url: state.appConfig.logo,
        logo_image_path: state.appConfig.logoImagePath || null,
        footer_copyright_text: state.appConfig.footerCopyrightText || null,
        theme_name: state.appConfig.theme || 'default',
        sales_rep_group_id: state.appConfig.salesRepGroupIds?.length 
          ? state.appConfig.salesRepGroupIds.join(',') 
          : (state.appConfig.salesRepGroupId || null),
        proj_manager_group_id: state.appConfig.projManagerGroupIds?.length 
          ? state.appConfig.projManagerGroupIds.join(',') 
          : (state.appConfig.projManagerGroupId || null),
        field_manager_group_id: state.appConfig.fieldManagerGroupIds?.length 
          ? state.appConfig.fieldManagerGroupIds.join(',') 
          : (state.appConfig.fieldManagerGroupId || null)
      }]).then(res => {
        if (res.error && (res.error.message.includes('sales_rep_group_id') || res.error.message.includes('proj_manager_group_id') || res.error.message.includes('field_manager_group_id') || res.error.code === '42703')) {
          // Fallback if the new manager group ID columns do not exist yet on live DB
          return supabase!.from('app_configuration').upsert([{
            id: '33333333-4444-5555-6666-777777777777',
            app_name: state.appConfig.appName,
            app_description: state.appConfig.appDescription,
            footer_text: state.appConfig.footerText,
            logo_url: state.appConfig.logo,
            logo_image_path: state.appConfig.logoImagePath || null,
            footer_copyright_text: state.appConfig.footerCopyrightText || null,
            theme_name: state.appConfig.theme || 'default'
          }]).then(res2 => {
            if (res2.error && (res2.error.message.includes('theme_name') || res2.error.code === 'P0002' || res2.error.code === '42703')) {
              // Fallback if theme_name column also doesn't exist yet
              return supabase!.from('app_configuration').upsert([{
                id: '33333333-4444-5555-6666-777777777777',
                app_name: state.appConfig.appName,
                app_description: state.appConfig.appDescription,
                footer_text: state.appConfig.footerText,
                logo_url: state.appConfig.logo,
                logo_image_path: state.appConfig.logoImagePath || null,
                footer_copyright_text: state.appConfig.footerCopyrightText || null
              }]);
            }
            return res2;
          });
        } else if (res.error && (res.error.message.includes('theme_name') || res.error.code === 'P0002' || res.error.code === '42703')) {
          // Fallback if theme_name doesn't exist
          return supabase!.from('app_configuration').upsert([{
            id: '33333333-4444-5555-6666-777777777777',
            app_name: state.appConfig.appName,
            app_description: state.appConfig.appDescription,
            footer_text: state.appConfig.footerText,
            logo_url: state.appConfig.logo,
            logo_image_path: state.appConfig.logoImagePath || null,
            footer_copyright_text: state.appConfig.footerCopyrightText || null
          }]);
        }
        return res;
      }),

      // Clients (with column compatibility fallback)
      (async () => {
        if (!state.clients || state.clients.length === 0) return { error: null };
        const fullClients = state.clients.map(c => ({
          id: c.id,
          client_name: c.clientName || 'Cliente Sem Nome',
          short_name: c.shortName || null,
          location: c.location || null,
          tax_id: c.taxId || null,
          contact_person: c.contactPerson || null,
          contact_email: c.contactEmail || null,
          contact_phone: c.contactPhone || null,
          notes: c.notes || null,
          deleted: Boolean(c.deleted),
          created_at: c.createdDate || new Date().toISOString()
        }));

        let res = await supabase!.from('clients').upsert(fullClients);
        if (res.error && (res.error.code === '42703' || res.error.message.includes('deleted') || res.error.message.includes('column'))) {
          console.warn('Clients table column missing, attempting basic upsert fallback:', res.error.message);
          const basicClients = state.clients.map(c => ({
            id: c.id,
            client_name: c.clientName || 'Cliente Sem Nome',
            created_at: c.createdDate || new Date().toISOString()
          }));
          res = await supabase!.from('clients').upsert(basicClients);
        }
        return res;
      })(),

      // Users
      supabase.from('users').upsert(state.users.map(u => ({
        id: u.id,
        type: u.type,
        name: u.name,
        email: u.email || null,
        password: u.password || null,
        role_id: u.roleId || null,
        approved: u.approved,
        deleted: u.deleted,
        created_at: u.createdDate || new Date().toISOString(),
        is_admin: u.isAdmin || false
      }))),

      // Materials (table: material)
      supabase.from('material').upsert(state.materials.map(m => ({
        id: m.id,
        name: m.name,
        reference: m.reference || null,
        manufacturer_reference: m.manufacturerReference || null,
        unit: m.unit || null,
        unit_cost: m.unitCost || 0,
        supplier: m.supplier || null,
        deleted: m.deleted,
        created_at: m.createdDate || new Date().toISOString()
      }))),
    ];

    const initialResults = await Promise.all(upserts);
    const initialError = initialResults.find(r => r && r.error);
    if (initialError && initialError.error) {
      console.error('Error saving primary entities:', initialError.error);
      return { success: false, message: `Erro a gravar entidades primárias: ${formatSupabaseError(initialError.error)}` };
    }

    // 3. Save Projects (depends on Clients / Users)
    const validClientIds = new Set((state.clients || []).filter(c => !c.deleted).map(c => stringToUUID(c.id)));
    const validCategoryIds = new Set(state.projectCategories.map(c => stringToUUID(c.id)));
    const validStatusIds = new Set(state.projectStatuses.map(s => stringToUUID(s.id)));
    const validUserIds = new Set(state.users.map(u => stringToUUID(u.id)));
    const validRiskIds = new Set(state.projectRisks.map(r => stringToUUID(r.id)));
    const validPriorityIds = new Set(state.projectPriorities.map(p => stringToUUID(p.id)));

    const projectUpserts = state.projects.map(p => {
      const pUUID = stringToUUID(p.id);
      const clientId = p.clientId ? stringToUUID(p.clientId) : null;
      const categoryId = p.categoryId ? stringToUUID(p.categoryId) : null;
      const statusId = p.statusId ? stringToUUID(p.statusId) : null;
      const pmId = p.projectManagerId ? stringToUUID(p.projectManagerId) : null;
      const fmId = p.fieldManagerId ? stringToUUID(p.fieldManagerId) : null;
      const srId = p.salesRepId ? stringToUUID(p.salesRepId) : null;
      const cbId = p.createdById ? stringToUUID(p.createdById) : null;
      const riskId = p.riskId ? stringToUUID(p.riskId) : null;
      const priorityId = p.priorityId ? stringToUUID(p.priorityId) : null;

      const teamsInvolvedUUIDs = p.teamsInvolvedIds && p.teamsInvolvedIds.length > 0
        ? p.teamsInvolvedIds.map(t => stringToUUID(t)).filter(Boolean)
        : [];
      const partnersUUIDs = p.partnersIds && p.partnersIds.length > 0
        ? p.partnersIds.map(pt => stringToUUID(pt)).filter(Boolean)
        : [];

      return {
        id: pUUID,
        demo: p.demo,
        client_id: (clientId && validClientIds.has(clientId)) ? clientId : null,
        project_title: p.title,
        project_description: p.description || null,
        category_id: (categoryId && validCategoryIds.has(categoryId)) ? categoryId : null,
        status_id: (statusId && validStatusIds.has(statusId)) ? statusId : null,
        project_manager_id: (pmId && validUserIds.has(pmId)) ? pmId : null,
        field_manager_id: (fmId && validUserIds.has(fmId)) ? fmId : null,
        sales_rep_id: (srId && validUserIds.has(srId)) ? srId : null,
        start_date: formatDbDate(p.startDate),
        delivery_date: formatDbDate(p.deliveryDate),
        estimated_date: formatDbDate(p.estimatedDate),
        scheduled_date: formatDbDate(p.scheduledDate),
        install_project_no: p.installProjectNo || null,
        sf_opportunity_no: p.sfOpportunityNo || null,
        documents: p.documents ? p.documents.join(',') : '',
        budget_value: p.budgetValue || 0,
        created_by: (cbId && validUserIds.has(cbId)) ? cbId : null,
        deleted: p.deleted,
        created_at: p.createdDate || new Date().toISOString(),
        updated_at: p.updatedDate || new Date().toISOString(),
        client_contact_name: p.clientContactName || null,
        client_contact_email: p.clientContactEmail || null,
        client_contact_phone: p.clientContactPhone || null,
        risk_id: (riskId && validRiskIds.has(riskId)) ? riskId : null,
        priority_id: (priorityId && validPriorityIds.has(priorityId)) ? priorityId : null,
        teams_involved_ids: teamsInvolvedUUIDs.length > 0 ? teamsInvolvedUUIDs.join(',') : null,
        partners_ids: partnersUUIDs.length > 0 ? partnersUUIDs.join(',') : null
      };
    });

    if (projectUpserts.length > 0) {
      let resProj = await supabase!.from('projects').upsert(projectUpserts);
      if (resProj.error && (resProj.error.code === '42703' || resProj.error.message.includes('column'))) {
        console.warn('Projects table direct link columns missing, attempting basic upsert fallback:', resProj.error.message);
        const basicProjectUpserts = projectUpserts.map(({ risk_id, priority_id, teams_involved_ids, partners_ids, ...rest }) => rest);
        resProj = await supabase!.from('projects').upsert(basicProjectUpserts);
      }
      if (resProj.error) return { success: false, message: `Erro ao gravar projetos: ${formatSupabaseError(resProj.error)}` };
    }

    // 4. Save Tasks (depends on Projects)
    const validProjectIds = new Set(state.projects.map(p => p.id));
    const validTaskStatusIds = new Set(state.taskStatuses.map(s => s.id));
    const validTaskTypeIds = new Set((state.taskTypes || []).map(tt => tt.id));

    const taskUpserts = state.tasks.map(t => {
      const projectId = t.projectId ? stringToUUID(t.projectId) : null;
      const statusId = t.statusId ? stringToUUID(t.statusId) : null;
      const taskTypeId = t.taskTypeId ? stringToUUID(t.taskTypeId) : null;

      return {
        id: t.id,
        project_id: (projectId && validProjectIds.has(projectId)) ? projectId : null,
        task_title: t.title,
        status_id: (statusId && validTaskStatusIds.has(statusId)) ? statusId : null,
        task_type_id: (taskTypeId && validTaskTypeIds.has(taskTypeId)) ? taskTypeId : null,
        estimated_date: formatDbDate(t.estimatedDate),
        task_description: t.description || null,
        estimated_hours: t.estimatedHours || null,
        actual_hours: t.actualHours || null,
        start_date: formatDbDate(t.startDate),
        start_time: t.startTime || null,
        end_date: formatDbDate(t.endDate),
        end_time: t.endTime || null,
        notes: t.notes || null,
        deleted: t.deleted,
        created_at: t.createdDate || new Date().toISOString(),
        is_milestone: Boolean(t.isMilestone)
      };
    });

    if (taskUpserts.length > 0) {
      let resTasks = await supabase.from('tasks').upsert(taskUpserts);
      if (resTasks.error && (resTasks.error.code === '42703' || resTasks.error.message.includes('task_type_id') || resTasks.error.message.includes('is_milestone'))) {
        const basicTaskUpserts = taskUpserts.map(({ task_type_id, is_milestone, ...rest }) => rest);
        resTasks = await supabase.from('tasks').upsert(basicTaskUpserts);
      }
      if (resTasks.error) return { success: false, message: `Erro ao gravar tarefas: ${formatSupabaseError(resTasks.error)}` };
    }

    // Save Project Materials
    if (state.projectMaterials && state.projectMaterials.length > 0) {
      const pmUpserts = state.projectMaterials.map(pm => ({
        id: stringToUUID(pm.id),
        project_id: stringToUUID(pm.projectId),
        description: pm.description,
        supplier: pm.supplier,
        quantity: pm.quantity || 1,
        reference: pm.reference || null,
        budget: pm.budget ? String(pm.budget) : null,
        cost_price: pm.costPrice || 0,
        sale_price: pm.salePrice || 0,
        expected_delivery_date: formatDbDate(pm.expectedDeliveryDate),
        status: pm.status || 'por_encomendar',
        deleted: Boolean(pm.deleted),
        created_at: pm.createdDate || new Date().toISOString()
      }));
      try {
        const resPM = await supabase.from('project_materials').upsert(pmUpserts);
        if (resPM.error) console.warn('Notice saving project_materials:', resPM.error.message);
      } catch (pmErr) {
        console.warn('Exception saving project_materials:', pmErr);
      }
    }

    // Save Project Risk Items
    if (state.projectRiskItems && state.projectRiskItems.length > 0) {
      const validRiskCatIds = new Set((state.riskCategories || []).map(rc => stringToUUID(rc.id)));
      const validRiskStatIds = new Set((state.riskStatuses || []).map(rs => stringToUUID(rs.id)));
      const validRiskPrioIds = new Set((state.riskPriorities || []).map(rp => stringToUUID(rp.id)));

      const priUpserts = state.projectRiskItems.map(pri => {
        const pId = pri.projectId ? stringToUUID(pri.projectId) : null;
        const ownerId = pri.ownerId ? stringToUUID(pri.ownerId) : null;
        const catId = pri.categoryId ? stringToUUID(pri.categoryId) : null;
        const statusId = pri.statusId ? stringToUUID(pri.statusId) : null;
        const priorityId = pri.priorityId ? stringToUUID(pri.priorityId) : null;

        return {
          id: stringToUUID(pri.id),
          project_id: (pId && validProjectIds.has(pId)) ? pId : null,
          title: pri.title || 'Risco sem título',
          category_id: (catId && validRiskCatIds.has(catId)) ? catId : null,
          identification_date: formatDbDate(pri.identificationDate) || new Date().toISOString().split('T')[0],
          owner_id: (ownerId && validUserIds.has(ownerId)) ? ownerId : null,
          description: pri.description || null,
          consequence: pri.consequence || null,
          probability: Math.min(5, Math.max(1, Number(pri.probability) || 1)),
          impact: Math.min(5, Math.max(1, Number(pri.impact) || 1)),
          mitigation_plan: pri.mitigationPlan || null,
          contingency_plan: pri.contingencyPlan || null,
          review_date: formatDbDate(pri.reviewDate) || null,
          status_id: (statusId && validRiskStatIds.has(statusId)) ? statusId : null,
          priority_id: (priorityId && validRiskPrioIds.has(priorityId)) ? priorityId : null,
          deleted: Boolean(pri.deleted),
          created_at: pri.createdDate || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }).filter(item => item.project_id);

      if (priUpserts.length > 0) {
        try {
          const resPRI = await supabase.from('project_risk_items').upsert(priUpserts);
          if (resPRI.error) console.warn('Notice saving project_risk_items:', resPRI.error.message);
        } catch (priErr) {
          console.warn('Exception saving project_risk_items:', priErr);
        }
      }
    }

    // 5. Update many-to-many bridge tables in parallel
    const projectIds = state.projects.map(p => p.id);
    const taskIds = state.tasks.map(t => t.id);

    // Delete existing links to recreate them
    if (projectIds.length > 0) {
      const safeDeleteLink = async (table: string, col: string) => {
        try {
          const res = await supabase!.from(table).delete().in(col, projectIds);
          if (res.error) console.warn(`Could not delete from ${table}:`, res.error.message);
        } catch (e) {
          console.warn(`Exception deleting from ${table}:`, e);
        }
      };
      await Promise.all([
        safeDeleteLink('project_risk_link', 'project_id'),
        safeDeleteLink('project_priority_link', 'project_id'),
        safeDeleteLink('project_teams_link', 'project_id'),
        safeDeleteLink('project_partners_link', 'project_id'),
        safeDeleteLink('project_category_link', 'project_id'),
      ]);
    }
    if (taskIds.length > 0) {
      try {
        const res = await supabase!.from('task_assignees').delete().in('task_id', taskIds);
        if (res.error) console.warn('Could not delete from task_assignees:', res.error.message);
      } catch (e) {
        console.warn('Exception deleting from task_assignees:', e);
      }
    }

    // Prepare link insert batches
    const validTeamIds = new Set(state.projectTeams.map(t => stringToUUID(t.id)));
    const validPartnerIds = new Set(state.projectPartners.map(p => stringToUUID(p.id)));

    const riskLinks = Array.from(new Map(state.projects
      .filter((p): p is typeof p & { riskId: string } => Boolean(p.riskId))
      .map(p => {
        const pUUID = stringToUUID(p.id);
        const rUUID = stringToUUID(p.riskId);
        return (pUUID && rUUID && validRiskIds.has(rUUID)) ? [`${pUUID}-${rUUID}`, { project_id: pUUID, risk_id: rUUID }] : null;
      })
      .filter(Boolean) as [string, any][]).values());

    const priorityLinks = Array.from(new Map(state.projects
      .filter(p => p.priorityId)
      .map(p => {
        const pUUID = stringToUUID(p.id);
        const prUUID = stringToUUID(p.priorityId);
        return (pUUID && prUUID && validPriorityIds.has(prUUID)) ? [`${pUUID}-${prUUID}`, { project_id: pUUID, priority_id: prUUID }] : null;
      })
      .filter(Boolean) as [string, any][]).values());
    
    const teamLinks: any[] = [];
    const teamLinkKeys = new Set<string>();
    state.projects.forEach(p => {
      const pUUID = stringToUUID(p.id);
      const uniqueTeams = Array.from(new Set(p.teamsInvolvedIds || []));
      uniqueTeams.forEach(tId => {
        const tUUID = stringToUUID(tId);
        if (pUUID && tUUID && validTeamIds.has(tUUID)) {
          const key = `${pUUID}-${tUUID}`;
          if (!teamLinkKeys.has(key)) {
            teamLinks.push({ project_id: pUUID, team_id: tUUID });
            teamLinkKeys.add(key);
          }
        }
      });
    });

    const partnerLinks: any[] = [];
    const partnerLinkKeys = new Set<string>();
    state.projects.forEach(p => {
      const pUUID = stringToUUID(p.id);
      const uniquePartners = Array.from(new Set(p.partnersIds || []));
      uniquePartners.forEach(ptId => {
        const ptUUID = stringToUUID(ptId);
        if (pUUID && ptUUID && validPartnerIds.has(ptUUID)) {
          const key = `${pUUID}-${ptUUID}`;
          if (!partnerLinkKeys.has(key)) {
            partnerLinks.push({ project_id: pUUID, partner_id: ptUUID });
            partnerLinkKeys.add(key);
          }
        }
      });
    });

    const categoryLinks: any[] = [];
    const categoryLinkKeys = new Set<string>();
    state.projects.forEach(p => {
      const uniqueCats = Array.from(new Set(p.categoryIds || []));
      uniqueCats.forEach(catId => {
        if (catId && validCategoryIds.has(catId)) {
          const key = `${p.id}-${catId}`;
          if (!categoryLinkKeys.has(key)) {
            categoryLinks.push({ project_id: p.id, category_id: catId });
            categoryLinkKeys.add(key);
          }
        }
      });
    });

    const assigneeLinks: any[] = [];
    const assigneeLinkKeys = new Set<string>();
    state.tasks.forEach(t => {
      const uniqueAssignees = Array.from(new Set(t.assigneeIds || []));
      uniqueAssignees.forEach(uId => {
        if (uId && validUserIds.has(uId)) {
          const key = `${t.id}-${uId}`;
          if (!assigneeLinkKeys.has(key)) {
            assigneeLinks.push({ task_id: t.id, user_id: uId });
            assigneeLinkKeys.add(key);
          }
        }
      });
    });

    const safeUpsertLink = async (table: string, records: any[]) => {
      if (!records || records.length === 0) return { error: null, ignoreError: true };
      try {
        const res = await supabase!.from(table).upsert(records);
        if (res.error) {
          console.warn(`Could not upsert into ${table} (table may not exist or RLS active):`, res.error.message);
        }
        return { ...res, ignoreError: true };
      } catch (err) {
        console.warn(`Exception upserting into ${table}:`, err);
        return { error: null, ignoreError: true };
      }
    };

    const insertPromises: any[] = [
      safeUpsertLink('project_risk_link', riskLinks),
      safeUpsertLink('project_priority_link', priorityLinks),
      safeUpsertLink('project_teams_link', teamLinks),
      safeUpsertLink('project_partners_link', partnerLinks),
      safeUpsertLink('task_assignees', assigneeLinks),
      safeUpsertLink('project_category_link', categoryLinks),
    ];

    const results = await Promise.all(insertPromises);
    for (const res of results) {
      if (res.error && !res.ignoreError) {
        console.error('Error inserting links:', JSON.stringify(res.error, null, 2));
        return { success: false, message: `Erro ao gravar ligações: ${formatSupabaseError(res.error)}` };
      }
    }

    // 6. Comments, User Absences, Quotes, BOMs, Equipment List, Special Days, Default Tasks
    // Delete what is not in state list to match exactly (real CRUD sync)
    // Note: Clients are soft-deleted via deleted = true, not hard deleted.

    const stateCommentIds = state.comments.map(c => c.id);
    const { data: dbComments } = await supabase.from('comments').select('id');
    if (dbComments && dbComments.length > 0) {
      const commentIdsToDelete = dbComments.map(d => d.id).filter(id => !stateCommentIds.includes(id));
      if (commentIdsToDelete.length > 0) {
        await supabase.from('comments').delete().in('id', commentIdsToDelete);
      }
    } else if (!dbComments) {
      await supabase.from('comments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const stateAbsenceIds = state.userAbsences.map(a => a.id);
    const { data: dbAbsences } = await supabase.from('user_absences').select('id');
    if (dbAbsences && dbAbsences.length > 0) {
      const absenceIdsToDelete = dbAbsences.map(d => d.id).filter(id => !stateAbsenceIds.includes(id));
      if (absenceIdsToDelete.length > 0) {
        await supabase.from('user_absences').delete().in('id', absenceIdsToDelete);
      }
    } else if (!dbAbsences) {
      await supabase.from('user_absences').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const stateSpecialDayIds = (state.specialDays || []).map(sd => sd.id);
    const { data: dbSpecialDays } = await supabase.from('special_days').select('id');
    if (dbSpecialDays && dbSpecialDays.length > 0) {
      const specialDayIdsToDelete = dbSpecialDays.map(d => d.id).filter(id => !stateSpecialDayIds.includes(id));
      if (specialDayIdsToDelete.length > 0) {
        await supabase.from('special_days').delete().in('id', specialDayIdsToDelete);
      }
    } else if (!dbSpecialDays) {
      await supabase.from('special_days').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const stateDefaultTaskIds = (state.defaultTasks || []).map(dt => dt.id);
    const { data: dbDefaultTasks } = await supabase.from('default_tasks').select('id');
    if (dbDefaultTasks && dbDefaultTasks.length > 0) {
      const defaultTaskIdsToDelete = dbDefaultTasks.map(d => d.id).filter(id => !stateDefaultTaskIds.includes(id));
      if (defaultTaskIdsToDelete.length > 0) {
        await supabase.from('default_tasks').delete().in('id', defaultTaskIdsToDelete);
      }
    } else if (!dbDefaultTasks) {
      await supabase.from('default_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const validProjIds = new Set(state.projects.map(p => p.id));
    const validUsrIds = new Set(state.users.map(u => u.id));

    const secondaryResults = await Promise.all([
      // Comments
      (state.comments && state.comments.length > 0) ? (() => {
        const mappedComments = state.comments.filter(c => c.id).map(c => {
          const pid = c.projectId ? stringToUUID(c.projectId) : null;
          const aid = c.authorId ? stringToUUID(c.authorId) : null;
          return {
            id: c.id,
            project_id: (pid && validProjIds.has(pid)) ? pid : null,
            author_id: (aid && validUsrIds.has(aid)) ? aid : null,
            comment: c.comment,
            created_at: c.createdDate || new Date().toISOString()
          };
        });
        return supabase.from('comments').upsert(mappedComments).then(res => ({ ...res, table: 'comments' }));
      })() : Promise.resolve({ error: null }),

      // User Absences
      (state.userAbsences && state.userAbsences.length > 0) ? (() => {
        const mappedAbsences = state.userAbsences.map(a => {
          const uid = a.userId ? stringToUUID(a.userId) : null;
          return {
            id: a.id,
            user_id: (uid && validUsrIds.has(uid)) ? uid : null,
            absence_start_date: formatDbDate(a.absenceStartDate),
            absence_end_date: formatDbDate(a.absenceEndDate),
            reason: a.reason,
            created_at: a.createdDate || new Date().toISOString()
          };
        });
        return supabase.from('user_absences').upsert(mappedAbsences).then(res => ({ ...res, table: 'user_absences' }));
      })() : Promise.resolve({ error: null }),

      // Quotes
      (state.quotes && state.quotes.length > 0) ? (() => {
        const mappedQuotes = state.quotes.map(q => {
          const pid = q.projectId ? stringToUUID(q.projectId) : null;
          const rid = q.responsibleId ? stringToUUID(q.responsibleId) : null;
          return {
            id: q.id,
            project_id: (pid && validProjIds.has(pid)) ? pid : null,
            status: q.status,
            version: Number(q.version) || 1,
            total_value: q.totalValue || 0,
            valid_until: q.validUntil || null,
            responsible_id: (rid && validUsrIds.has(rid)) ? rid : null,
            deleted: q.deleted,
            created_at: q.createdDate || new Date().toISOString()
          };
        });
        return supabase.from('quotes').upsert(mappedQuotes).then(res => ({ ...res, table: 'quotes' }));
      })() : Promise.resolve({ error: null }),

      // Equipment List
      (state.equipmentList && state.equipmentList.length > 0) ? (() => {
        const mappedEquipment = state.equipmentList.map(e => {
          const pid = e.projectId ? stringToUUID(e.projectId) : null;
          return {
            id: e.id,
            serial_number: e.serialNumber,
            brand: e.brand,
            model: e.model,
            project_id: (pid && validProjIds.has(pid)) ? pid : null,
            status: e.status,
            installation_date: formatDbDate(e.installationDate) || null,
            deleted: e.deleted,
            created_at: e.createdDate || new Date().toISOString()
          };
        });
        return supabase.from('equipment').upsert(mappedEquipment).then(res => ({ ...res, table: 'equipment' }));
      })() : Promise.resolve({ error: null }),

      // Special Days
      (state.specialDays && state.specialDays.length > 0) ? supabase.from('special_days').upsert(state.specialDays.map(sd => ({
        id: sd.id,
        date: formatDbDate(sd.date),
        name: sd.name
      }))).then(res => ({ ...res, table: 'special_days' })) : Promise.resolve({ error: null }),

      // Default Tasks
      (state.defaultTasks && state.defaultTasks.length > 0) ? supabase.from('default_tasks').upsert(state.defaultTasks.map(dt => ({
        id: dt.id,
        title: dt.title,
        description: dt.description || null,
        estimated_hours: dt.estimatedHours || null
      }))).then(res => ({ ...res, table: 'default_tasks' })) : Promise.resolve({ error: null }),
    ]);

    const secondaryError = secondaryResults.find(r => r && r.error);
    if (secondaryError && secondaryError.error) {
      console.error('Error saving secondary entities (Stage 1) for table', (secondaryError as any).table, ':', secondaryError.error);
      return { success: false, message: `Error saving secondary entities (Stage 1) for table ${(secondaryError as any).table}: ${formatSupabaseError(secondaryError.error)}` };
    }

    // Now that quotes are fully saved in the database, we can safely upsert Bill of Materials to avoid foreign key violations.
    if (state.billOfMaterials && state.billOfMaterials.length > 0) {
      const validQuoteIds = new Set(state.quotes.map(q => q.id));
      const validMaterialIds = new Set(state.materials.map(m => m.id));
      const mappedBOMs = state.billOfMaterials
        .map(b => {
          const qid = b.quoteId ? stringToUUID(b.quoteId) : null;
          const mid = b.materialId ? stringToUUID(b.materialId) : null;
          return {
            id: b.id,
            quote_id: (qid && validQuoteIds.has(qid)) ? qid : null,
            material_id: (mid && validMaterialIds.has(mid)) ? mid : null,
            quantity: b.quantity || 1,
            deleted: b.deleted,
            created_at: b.createdDate || new Date().toISOString()
          };
        })
        .filter(b => b.quote_id && b.material_id);

      if (mappedBOMs.length > 0) {
        const resBOM = await supabase.from('bill_of_materials').upsert(mappedBOMs);
        if (resBOM.error) {
          console.error('Error saving Bill of Materials (Stage 2):', resBOM.error);
          return { success: false, message: `Erro ao gravar Bill of Materials: ${formatSupabaseError(resBOM.error)}` };
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Supabase relational save state error:', error);
    return { success: false, message: `Erro ao gravar no Supabase SQL: ${formatSupabaseError(error)}` };
  }
}

/**
 * SQL setup script instructions (Includes public RLS policies or disabling RLS altogether for quick dev)
 */
export const SUPABASE_SETUP_SQL = `-- EXECUTE ESTE SCRIPT NO EDITOR SQL DO SUPABASE (SQL Editor) PARA PERMITIR TRABALHO ONLINE SEM RESTRIÇÕES DE RLS:
-- 

-- Desativar RLS para permitir ligações diretas anónimas da app (método ideal recomendado pelo cliente):
ALTER TABLE IF EXISTS user_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_category DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_risk DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_priority DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_partners DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_risk_link DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_priority_link DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_category_link DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_teams_link DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_partners_link DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_assignees DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_absences DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_configuration DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS material DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bill_of_materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS equipment DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS portal_erp_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS special_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS default_tasks DISABLE ROW LEVEL SECURITY;

-- Adicionar campo de password aos utilizadores e definir valor por defeito para 12345 (hashed)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password TEXT;
UPDATE users SET password = '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5' WHERE password IS NULL;

-- Adicionar campo de permissões aos grupos de utilizadores
ALTER TABLE IF EXISTS user_groups ADD COLUMN IF NOT EXISTS permissions TEXT;

-- Adicionar campos de notas e eliminação lógica (deleted) à tabela de clientes
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- Adicionar campos de ligação direta na tabela projects
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS risk_id UUID;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS priority_id UUID;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS teams_involved_ids TEXT;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS partners_ids TEXT;

-- Criar tabelas novas
CREATE TABLE IF NOT EXISTS project_risk_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    risk_id UUID REFERENCES project_risk(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, risk_id)
);

CREATE TABLE IF NOT EXISTS project_priority_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    priority_id UUID REFERENCES project_priority(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, priority_id)
);

CREATE TABLE IF NOT EXISTS project_teams_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID REFERENCES project_teams(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, team_id)
);

CREATE TABLE IF NOT EXISTS project_partners_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES project_partners(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, partner_id)
);

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_category_link (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    category_id UUID REFERENCES project_category(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, category_id)
);

CREATE TABLE IF NOT EXISTS task_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT DEFAULT 1,
    deleted BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS task_status ADD COLUMN IF NOT EXISTS scale INT DEFAULT 1;
ALTER TABLE IF EXISTS task_status ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS task_status ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE IF EXISTS task_status ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS task_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT DEFAULT 1,
    deleted BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS task_types ADD COLUMN IF NOT EXISTS scale INT DEFAULT 1;
ALTER TABLE IF EXISTS task_types ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS task_types ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE IF EXISTS task_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS task_type_id UUID;
ALTER TABLE IF EXISTS default_tasks ADD COLUMN IF NOT EXISTS task_type_id UUID;

-- Seed dos Tipos de Tarefa com Níveis
INSERT INTO task_types (id, name, scale, sort_order)
VALUES 
    ('33333333-3333-3333-3333-333333333301', 'Marco de projeto', 1, 1),
    ('33333333-3333-3333-3333-333333333302', 'Planeamento/Requisitos', 2, 2),
    ('33333333-3333-3333-3333-333333333303', 'Preparação', 3, 3),
    ('33333333-3333-3333-3333-333333333304', 'Instalação', 4, 4),
    ('33333333-3333-3333-3333-333333333305', 'Reparação', 5, 5),
    ('33333333-3333-3333-3333-333333333306', 'Formação', 6, 6),
    ('33333333-3333-3333-3333-333333333307', 'Outro', 7, 7)
ON CONFLICT (id) DO NOTHING;

-- Limpeza de eventuais duplicados por nome em task_types
DELETE FROM task_types a USING task_types b
WHERE a.id > b.id AND lower(trim(a.name)) = lower(trim(b.name));

-- Migração automática de tarefas existentes: mapear tarefas marcadas como marco para o tipo 'Marco de projeto'
UPDATE tasks 
SET task_type_id = '33333333-3333-3333-3333-333333333301'
WHERE (task_type_id IS NULL) 
  AND (is_milestone = true OR task_title ILIKE '%marco%');

-- Atribuir tipo padrão às restantes tarefas sem tipo
UPDATE tasks 
SET task_type_id = '33333333-3333-3333-3333-333333333302'
WHERE task_type_id IS NULL;

CREATE TABLE IF NOT EXISTS special_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS default_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NULL,
    estimated_hours TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- MÓDULO DE GESTÃO DE RISCOS DOS PROJETOS
-- ==========================================
CREATE TABLE IF NOT EXISTS risk_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_statuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    deleted BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_priorities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    scale INT DEFAULT 1,
    deleted BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_risk_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category_id UUID REFERENCES risk_categories(id) ON DELETE SET NULL,
    identification_date DATE NOT NULL DEFAULT CURRENT_DATE,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    consequence TEXT,
    probability INT NOT NULL CHECK (probability BETWEEN 1 AND 5),
    impact INT NOT NULL CHECK (impact BETWEEN 1 AND 5),
    mitigation_plan TEXT,
    contingency_plan TEXT,
    review_date DATE,
    status_id UUID REFERENCES risk_statuses(id) ON DELETE SET NULL,
    priority_id UUID REFERENCES risk_priorities(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS risk_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS risk_statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS risk_priorities DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_risk_items DISABLE ROW LEVEL SECURITY;

-- Adicionar campo de grupo de gestores na tabela de configurações
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS sales_rep_group_id TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS proj_manager_group_id TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS field_manager_group_id TEXT;

-- ==========================================
-- MÓDULO DE REGRAS DE AUTOMAÇÃO NO-CODE
-- ==========================================
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    trigger_type TEXT NOT NULL,
    trigger_condition JSONB,
    actions JSONB NOT NULL,
    deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS automation_rules DISABLE ROW LEVEL SECURITY;

-- OU, se preferir manter o RLS ativo, execute estes comandos para conceder políticas públicas:
-- DROP POLICY IF EXISTS "Full access to auth users on projects" ON projects;
-- CREATE POLICY "Acesso público total ao projects" ON projects FOR ALL USING (true) WITH CHECK (true);
-- ...etc para todas as tabelas
`;
