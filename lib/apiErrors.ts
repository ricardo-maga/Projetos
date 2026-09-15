import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_SERVER_ERROR'
  | 'DATABASE_ERROR'
  | 'BOOTSTRAP_DISABLED'
  | 'RATE_LIMIT_EXCEEDED';

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode | string;
    message: string;
    requestId: string;
    details?: any;
  };
}

export function createErrorResponse(
  status: number,
  code: ApiErrorCode | string,
  message: string,
  requestId: string,
  details?: any
): NextResponse<ApiErrorPayload> {
  const payload: ApiErrorPayload = {
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  };

  const headers: Record<string, string> = {
    'x-request-id': requestId,
    'Content-Type': 'application/json',
  };

  return NextResponse.json(payload, { status, headers });
}

export function badRequest(message: string, requestId: string, details?: any) {
  return createErrorResponse(400, 'BAD_REQUEST', message, requestId, details);
}

export function validationError(message: string, requestId: string, details?: any) {
  return createErrorResponse(422, 'VALIDATION_ERROR', message, requestId, details);
}

export function unauthorized(message: string = 'Autenticação necessária.', requestId: string) {
  return createErrorResponse(401, 'UNAUTHORIZED', message, requestId);
}

export function forbidden(message: string = 'Sem permissão para realizar esta operação.', requestId: string) {
  return createErrorResponse(403, 'FORBIDDEN', message, requestId);
}

export function notFound(message: string = 'Recurso não encontrado.', requestId: string) {
  return createErrorResponse(404, 'NOT_FOUND', message, requestId);
}

export function conflict(message: string = 'Conflito de concorrência. O registo foi alterado por outro utilizador.', requestId: string, details?: any) {
  return createErrorResponse(409, 'CONFLICT', message, requestId, details);
}

export function tooManyRequests(arg1: string, arg2?: string) {
  // Can be called as tooManyRequests(requestId) or tooManyRequests(message, requestId)
  const requestId = arg2 || arg1;
  const message = arg2 ? arg1 : 'Demasiados pedidos. Por favor, tente novamente mais tarde.';
  return createErrorResponse(429, 'TOO_MANY_REQUESTS', message, requestId);
}

export const rateLimitExceeded = tooManyRequests;

export function internalServerError(message: string = 'Ocorreu um erro interno no servidor.', requestId: string) {
  return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', message, requestId);
}
