import { createAdminClient } from './server';
import { AuthError } from '../auth/requireAuth';

/** Call only after authentication/permission checks, or validated inbound secret. */
export function requireServerDbClient() {
  const client = createAdminClient();
  if (!client) throw new AuthError('Serviço de base de dados indisponível.', 503);
  return client;
}
