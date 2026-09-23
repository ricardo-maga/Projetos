import { describe, it, expect } from 'bun:test';
import { GET, POST } from '../app/api/supabase/sync/route';
import { NextRequest } from 'next/server';

describe('FASE 25-A — Correção do acesso ao endpoint de Sync (/api/supabase/sync)', () => {
  describe('Teste A: GET sem autenticação', () => {
    it('deve devolver HTTP 401 e não devolver quaisquer dados internos da aplicação', async () => {
      const req = new NextRequest('http://localhost:3000/api/supabase/sync', {
        method: 'GET',
      });

      const res = await GET(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toBeDefined();

      // Confirm internal data is NOT returned
      expect(json.data).toBeUndefined();
      expect(json.users).toBeUndefined();
      expect(json.userGroups).toBeUndefined();
      expect(json.appConfig).toBeUndefined();
      expect(json.projects).toBeUndefined();
      expect(json.tasks).toBeUndefined();
      expect(json.clients).toBeUndefined();
      expect(json.debug).toBeUndefined();
    });
  });

  describe('Teste C: GET com token/sessão inválida', () => {
    it('deve rejeitar com HTTP 401 para Bearer token inválido sem expor dados internos', async () => {
      const req = new NextRequest('http://localhost:3000/api/supabase/sync', {
        method: 'GET',
        headers: {
          authorization: 'Bearer invalid-token-12345',
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.data).toBeUndefined();
      expect(json.users).toBeUndefined();
      expect(json.projects).toBeUndefined();
      expect(json.tasks).toBeUndefined();
      expect(json.clients).toBeUndefined();
      expect(json.debug).toBeUndefined();
    });
  });

  describe('Teste D & E: POST proteções não-admin vs admin', () => {
    it('bloqueia utilizador não autenticado no POST /api/supabase/sync com HTTP 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/supabase/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userGroups: [{ id: 'ug-1', name: 'Hacked Admins' }],
          users: [{ id: 'u-1', role_id: 'ug-1' }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.data).toBeUndefined();
    });
  });

  describe('Teste F: Ausência de informação sensível em respostas de erro', () => {
    it('não expõe chaves, segredos de serviço ou tokens em respostas de erro', async () => {
      const req = new NextRequest('http://localhost:3000/api/supabase/sync', {
        method: 'GET',
        headers: {
          authorization: 'Bearer token-errado-xyz',
        },
      });

      const res = await GET(req);
      const rawText = await res.text();

      expect(rawText).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(rawText).not.toContain('service_role');
      expect(rawText).not.toContain('refresh_token');
      expect(rawText).not.toContain('token-errado-xyz');
      expect(rawText).not.toContain('password');
    });
  });
});
