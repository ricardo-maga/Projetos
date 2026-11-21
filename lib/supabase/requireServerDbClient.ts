import { auditRequestHeaders, createAdminClient } from './server';
import { AuthError } from '../auth/requireAuth';

/** Privileged client for an already authenticated actor; callers enforce the route permission first. */
export function requireServerDbClient(actor: { id: string }) {
  if (!actor?.id) throw new AuthError('Utilizador não autenticado.');
  return requireAdminDatabase(auditRequestHeaders(actor));
}

/** Narrow exception used to validate a hashed integration key before its identity is known. */
export function requireIntegrationKeyLookupClient() {
  return requireAdminDatabase();
}

function requireAdminDatabase(headers?: Record<string, string>) {
  const client = createAdminClient(headers);
  if (!client) throw new AuthError('Serviço de base de dados indisponível.', 503);
  return client;
}
