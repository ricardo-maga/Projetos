import { authenticatedRequest, getAuthHeaders } from '@/lib/clientAuth';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createCommunicationActions({ state, setState, setSyncError, refreshFromDatabase }: Pick<LegacyActionContext, 'state' | 'setState' | 'setSyncError' | 'refreshFromDatabase'>) {
    // ==================== NOTIFICATIONS ====================
  const updateNotificationSetting = async (id: string, updates: Partial<import('@/lib/types').NotificationSetting>) => {
    const setting = state?.notificationSettings?.find(item => item.id === id);
    if (!setting) return { success: false, message: 'Definição não encontrada.' };
    try {
      const response = await authenticatedRequest('/api/notifications/settings', {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ type: setting.type, updates }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Erro ao guardar a definição.');
      setState(prev => prev ? ({ ...prev, notificationSettings: (prev.notificationSettings || []).map(item =>
        item.id === id ? { ...item, ...updates } : item) }) : prev);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao guardar a definição.';
      setSyncError(message);
      return { success: false, message };
    }
  };

  const markNotificationAsRead = async (id: string) => {
    const response = await authenticatedRequest('/api/notifications/read', {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id }),
    });
    if (!response.ok) return { success: false };
    setState(prev => prev ? ({ ...prev, notifications: (prev.notifications || []).map(n =>
      n.id === id ? { ...n, isRead: true } : n) }) : prev);
    return { success: true };
  };

  const markAllNotificationsAsRead = (userId: string) => {
    return authenticatedRequest('/api/notifications/read', {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ all: true }),
    }).then(response => {
      if (!response.ok) return { success: false };
      setState(prev => prev ? ({ ...prev, notifications: (prev.notifications || []).map(n =>
        n.userId === userId || n.userId === 'all' ? { ...n, isRead: true } : n) }) : prev);
      return { success: true };
    });
  };

  // ==================== AUTOMATION RULES ====================
  const writeRule = async (url: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown) => {
    try {
      const response = await authenticatedRequest(url, { method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        if (response.status === 409) void refreshFromDatabase();
        return { success: false, message: result.message || 'Não foi possível guardar a regra.' };
      }
      if (method === 'POST') setState(prev => prev ? ({ ...prev, automationRules: [result.data, ...(prev.automationRules || [])] }) : prev);
      else if (method === 'PATCH') setState(prev => prev ? ({ ...prev, automationRules: (prev.automationRules || []).map(rule => rule.id === result.data.id ? result.data : rule) }) : prev);
      else setState(prev => prev ? ({ ...prev, automationRules: (prev.automationRules || []).filter(rule => rule.id !== result.id) }) : prev);
      return { success: true };
    } catch { return { success: false, message: 'Falha de comunicação ao guardar a regra.' }; }
  };

  const addAutomationRule = (rule: Omit<import('@/lib/types').AutomationRule, 'id' | 'createdDate'>) =>
    writeRule('/api/v1/automation-rules', 'POST', rule);

  const updateAutomationRule = (id: string, updates: Partial<import('@/lib/types').AutomationRule>) => {
    const current = state?.automationRules?.find(rule => rule.id === id);
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue as regras antes de alterar.' });
    return writeRule(`/api/v1/automation-rules/${encodeURIComponent(id)}`, 'PATCH', { ...current, ...updates, syncVersion: current.syncVersion });
  };

  const deleteAutomationRule = (id: string) => {
    const current = state?.automationRules?.find(rule => rule.id === id);
    if (!current?.syncVersion) return Promise.resolve({ success: false, message: 'Recarregue as regras antes de eliminar.' });
    return writeRule(`/api/v1/automation-rules/${encodeURIComponent(id)}`, 'DELETE', { syncVersion: current.syncVersion });
  };

  const toggleAutomationRule = (id: string) => {
    const current = state?.automationRules?.find(rule => rule.id === id);
    if (!current) return Promise.resolve({ success: false, message: 'Regra não encontrada.' });
    return updateAutomationRule(id, { enabled: !current.enabled });
  };
  return { updateNotificationSetting, markNotificationAsRead, markAllNotificationsAsRead, addAutomationRule, updateAutomationRule, deleteAutomationRule, toggleAutomationRule };
}
