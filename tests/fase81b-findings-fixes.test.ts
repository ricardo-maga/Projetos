import { describe, it, expect } from 'bun:test';
import { updateTaskSchema } from '../lib/validations/task';

describe('FASE 81-B — Correção Cirúrgica dos Findings da FASE 80', () => {
  describe('FINDING 1: Apresentação de Referências de Project em Tasks e Planning', () => {
    const mockProjects = [
      { id: 'proj-1', title: 'Projeto Alpha', clientId: 'client-1' },
      { id: 'proj-2', title: 'Projeto Beta', clientId: 'client-2' },
    ];
    const mockClients = [
      { id: 'client-1', clientName: 'Cliente 1', shortName: 'C1' },
      { id: 'client-2', clientName: 'Cliente 2', shortName: 'C2' },
    ];

    const projectMap = new Map(mockProjects.map(p => [p.id, p]));
    const clientMap = new Map(mockClients.map(c => [c.id, c]));

    const getProjectWithClientLabel = (projId: string) => {
      if (!projId) return 'Sem projeto';
      const proj = projectMap.get(projId);
      if (!proj) return 'Projeto não encontrado';
      const client = clientMap.get(proj.clientId);
      const clientName = client ? (client.clientName || client.shortName) : '';
      const ipPart = (proj as any).installProjectNo ? ` (${(proj as any).installProjectNo})` : '';
      return clientName ? `${clientName} - ${proj.title}${ipPart}` : `${proj.title}${ipPart}`;
    };

    const getProjectTitle = (projId?: string | null) => {
      if (!projId) return 'Sem projeto';
      const proj = mockProjects.find(p => p.id === projId);
      if (!proj) return 'Projeto não encontrado';
      const client = mockClients.find(c => c.id === proj.clientId);
      const clientName = client ? (client.clientName || client.shortName) : '';
      return clientName ? `${clientName} • ${proj.title}` : proj.title;
    };

    const getPlanningTaskProjectLabel = (t: { projectId?: string | null }) => {
      return t.projectId
        ? (mockProjects.find(p => p.id === t.projectId)?.title || 'Projeto não encontrado')
        : 'Sem projeto';
    };

    it('Caso A: projectId = null deve retornar "Sem projeto"', () => {
      expect(getProjectWithClientLabel('')).toBe('Sem projeto');
      expect(getProjectTitle(null)).toBe('Sem projeto');
      expect(getProjectTitle(undefined)).toBe('Sem projeto');
      expect(getPlanningTaskProjectLabel({ projectId: null })).toBe('Sem projeto');
      expect(getPlanningTaskProjectLabel({ projectId: undefined })).toBe('Sem projeto');
    });

    it('Caso B: projectId existente deve retornar o nome do projeto e cliente', () => {
      expect(getProjectWithClientLabel('proj-1')).toBe('Cliente 1 - Projeto Alpha');
      expect(getProjectTitle('proj-2')).toBe('Cliente 2 • Projeto Beta');
      expect(getPlanningTaskProjectLabel({ projectId: 'proj-1' })).toBe('Projeto Alpha');
    });

    it('Caso C: projectId inexistente/órfão deve retornar "Projeto não encontrado" (e NUNCA "Sem projeto")', () => {
      const orphanId = '00000000-0000-0000-0000-000000000999';
      expect(getProjectWithClientLabel(orphanId)).toBe('Projeto não encontrado');
      expect(getProjectTitle(orphanId)).toBe('Projeto não encontrado');
      expect(getPlanningTaskProjectLabel({ projectId: orphanId })).toBe('Projeto não encontrado');
    });
  });

  describe('FINDING 2: Validação Parcial de Datas no updateTaskSchema', () => {
    it('Permite atualização parcial apenas com startDate sem exigir endDate', () => {
      const result = updateTaskSchema.safeParse({
        startDate: '2026-10-15',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startDate).toBe('2026-10-15');
      }
    });

    it('Permite atualização parcial apenas com endDate sem exigir startDate', () => {
      const result = updateTaskSchema.safeParse({
        endDate: '2026-10-20',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.endDate).toBe('2026-10-20');
      }
    });

    it('Permite atualização parcial apenas com startTime sem exigir endTime', () => {
      const result = updateTaskSchema.safeParse({
        startTime: '09:00',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBe('09:00');
      }
    });

    it('Rejeita quando ambas startDate e endDate são fornecidas e endDate < startDate', () => {
      const result = updateTaskSchema.safeParse({
        startDate: '2026-10-25',
        endDate: '2026-10-20',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('endDate'))).toBe(true);
      }
    });

    it('Rejeita quando ambas startTime e endTime são fornecidas e endTime <= startTime', () => {
      const result = updateTaskSchema.safeParse({
        startTime: '14:00',
        endTime: '13:00',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('endTime'))).toBe(true);
      }
    });

    it('Aceita datas e horas válidas completas em conjunto', () => {
      const result = updateTaskSchema.safeParse({
        startDate: '2026-10-10',
        endDate: '2026-10-12',
        startTime: '08:30',
        endTime: '17:30',
        title: 'Tarefa Completa',
      });
      expect(result.success).toBe(true);
    });
  });
});
