import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../../../lib/types';
import { stringToUUID, formatSupabaseError, formatDbDate } from '../../../lib/supabaseSync';
import { normalizeRoleId } from '../../../lib/permissions';

export async function writeProjectRisks(supabase: SupabaseClient, state: ERPState) {
    // Save Project Risk Items
    if (state.projectRiskItems && state.projectRiskItems.length > 0) {
      // Projects are deliberately stripped by the sync API. Validate risk links
      // against PostgreSQL, never against the (empty) global-sync project list.
      const riskProjectIds = [...new Set(state.projectRiskItems.map(pri => stringToUUID(pri.projectId)))];
      const { data: riskProjects, error: riskProjectError } = await supabase
        .from('projects').select('id').in('id', riskProjectIds);
      if (riskProjectError) {
        return { success: false, message: `Erro ao validar projetos dos riscos: ${formatSupabaseError(riskProjectError)}` };
      }
      const persistedRiskProjectIds = new Set((riskProjects || []).map(p => p.id));
      if (riskProjectIds.some(id => !persistedRiskProjectIds.has(id))) {
        return { success: false, message: 'Não foi possível gravar riscos: um projeto associado não existe na base de dados.' };
      }
      const validRiskCatIds = new Set((state.riskCategories || []).map((rc: any) => stringToUUID(rc.id)));
      const validRiskStatIds = new Set((state.riskStatuses || []).map((rs: any) => stringToUUID(rs.id)));
      const validRiskPrioIds = new Set((state.riskPriorities || []).map((rp: any) => stringToUUID(rp.id)));

      const priUpserts = state.projectRiskItems.map((pri: any) => {
        const pId = pri.projectId ? stringToUUID(pri.projectId) : null;
        const ownerId = pri.ownerId ? stringToUUID(pri.ownerId) : null;
        const catId = pri.categoryId ? stringToUUID(pri.categoryId) : null;
        const statusId = pri.statusId ? stringToUUID(pri.statusId) : null;
        const priorityId = pri.priorityId ? stringToUUID(pri.priorityId) : null;

        return {
          id: stringToUUID(pri.id),
          project_id: pId,
          title: pri.title || 'Risco sem título',
          category_id: catId,
          identification_date: formatDbDate(pri.identificationDate) || new Date().toISOString().split('T')[0],
          owner_id: ownerId,
          description: pri.description || null,
          consequence: pri.consequence || null,
          probability: Math.min(5, Math.max(1, Number(pri.probability) || 1)),
          impact: Math.min(5, Math.max(1, Number(pri.impact) || 1)),
          mitigation_plan: pri.mitigationPlan || null,
          contingency_plan: pri.contingencyPlan || null,
          review_date: formatDbDate(pri.reviewDate) || null,
          status_id: statusId,
          priority_id: priorityId,
          deleted: Boolean(pri.deleted),
          created_at: pri.createdDate || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      if (priUpserts.length > 0) {
        try {
          const resPRI = await supabase.from('project_risk_items').upsert(priUpserts);
          if (resPRI.error) {
            console.error('Error saving project_risk_items:', resPRI.error.message);
            return { success: false, message: `Erro ao gravar itens de risco: ${formatSupabaseError(resPRI.error)}` };
          }
        } catch (priErr: any) {
          console.error('Exception saving project_risk_items:', priErr);
          return { success: false, message: `Exceção ao gravar itens de risco: ${formatSupabaseError(priErr)}` };
        }
      }
    }


  return { success: true };
}
