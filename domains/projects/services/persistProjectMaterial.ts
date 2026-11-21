import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectMaterial } from '@/lib/types';
import { formatDbDate } from '@/lib/supabaseSync';

export async function persistProjectMaterial(db: SupabaseClient, material: ProjectMaterial, mode: 'create' | 'update' | 'delete') {
  const row = {
    project_id: material.projectId,
    description: material.description,
    supplier: material.supplier,
    quantity: material.quantity || 1,
    reference: material.reference || null,
    budget: material.budget ? String(material.budget) : null,
    cost_price: material.costPrice || 0,
    sale_price: material.salePrice || 0,
    expected_delivery_date: formatDbDate(material.expectedDeliveryDate),
    status: material.status || 'por_encomendar',
  };
  const table = db.from('project_materials');
  const version = material.syncVersion;
  if (mode !== 'create' && (!Number.isSafeInteger(version) || !version || version < 1)) {
    return { success: false, status: 409, message: 'Atualize o material antes de repetir a operação.' } as const;
  }

  const write = mode === 'create'
    ? table.insert({ ...row, id: material.id, created_at: material.createdDate, deleted: false })
    : table.update({ ...(mode === 'delete' ? { deleted: true } : row), sync_version: version! + 1 })
      .eq('id', material.id).eq('sync_version', version!).eq('deleted', false);

  const { data, error } = await write.select('sync_version').maybeSingle();
  if (error) {
    const conflict = ['PT409', '40001'].includes(error.code);
    if (!conflict) console.error('[PROJECT MATERIAL WRITE]', error.code);
    return {
      success: false, status: conflict ? 409 : 500,
      message: conflict ? 'O material foi alterado entretanto.' : 'A base de dados rejeitou a gravação do material.',
    } as const;
  }
  if (!data) return { success: false, status: 409, message: 'O material foi alterado entretanto.' } as const;
  return { success: true, syncVersion: data.sync_version as number } as const;
}
