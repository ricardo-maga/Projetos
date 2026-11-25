import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthError, ForbiddenError } from '@/lib/auth/requireAuth';
import { logAuditEvent } from '@/lib/audit';

type Db = Pick<SupabaseClient, 'rpc'>;

/**
 * Elimina (soft delete) um perfil através de admin_soft_delete_user, que numa só transação
 * bloqueia a autoeliminação, exige roles.manage para contas privilegiadas, recusa o perfil se a versão
 * lida pelo pedido já não for a atual e protege o último Super Administrador elegível.
 */
export async function softDeleteUser(
  db: Db,
  actor: { id: string; name: string },
  userId: string,
  context: { expectedVersion: number; ip?: string | null; userAgent?: string | null; requestId?: string | null },
): Promise<void> {
  const { error } = await db.rpc('admin_soft_delete_user', {
    p_user_id: userId, p_actor_id: actor.id, p_expected_version: context.expectedVersion,
  });
  if (error) {
    if (error.code === '42501') throw new ForbiddenError(error.message);
    if (error.code === '23514' || error.code === '40001') throw new AuthError(error.message, 409);
    if (error.code === 'P0002') throw new AuthError('Utilizador não encontrado.', 404);
    throw error;
  }
  await logAuditEvent({ action: 'USER_DELETED', userId: actor.id, userName: actor.name, entity: 'users', entityId: userId,
    ip: context.ip ?? undefined, userAgent: context.userAgent ?? undefined, requestId: context.requestId ?? undefined,
    details: { targetId: userId } });
}
