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

  describe('FASE 26 — Redução e Isolamento do Global Sync', () => {
    it('bloqueia utilizador não-admin que tenta alterar exclusivamente dados administrativos com HTTP 403', async () => {
      const authModule = await import('../lib/auth/requireAuth');
      const { spyOn } = await import('bun:test');

      const nonAdminUser: authModule.AuthenticatedUser = {
        id: 'u-normal-1',
        auth_user_id: 'auth-normal-1',
        name: 'Utilizador Técnico',
        email: 'tecnico@empresa.pt',
        role_id: 'ug-3',
        is_admin: false,
        type: 'Team',
      };

      const authSpy = spyOn(authModule, 'requireAuth').mockImplementation(async () => nonAdminUser);

      try {
        const req = new NextRequest('http://localhost:3000/api/supabase/sync', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer valid-user-token',
          },
          body: JSON.stringify({
            userGroups: [{ id: 'ug-1', name: 'Escalated Group' }],
            appConfig: { appName: 'Hacked ERP' },
          }),
        });

        const res = await POST(req);
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.message).toContain('Sem permissão');
      } finally {
        authSpy.mockRestore();
      }
    });

    it('isola entidades com APIs próprias (projects, tasks, clients) impedindo a sua escrita pelo Global Sync', async () => {
      const authModule = await import('../lib/auth/requireAuth');
      const syncModule = await import('../lib/supabaseSync');
      const { spyOn } = await import('bun:test');

      const adminUser: authModule.AuthenticatedUser = {
        id: 'u-admin-1',
        auth_user_id: 'auth-admin-1',
        name: 'Administrador',
        email: 'admin@empresa.pt',
        role_id: 'ug-1',
        is_admin: true,
        type: 'Team',
      };

      const authSpy = spyOn(authModule, 'requireAuth').mockImplementation(async () => adminUser);

      let savedPayload: any = null;
      const saveSpy = spyOn(syncModule, 'saveActiveStateToSupabase').mockImplementation(async (state: any) => {
        savedPayload = state;
        return { success: true };
      });

      try {
        const req = new NextRequest('http://localhost:3000/api/supabase/sync', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer valid-admin-token',
          },
          body: JSON.stringify({
            projects: [{ id: 'p-1', title: 'Tentativa de Escrita Global Projeto' }],
            tasks: [{ id: 't-1', title: 'Tentativa de Escrita Global Tarefa' }],
            clients: [{ id: 'c-1', clientName: 'Tentativa de Escrita Global Cliente' }],
            planningAllocations: [{ id: 'pa-1' }],
            comments: [{ id: 'com-1', text: 'Comentário legítimo' }],
          }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(savedPayload).not.toBeNull();

        // Assegurar que projects, tasks, clients e planningAllocations foram removidos do payload de gravação
        expect(savedPayload.projects).toBeUndefined();
        expect(savedPayload.tasks).toBeUndefined();
        expect(savedPayload.clients).toBeUndefined();
        expect(savedPayload.planningAllocations).toBeUndefined();
        // Dados legítimos do Global Sync devem ser preservados
        expect(savedPayload.comments).toBeDefined();
        expect(savedPayload.comments.length).toBe(1);
      } finally {
        authSpy.mockRestore();
        saveSpy.mockRestore();
      }
    });
  });
});
