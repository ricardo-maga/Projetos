import { getAuthHeaders } from '@/lib/clientAuth';
import type { LegacyActionContext } from '@/platform/sync/legacyActionContext';

export function createCommunicationActions({ state, setState, setSyncError, saveState, genId }: Pick<LegacyActionContext, 'state' | 'setState' | 'setSyncError' | 'saveState' | 'genId'>) {
    // ==================== NOTIFICATIONS ====================
  const updateNotificationSetting = async (id: string, updates: Partial<import('@/lib/types').NotificationSetting>) => {
    const setting = state?.notificationSettings?.find(item => item.id === id);
    if (!setting) return { success: false, message: 'Definição não encontrada.' };
    try {
      const response = await fetch('/api/notifications/settings', {
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
    const response = await fetch('/api/notifications/read', {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id }),
    });
    if (!response.ok) return { success: false };
    setState(prev => prev ? ({ ...prev, notifications: (prev.notifications || []).map(n =>
      n.id === id ? { ...n, isRead: true } : n) }) : prev);
    return { success: true };
  };

  const markAllNotificationsAsRead = (userId: string) => {
    return fetch('/api/notifications/read', {
      method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ all: true }),
    }).then(response => {
      if (!response.ok) return { success: false };
      setState(prev => prev ? ({ ...prev, notifications: (prev.notifications || []).map(n =>
        n.userId === userId || n.userId === 'all' ? { ...n, isRead: true } : n) }) : prev);
      return { success: true };
    });
  };

  const addNotification = (userId: string, title: string, message: string, linkUrl?: string) => {
    const newNotif = {
      id: genId('notif'),
      userId,
      title,
      message,
      isRead: false,
      createdDate: new Date().toISOString(),
      linkUrl
    };
    saveState(prev => ({
      ...prev,
      notifications: [newNotif, ...(prev.notifications || [])]
    }));
  };

  // ==================== AUTOMATION RULES ====================
  const addAutomationRule = (rule: Omit<import('@/lib/types').AutomationRule, 'id' | 'createdDate'>) => {
    const newRule: import('@/lib/types').AutomationRule = {
      ...rule,
      id: genId('rule'),
      createdDate: new Date().toISOString()
    };
    return saveState(prev => ({
      ...prev,
      automationRules: [newRule, ...(prev.automationRules || [])]
    }));
  };

  const updateAutomationRule = (id: string, updates: Partial<import('@/lib/types').AutomationRule>) => {
    return saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, ...updates } as import('@/lib/types').AutomationRule : r)
    }));
  };

  const deleteAutomationRule = (id: string) => {
    return saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, deleted: true, enabled: false } : r)
    }));
  };

  const toggleAutomationRule = (id: string) => {
    return saveState(prev => ({
      ...prev,
      automationRules: (prev.automationRules || []).map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    }));
  };
  return { updateNotificationSetting, markNotificationAsRead, markAllNotificationsAsRead, addNotification, addAutomationRule, updateAutomationRule, deleteAutomationRule, toggleAutomationRule };
}
