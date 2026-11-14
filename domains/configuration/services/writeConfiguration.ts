import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../../../lib/types';
import { stringToUUID, formatSupabaseError, formatDbDate } from '../../../lib/supabaseSync';
import { normalizeRoleId } from '../../../lib/permissions';
async function safeUpsertRef(
  client: any,
  tableName: string,
  fullRecords: any[],
  fallbackFields: string[] = ['id', 'name', 'deleted']
) {
  if (!fullRecords || fullRecords.length === 0) {
    return { data: null, error: null };
  }

  const res = await client.from(tableName).upsert(fullRecords);
  if (res.error && (res.error.code === '42703' || res.error.message?.includes('column') || res.error.message?.includes('schema cache') || res.error.message?.includes('Could not find'))) {
    console.warn(`[SYNC WARNING] Column missing in ${tableName} (${res.error.message}). Retrying upsert with fallback fields:`, fallbackFields);
    const fallbackRecords = fullRecords.map((r: any) => {
      const cleanRecord: any = {};
      fallbackFields.forEach(f => {
        if (r[f] !== undefined) cleanRecord[f] = r[f];
      });
      return cleanRecord;
    });
    const fallbackRes = await client.from(tableName).upsert(fallbackRecords);
    if (fallbackRes.error && (fallbackRes.error.code === '42703' || fallbackRes.error.message?.includes('column') || fallbackRes.error.message?.includes('schema cache') || fallbackRes.error.message?.includes('Could not find'))) {
      console.warn(`[SYNC WARNING] Fallback fields still failed in ${tableName}. Retrying with minimal fields (id, name):`);
      const minimalRecords = fullRecords.map((r: any) => ({
        id: r.id,
        name: r.name,
      }));
      return client.from(tableName).upsert(minimalRecords);
    }
    return fallbackRes;
  }
  return res;
}


