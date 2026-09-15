import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hasPermission, GroupPermissions } from './permissions';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not defined.');
  }
  return secret;
}

export interface SessionPayload {
  id: string;
  email: string;
  name: string;
  roleId: string;
  isAdmin: boolean;
  type?: string;
  exp: number;
}

/**
 * Signs a JSON Web Token payload with HS256 algorithm and returns the token string
 */
export function signSession(payload: Omit<SessionPayload, 'exp'>, expiresInHours: number = 8): string {
  const secret = getJwtSecret();
  const exp = Math.floor(Date.now() / 1000) + (expiresInHours * 3600);
  const fullPayload: SessionPayload = { ...payload, exp };
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  
  const signatureInput = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');
    
  return `${signatureInput}.${signature}`;
}

/**
 * Verifies and decodes a signed session token, returning payload or null if invalid/expired
 */
export function verifySession(tokenOrReq: string | NextRequest | null | undefined): SessionPayload | null {
  if (!tokenOrReq) return null;

  let token: string | null = null;
  if (typeof tokenOrReq === 'string') {
    token = tokenOrReq;
  } else if (tokenOrReq && typeof tokenOrReq === 'object') {
    // 1. Try cookie first
    const cookieToken = tokenOrReq.cookies?.get?.('erp_session')?.value;
    if (cookieToken) {
      token = cookieToken;
    } else {
      // 2. Try Authorization Bearer header
      const authHeader = tokenOrReq.headers?.get?.('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }
  }

  if (!token) return null;

  try {
    const secret = getJwtSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    const signatureInput = `${header}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64url');
      
    if (signature !== expectedSignature) {
      return null;
    }
    
    const payload: SessionPayload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    );
    
    if (Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }
    
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Authorizes an incoming NextRequest for a given permission code
 */
export function authorizeRequest(
  req: NextRequest,
  requiredPermission?: keyof GroupPermissions
): { session: SessionPayload } | { errorResponse: NextResponse } {
  const session = verifySession(req);
  if (!session) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada. Autenticação necessária.' } },
        { status: 401 }
      )
    };
  }

  if (requiredPermission && !hasPermission(session, requiredPermission)) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para realizar esta operação.' } },
        { status: 403 }
      )
    };
  }

  return { session };
}

