import type { SupabaseClient } from '@supabase/supabase-js';
import type { PresalesRequest } from './presales';

export async function usersWithPresalesPermission(db: SupabaseClient, code: string): Promise<string[]> {
  const { data: permission, error: permissionError } = await db.from('permissions').select('id')
    .eq('code', code).eq('is_active', true).maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission) return [];
  const { data: grants, error: grantsError } = await db.from('role_permissions').select('role_id').eq('permission_id', permission.id);
  if (grantsError) throw grantsError;
  const roleIds = [...new Set((grants || []).map(row => row.role_id))];
  if (!roleIds.length) return [];
  const { data: roles, error: rolesError } = await db.from('roles').select('id').in('id', roleIds).eq('is_active', true);
  if (rolesError) throw rolesError;
  const activeRoles = (roles || []).map(row => row.id);
  if (!activeRoles.length) return [];
  const { data: links, error: linksError } = await db.from('user_roles').select('user_id').in('role_id', activeRoles);
  if (linksError) throw linksError;
  return [...new Set((links || []).map(row => row.user_id))];
}

export async function personalPresalesIds(db: SupabaseClient, userId: string) {
  const { data: assignments, error } = await db.from('task_assignees').select('task_id').eq('user_id', userId);
  if (error) throw error;
  const taskIds = (assignments || []).map(row => row.task_id);
  if (!taskIds.length) return [];
  const { data: links, error: linkError } = await db.from('work_request_tasks').select('request_id').in('task_id', taskIds);
  if (linkError) throw linkError;
  return [...new Set((links || []).map(row => row.request_id))];
}

export async function listPresales(db: SupabaseClient, options: { id?: string; page?: number; ownerId?: string; assignedIds?: string[] } = {}) {
  const page = options.page || 1;
  let query = db.from('work_requests').select('id,title,status,requester_id,area_owner_id,version,planned_start_date,planned_end_date')
    .eq('kind', 'presales').order('created_at', { ascending: false });
  if (options.id) query = query.eq('id', options.id);
  else if (options.ownerId) {
    const ids = options.assignedIds || [];
    query = ids.length ? query.or(`area_owner_id.eq.${options.ownerId},id.in.(${ids.join(',')})`)
      : query.eq('area_owner_id', options.ownerId);
  }
  if (!options.id) query = query.range((page - 1) * 50, page * 50 - 1);
  const { data: requests, error } = await query;
  if (error) throw error;
  if (!requests?.length) return [] as PresalesRequest[];
  const ids = requests.map(row => row.id);
  const [detailsResult, linksResult, itemsResult, revisionsResult] = await Promise.all([
    db.from('presales_details').select('*').in('request_id', ids),
    db.from('work_request_tasks').select('*').in('request_id', ids),
    db.from('presales_items').select('*').in('request_id', ids).order('sort_order'),
    db.from('presales_document_revisions').select('*').in('request_id', ids).order('revision_number', { ascending: false }),
  ]);
  const failure = detailsResult.error || linksResult.error || itemsResult.error || revisionsResult.error;
  if (failure) throw failure;
  const links = linksResult.data || [];
  const taskIds = links.map(row => row.task_id);
  const [tasksResult, assigneesResult] = taskIds.length ? await Promise.all([
    db.from('tasks').select('id,task_title,task_description,status_id,version').in('id', taskIds),
    db.from('task_assignees').select('task_id,user_id').in('task_id', taskIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (tasksResult.error || assigneesResult.error) throw tasksResult.error || assigneesResult.error;
  const detailMap = new Map((detailsResult.data || []).map(row => [row.request_id, row]));
  const taskMap = new Map((tasksResult.data || []).map(row => [row.id, row]));
  return requests.map(row => {
    const detail = detailMap.get(row.id);
    return {
      id: row.id, title: row.title, status: row.status, requesterId: row.requester_id,
      ownerId: row.area_owner_id, version: row.version,
      plannedStartDate: row.planned_start_date || '', plannedEndDate: row.planned_end_date || '',
      requirements: detail?.technical_requirements || '', outcome: detail?.technical_outcome || '',
      commercialManagerId: detail?.commercial_manager_id || null, projectManagerId: detail?.project_manager_id || null,
      executionProjectId: detail?.execution_project_id || null,
      document: detail?.document_draft || { schemaVersion: 1, blocks: [] }, documentLocked: Boolean(detail?.document_locked),
      tasks: links.filter(link => link.request_id === row.id).map(link => {
        const task = taskMap.get(link.task_id);
        if (!task) return null;
        return { id: task.id, title: task.task_title, description: task.task_description || '',
          statusId: task.status_id, version: task.version, isInitial: Boolean(link.is_initial),
          estimatedDays: link.estimated_days === null ? null : Number(link.estimated_days),
          assigneeIds: (assigneesResult.data || []).filter(assignment => assignment.task_id === task.id).map(assignment => assignment.user_id) };
      }).filter((task): task is NonNullable<typeof task> => task !== null),
      items: (itemsResult.data || []).filter(item => item.request_id === row.id).map(item => ({
        id: item.id, title: item.title, unit: item.unit, quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price), groupLabel: item.group_label,
        sortOrder: item.sort_order, total: Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100 })),
      revisions: (revisionsResult.data || []).filter(revision => revision.request_id === row.id).map(revision => ({
        id: revision.id, revisionNumber: revision.revision_number,
        publishedBy: revision.published_by, publishedAt: revision.published_at,
        documentSnapshot: revision.document_snapshot, itemsSnapshot: revision.items_snapshot,
        contactsSnapshot: revision.contacts_snapshot })),
    } as PresalesRequest;
  });
}
