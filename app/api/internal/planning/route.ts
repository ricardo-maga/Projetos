export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/authorization';
import { getServerDbClient } from '@/lib/supabase/server';
import { evaluatePersonDay, type PlanningBlock, type PlanningTask } from '@/lib/planning/intelligence';
import { readiness, type ProjectRequirement, type RequirementState } from '@/lib/planning/requirements';
import { resolveLocation, type Site } from '@/lib/planning/geo';

function enabled() {
  return process.env.PLANNING_PREVIEW_ENABLED === 'true' && process.env.VERCEL_ENV !== 'production';
}

async function allRows(db: any, table: string, columns: string, configure?: (query: any) => any) {
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    let query = db.from(table).select(columns);
    if (configure) query = configure(query);
    query = query.order(table === 'task_assignees' || table === 'task_plan_blocks' || table === 'work_request_tasks' ? 'task_id'
      : table === 'project_category_link' || table === 'project_task_requirement_state' ? 'project_id' : 'id');
    if (table === 'task_assignees' || table === 'task_plan_blocks') query = query.order('user_id');
    if (table === 'task_plan_blocks') query = query.order('plan_date').order('day_half');
    if (table === 'project_category_link') query = query.order('category_id');
    if (table === 'project_task_requirement_state') query = query.order('requirement_id');
    const { data, error } = await query.range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const auth = await requirePermission(req, 'tasks_read');
  if (!auth.success) return auth.response;
  for (const code of ['planning_center_read', 'calendar_read', 'projects_read', 'clients_read', 'absences_read'] as const) {
    const allowed = await requirePermission(req, code);
    if (!allowed.success) return allowed.response;
  }
  try {
    const db = await getServerDbClient(req, auth.user);
    if (!db) throw new Error('Base de dados indisponível.');
    const [taskRows, assignees, blocksRaw, people, projects, clients, absencesRaw, scheduleLinks, schedulesRaw, periods, requestTasks,
      categoryLinks, categories, templates, requirementRows, requirementStates, siteRows] = await Promise.all([
      allRows(db, 'tasks', 'id,task_title,project_id,estimated_date,completed_date,version,status_id,execution_location_kind,execution_site_id,deleted', q => q.eq('deleted', false)),
      allRows(db, 'task_assignees', 'task_id,user_id'),
      allRows(db, 'task_plan_blocks', 'task_id,user_id,plan_date,day_half'),
      allRows(db, 'users', 'id,name,approved,deleted', q => q.eq('deleted', false).eq('approved', true)),
      allRows(db, 'projects', 'id,project_title,project_manager_id,field_manager_id,client_id,category_id,install_project_no,sf_opportunity_no,default_site_id,version,deleted', q => q.eq('deleted', false)),
      allRows(db, 'clients', 'id,client_name,location,deleted', q => q.eq('deleted', false)),
      allRows(db, 'user_absences', 'user_id,absence_start_date,absence_end_date,is_full_day'),
      allRows(db, 'resource_work_schedules', 'resource_id,schedule_id'),
      allRows(db, 'work_schedules', 'id,is_active'),
      allRows(db, 'work_schedule_periods', 'schedule_id,day_of_week,start_time,end_time'),
      allRows(db, 'work_request_tasks', 'task_id'),
      allRows(db, 'project_category_link', 'project_id,category_id'),
      allRows(db, 'project_category', 'id,name,deleted', q => q.eq('deleted', false)),
      allRows(db, 'default_tasks', 'id,title,description,estimated_hours,task_type_id'),
      allRows(db, 'project_task_requirements', 'id,category_id,default_task_id,necessity,condition_code,sort_order,active,version'),
      allRows(db, 'project_task_requirement_state', 'project_id,requirement_id,task_id,waived,reason,version'),
      allRows(db, 'client_sites', 'id,client_id,name,address,region,deleted,version'),
    ]);
    const taskAssignees = new Map<string, string[]>();
    for (const row of assignees) taskAssignees.set(row.task_id, [...(taskAssignees.get(row.task_id) || []), row.user_id]);
    const tasks: PlanningTask[] = taskRows.map(row => ({
      id: row.id, title: row.task_title, projectId: row.project_id,
      estimatedDate: row.estimated_date, completedDate: row.completed_date,
      version: row.version, statusId: row.status_id,
      executionLocationKind: row.execution_location_kind,
      executionSiteId: row.execution_site_id,
      assigneeIds: taskAssignees.get(row.id) || [],
    }));
    const blocks: PlanningBlock[] = blocksRaw.map(row => ({
      taskId: row.task_id, userId: row.user_id, date: row.plan_date, half: row.day_half,
    }));
    const activeSchedules = new Set(schedulesRaw.filter(row => row.is_active).map(row => row.id));
    const scheduleParts = scheduleLinks.flatMap(link => {
      if (!activeSchedules.has(link.schedule_id)) return [];
      return periods.filter(period => period.schedule_id === link.schedule_id).map(period => ({
        userId: link.resource_id, weekday: period.day_of_week,
        halves: [
          ...(period.start_time < '12:00:00' && period.end_time >= '12:00:00' ? ['am' as const] : []),
          ...(period.start_time <= '13:00:00' && period.end_time > '13:00:00' ? ['pm' as const] : []),
        ],
      }));
    });
    const scheduleMap = new Map<string, { userId: string; weekday: number; halves: Array<'am' | 'pm'> }>();
    for (const part of scheduleParts) {
      const key = `${part.userId}/${part.weekday}`;
      const old = scheduleMap.get(key);
      scheduleMap.set(key, { userId: part.userId, weekday: part.weekday,
        halves: [...new Set([...(old?.halves || []), ...part.halves])] });
    }
    const schedules = [...scheduleMap.values()];
    const absences = absencesRaw.map(row => ({ userId: row.user_id, start: row.absence_start_date,
      end: row.absence_end_date, fullDay: row.is_full_day }));
    const start = req.nextUrl.searchParams.get('start') || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
    const days = req.nextUrl.searchParams.get('days') === '14' ? 14 : 7;
    const matrix = people.flatMap(person => Array.from({ length: days }, (_, offset) => {
      const date = new Date(`${start}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return evaluatePersonDay({ person, date: date.toISOString().slice(0, 10), tasks, blocks, absences, schedules });
    }));
    const writeAuth = await requirePermission(req, 'planning_center_write');
    const tasksWriteAuth = await requirePermission(req, 'tasks_write');
    const calendarWriteAuth = await requirePermission(req, 'calendar_write');
    const configureAuth = await requirePermission(req, 'config_write');
    const sitesAuth = await requirePermission(req, 'clients_write');
    const projectWriteAuth = await requirePermission(req, 'projects_write');
    const requirements: ProjectRequirement[] = requirementRows.map(row => ({ id: row.id,
      categoryId: row.category_id, defaultTaskId: row.default_task_id, necessity: row.necessity,
      conditionCode: row.condition_code, sortOrder: row.sort_order, active: row.active, version: row.version }));
    const states: RequirementState[] = requirementStates.map(row => ({ projectId: row.project_id,
      requirementId: row.requirement_id, taskId: row.task_id, waived: row.waived,
      reason: row.reason, version: row.version }));
    const readinessByProject = Object.fromEntries(projects.map(project => [project.id,
      readiness({ id: project.id, categoryId: project.category_id,
        categoryIds: categoryLinks.filter(link => link.project_id === project.id).map(link => link.category_id),
        installProjectNo: project.install_project_no, sfOpportunityNo: project.sf_opportunity_no },
      requirements, states, tasks)]));
    const sites: Site[] = siteRows.map(row => ({ id: row.id, clientId: row.client_id,
      name: row.name, address: row.address, region: row.region, deleted: row.deleted }));
    const locationByTask = Object.fromEntries(taskRows.map(row => {
      const project = projects.find(p => p.id === row.project_id);
      const client = clients.find(c => c.id === project?.client_id);
      return [row.id, resolveLocation({ kind: row.execution_location_kind || 'inherit',
        siteId: row.execution_site_id }, project ? { clientId: project.client_id,
        defaultSiteId: project.default_site_id } : null, sites, client?.location)];
    }));
    return NextResponse.json({ tasks, blocks, people, projects, clients, absences, matrix, start, days,
      specialTaskIds: requestTasks.map(row => row.task_id),
      categories, templates, requirements, states, readinessByProject, sites: siteRows, locationByTask,
      canWrite: writeAuth.success && tasksWriteAuth.success && calendarWriteAuth.success,
      canConfigure: writeAuth.success && configureAuth.success,
      canManageSites: writeAuth.success && sitesAuth.success,
      canManageProjectSites: writeAuth.success && projectWriteAuth.success }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch (error) {
    console.error('[PLANNING READ]', error);
    return NextResponse.json({ error: 'Não foi possível carregar o planeamento.' }, { status: 503 });
  }
}
