import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'a-very-secure-fallback-secret-for-erp-portal-2026';

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
  const exp = Math.floor(Date.now() / 1000) + (expiresInHours * 3600);
  const fullPayload: SessionPayload = { ...payload, exp };
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  
  const signatureInput = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(signatureInput)
    .digest('base64url');
    
  return `${signatureInput}.${signature}`;
}

/**
 * Verifies and decodes a signed session token, returning payload or null if invalid/expired
 */
export function verifySession(token: string): SessionPayload | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    const signatureInput = `${header}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
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
