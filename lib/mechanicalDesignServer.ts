import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDesignRows } from './mechanicalDesign';

export async function listEligibleDesignExecutors(db: SupabaseClient): Promise<string[]> {
  const { data: permission, error: permissionError } = await db.from('permissions').select('id')
    .eq('code', 'mechanical_design.execute').eq('is_active', true).maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission) return [];
  const { data: grants, error: grantsError } = await db.from('role_permissions').select('role_id').eq('permission_id', permission.id);
  if (grantsError) throw grantsError;
  const roleIds = [...new Set((grants || []).map(row => row.role_id))];
  if (!roleIds.length) return [];
  const { data: roles, error: rolesError } = await db.from('roles').select('id').eq('is_active', true).in('id', roleIds);
  if (rolesError) throw rolesError;
  const activeRoleIds = (roles || []).map(row => row.id);
  if (!activeRoleIds.length) return [];
  const { data: assignments, error: assignmentsError } = await db.from('user_roles').select('user_id').in('role_id', activeRoleIds);
  if (assignmentsError) throw assignmentsError;
  return [...new Set((assignments || []).map(row => row.user_id))];
}

export async function listMechanicalDesign(db: SupabaseClient, id?: string, page = 1, pageSize = 50) {
  let query = db.from('work_requests').select('id,title,status,requester_id,area_owner_id,project_id,planned_start_date,planned_end_date,version,created_at,delivered_at,delivered_by')
    .eq('kind', 'mechanical_design').order('created_at', { ascending: false });
  if (id) query = query.eq('id', id);
  else query = query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data: requests, error } = await query;
  if (error) throw error;
  if (!requests?.length) return [];
  const ids = requests.map(row => row.id);
  const [{ data: details, error: detailError }, { data: links, error: linkError },
    { data: otherManagers, error: otherManagersError },
    { data: requestEvents, error: requestEventsError }, { data: taskEvents, error: taskEventsError }] = await Promise.all([
    db.from('mechanical_design_details').select('*').in('request_id', ids),
    db.from('work_request_tasks').select('*').in('request_id', ids),
    db.from('mechanical_design_other_managers').select('request_id,user_id').in('request_id', ids).eq('active', true),
    db.from('work_request_events').select('request_id,action,actor_id,occurred_at').in('request_id', ids),
    db.from('work_task_events').select('request_id,task_id,action,actor_id,occurred_at').in('request_id', ids),
  ]);
  if (detailError || linkError || otherManagersError || requestEventsError || taskEventsError) throw detailError || linkError || otherManagersError || requestEventsError || taskEventsError;
  const taskIds = (links || []).map(row => row.task_id);
  if (!taskIds.length) return mapDesignRows(requests, details || [], links || [], [], [], requestEvents || [], taskEvents || [], otherManagers || []);
  const [{ data: tasks, error: taskError }, { data: assignees, error: assigneeError }] = await Promise.all([
    db.from('tasks').select('id,task_title,task_description,status_id,version').in('id', taskIds),
    db.from('task_assignees').select('task_id,user_id').in('task_id', taskIds),
  ]);
  if (taskError || assigneeError) throw taskError || assigneeError;
  return mapDesignRows(requests, details || [], links || [], tasks || [], assignees || [], requestEvents || [], taskEvents || [], otherManagers || []);
}

export function designRpcError(error: { code?: string; message?: string }) {
  if (error.code === '40001' || error.code === '23505') return { status: 409, message: 'O pedido foi alterado. Atualize os dados e tente novamente.' };
  if (error.code === '42501') return { status: 403, message: error.message || 'Sem permissão.' };
  if (error.code === 'P0002') return { status: 404, message: error.message || 'Pedido inexistente.' };
  if (error.code === '22023' || error.code === '23514' || error.code === '23503') return { status: 400, message: error.message || 'Dados inválidos.' };
  return { status: 500, message: 'Não foi possível gravar o pedido de desenho.' };
}
