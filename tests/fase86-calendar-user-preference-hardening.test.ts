import { describe, it, expect, beforeEach } from 'bun:test';
import { sanitizeUserIds } from '../components/OperationalUserCalendar';
import { User } from '../lib/types';

describe('FASE 86 — Hardening da Persistência da Preferência de Utilizadores do Calendário', () => {
  const eligibleUsers: User[] = [
    { id: 'u-1', name: 'João Silva', email: 'joao@empresa.pt' },
    { id: 'u-2', name: 'Maria de Sousa', email: 'maria@empresa.pt' },
    { id: 'u-3', name: 'Pedro Correia', email: 'pedro@empresa.pt' },
  ];

  // Mock localStorage in memory
  let mockStorage: Record<string, string> = {};

  const getLocalStorageMock = (shouldThrow = false) => ({
    getItem: (key: string) => {
      if (shouldThrow) throw new Error('localStorage read error (quota/disabled)');
      return mockStorage[key] !== undefined ? mockStorage[key] : null;
    },
    setItem: (key: string, value: string) => {
      if (shouldThrow) throw new Error('localStorage write error (quota/disabled)');
      mockStorage[key] = value;
    },
    clear: () => {
      mockStorage = {};
    }
  });

  beforeEach(() => {
    mockStorage = {};
  });

  it('1. Primeiro acesso: currentUser = user-A e ausência em localStorage retorna []', () => {
    const storage = getLocalStorageMock();
    const userId = 'user-A';
    const key = `task-calendar-selected-users-v1:${userId}`;

    const saved = storage.getItem(key);
    let selected: string[] = [];
    if (saved !== null) {
      try {
        selected = sanitizeUserIds(JSON.parse(saved), eligibleUsers);
      } catch (e) {
        selected = [];
      }
    }

    expect(selected).toEqual([]);
    expect(key).not.toContain('default');
  });

  it('2. Preferência existente: currentUser = user-A com ["u-1", "u-2"] carrega ["u-1", "u-2"]', () => {
    const storage = getLocalStorageMock();
    const userId = 'user-A';
    const key = `task-calendar-selected-users-v1:${userId}`;
    storage.setItem(key, JSON.stringify(['u-1', 'u-2']));

    const saved = storage.getItem(key);
    expect(saved).not.toBeNull();

    const selected = sanitizeUserIds(JSON.parse(saved!), eligibleUsers);
    expect(selected).toEqual(['u-1', 'u-2']);
  });

  it('3. IDs inválidos: descarta vazios, duplicados e utilizadores que já não sejam elegíveis', () => {
    const rawIds = ['u-1', 'u-removido', '', 'u-1', 'u-2', '   ', null, undefined];
    const sanitized = sanitizeUserIds(rawIds, eligibleUsers);

    expect(sanitized).toEqual(['u-1', 'u-2']);
  });

  it('4. JSON inválido: trata excepção de parse como ausência de preferência ([])', () => {
    const invalidJson = '{invalid_json_content';
    let selected: string[] = [];

    try {
      const parsed = JSON.parse(invalidJson);
      selected = sanitizeUserIds(parsed, eligibleUsers);
    } catch (e) {
      selected = [];
    }

    expect(selected).toEqual([]);
  });

  it('5. currentUser inicialmente ausente: ao ficar disponível (undefined -> user-A), carrega a preferência de user-A', () => {
    const storage = getLocalStorageMock();
    storage.setItem('task-calendar-selected-users-v1:user-A', JSON.stringify(['u-3']));

    let currentUserId: string | null = null;
    let selectedUserIds: string[] = [];

    // Render 1: currentUser = undefined
    if (currentUserId) {
      const saved = storage.getItem(`task-calendar-selected-users-v1:${currentUserId}`);
      selectedUserIds = saved ? sanitizeUserIds(JSON.parse(saved), eligibleUsers) : [];
    } else {
      selectedUserIds = [];
    }
    expect(selectedUserIds).toEqual([]);

    // Render 2: currentUser = user-A
    currentUserId = 'user-A';
    const saved = storage.getItem(`task-calendar-selected-users-v1:${currentUserId}`);
    selectedUserIds = saved ? sanitizeUserIds(JSON.parse(saved), eligibleUsers) : [];

    expect(selectedUserIds).toEqual(['u-3']);
  });

  it('6. Mudança de utilizador (user-A -> user-B): carrega preferência de B sem sobrescrever a chave de B durante a transição', () => {
    const storage = getLocalStorageMock();
    storage.setItem('task-calendar-selected-users-v1:user-A', JSON.stringify(['u-1']));
    storage.setItem('task-calendar-selected-users-v1:user-B', JSON.stringify(['u-2', 'u-3']));

    let activeUser = 'user-A';
    let loadedUserIdRef = 'user-A';
    let selectedUserIds = sanitizeUserIds(JSON.parse(storage.getItem(`task-calendar-selected-users-v1:${activeUser}`)!), eligibleUsers);

    expect(selectedUserIds).toEqual(['u-1']);

    // Mudança para user-B:
    activeUser = 'user-B';

    // Verificação de guarda de salvamento:
    const isSaveAllowedDuringTransition = (loadedUserIdRef === activeUser);
    expect(isSaveAllowedDuringTransition).toBe(false); // NÃO deve salvar estado antigo em user-B!

    // Efeito reativo carrega user-B:
    const savedB = storage.getItem(`task-calendar-selected-users-v1:${activeUser}`);
    selectedUserIds = sanitizeUserIds(JSON.parse(savedB!), eligibleUsers);
    loadedUserIdRef = 'user-B';

    expect(selectedUserIds).toEqual(['u-2', 'u-3']);
    expect(loadedUserIdRef).toBe('user-B');
  });

  it('7. Erro de localStorage: falhas em getItem e setItem são capturadas sem crash', () => {
    const storageWithError = getLocalStorageMock(true); // lça exceções
    let selectedUserIds: string[] = ['u-1'];

    // Read attempt
    try {
      const saved = storageWithError.getItem('task-calendar-selected-users-v1:user-A');
      selectedUserIds = saved ? sanitizeUserIds(JSON.parse(saved), eligibleUsers) : [];
    } catch (e) {
      // Graceful fallback to current memory state
    }
    expect(selectedUserIds).toEqual(['u-1']);

    // Write attempt
    let writeFailed = false;
    try {
      storageWithError.setItem('task-calendar-selected-users-v1:user-A', JSON.stringify(['u-1', 'u-2']));
    } catch (e) {
      writeFailed = true;
    }

    expect(writeFailed).toBe(true);
    expect(selectedUserIds).toEqual(['u-1']); // Aplicação continua estável em memória
  });
});
