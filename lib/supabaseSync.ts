/**
 * ============================================================================
 * ARQUITETURA DE DADOS — CONTENÇÃO DO MECANISMO LEGACY DE SINCRONIZAÇÃO
 * FASE 59: SUPABASE SYNC BOUNDARY & ERPSTATE CONTAINMENT
 * ============================================================================
 * 
 * REGRA ARQUITETURAL FUNDAMENTAL:
 * 1. PostgreSQL = FONTE ÚNICA DE VERDADE (Single Source of Truth - SSOT).
 * 2. ERPState (em memória / useERP.ts) = Estado de apresentação e cache temporário,
 *    NUNCA fonte de verdade persistente.
 * 3. supabaseSync.ts = Mecanismo LEGACY controlado, temporário e explicitamente delimitado.
 * 
 * RESTRIÇÕES E REGRAS DE CONTENÇÃO:
 * - É ESTRITAMENTE PROIBIDO utilizar saveActiveStateToSupabase() para implementar
 *   novas operações CRUD ou funcionalidades de negócio.
 * - Novos domínios e rotas devem comunicar diretamente via:
 *   UI -> API Route -> Domain Service / Repository -> PostgreSQL (ou RPC).
 * - O agregado Projects já se encontra 100% CANONICALIZADO e ISOLADO neste ficheiro:
 *   saveActiveStateToSupabase() NUNCA escreve na tabela 'projects' ou link tables.
 * ============================================================================
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ERPState, Project, Task, Comment, UserAbsence, User, Client, SpecialDay, DefaultTask, UserGroup, RiskCategory, RiskStatus, RiskPriority, ProjectRiskItem, AuditLog } from './types';
import { getProjectsServerData } from './projects/projectService';
import { normalizeRoleId } from './permissions';
import { getAuthHeaders } from './clientAuth';
import { orLike } from './security/postgrestSearch';

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Safely parses string array fields (e.g. documents, categoryIds, teamsInvolvedIds, partnersIds, groupIds)
 * from both string (comma-separated), string[] arrays, or null/undefined.
 */
