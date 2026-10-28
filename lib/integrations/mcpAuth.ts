import { createRemoteJWKSet, jwtVerify } from 'jose';

type McpIdentity = { tenantId: string; userId: string };

const jwksByTenant = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function mcpConfig() {
  const tenantId = process.env.M365_MCP_TENANT_ID?.trim();
  const audience = process.env.M365_MCP_AUDIENCE?.trim();
  const integrationKey = process.env.M365_MCP_INTEGRATION_KEY?.trim();
  const allowedUsers = process.env.M365_MCP_ALLOWED_USER_IDS?.split(',').map(id => id.trim().toLowerCase()).filter(Boolean) || [];
  const publicUrl = process.env.M365_MCP_PUBLIC_URL?.trim();
  if (!tenantId || !audience || !integrationKey || !publicUrl || !allowedUsers.length) return null;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^erp_int_[A-Za-z0-9_-]{32,}$/.test(integrationKey)) return null;
  try {
    const url = new URL(publicUrl);
    if (url.protocol !== 'https:' || url.pathname !== '/api/mcp' || url.search || url.hash) return null;
  } catch { return null; }
  return { tenantId, audience, integrationKey, allowedUsers, publicUrl };
}

export async function verifyMcpBearer(header: string | null, config: NonNullable<ReturnType<typeof mcpConfig>>): Promise<McpIdentity | null> {
  const token = header?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) return null;
  try {
    let jwks = jwksByTenant.get(config.tenantId);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`));
      jwksByTenant.set(config.tenantId, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
      audience: config.audience,
      algorithms: ['RS256'],
      requiredClaims: ['tid', 'oid', 'scp'],
    });
    if (payload.tid !== config.tenantId || typeof payload.oid !== 'string' ||
      !config.allowedUsers.includes(payload.oid.toLowerCase()) ||
      typeof payload.scp !== 'string' || !payload.scp.split(' ').includes('access_as_user')) return null;
    return { tenantId: config.tenantId, userId: payload.oid };
  } catch { return null; }
}
