import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../../../lib/types';
import { stringToUUID, formatSupabaseError, formatDbDate } from '../../../lib/supabaseSync';
import { normalizeRoleId } from '../../../lib/permissions';

export async function writeNotifications(supabase: SupabaseClient, state: ERPState) {
    // Save Notifications
    if (state.notifications && state.notifications.length > 0) {
      try {
        const mappedNotifs = state.notifications.slice(0, 100).map((n: any) => ({
          id: stringToUUID(n.id),
          user_id: n.userId === 'all' ? null : (n.userId || null),
          title: n.title,
          message: n.message || '',
          is_read: n.isRead || false,
          link_url: n.linkUrl || null,
          created_at: n.createdDate || new Date().toISOString()
        }));
        const resNotif = await supabase.from('notifications').upsert(mappedNotifs);
        if (resNotif.error) {
          console.error('Error saving notifications:', resNotif.error.message);
          return { success: false, message: `Erro ao gravar notificações: ${formatSupabaseError(resNotif.error)}` };
        }
      } catch (e: any) {
        console.error('notifications upsert error:', e);
        return { success: false, message: `Exceção ao gravar notificações: ${formatSupabaseError(e)}` };
      }
    }


  return { success: true };
}
