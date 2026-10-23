import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectActivityTable from '../components/ProjectActivityTable';
import { Project, Task, Comment, ProjectRiskItem, ProjectMaterial } from '../lib/types';

describe('atividade do projeto', () => {
  test('mostra todos os tipos, os estados e ordena por data sem esconder registos sem data', () => {
    const html = renderToStaticMarkup(<ProjectActivityTable
      project={{ title: 'Projeto Exemplo', createdDate: '2026-10-01', startDate: '2026-10-04', deliveryDate: '', estimatedDate: '', scheduledDate: '', forecastDate: '' } as Project}
      tasks={[{ id: 't1', title: 'Preparação', estimatedDate: '2026-10-05', statusId: 'ts1', startDate: '', endDate: '', deleted: false } as Task]}
      comments={[{ id: 'c1', comment: 'Material confirmado', authorId: 'u1', createdDate: '2026-10-06T10:30:00Z' } as Comment]}
      risks={[{ id: 'r1', title: 'Atraso', identificationDate: '2026-10-02', reviewDate: '2026-10-07', statusId: 'rs1', deleted: false } as ProjectRiskItem]}
      materials={[{ id: 'm1', description: 'Sensor', supplier: 'Fornecedor', expectedDeliveryDate: '', status: 'por_encomendar', deleted: false } as ProjectMaterial]}
      taskStatuses={[{ id: 'ts1', name: 'Em curso' }]} riskStatuses={[{ id: 'rs1', name: 'Em avaliação' }]}
      getUserName={() => 'Ana'} pendingMaterialStatuses={{ m1: 'encomendado' }} />);

    for (const text of ['Criação do projeto', 'Preparação', 'Material confirmado', 'Comentário de Ana em 06/10/2026', 'Atraso', 'Sensor', 'Em curso', 'Em avaliação', 'Encomendado', 'Sem data']) {
      expect(html).toContain(text);
    }
    expect(html.indexOf('Atraso')).toBeLessThan(html.indexOf('Material confirmado'));
    expect(html.indexOf('Material confirmado')).toBeLessThan(html.indexOf('Preparação'));
    expect(html.indexOf('Preparação')).toBeLessThan(html.indexOf('Sensor'));
  });
});
