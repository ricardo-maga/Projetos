import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthError, ForbiddenError } from '@/lib/auth/requireAuth';

type ProfileValues = { name: string; email: string | null; type: string; authId: string | null };
type RpcError = { code: string; message: string };

function profileChangeError(error: RpcError): AuthError {
  if (error.code === '42501') return new ForbiddenError(error.message);
  if (['23514', '40001', '23505'].includes(error.code)) return new AuthError(error.message, 409);
  if (error.code === 'P0002') return new AuthError('Perfil não encontrado.', 404);
  return new AuthError('Serviço de gestão de utilizadores indisponível.', 503);
}

// A transport failure can hide a committed Auth change. Only a definite
// rejection permits automatic compensation and release of the reservation.
export function isDefinitiveAuthError(error: { status?: number } | null): boolean {
  return typeof error?.status === 'number' && error.status >= 400 && error.status < 500 && error.status !== 408;
}

export async function beginProfileChange(
  db: Pick<SupabaseClient, 'rpc'>, actorId: string, userId: string, version: number, changesCredentials: boolean,
) {
  const operationId = randomUUID();
  const operation = { p_user_id: userId, p_operation_id: operationId };
  const { error } = await db.rpc('admin_begin_user_profile_change', {
    ...operation, p_actor_id: actorId, p_expected_version: version, p_changes_credentials: changesCredentials,
  });
  if (error) throw profileChangeError(error);

  return {
    async write(profile: ProfileValues, expectedVersion: number): Promise<number> {
      const { data, error } = await db.rpc('admin_update_user_profile', {
        ...operation, p_expected_version: expectedVersion,
        p_name: profile.name, p_email: profile.email, p_type: profile.type, p_auth_user_id: profile.authId,
      });
      if (error) throw profileChangeError(error);
      const version = Number(data);
      if (!Number.isSafeInteger(version) || version <= expectedVersion) {
        throw new AuthError('Não foi possível confirmar a versão do perfil.', 503);
      }
      return version;
    },
    async release() {
      const { error } = await db.rpc('admin_end_user_profile_change', operation);
      if (error) throw profileChangeError(error);
    },
  };
}
