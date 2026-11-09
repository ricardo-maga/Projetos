import { badRequest, conflict, internalServerError, notFound } from '@/lib/apiErrors';
import { ClientFailure } from '@/domains/clients/modules/clientService';

export function clientErrorResponse(error: unknown, requestId: string, fallback: string) {
  if (error instanceof ClientFailure) {
    if (error.status === 400) return badRequest(error.message, requestId, error.details);
    if (error.status === 404) return notFound(error.message, requestId);
    if (error.status === 409) return conflict(error.message, requestId, error.details);
    return internalServerError(error.message, requestId);
  }
  return internalServerError(fallback, requestId);
}
