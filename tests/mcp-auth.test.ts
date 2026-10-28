import { afterEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/mcp/route';
import { mcpConfig, verifyMcpBearer } from '../lib/integrations/mcpAuth';

const names = ['M365_MCP_TENANT_ID', 'M365_MCP_AUDIENCE', 'M365_MCP_INTEGRATION_KEY', 'M365_MCP_ALLOWED_USER_IDS', 'M365_MCP_PUBLIC_URL'] as const;
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
afterEach(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

function configured() {
  process.env.M365_MCP_TENANT_ID = '11111111-1111-1111-1111-111111111111';
  process.env.M365_MCP_AUDIENCE = 'api://projetos-mcp';
  process.env.M365_MCP_INTEGRATION_KEY = 'erp_int_' + 'a'.repeat(32);
  process.env.M365_MCP_ALLOWED_USER_IDS = '22222222-2222-2222-2222-222222222222';
  process.env.M365_MCP_PUBLIC_URL = 'https://example.com/api/mcp';
}

describe('MCP remote authentication boundary', () => {
  it('stays unavailable without complete configuration', async () => {
    for (const name of names) delete process.env[name];
    expect(mcpConfig()).toBeNull();
    const response = await POST(new NextRequest('https://example.com/api/mcp', { method: 'POST' }));
    expect(response.status).toBe(503);
  });

  it('rejects invalid public URL and credentials', () => {
    configured();
    process.env.M365_MCP_PUBLIC_URL = 'http://example.com/api/mcp';
    expect(mcpConfig()).toBeNull();
    process.env.M365_MCP_PUBLIC_URL = 'https://example.com/api/mcp';
    process.env.M365_MCP_INTEGRATION_KEY = 'invalid';
    expect(mcpConfig()).toBeNull();
  });

  it('rejects an unexpected host, browser origin and missing bearer before MCP processing', async () => {
    configured();
    const wrongHost = await POST(new NextRequest('https://other.example/api/mcp', { method: 'POST' }));
    expect(wrongHost.status).toBe(403);
    const wrongOrigin = await POST(new NextRequest('https://example.com/api/mcp', { method: 'POST', headers: { origin: 'https://attacker.example' } }));
    expect(wrongOrigin.status).toBe(403);
    const noBearer = await POST(new NextRequest('https://example.com/api/mcp', { method: 'POST' }));
    expect(noBearer.status).toBe(401);
    expect(noBearer.headers.get('www-authenticate')).toContain('Bearer');
    expect(await verifyMcpBearer('Bearer invalid', mcpConfig()!)).toBeNull();
  });
});
