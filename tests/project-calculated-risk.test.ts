import { describe, expect, it } from 'bun:test';
import { getProjectCalculatedRisk } from '../lib/utils';
import type { ProjectRiskItem, RiskStatus } from '../lib/types';

const statuses: RiskStatus[] = [1, 2, 3, 4].map(scale => ({ id: `status-${scale}`, name: `Estado ${scale}`, scale }));
const risk = (id: string, statusLevel: number, probability: number, impact: number): ProjectRiskItem => ({
  id, projectId: 'project-1', statusId: `status-${statusLevel}`,
  probability, impact, deleted: false,
} as ProjectRiskItem);

describe('risco geral do projeto', () => {
  it('usa apenas o risco ativo mais grave', () => {
    const risks = [risk('resolved', 3, 5, 5), risk('medium', 2, 2, 4), risk('critical', 1, 4, 4)];
    expect(getProjectCalculatedRisk('project-1', risks, statuses)).toMatchObject({ score: 16, label: 'Crítico' });
    expect(getProjectCalculatedRisk('project-1', risks.slice(0, 2), statuses)).toMatchObject({ score: 8, label: 'Médio' });
  });

  it('fica Baixo quando todos os riscos estão resolvidos ou cancelados', () => {
    const risks = [risk('resolved', 3, 5, 5), risk('cancelled', 4, 5, 5)];
    expect(getProjectCalculatedRisk('project-1', risks, statuses)).toMatchObject({ score: 0, label: 'Baixo' });
    expect(getProjectCalculatedRisk('project-2', risks, statuses)).toMatchObject({ score: 0, label: 'Baixo' });
  });
});
