import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../../../lib/types';
import { stringToUUID, formatSupabaseError, formatDbDate } from '../../../lib/supabaseSync';
import { normalizeRoleId } from '../../../lib/permissions';

export async function writeAutomationRules(supabase: SupabaseClient, state: ERPState) {
    // Save Automation Rules
    if (state.automationRules && state.automationRules.length > 0) {
      try {
        const mappedRules = state.automationRules.map((r: any) => ({
          id: stringToUUID(r.id),
          name: r.name,
          description: r.description || null,
          trigger_type: r.triggerType,
          trigger_condition: r.triggerCondition || {},
          actions: r.actions || [],
          enabled: r.enabled !== false,
          deleted: r.deleted === true,
          created_at: r.createdDate || new Date().toISOString()
        }));
        const resRules = await supabase.from('automation_rules').upsert(mappedRules);
        if (resRules.error) {
          console.error('Error saving automation_rules:', resRules.error.message);
          return { success: false, message: `Erro ao gravar regras de automação: ${formatSupabaseError(resRules.error)}` };
        }
      } catch (e: any) {
        console.error('automation_rules upsert error:', e);
        return { success: false, message: `Exceção ao gravar regras de automação: ${formatSupabaseError(e)}` };
      }
    }


  return { success: true };
}