export async function writeConfiguration(supabase: SupabaseClient, state: ERPState) {
    // 1.5. Perform parallel upserts for reference tables to prevent foreign key errors in primary tables
    const refUpserts = [
      safeUpsertRef(supabase, 'user_groups', (state.userGroups || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        deleted: g.deleted || false,
        permissions: g.permissions ? (typeof g.permissions === 'object' ? JSON.stringify(g.permissions) : g.permissions) : null
      })), ['id', 'name', 'deleted']),
      safeUpsertRef(supabase, 'project_status', (state.projectStatuses || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        scale: s.scale || 1,
        color: s.color || '#bfdbfe',
        deleted: s.deleted || false,
        sort_order: s.sort_order || 0
      })), ['id', 'name', 'scale', 'deleted']),
      safeUpsertRef(supabase, 'project_category', (state.projectCategories || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        deleted: c.deleted || false,
        sort_order: c.sort_order || 0
      })), ['id', 'name', 'deleted']),
      safeUpsertRef(supabase, 'project_risk', (state.projectRisks || []).map((r: any) => ({
        id: stringToUUID(r.id),
        name: r.name,
        scale: r.scale || 1,
        color: r.color || '#bfdbfe',
        deleted: r.deleted || false,
        sort_order: r.sort_order || 0
      })), ['id', 'name', 'scale', 'deleted']),
      safeUpsertRef(supabase, 'project_priority', (state.projectPriorities || []).map((p: any) => ({
        id: stringToUUID(p.id),
        name: p.name,
        scale: p.scale || 1,
        color: p.color || '#bfdbfe',
        deleted: p.deleted || false,
        sort_order: p.sort_order || 0
      })), ['id', 'name', 'scale', 'deleted']),
      safeUpsertRef(supabase, 'project_teams', (state.projectTeams || []).map((t: any) => ({
        id: stringToUUID(t.id),
        name: t.name,
        deleted: t.deleted || false,
        sort_order: t.sort_order || 0
      })), ['id', 'name', 'deleted']),
      safeUpsertRef(supabase, 'project_partners', (state.projectPartners || []).map((p: any) => ({
        id: stringToUUID(p.id),
        name: p.name,
        deleted: p.deleted || false,
        sort_order: p.sort_order || 0
      })), ['id', 'name', 'deleted']),
      safeUpsertRef(supabase, 'task_status', (state.taskStatuses || []).map((s: any) => ({
        id: stringToUUID(s.id),
        name: s.name,
        scale: s.scale ?? 1,
        color: s.color || '#bfdbfe',
        deleted: s.deleted ?? false,
        sort_order: s.sort_order ?? (s as any).sortOrder ?? s.scale ?? 0,
      })), ['id', 'name', 'scale', 'deleted']),
      safeUpsertRef(supabase, 'task_types', (state.taskTypes || []).map((tt: any) => ({
        id: stringToUUID(tt.id),
        name: tt.name,
        scale: tt.scale ?? 1,
        deleted: tt.deleted ?? false,
        sort_order: tt.sort_order ?? tt.scale ?? 0,
      })), ['id', 'name', 'scale', 'deleted']),
      safeUpsertRef(supabase, 'risk_categories', (state.riskCategories || []).map((rc: any) => ({
        id: stringToUUID(rc.id),
        name: rc.name,
        deleted: rc.deleted || false,
        sort_order: rc.sort_order || 0
      })), ['id', 'name', 'deleted']),
      safeUpsertRef(supabase, 'risk_statuses', (state.riskStatuses || []).map((rs: any) => ({
        id: stringToUUID(rs.id),
        name: rs.name,
        scale: rs.scale ?? 1,
        color: rs.color || '#bfdbfe',
        deleted: rs.deleted || false,
        sort_order: rs.sort_order || 0
      })), ['id', 'name', 'scale', 'deleted']),
      safeUpsertRef(supabase, 'risk_priorities', (state.riskPriorities || []).map((rp: any) => ({
        id: stringToUUID(rp.id),
        name: rp.name,
        scale: rp.scale || 1,
        color: rp.color || '#bfdbfe',
        deleted: rp.deleted || false,
        sort_order: rp.sort_order || 0
      })), ['id', 'name', 'scale', 'deleted']),
    ];

    const refResults = await Promise.all(refUpserts);
    const refError = refResults.find(r => r && r.error);
    if (refError && refError.error) {
      console.error('Error saving reference tables:', refError.error);
      return { success: false, message: `Erro a gravar tabelas de referência: ${formatSupabaseError(refError.error)}` };
    }

    // 2. Perform parallel upserts for primary entities
    const upserts = [
      // Association columns are required: never report success after dropping them from a fallback write.
      state.appConfig ? supabase.from('app_configuration').upsert([{
        id: '33333333-4444-5555-6666-777777777777',
        app_name: state.appConfig.appName,
        app_description: state.appConfig.appDescription,
        footer_text: state.appConfig.footerText,
        logo_url: state.appConfig.logoImagePath || state.appConfig.logo || null,
        logo_image_path: state.appConfig.logoImagePath || state.appConfig.logo || null,
        footer_copyright_text: state.appConfig.footerCopyrightText || null,
        theme_name: state.appConfig.theme || 'default',
        sales_rep_group_id: Array.isArray(state.appConfig.salesRepGroupIds)
          ? (state.appConfig.salesRepGroupIds.length ? state.appConfig.salesRepGroupIds.join(',') : null)
          : (state.appConfig.salesRepGroupId || null),
        proj_manager_group_id: Array.isArray(state.appConfig.projManagerGroupIds)
          ? (state.appConfig.projManagerGroupIds.length ? state.appConfig.projManagerGroupIds.join(',') : null)
          : (state.appConfig.projManagerGroupId || null),
        field_manager_group_id: Array.isArray(state.appConfig.fieldManagerGroupIds)
          ? (state.appConfig.fieldManagerGroupIds.length ? state.appConfig.fieldManagerGroupIds.join(',') : null)
          : (state.appConfig.fieldManagerGroupId || null),
        task_assignee_group_id: Array.isArray(state.appConfig.taskAssigneeGroupIds)
          ? (state.appConfig.taskAssigneeGroupIds.length ? state.appConfig.taskAssigneeGroupIds.join(',') : null)
          : (state.appConfig.taskAssigneeGroupId || null)
      }]) : Promise.resolve({ error: null }),

      // Users
      state.users.length ? supabase.from('users').upsert(state.users.map((u: any) => ({
        id: u.id,
        type: u.type,
        name: u.name,
        email: u.email || null,
        role_id: normalizeRoleId(u.roleId) || u.roleId || null,
        approved: u.approved,
        deleted: u.deleted,
        created_at: u.createdDate || new Date().toISOString(),
        is_admin: u.isAdmin || false
      }))) : Promise.resolve({ error: null }),

    ];

    const initialResults = await Promise.all(upserts);
    const initialError = initialResults.find(r => r && r.error);
    if (initialError && initialError.error) {
      console.error('Error saving primary entities:', initialError.error);
      return { success: false, message: `Erro a gravar entidades primárias: ${formatSupabaseError(initialError.error)}` };
    }


  return { success: true };
}
