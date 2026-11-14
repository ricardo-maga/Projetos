import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../types';
import { mapStateToUUIDs, isolateOperationalWrite, formatSupabaseError, type OperationalWriteScope } from '../supabaseSync';
import { createLegacyWriteBatch, type LegacyVersions } from './legacyWriteBatch';
import { writeConfiguration } from '../../domains/configuration/services/writeConfiguration';
import { writeProjectMaterials } from '../../domains/projects/services/writeProjectMaterials';
import { writeProjectRisks } from '../../domains/projects/services/writeProjectRisks';
import { writePeopleActivity } from '../../domains/people/services/writePeopleActivity';
import { writeNotifications } from '../../domains/communication/services/writeNotifications';
import { writeAutomationRules } from '../../domains/communication/services/writeAutomationRules';
export async function writeDomainChanges(rawState: ERPState, databaseClient?: SupabaseClient | null, scope?: OperationalWriteScope): Promise<{ success: boolean; message?: string; status?: number; versions?: LegacyVersions }> {
  // Explicit server injection: never fall back to the module's public client.
  const supabase = databaseClient;
  if (typeof window !== 'undefined' || !supabase) {
    return { success: false, message: 'Cliente de base de dados do servidor indisponível.' };
  }

  try {
    // 1. Ensure all IDs and keys in state are formatted as valid UUIDs for PostgreSQL compatibility
    const state = mapStateToUUIDs(scope ? isolateOperationalWrite(rawState, scope) : rawState);
    const batch = createLegacyWriteBatch(databaseClient, state);
    // Mapping and validation stay here; mutations commit together in PostgreSQL.
    const supabase = batch.client as SupabaseClient;

    const writeConfigurationResult = await writeConfiguration(supabase, state);
    if (writeConfigurationResult.success === false) return writeConfigurationResult;

    const writeProjectMaterialsResult = await writeProjectMaterials(supabase, state);
    if (writeProjectMaterialsResult.success === false) return writeProjectMaterialsResult;

    const writeProjectRisksResult = await writeProjectRisks(supabase, state);
    if (writeProjectRisksResult.success === false) return writeProjectRisksResult;

    const writePeopleActivityResult = await writePeopleActivity(supabase, state);
    if (writePeopleActivityResult.success === false) return writePeopleActivityResult;

    const writeNotificationsResult = await writeNotifications(supabase, state);
    if (writeNotificationsResult.success === false) return writeNotificationsResult;

    const writeAutomationRulesResult = await writeAutomationRules(supabase, state);
    if (writeAutomationRulesResult.success === false) return writeAutomationRulesResult;

    return await batch.commit();
  } catch (error: any) {
    console.error('Supabase relational save state error:', error);
    return { success: false, message: `Erro ao gravar no Supabase SQL: ${formatSupabaseError(error)}` };
  }
}
