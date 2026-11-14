import type { SupabaseClient } from '@supabase/supabase-js';
import type { ERPState } from '../../../lib/types';
import { stringToUUID, formatSupabaseError, formatDbDate } from '../../../lib/supabaseSync';
import { normalizeRoleId } from '../../../lib/permissions';

export async function writePeopleActivity(supabase: SupabaseClient, state: ERPState) {
    const secondaryResults = await Promise.all([
      // Comments
      (state.comments && state.comments.length > 0) ? (() => {
        const mappedComments = state.comments.filter(c => c.id).map((c: any) => {
          const pid = c.projectId ? stringToUUID(c.projectId) : null;
          const aid = c.authorId ? stringToUUID(c.authorId) : null;
          return {
            id: c.id,
            // The API strips projects from global sync. Keep the supplied link;
            // PostgreSQL's foreign key validates it instead of silently orphaning it.
            project_id: pid,
            // Users are removed from non-admin snapshots. Preserve the server-
            // validated identity; PostgreSQL validates the foreign key.
            author_id: aid,
            comment: c.comment,
            created_at: c.createdDate || new Date().toISOString()
          };
        });
        return supabase.from('comments').upsert(mappedComments).then(res => ({ ...res, table: 'comments' }));
      })() : Promise.resolve({ error: null }),

      // User Absences
      (state.userAbsences && state.userAbsences.length > 0) ? (() => {
        const mappedAbsences = state.userAbsences.map((a: any) => {
          const uid = a.userId ? stringToUUID(a.userId) : null;
          return {
            id: a.id,
            user_id: uid,
            absence_start_date: formatDbDate(a.absenceStartDate),
            absence_end_date: formatDbDate(a.absenceEndDate),
            reason: a.reason,
            created_at: a.createdDate || new Date().toISOString()
          };
        });
        return supabase.from('user_absences').upsert(mappedAbsences).then(res => ({ ...res, table: 'user_absences' }));
      })() : Promise.resolve({ error: null }),

    ]);

    const secondaryError = secondaryResults.find(r => r && r.error);
    if (secondaryError && secondaryError.error) {
      console.error('Error saving secondary entities (Stage 1) for table', (secondaryError as any).table, ':', secondaryError.error);
      return { success: false, message: `Error saving secondary entities (Stage 1) for table ${(secondaryError as any).table}: ${formatSupabaseError(secondaryError.error)}` };
    }


  return { success: true };
}
