import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../../../lib/types';
import { stringToUUID, formatSupabaseError, formatDbDate } from '../../../lib/supabaseSync';
import { normalizeRoleId } from '../../../lib/permissions';

export async function writeProjectMaterials(supabase: SupabaseClient, state: ERPState) {
    // Save Project Materials
    if (state.projectMaterials && state.projectMaterials.length > 0) {
      const pmUpserts = state.projectMaterials.map((pm: any) => ({
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
        if (resPM.error) {
          console.error('Error saving project_materials:', resPM.error.message);
          return { success: false, message: `Erro ao gravar materiais de projeto: ${formatSupabaseError(resPM.error)}` };
        }
      } catch (pmErr: any) {
        console.error('Exception saving project_materials:', pmErr);
        return { success: false, message: `Exceção ao gravar materiais de projeto: ${formatSupabaseError(pmErr)}` };
      }
    }


  return { success: true };
}
