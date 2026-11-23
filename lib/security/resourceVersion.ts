import { createHash } from 'node:crypto';
import { createErrorResponse } from '@/lib/apiErrors';

export function resourceTag(resource: unknown) {
  return `"${createHash('sha256').update(JSON.stringify(resource)).digest('base64url')}"`;
}

export function validationHeaders(etag: string) {
  return { ETag: etag, 'Cache-Control': 'private, no-cache', Vary: 'Cookie, Authorization' };
}

export function isNotModified(req: Request, etag: string) {
  return req.headers.get('if-none-match')?.split(',').some(value =>
    value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}

export function mutationPrecondition(req: Request, etag: string, sentVersion: number | undefined,
  currentVersion: number | undefined, requestId: string) {
  const header = req.headers.get('if-match');
  if (header !== null && !header.split(',').some(value => value.trim() === '*' || value.trim() === etag))
    return preconditionFailed(requestId);
  if (sentVersion !== undefined && sentVersion !== currentVersion)
    return createErrorResponse(409, 'CONFLICT', 'Conflito de concorrência. O registo foi alterado entretanto. Atualize antes de repetir.', requestId, { currentVersion });
  if (header === null && sentVersion === undefined && process.env.API_REQUIRE_WRITE_PRECONDITION === 'true')
    return createErrorResponse(428, 'PRECONDITION_REQUIRED', 'Indique If-Match ou a versão atual do registo.', requestId);
  return null;
}

export function preconditionFailed(requestId: string) {
  return createErrorResponse(412, 'PRECONDITION_FAILED', 'O registo foi alterado entretanto. Atualize antes de repetir.', requestId);
}

export function warnMissingPrecondition<T extends Response>(req: Request, sentVersion: number | undefined, response: T): T {
  if (sentVersion === undefined && !req.headers.has('if-match'))
    response.headers.set('X-Deprecation-Notice', 'Send If-Match or the current version in the request body.');
  return response;
}