export function parseStringArray(val: any): string[] {
  if (Array.isArray(val)) {
    return val.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

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

  // FASE 26: Prevenir fuga de detalhes internos de PostgreSQL, esquemas ou tabelas
  if (
    msg.includes('syntax error') ||
    msg.includes('relation') ||
    msg.includes('column') ||
    msg.includes('violates') ||
    msg.includes('foreign key') ||
    msg.includes('duplicate key')
  ) {
    return 'Erro na persistência dos dados. Verifique a integridade dos dados enviados ou tente novamente.';
  }
  
  return error.message || 'Erro ao comunicar com a base de dados.';
}

/**
 * Maps legacy/short/demonstration IDs into standard valid UUIDs
 */
export const stringToUUID = (str: string): string => {
  if (!str) return '';
  if (isUUID(str)) return str;
  
  const mappings: Record<string, string> = {
    // Groups / Roles (Canonical 10000000 Series)
    'ug-1': '10000000-0000-0000-0000-000000000001',
    'ug-2': '10000000-0000-0000-0000-000000000003',
    'ug-3': '10000000-0000-0000-0000-000000000004',
    'ug-4': '10000000-0000-0000-0000-000000000007',
    
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
    userGroups: (state.userGroups || []).map((g: any) => ({ ...g, id: stringToUUID(g.id) })),
    projectStatuses: (state.projectStatuses || []).map((s: any) => ({ ...s, id: stringToUUID(s.id) })),
    projectCategories: (state.projectCategories || []).map((c: any) => ({ ...c, id: stringToUUID(c.id) })),
    projectRisks: (state.projectRisks || []).map((r: any) => ({ ...r, id: stringToUUID(r.id) })),
    projectPriorities: (state.projectPriorities || []).map((p: any) => ({ ...p, id: stringToUUID(p.id) })),
    projectTeams: (state.projectTeams || []).map((t: any) => ({ ...t, id: stringToUUID(t.id) })),
    projectPartners: (state.projectPartners || []).map((p: any) => ({ ...p, id: stringToUUID(p.id) })),
    taskStatuses: (state.taskStatuses || []).map((s: any) => ({ ...s, id: stringToUUID(s.id) })),
    taskTypes: (state.taskTypes || []).map((tt: any) => ({ ...tt, id: stringToUUID(tt.id) })),
    users: (state.users || []).map(({ password, ...u }: any) => ({
      ...u,
      id: stringToUUID(u.id),
      roleId: normalizeRoleId(u.roleId) || stringToUUID(u.roleId),
    })),
    clients: (state.clients || []).map((c: any) => ({
      ...c,
      id: stringToUUID(c.id),
    })),
    projects: (state.projects || []).map((p: any) => ({
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
    tasks: (state.tasks || []).map((t: any) => ({
      ...t,
      id: stringToUUID(t.id),
      projectId: stringToUUID(t.projectId),
      statusId: stringToUUID(t.statusId),
      taskTypeId: t.taskTypeId ? stringToUUID(t.taskTypeId) : undefined,
      assigneeIds: (t.assigneeIds || []).map(stringToUUID),
    })),
    comments: (state.comments || []).map((c: any) => ({
      ...c,
      id: stringToUUID(c.id),
      projectId: stringToUUID(c.projectId),
      authorId: stringToUUID(c.authorId),
    })),
    userAbsences: (state.userAbsences || []).map((a: any) => ({
      ...a,
      id: stringToUUID(a.id),
      userId: stringToUUID(a.userId),
    })),
    specialDays: (state.specialDays || []).map((sd: any) => ({
      ...sd,
      id: stringToUUID(sd.id),
    })),
    defaultTasks: (state.defaultTasks || []).map((dt: any) => ({
      ...dt,
      id: stringToUUID(dt.id),
      taskTypeId: dt.taskTypeId ? stringToUUID(dt.taskTypeId) : undefined,
    })),
    riskCategories: (state.riskCategories || []).map((rc: any) => ({
      ...rc,
      id: stringToUUID(rc.id),
    })),
    riskStatuses: (state.riskStatuses || []).map((rs: any) => ({
      ...rs,
      id: stringToUUID(rs.id),
    })),
    riskPriorities: (state.riskPriorities || []).map((rp: any) => ({
      ...rp,
      id: stringToUUID(rp.id),
    })),
    projectRiskItems: (state.projectRiskItems || []).map((pri: any) => ({
      ...pri,
      id: stringToUUID(pri.id),
      projectId: stringToUUID(pri.projectId),
      categoryId: stringToUUID(pri.categoryId),
      ownerId: stringToUUID(pri.ownerId),
      statusId: stringToUUID(pri.statusId),
      priorityId: stringToUUID(pri.priorityId),
    })),
    notifications: (state.notifications || []).map((n: any) => ({ ...n, id: stringToUUID(n.id) })),
    automationRules: (state.automationRules || []).map((r: any) => ({ ...r, id: stringToUUID(r.id) })),
  };
}

/**
 * Test the connection to Supabase
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: 'Supabase não está configurado nesta aplicação.'
    };
  }

  try {
    const res = await fetch('/api/supabase/sync?partition=directory', { method: 'GET', headers: getAuthHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      return {
        success: true,
        message: 'Leitura autenticada da base de dados concluída com sucesso.'
      };
    }

    return {
      success: false,
      message: data?.message || `Não foi possível ler a base de dados (${res.status}).`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Erro ao conectar: ${formatSupabaseError(error)}`
    };
  }
}

/**
 * Normalize dates received from legacy records.
 */
export function formatDbDate(dateStr: string | null | undefined): string | null {
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

/**
 * @deprecated MECANISMO LEGACY CONTROLADO (FASE 59: SUPABASE SYNC BOUNDARY)
 * Carrega o snapshot completo do ERP em memória.
 * NÃO deve ser utilizado por novas rotas, serviços ou funcionalidades.
 * Destina-se apenas ao suporte de rotas legadas em transição e ao endpoint de sincronização global.
 */
export async function getActiveStateFromSupabase(
  customClient?: any,
  readOptions?: { readableDomains: ReadonlySet<string>; userId: string; skipNotifications?: boolean; skipConfigRuntime?: boolean; skipDefaultTasks?: boolean },
): Promise<{ success: boolean; data?: ERPState; message?: string }> {
  const client = customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { success: false, message: 'Supabase não está configurado.' };
  }

  try {
    const readable = (domain: string) => !readOptions || readOptions.readableDomains.has(domain);
    const skipped = () => Promise.resolve({ data: [] as any[], error: null });
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
      resConfig,
      resSpecialDays,
      resDefaultTasks,
      resRiskCategories,
      resRiskStatuses,
      resRiskPriorities,
      resProjectRiskItems,
      resNotifications,
      resNotificationSettings,
      resAutomationRules,
      resActiveRoles,
      resUserRoles,
      resOwnUser,
    ] = await Promise.all([
      readable('userGroups') ? client.from('user_groups').select('*') : skipped(),
      readable('projectStatuses') ? client.from('project_status').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('projectCategories') ? client.from('project_category').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('projectRisks') ? client.from('project_risk').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('projectPriorities') ? client.from('project_priority').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('projectTeams') ? client.from('project_teams').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('projectPartners') ? client.from('project_partners').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('taskStatuses') ? client.from('task_status').select('*').order('scale', { ascending: true }) : skipped(),
      readable('taskTypes') || readable('tasks') ? client.from('task_types').select('*').order('sort_order', { ascending: true }) : skipped(),
      client.from('users').select(readable('users') ? '*' : 'id,type,name,role_id,approved,deleted,created_at,sync_version'),
      readable('clients') ? client.from('clients').select('*').order('created_at', { ascending: false }) : skipped(),
      readable('projects') ? getProjectsServerData(client, { all: true, includeDeleted: true }) : skipped(),
      readable('tasks') ? client.from('tasks').select('*').order('created_at', { ascending: false }) : skipped(),
      readable('comments') ? client.from('comments').select('*').order('created_at', { ascending: true }) : skipped(),
      readable('userAbsences') ? client.from('user_absences').select('*') : skipped(),
      readable('appConfig') ? configurationReadQuery(client) : skipped(),
      readable('specialDays') ? client.from('special_days').select('*') : skipped(),
      readable('defaultTasks') && !readOptions?.skipDefaultTasks ? client.from('default_tasks').select('*') : skipped(),
      readable('riskCategories') ? client.from('risk_categories').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('riskStatuses') ? client.from('risk_statuses').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('riskPriorities') ? client.from('risk_priorities').select('*').order('sort_order', { ascending: true }) : skipped(),
      readable('projectRiskItems') ? client.from('project_risk_items').select('*').order('created_at', { ascending: false }) : skipped(),
      readOptions?.skipNotifications || !readable('notifications') ? skipped() : client.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
      readable('notificationSettings') && !readOptions?.skipConfigRuntime ? client.from('notification_settings').select('*').order('type') : skipped(),
      readable('automationRules') && !readOptions?.skipConfigRuntime ? client.from('automation_rules').select('*').eq('deleted', false).order('created_at', { ascending: false }) : skipped(),
      readable('activeRoles') || readable('users') ? client.from('roles').select('id,name,code').eq('is_active', true).order('name') : skipped(),
      readable('users') ? client.from('user_roles').select('user_id,role_id') : skipped(),
      readOptions && !readable('users') ? client.from('users').select('*').eq('id', readOptions.userId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const mandatoryResults = [
      resUserGroups, resProjectStatuses, resProjectCategories, resProjectRisks,
      resProjectPriorities, resProjectTeams, resProjectPartners, resTaskStatuses,
      resTaskTypes, resUsers, resClients, resTasks, resComments, resUserAbsences,
      resConfig, resSpecialDays, resDefaultTasks, resRiskCategories,
      resRiskStatuses, resRiskPriorities, resProjectRiskItems, resNotificationSettings,
      resAutomationRules, resActiveRoles, resUserRoles, resOwnUser,
    ];
    const mandatoryError = mandatoryResults.find((result: any) => result?.error)?.error;
    if (mandatoryError) {
      throw mandatoryError;
    }
    const activeRoles = resActiveRoles.data || [];
    const activeRoleIds = new Set(activeRoles.map((role: any) => role.id));
    const assignments = new Map<string, string[]>();
    for (const row of resUserRoles.data || []) {
      if (!activeRoleIds.has(row.role_id)) continue;
      assignments.set(row.user_id, [...(assignments.get(row.user_id) || []), row.role_id]);
    }

    // Get projects data mapped via getProjectsServerData
    let projectsData: Project[] = (resProjects as any)?.data || [];

    // Fetch relational link tables with safe queries
    const fetchLinkData = async (tableName: string, required = true) => {
      if (!required) return [];
      try {
        const res = await client.from(tableName).select('*');
        if (res.error) throw res.error;
        return res.data || [];
      } catch (err) {
        throw new Error(`Falha ao carregar a coleção obrigatória ${tableName}: ${formatSupabaseError(err)}`);
      }
    };

    const [riskLinkRows, priorityLinkRows, teamLinkRows, partnerLinkRows, assigneeLinkRows, categoryLinkRows, projectMaterialsRows] = await Promise.all([
      fetchLinkData('project_risk_link', readable('projects')),
      fetchLinkData('project_priority_link', readable('projects')),
      fetchLinkData('project_teams_link', readable('projects')),
      fetchLinkData('project_partners_link', readable('projects')),
      fetchLinkData('task_assignees', readable('tasks')),
      fetchLinkData('project_category_link', readable('projects')),
      fetchLinkData('project_materials', readable('projectMaterials')),
    ]);

    // Build lookup maps for fast association
    const riskMap: Record<string, string> = {};
    riskLinkRows.forEach((link: any) => {
      if (link.project_id && link.risk_id) riskMap[link.project_id] = link.risk_id;
    });

    const priorityMap: Record<string, string> = {};
    priorityLinkRows.forEach((link: any) => {
      if (link.project_id && link.priority_id) priorityMap[link.project_id] = link.priority_id;
    });

    const teamsMap: Record<string, string[]> = {};
    teamLinkRows.forEach((link: any) => {
      if (link.project_id && link.team_id) {
        if (!teamsMap[link.project_id]) teamsMap[link.project_id] = [];
        teamsMap[link.project_id].push(link.team_id);
      }
    });

    const partnersMap: Record<string, string[]> = {};
    partnerLinkRows.forEach((link: any) => {
      if (link.project_id && link.partner_id) {
        if (!partnersMap[link.project_id]) partnersMap[link.project_id] = [];
        partnersMap[link.project_id].push(link.partner_id);
      }
    });

    const assigneesMap: Record<string, string[]> = {};
    assigneeLinkRows.forEach((link: any) => {
      if (link.task_id && link.user_id) {
        if (!assigneesMap[link.task_id]) assigneesMap[link.task_id] = [];
        assigneesMap[link.task_id].push(link.user_id);
      }
    });

    const categoriesMap: Record<string, string[]> = {};
    categoryLinkRows.forEach((link: any) => {
      if (link.project_id && link.category_id) {
        if (!categoriesMap[link.project_id]) categoriesMap[link.project_id] = [];
        categoriesMap[link.project_id].push(link.category_id);
      }
    });

    // Handle App Config
    const configRow = resConfig.data?.[0];
    let appConfig = configRow ? {
      syncVersion: Number(configRow.sync_version) || 1,
      appName: configRow.app_name || 'Gestão de projetos e planeamento',
      appDescription: configRow.app_description || '',
      footerText: configRow.footer_text || '',
      logo: configRow.logo_image_path || configRow.logo_url || '',
      footerCopyrightText: configRow.footer_copyright_text || configRow.footer_text || '',
      logoImagePath: configRow.logo_image_path || configRow.logo_url || '',
      theme: configRow.theme_name || 'default',
      salesRepGroupId: configRow.sales_rep_group_id || configRow.salesRepGroupId || '',
      projManagerGroupId: configRow.proj_manager_group_id || configRow.projManagerGroupId || '',
      fieldManagerGroupId: configRow.field_manager_group_id || configRow.fieldManagerGroupId || '',
      salesRepGroupIds: parseStringArray(configRow.salesRepGroupIds ?? configRow.sales_rep_group_id),
      projManagerGroupIds: parseStringArray(configRow.projManagerGroupIds ?? configRow.proj_manager_group_id),
      fieldManagerGroupIds: parseStringArray(configRow.fieldManagerGroupIds ?? configRow.field_manager_group_id),
      taskAssigneeGroupIds: parseStringArray(configRow.taskAssigneeGroupIds ?? configRow.task_assignee_group_id),
      taskAssigneeGroupId: configRow.task_assignee_group_id || configRow.taskAssigneeGroupId || '',
    } : {
      appName: 'Gestão de projetos',
      appDescription: 'Plataforma integrada de gestão de projetos, tarefas e planeamento.',
      footerText: '© 2026 Gestão de projetos. Todos os direitos reservados.',
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
      taskAssigneeGroupIds: [],
      taskAssigneeGroupId: '',
    };

    // Map database structures to React types
    let projects: Project[] = (projectsData || []).map((p: any) => {
      const finalCatIds = categoriesMap[p.id] || [];
      const finalTeamIds = teamsMap[p.id] || [];
      const finalPartnerIds = partnersMap[p.id] || [];

      let versionVal: number | undefined = p.version ?? undefined;
      if (typeof p.version === 'string' && p.version.trim() !== '' && !isNaN(Number(p.version))) {
        versionVal = Number(p.version);
      } else if (typeof p.version === 'number') {
        versionVal = p.version;
      }

      return {
        id: p.id,
        demo: Boolean(p.demo),
        clientId: p.client_id || p.clientId || '',
        title: p.project_title || p.title || '',
        description: p.project_description || p.description || '',
        categoryId: p.category_id || p.categoryId || finalCatIds[0] || '',
        categoryIds: finalCatIds,
        statusId: p.status_id || p.statusId || '',
        projectManagerId: p.project_manager_id || p.projectManagerId || '',
        fieldManagerId: p.field_manager_id || p.fieldManagerId || '',
        salesRepId: p.sales_rep_id || p.salesRepId || '',
        startDate: p.start_date || p.startDate || '',
        deliveryDate: p.delivery_date || p.deliveryDate || '',
        estimatedDate: p.estimated_date || p.estimatedDate || '',
        scheduledDate: p.scheduled_date || p.scheduledDate || '',
        forecastDate: p.forecast_date || p.forecastDate || '',
        installProjectNo: p.install_project_no || p.installProjectNo || '',
        sfOpportunityNo: p.sf_opportunity_no || p.sfOpportunityNo || '',
        riskId: riskMap[p.id] || '',
        priorityId: priorityMap[p.id] || '',
        teamsInvolvedIds: finalTeamIds,
        partnersIds: finalPartnerIds,
        documents: parseStringArray(p.documents),
        budgetValue: Number(p.budget_value ?? p.budgetValue ?? 0),
        createdById: p.created_by || p.createdById || '',
        deleted: Boolean(p.deleted),
        createdDate: p.created_at || p.createdDate || '',
        updatedDate: p.updated_at || p.updatedDate || '',
        clientContactName: p.client_contact_name || p.clientContactName || '',
        clientContactEmail: p.client_contact_email || p.clientContactEmail || '',
        clientContactPhone: p.client_contact_phone || p.clientContactPhone || '',
        version: versionVal,
      };
    });

    const milestoneTaskType = (resTaskTypes?.data || []).find((tt: any) => tt.name?.toLowerCase().includes('marco'));
    const defaultTaskType = (resTaskTypes?.data || []).find((tt: any) => !tt.deleted);

    let tasks: Task[] = (resTasks.data || []).map((t: any) => {
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
        priorityId: t.priority_id || undefined,
        assigneeIds: assigneesMap[t.id] || [],
        estimatedDate: t.estimated_date || '',
        description: t.task_description || '',
        estimatedHours: t.estimated_hours || '',
        actualHours: t.actual_hours ?? null,
        startDate: t.start_date || '',
        startTime: t.start_time || '',
        endDate: t.end_date || '',
        endTime: t.end_time || '',
        notes: t.notes || '',
        deleted: t.deleted || false,
        createdDate: t.created_at || '',
        isMilestone: t.is_milestone || false,
        version: typeof t.version === 'number' ? t.version : 1,
      };
    });

    const clients: Client[] = (resClients.data || []).map((c: any) => ({
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

    const users: User[] = (resUsers.data || []).map((row: any) => {
      const u = row.id === resOwnUser.data?.id ? resOwnUser.data : row;
      return {
      id: u.id,
      type: u.type as any,
      name: u.name,
      email: u.email || '',
      authUserId: u.auth_user_id || null,
      roleId: u.role_id || '',
      roleIds: assignments.get(u.id) || [],
      approved: u.approved || false,
      deleted: u.deleted || false,
      createdDate: u.created_at || '',
      isAdmin: u.is_admin || false,
      };
    });

    const comments: Comment[] = (resComments.data || []).map((c: any) => ({
      id: c.id,
      projectId: c.project_id || '',
      authorId: c.author_id || '',
      comment: c.comment || '',
      createdDate: c.created_at || '',
    }));

    const userAbsences: UserAbsence[] = (resUserAbsences.data || []).map((a: any) => ({
      id: a.id,
      userId: a.user_id || '',
      absenceStartDate: a.absence_start_date || '',
      absenceEndDate: a.absence_end_date || '',
      reason: a.reason || '',
      createdDate: a.created_at || '',
    }));

    const specialDays: SpecialDay[] = (resSpecialDays.data || []).map((sd: any) => ({
      id: sd.id,
      date: sd.date || '',
      name: sd.name || '',
      syncVersion: Number(sd.sync_version) || 1,
    }));

    const defaultTasks: DefaultTask[] = (resDefaultTasks.data || []).map((dt: any) => ({
      id: dt.id,
      title: dt.title || '',
      description: dt.description || '',
      estimatedHours: dt.estimated_hours || '',
    }));

    const userGroupsMapped: UserGroup[] = (resUserGroups.data || []).map((g: any) => ({
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

    const riskCategories: RiskCategory[] = (resRiskCategories.data || []).map((rc: any) => ({
      id: rc.id,
      syncVersion: Number(rc.sync_version) || 1,
      name: rc.name,
      deleted: rc.deleted || false,
      sort_order: rc.sort_order || 0,
    }));

    const riskStatuses: RiskStatus[] = (resRiskStatuses.data || []).map((rs: any) => ({
      id: rs.id,
      syncVersion: Number(rs.sync_version) || 1,
      name: rs.name,
      scale: rs.scale ?? 1,
      color: rs.color || '#bfdbfe',
      deleted: rs.deleted || false,
      sort_order: rs.sort_order || 0,
    }));

    const riskPriorities: RiskPriority[] = (resRiskPriorities.data || []).map((rp: any) => ({
      id: rp.id,
      syncVersion: Number(rp.sync_version) || 1,
      name: rp.name,
      scale: rp.scale || 1,
      color: rp.color || '#bfdbfe',
      deleted: rp.deleted || false,
      sort_order: rp.sort_order || 0,
    }));

    const projectRiskItems: ProjectRiskItem[] = (resProjectRiskItems.data || []).map((pri: any) => ({
      id: pri.id,
      syncVersion: Number(pri.sync_version) || 1,
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

    let notifications: any[] = (resNotifications?.data || []).map((n: any) => ({
      id: n.id,
      userId: n.user_id || n.userId || 'all',
      title: n.title || '',
      message: n.message || '',
      isRead: n.is_read === true || n.isRead === true || n.is_read === 1,
      createdDate: n.created_at || n.createdDate || new Date().toISOString(),
      linkUrl: n.link_url || n.linkUrl || ''
    }));

    let automationRules: any[] = (resAutomationRules?.data || []).map((ar: any) => ({
      id: ar.id,
      syncVersion: Number(ar.sync_version) || 1,
      name: ar.name || '',
      description: ar.description || '',
      triggerType: ar.trigger_type || ar.triggerType || 'manual',
      triggerCondition: ar.trigger_condition || ar.triggerCondition || {},
      actions: ar.actions || [],
      enabled: ar.enabled !== false,
        deleted: ar.deleted === true,
      createdDate: ar.created_at || ar.createdDate || new Date().toISOString()
    }));



    const loadedState: ERPState = {
      userGroups: userGroupsMapped,
      activeRoles,
      projectStatuses: (resProjectStatuses.data || []).map((s: any) => ({ ...s, color: s.color || '#bfdbfe', deleted: s.deleted === true || s.deleted === 1 || s.deleted === 'true' })),
      projectCategories: (resProjectCategories.data || []).map((c: any) => ({ ...c, deleted: c.deleted === true || c.deleted === 1 || c.deleted === 'true' })),
      projectRisks: (resProjectRisks.data || []).map((r: any) => ({ ...r, color: r.color || '#bfdbfe', deleted: r.deleted === true || r.deleted === 1 || r.deleted === 'true' })),
      projectPriorities: (resProjectPriorities.data || []).map((p: any) => ({ ...p, color: p.color || '#bfdbfe', deleted: p.deleted === true || p.deleted === 1 || p.deleted === 'true' })),
      projectTeams: (resProjectTeams.data || []).map((t: any) => ({ ...t, deleted: t.deleted === true || t.deleted === 1 || t.deleted === 'true' })),
      projectPartners: (resProjectPartners.data || []).map((pt: any) => ({ ...pt, deleted: pt.deleted === true || pt.deleted === 1 || pt.deleted === 'true' })),
      taskStatuses: (resTaskStatuses.data || []).map((s: any) => ({
        id: s.id,
        syncVersion: Number(s.sync_version) || 1,
        name: s.name,
        scale: s.scale ?? 1,
        color: s.color || '#bfdbfe',
        deleted: s.deleted || false,
        sort_order: s.sort_order ?? s.scale ?? 0,
      })),
      taskTypes: (() => {
        const rawTypes = (resTaskTypes.data && resTaskTypes.data.length > 0)
          ? resTaskTypes.data.map((tt: any) => ({
              id: tt.id,
              syncVersion: Number(tt.sync_version) || 1,
              name: tt.name,
              scale: tt.scale ?? 1,
              deleted: tt.deleted || false,
              sort_order: tt.sort_order ?? tt.scale ?? 0,
            }))
          : [];
        
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
      projectMaterials,
      specialDays,
      defaultTasks,
      riskCategories: riskCategories || [],
      riskStatuses: riskStatuses || [],
      riskPriorities: riskPriorities || [],
      projectRiskItems: projectRiskItems || [],
      notifications: notifications || [],
      automationRules: automationRules || [],
      notificationSettings: (resNotificationSettings.data || []).map((setting: any) => ({
        id: setting.id, type: setting.type, name: setting.name,
        enabled: setting.enabled === true, daysBefore: setting.days_before ?? 0,
        targetGroup: setting.target_group || 'allocated',
      })),
    };

    // If completely empty database (unseeded), return undefined to let /hooks/useERP seed defaults.
    // If a configuration row exists, we MUST NOT treat it as unseeded, otherwise custom system name is overwritten.
    if (projects.length === 0 && clients.length === 0 && users.length === 0 && !configRow) {
      return { success: true, data: undefined };
    }

    // Carry database revisions from the SAME queries as the mapped records.
    // A second revision query would race with those reads.
    const revisionSources: Record<string, any[]> = {
      userGroups: resUserGroups.data || [], projectStatuses: resProjectStatuses.data || [],
      projectCategories: resProjectCategories.data || [], projectRisks: resProjectRisks.data || [],
      projectPriorities: resProjectPriorities.data || [], projectTeams: resProjectTeams.data || [],
      projectPartners: resProjectPartners.data || [], taskStatuses: resTaskStatuses.data || [],
      taskTypes: resTaskTypes.data || [], users: resUsers.data || [],
      projectMaterials: projectMaterialsRows || [], projectRiskItems: resProjectRiskItems.data || [],
      comments: resComments.data || [], userAbsences: resUserAbsences.data || [], specialDays: resSpecialDays.data || [],
      defaultTasks: resDefaultTasks.data || [], riskCategories: resRiskCategories.data || [],
      riskStatuses: resRiskStatuses.data || [], riskPriorities: resRiskPriorities.data || [],
      notifications: resNotifications.data || [], automationRules: resAutomationRules.data || [],
    };
    for (const [field, rows] of Object.entries(revisionSources)) {
      const versions = new Map(rows.map(row => [row.id, row.sync_version]));
      for (const record of (loadedState as any)[field] || []) {
        if (versions.has(record.id)) record.syncVersion = versions.get(record.id);
      }
    }
    if (configRow?.sync_version) (loadedState.appConfig as any).syncVersion = configRow.sync_version;
    return { success: true, data: loadedState };
  } catch (error: any) {
    console.error('Relational load error from Supabase:', error);
    return { success: false, message: `Erro ao ler dados do Supabase SQL: ${formatSupabaseError(error)}` };
  }
}

export interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  message?: string;
}

/**
 * Fetches projects directly from Supabase via canonical Project repository/service
 */
export async function fetchPaginatedProjectsDirectly(
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    statusId?: string;
    categoryId?: string;
    managerId?: string;
    includeCompleted?: boolean;
  },
  clientOverride?: SupabaseClient
): Promise<PaginatedResult<Project>> {
  const dbClient = clientOverride || supabase;
  if (!isSupabaseConfigured || !dbClient) {
    return { success: false, data: [], total: 0, page: 1, pageSize: 25, totalPages: 0, message: 'Supabase não configurado.' };
  }

  try {
    const result = await getProjectsServerData(dbClient, {
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      statusId: params.statusId,
      categoryId: params.categoryId,
      managerId: params.managerId,
      includeDeleted: false,
    });

    return {
      success: true,
      data: result.data,
      total: result.total,
      page: result.page || 1,
      pageSize: result.pageSize || 25,
      totalPages: result.totalPages || 1,
    };
  } catch (error: any) {
    console.error('Error in fetchPaginatedProjectsDirectly:', error);
    return {
      success: false,
      data: [],
      total: 0,
      page: params.page || 1,
      pageSize: params.pageSize || 25,
      totalPages: 0,
      message: formatSupabaseError(error),
    };
  }
}

/**
 * Fetches tasks directly from Supabase with SQL-level pagination and indexing
 */
export async function fetchPaginatedTasksDirectly(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  projectId?: string;
  statusId?: string;
  taskTypeId?: string;
}): Promise<PaginatedResult<Task>> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, data: [], total: 0, page: 1, pageSize: 25, totalPages: 0, message: 'Supabase não configurado.' };
  }

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(params.pageSize) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .eq('deleted', false);

    if (params.projectId) {
      query = query.eq('project_id', params.projectId);
    }

    if (params.statusId) {
      query = query.eq('status_id', params.statusId);
    }

    if (params.taskTypeId) {
      query = query.eq('task_type_id', params.taskTypeId);
    }

    if (params.search && params.search.trim()) {
      query = query.or(orLike(['task_title', 'task_description', 'notes'], params.search));
    }

    // Uses idx_tasks_project_deleted and idx_tasks_deleted_created_at
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    const total = count ?? (data ? data.length : 0);
    const totalPages = Math.ceil(total / pageSize) || 1;

    const tasks: Task[] = (data || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id || '',
      title: row.task_title || row.title || 'Sem Título',
      statusId: row.status_id || '',
      taskTypeId: row.task_type_id || '',
      assigneeIds: [],
      estimatedDate: row.estimated_date || '',
      description: row.task_description || row.description || '',
      estimatedHours: row.estimated_hours || '00:00',
      actualHours: row.actual_hours ?? null,
      startDate: row.start_date || '',
      startTime: row.start_time || '',
      endDate: row.end_date || '',
      endTime: row.end_time || '',
      notes: row.notes || '',
      deleted: Boolean(row.deleted),
      isMilestone: Boolean(row.is_milestone),
      createdDate: row.created_at || new Date().toISOString(),
      updatedDate: row.updated_at || new Date().toISOString(),
      version: typeof row.version === 'number' ? row.version : 1,
    }));

    return {
      success: true,
      data: tasks,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error: any) {
    console.error('Error in fetchPaginatedTasksDirectly:', error);
    return {
      success: false,
      data: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      message: formatSupabaseError(error),
    };
  }
}

/**
 * Safely upserts records into reference tables, falling back gracefully if extended columns (e.g., color, sort_order) do not exist in the database schema yet.
 */

/**
 * @deprecated MECANISMO LEGACY CONTROLADO (FASE 59: SUPABASE SYNC BOUNDARY)
 * 
 * AVISO ARQUITETURAL CRÍTICO:
 * Grava em lote múltiplos agregados diretamente no PostgreSQL.
 * Este mecanismo cria fontes de verdade concorrentes (last-write-wins) e riscos de supressão silenciosa de erros.
 * 
 * REGRAS DE CONTENÇÃO:
 * - É ESTRITAMENTE PROIBIDO utilizar esta função para implementar novas operações de negócio.
 * - Novas rotas de API e novos domínios NÃO podem chamar esta função.
 * - O agregado Projects NUNCA é gravado por esta função (isolamento estrito).
 * 
 * CONSUMIDORES LEGACY PERMITIDOS (EM TRANSIÇÃO):
 * 1. app/api/supabase/sync/route.ts (Endpoint de sincronização global)
 * 5. app/api/v1/project-materials/route.ts (Migração futura)
 * 6. app/api/v1/project-materials/[id]/route.ts (Migração futura)
 */
export type OperationalWriteScope = Partial<Pick<ERPState, 'notifications' | 'projectMaterials'>>;

export function isolateOperationalWrite(state: ERPState, scope: OperationalWriteScope): ERPState {
  // Keep the normalizer's collection shape, but never copy unrelated records or config.
  const emptyState = Object.fromEntries(Object.entries(state)
    .filter(([key]) => key !== 'appConfig')
    .map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
  return { ...emptyState, ...scope } as ERPState;
}

export { writeDomainChanges as saveActiveStateToSupabase } from './supabase/writeDomainChanges';

/**
 * SQL setup script instructions (Includes public RLS policies or disabling RLS altogether for quick dev)
 */
export const SUPABASE_SETUP_SQL = `-- EXECUTE ESTE SCRIPT NO EDITOR SQL DO SUPABASE (SQL Editor) PARA PERMITIR TRABALHO ONLINE SEM RESTRIÇÕES DE RLS:
-- 

-- Ativar RLS para segurança de dados por função/utilizador
ALTER TABLE IF EXISTS user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_risk ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_risk_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_priority_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_category_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_teams_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_partners_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS default_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notification_settings ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- MÓDULO DE NOTIFICAÇÕES
-- ==========================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL DEFAULT 'all',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    link_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);

-- Adicionar campo de permissões aos grupos de utilizadores
ALTER TABLE IF EXISTS user_groups ADD COLUMN IF NOT EXISTS permissions TEXT;

-- Adicionar campos de notas e eliminação lógica (deleted) à tabela de clientes
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

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
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS priority_id UUID REFERENCES project_priority(id) ON DELETE SET NULL;
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

ALTER TABLE IF EXISTS risk_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS risk_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS risk_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_risk_items ENABLE ROW LEVEL SECURITY;

-- Adicionar/Criar tabela de configurações da aplicação
CREATE TABLE IF NOT EXISTS app_configuration (
    id UUID PRIMARY KEY DEFAULT '33333333-4444-5555-6666-777777777777',
    app_name TEXT,
    app_description TEXT,
    footer_text TEXT,
    logo_url TEXT,
    logo_image_path TEXT,
    footer_copyright_text TEXT,
    theme_name TEXT DEFAULT 'default',
    sales_rep_group_id TEXT,
    proj_manager_group_id TEXT,
    field_manager_group_id TEXT,
    task_assignee_group_id TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS app_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS sales_rep_group_id TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS proj_manager_group_id TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS field_manager_group_id TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS task_assignee_group_id TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS logo_image_path TEXT;
ALTER TABLE IF EXISTS app_configuration ADD COLUMN IF NOT EXISTS theme_name TEXT;

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

ALTER TABLE IF EXISTS automation_rules ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- MÓDULO DE REGISTOS DE AUDITORIA (AUDIT LOGS)
-- ==========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    entity_name TEXT,
    details TEXT
);

ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- ============================================================================
-- AUDITORIA E ÍNDICES DE ALTO DESEMPENHO (PAGINAÇÃO E PESQUISA OTIMIZADAS)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects (deleted);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_created_at ON projects (deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects (client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status_id ON projects (status_id);
CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects (category_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects (project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_active_status ON projects (status_id, created_at DESC) WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks (deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks (status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project_deleted ON tasks (project_id, deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_created_at ON tasks (deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_active_project ON tasks (project_id, status_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tasks_task_type_id ON tasks (task_type_id);
CREATE INDEX IF NOT EXISTS idx_tasks_estimated_date ON tasks (estimated_date);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees (user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees (task_id);

CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments (project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project_created ON comments (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_materials_project_id ON project_materials (project_id);
CREATE INDEX IF NOT EXISTS idx_project_materials_proj_del ON project_materials (project_id, deleted);

CREATE INDEX IF NOT EXISTS idx_risk_items_project_id ON project_risk_items (project_id);
CREATE INDEX IF NOT EXISTS idx_risk_items_proj_del ON project_risk_items (project_id, deleted);

-- OU, se preferir manter o RLS ativo, execute estes comandos para conceder políticas públicas:
-- DROP POLICY IF EXISTS "Full access to auth users on projects" ON projects;
-- CREATE POLICY "Acesso público total ao projects" ON projects FOR ALL USING (true) WITH CHECK (true);
-- ...etc para todas as tabelas
`;

export const SUPABASE_OPTIMIZE_INDEXES_SQL = `-- ============================================================================
-- AUDITORIA E ÍNDICES DE ALTO DESEMPENHO (PAGINAÇÃO E PESQUISA OTIMIZADAS)
-- ============================================================================
-- Executar no SQL Editor do Supabase para acelerar consultas e paginação:

-- 1. Projetos (Paginação & Filtros)
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects (deleted);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_created_at ON projects (deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects (client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status_id ON projects (status_id);
CREATE INDEX IF NOT EXISTS idx_projects_category_id ON projects (category_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects (project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_active_status ON projects (status_id, created_at DESC) WHERE deleted = FALSE;

-- 2. Tarefas (Paginação & Ordenação)
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks (deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks (status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project_deleted ON tasks (project_id, deleted);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_created_at ON tasks (deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_active_project ON tasks (project_id, status_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tasks_task_type_id ON tasks (task_type_id);
CREATE INDEX IF NOT EXISTS idx_tasks_estimated_date ON tasks (estimated_date);

-- 3. Técnicos Atribuídos (O Meu Foco & Conflitos)
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees (user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees (task_id);

-- 4. Comentários
CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments (project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project_created ON comments (project_id, created_at DESC);

-- 5. Materiais e Encomendas
CREATE INDEX IF NOT EXISTS idx_project_materials_project_id ON project_materials (project_id);
CREATE INDEX IF NOT EXISTS idx_project_materials_proj_del ON project_materials (project_id, deleted);

-- 6. Matriz de Riscos
CREATE INDEX IF NOT EXISTS idx_risk_items_project_id ON project_risk_items (project_id);
CREATE INDEX IF NOT EXISTS idx_risk_items_proj_del ON project_risk_items (project_id, deleted);

-- 7. Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
`;

/**
 * Registers an event in the audit log system in Supabase
 */
export async function logAuditEventToSupabase(log: {
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'SETTINGS' | string;
  entityType: 'PROJECT' | 'TASK' | 'CLIENT' | 'USER' | 'RISK' | 'SYSTEM' | string;
  entityId?: string;
  entityName?: string;
  details: string;
}): Promise<{ success: boolean; data?: AuditLog; message?: string }> {
  try {
    const response = await fetch('/api/audit', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: log.action }), credentials: 'same-origin' });
    return await response.json();
  } catch (err: any) { return { success: false, message: formatSupabaseError(err) }; }
}

/**
 * Fetches recent audit logs from Supabase
 */
export async function fetchAuditLogsFromSupabase(limit = 100): Promise<{ success: boolean; data?: AuditLog[]; message?: string }> {
  try {
    const response = await fetch(`/api/audit?limit=${encodeURIComponent(limit)}`, { headers: getAuthHeaders(), credentials: 'same-origin' });
    return await response.json();
  } catch (err: any) { return { success: false, message: formatSupabaseError(err) }; }
}
import { configurationReadQuery } from '@/domains/configuration/data/configurationRepository';
