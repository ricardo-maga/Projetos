import { describe, it, expect } from 'bun:test';

describe('FASE 87-B — Alinhamento Canónico do PATCH Temporal de Tasks', () => {

  describe('1. Fusão e Cálculo do Estado Final de Datas na Camada API', () => {
    const cleanDateVal = (val?: string | null) => (val && typeof val === 'string' && val.trim() ? val.trim() : null);

    const currentTask = {
      id: 'task-123',
      start_date: '2026-10-01',
      end_date: '2026-10-05',
    };

    it('1. PATCH com apenas startDate preserva end_date existente e envia par completo', () => {
      const updates = { startDate: '2026-10-02' };

      const mergedStartDate = updates.startDate !== undefined ? cleanDateVal(updates.startDate) : currentTask.start_date;
      const mergedEndDate = (updates as any).endDate !== undefined ? cleanDateVal((updates as any).endDate) : currentTask.end_date;

      expect(mergedStartDate).toBe('2026-10-02');
      expect(mergedEndDate).toBe('2026-10-05');

      const dateParams = (updates.startDate !== undefined || (updates as any).endDate !== undefined) ? {
        startDate: mergedStartDate,
        endDate: mergedEndDate,
      } : {};

      expect(dateParams).toEqual({
        startDate: '2026-10-02',
        endDate: '2026-10-05',
      });
    });

    it('2. PATCH com apenas endDate preserva start_date existente e envia par completo', () => {
      const updates = { endDate: '2026-10-08' };

      const mergedStartDate = (updates as any).startDate !== undefined ? cleanDateVal((updates as any).startDate) : currentTask.start_date;
      const mergedEndDate = updates.endDate !== undefined ? cleanDateVal(updates.endDate) : currentTask.end_date;

      expect(mergedStartDate).toBe('2026-10-01');
      expect(mergedEndDate).toBe('2026-10-08');

      const dateParams = ((updates as any).startDate !== undefined || updates.endDate !== undefined) ? {
        startDate: mergedStartDate,
        endDate: mergedEndDate,
      } : {};

      expect(dateParams).toEqual({
        startDate: '2026-10-01',
        endDate: '2026-10-08',
      });
    });

    it('3. PATCH com ambas as datas atualiza todo o par temporal', () => {
      const updates = { startDate: '2026-10-10', endDate: '2026-10-15' };

      const mergedStartDate = updates.startDate !== undefined ? cleanDateVal(updates.startDate) : currentTask.start_date;
      const mergedEndDate = updates.endDate !== undefined ? cleanDateVal(updates.endDate) : currentTask.end_date;

      expect(mergedStartDate).toBe('2026-10-10');
      expect(mergedEndDate).toBe('2026-10-15');
    });

    it('4. PATCH com datas nulas limpa o par temporal', () => {
      const updates = { startDate: null, endDate: null };

      const mergedStartDate = updates.startDate !== undefined ? cleanDateVal(updates.startDate) : currentTask.start_date;
      const mergedEndDate = updates.endDate !== undefined ? cleanDateVal(updates.endDate) : currentTask.end_date;

      expect(mergedStartDate).toBeNull();
      expect(mergedEndDate).toBeNull();
    });
  });

  describe('2. Validação Antecipada de Erros de Integridade Temporal na API', () => {
    const cleanDateVal = (val?: string | null) => (val && typeof val === 'string' && val.trim() ? val.trim() : null);

    const validateDates = (current: { start_date: string | null; end_date: string | null }, updates: { startDate?: string | null; endDate?: string | null }) => {
      const mergedStartDate = updates.startDate !== undefined ? cleanDateVal(updates.startDate) : current.start_date;
      const mergedEndDate = updates.endDate !== undefined ? cleanDateVal(updates.endDate) : current.end_date;

      if (mergedStartDate && !mergedEndDate) {
        return { valid: false, error: 'A data de fim é obrigatória se a data de início estiver preenchida.' };
      }
      if (!mergedStartDate && mergedEndDate) {
        return { valid: false, error: 'A data de início é obrigatória se a data de fim estiver preenchida.' };
      }
      if (mergedStartDate && mergedEndDate && mergedEndDate < mergedStartDate) {
        return { valid: false, error: 'A data de fim não pode ser anterior à data de início.' };
      }

      return { valid: true, mergedStartDate, mergedEndDate };
    };

    it('1. Rejeita se o par final tiver apenas startDate e nenhum endDate', () => {
      const current = { start_date: null, end_date: null };
      const res = validateDates(current, { startDate: '2026-10-10' });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('data de fim é obrigatória');
    });

    it('2. Rejeita se o par final tiver apenas endDate e nenhum startDate', () => {
      const current = { start_date: null, end_date: null };
      const res = validateDates(current, { endDate: '2026-10-10' });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('data de início é obrigatória');
    });

    it('3. Rejeita se endDate < startDate no estado final fundido', () => {
      const current = { start_date: '2026-10-10', end_date: '2026-10-15' };
      const res = validateDates(current, { endDate: '2026-10-05' });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('não pode ser anterior à data de início');
    });

    it('4. Aprova e funde corretamente quando o par final é válido', () => {
      const current = { start_date: '2026-10-10', end_date: '2026-10-15' };
      const res = validateDates(current, { startDate: '2026-10-12' });
      expect(res.valid).toBe(true);
      expect(res.mergedStartDate).toBe('2026-10-12');
      expect(res.mergedEndDate).toBe('2026-10-15');
    });
  });
});
