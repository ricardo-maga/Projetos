import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';
import { getAuthHeaders } from '@/lib/clientAuth';
import type { AppConfiguration } from '@/lib/types';

export function createConfigActions({ state, setState, refreshFromDatabase }: Pick<LegacyActionContext, 'state' | 'setState' | 'refreshFromDatabase'>) {
  // ==================== APP CONFIGURATION ====================
  const updateConfig = async (updates: Partial<AppConfiguration>) => {
    const syncVersion = state?.appConfig?.syncVersion;
    if (!syncVersion) return { success: false, message: 'Recarregue a configuração antes de alterar.' };
    try {
      const response = await fetch('/api/v1/configuration', {
        method: 'PATCH', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncVersion, updates }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        if (response.status === 409) void refreshFromDatabase();
        return { success: false, message: result.message || 'Não foi possível guardar a configuração.' };
      }
      setState(prev => prev ? ({ ...prev, appConfig: { ...prev.appConfig, ...result.data } }) : prev);
      return { success: true };
    } catch { return { success: false, message: 'Falha de comunicação ao guardar a configuração.' }; }
  };

  return { updateConfig };
}
