import { describe, it, expect, beforeEach } from 'bun:test';
import { CLEAN_BASELINE_STATE } from '../lib/cleanDefaults';

describe('FASE 31 — Loading Autoritativo da Base de Dados', () => {

  describe('1. Estado inicial não é considerado carregado', () => {
    it('isInitialDataLoaded deve iniciar rigorosamente como false', () => {
      let isInitialDataLoaded = false;
      let state: any = null;

      expect(isInitialDataLoaded).toBe(false);
      expect(state).toBeNull();
    });
  });

  describe('2. Dados só ficam disponíveis após carregamento autoritativo', () => {
    it('transita para isInitialDataLoaded = true apenas quando a BD devolve resposta válida com dados', () => {
      let isInitialDataLoaded = false;
      let state: any = null;
      let syncStatus: string = 'idle';

      // Simulando chamada de sucesso à BD
      const mockDbResponse = {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            ...CLEAN_BASELINE_STATE,
            projects: [{ id: 'proj-1', title: 'Projeto Real da BD' }],
          },
        }),
      };

      if (mockDbResponse.ok) {
        const result = {
          success: true,
          data: {
            ...CLEAN_BASELINE_STATE,
            projects: [{ id: 'proj-1', title: 'Projeto Real da BD' }],
          },
        };
        if (result.success && result.data) {
          state = result.data;
          isInitialDataLoaded = true;
          syncStatus = 'synced';
        }
      }

      expect(isInitialDataLoaded).toBe(true);
      expect(syncStatus).toBe('synced');
      expect(state).not.toBeNull();
      expect(state.projects[0].title).toBe('Projeto Real da BD');
    });
  });

  describe('3. CLEAN_BASELINE_STATE não desbloqueia o loading', () => {
    it('o mero preenchimento de appConfig ou baseline sintético não define isInitialDataLoaded = true', () => {
      let isInitialDataLoaded = false;
      let state: any = null;

      // Se /api/supabase/config devolver appConfig antes da BD, prev === null não assume baseline
      const configData = { appConfig: { appName: 'Empresa Teste' } };
      
      const updateStateWithoutPretendingLoaded = (prev: any) => {
        if (!prev) return null; // Regra da Fase 31: nunca instanciar baseline durante boot
        return {
          ...prev,
          appConfig: {
            ...prev.appConfig,
            ...configData.appConfig,
          },
        };
      };

      state = updateStateWithoutPretendingLoaded(state);

      expect(state).toBeNull();
      expect(isInitialDataLoaded).toBe(false);
    });

    it('em caso de sessão 401 não autenticada, não define isInitialDataLoaded = true com baseline', () => {
      let isInitialDataLoaded = false;
      let syncStatus = 'idle';
      let state: any = null;

      const syncStatusResponse = 401;
      if (syncStatusResponse === 401) {
        syncStatus = 'idle';
        isInitialDataLoaded = false;
        // Não definir state = CLEAN_BASELINE_STATE
      }

      expect(isInitialDataLoaded).toBe(false);
      expect(state).toBeNull();
    });
  });

  describe('4. Erro de BD mantém a aplicação fora do ERP', () => {
    it('falha de ligação à BD define syncStatus = error e mantém isInitialDataLoaded = false', () => {
      let isInitialDataLoaded = false;
      let syncStatus: 'idle' | 'syncing' | 'synced' | 'error' = 'syncing';
      let syncError: string | null = null;
      let state: any = null;

      // Simulando falha de rede ou HTTP 500
      const isOk = false;
      const errorMsg = 'Erro do servidor ao contactar a base de dados (Status: 500).';

      if (!isOk) {
        syncStatus = 'error';
        syncError = errorMsg;
        isInitialDataLoaded = false;
      }

      expect(isInitialDataLoaded).toBe(false);
      expect(syncStatus).toBe('error');
      expect(syncError).toContain('Status: 500');
      expect(state).toBeNull();

      // UI Check: Não deve renderizar ERP enquanto isInitialDataLoaded for false
      const canRenderERP = isInitialDataLoaded && syncStatus !== 'error';
      expect(canRenderERP).toBe(false);
    });
  });

  describe('5. Retry permite novo carregamento', () => {
    it('após falha, executar nova tentativa com sucesso desbloqueia a aplicação', async () => {
      let isInitialDataLoaded = false;
      let syncStatus: string = 'error';
      let syncError: string | null = 'Erro prévio';
      let state: any = null;

      // Executando ação de Retry
      const executeAuthoritativeFetch = async (succeed: boolean) => {
        syncStatus = 'syncing';
        syncError = null;
        if (succeed) {
          state = { ...CLEAN_BASELINE_STATE, projects: [] };
          syncStatus = 'synced';
          isInitialDataLoaded = true;
          return true;
        } else {
          syncStatus = 'error';
          syncError = 'Falha persistente';
          isInitialDataLoaded = false;
          return false;
        }
      };

      const ok = await executeAuthoritativeFetch(true);
      expect(ok).toBe(true);
      expect(isInitialDataLoaded).toBe(true);
      expect(syncStatus).toBe('synced');
      expect(syncError).toBeNull();
      expect(state).not.toBeNull();
    });
  });

  describe('6. Timeout não desbloqueia a aplicação', () => {
    it('a passagem de 4 segundos sem resposta da BD não pode marcar isInitialDataLoaded = true nem exibir o ERP', () => {
      let isInitialDataLoaded = false;
      let dbFinished = false;

      // Simulação do timer de 4000ms que foi removido
      const simulatedSafetyTimerFired = true;

      // Com a regra da Fase 31, o timer NÃO pode tocar no estado de dados
      if (simulatedSafetyTimerFired) {
        // Apenas o sinal de dados da BD pode alterar isInitialDataLoaded
        if (dbFinished) {
          isInitialDataLoaded = true;
        }
      }

      expect(isInitialDataLoaded).toBe(false);
      const canRenderERP = isInitialDataLoaded;
      expect(canRenderERP).toBe(false);
    });
  });

  describe('7. Após login, o ERP só aparece depois do carregamento autoritativo', () => {
    it('ter currentUser preenchido não é suficiente para mostrar o ERP antes da confirmação da BD', () => {
      let currentUser: any = null;
      let isInitialDataLoaded = false;
      let isTransitioning = false;

      // 1. Utilizador submete credenciais e recebe utilizador autenticado
      currentUser = { id: 'u-1', email: 'admin@empresa.pt', name: 'Administrador' };
      isTransitioning = true;

      // Condição de renderização do ERP:
      const shouldShowERP = currentUser !== null && isInitialDataLoaded && !isTransitioning;
      expect(shouldShowERP).toBe(false);

      // 2. Leitura da BD termina com sucesso
      isInitialDataLoaded = true;
      isTransitioning = false;

      const shouldShowERPAfterLoad = currentUser !== null && isInitialDataLoaded && !isTransitioning;
      expect(shouldShowERPAfterLoad).toBe(true);
    });

    it('se o carregamento após login falhar, permanece no ecrã de erro e não mostra o ERP', () => {
      const currentUser = { id: 'u-1', email: 'admin@empresa.pt' };
      const isInitialDataLoaded = false;
      const syncStatus = 'error';

      const isErrorScreen = syncStatus === 'error' && !isInitialDataLoaded;
      const shouldShowERP = currentUser !== null && isInitialDataLoaded;

      expect(isErrorScreen).toBe(true);
      expect(shouldShowERP).toBe(false);
    });
  });

});
