'use client';

const TOKEN_KEY = 'erp_session_token';
const USER_KEY = 'erp_session_user';
let currentUser: any | null = null;
let sessionGeneration = 0;
let sessionRequests: AbortController | null = null;
let checkingConnection = false;

export const SESSION_EXPIRED_EVENT = 'erp_auth_session_expired';
export const CONNECTION_INTERRUPTED_EVENT = 'erp_connection_interrupted';
export const SLOW_READ_MS = 3000;
const READ_TIMEOUT_MS = 20000;

export function setCheckingConnection(checking: boolean) {
  checkingConnection = checking;
}

export class ClientRequestError extends Error {
  constructor(message: string, public readonly fieldErrors: Record<string, string[]> = {}) {
    super(message);
  }
}

export function apiRequestError(response: Response, body: any, fallback: string) {
  const requestId = body?.error?.requestId || response.headers?.get('x-request-id');
  if (requestId || response.status >= 500) {
    console.warn('[API]', { status: response.status, requestId, code: body?.error?.code });
  }
  const message = response.ok ? 'Não foi possível confirmar o resultado da operação. Verifique o registo antes de repetir.'
    : response.status === 401 ? 'A sua sessão expirou. Inicie sessão novamente.'
    : response.status === 403 ? 'Não tem permissão para esta operação. Contacte um administrador.'
    : response.status >= 500 ? fallback : getApiErrorMessage(body, fallback);
  const fields = body?.error?.details?.fieldErrors;
  return new ClientRequestError(message, fields && typeof fields === 'object' ? fields : undefined);
}

export function readRequest(input: string, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export async function authenticatedRequest(input: string, init: RequestInit = {}) {
  const generation = sessionGeneration;
  const read = !init.method || ['GET', 'HEAD'].includes(init.method.toUpperCase());
  const browser = typeof window !== 'undefined';
  if (browser && (navigator.onLine === false || (!read && checkingConnection))) {
    throw new ClientRequestError('A ligação está indisponível. Aguarde pela confirmação da ligação para guardar.');
  }

  const sessionSignal = browser && currentUser ? (sessionRequests ??= new AbortController()).signal : undefined;
  const signal = sessionSignal && init.signal ? AbortSignal.any([sessionSignal, init.signal]) : sessionSignal || init.signal;
  const options = signal ? { ...init, signal } : init;
  let response: Response;
  try {
    response = await (read ? readRequest(input, options) : fetch(input, options));
  } catch (error) {
    if (signal?.aborted) throw error;
    if (browser && !read && generation === sessionGeneration) {
      window.dispatchEvent(new Event(CONNECTION_INTERRUPTED_EVENT));
    }
    throw new ClientRequestError(read
      ? 'Não foi possível obter os dados. Tente novamente.'
      : 'Não foi possível confirmar a gravação. Verifique o registo antes de voltar a tentar.');
  }

  if (generation !== sessionGeneration) {
    throw new DOMException('A sessão mudou durante o pedido.', 'AbortError');
  }
  if (response.status === 401 && browser && currentUser) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return response;
}

export function setClientUser(user: any | null) {
  if (currentUser?.id !== user?.id) {
    sessionGeneration += 1;
    sessionRequests?.abort();
    sessionRequests = null;
  }
  currentUser = user;
}

export function getClientUser(): any | null {
  return currentUser;
}

export function clearClientSession() {
  setClientUser(null);
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch (e) {
    console.warn('Could not clear client session token:', e);
  }
}

export function getAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders || {}),
  };
  return headers;
}

export function getApiErrorMessage(result: any, fallback: string = 'Ocorreu um erro na operação.'): string {
  if (!result) return fallback;
  if (typeof result === 'string') return result;
  if (result.message && typeof result.message === 'string') return result.message;
  if (result.error && typeof result.error === 'string') return result.error;
  if (result.error && typeof result.error === 'object' && typeof result.error.message === 'string') return result.error.message;
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return result.errors.map((e: any) => e.message || e).join('; ');
  }
  return fallback;
}
