'use client';

const TOKEN_KEY = 'erp_session_token';
const USER_KEY = 'erp_session_user';
let currentUser: any | null = null;

export function setClientUser(user: any | null) {
  currentUser = user;
}

export function getClientUser(): any | null {
  return currentUser;
}

export function clearClientSession() {
  currentUser = null;
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
