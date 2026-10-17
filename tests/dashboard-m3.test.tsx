import { describe, it, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import Dashboard from '../components/BentoDashboard';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { M3Button } from '../components/M3';
import { hasFilledButtonBackground } from '../components/ui/buttonAppearance';
import { currentForecastMonth, offsetForecastMonth } from '../lib/projectForecast';

const props: React.ComponentProps<typeof Dashboard> = {
  projects: [], tasks: [], absences: [], projectMaterials: [], comments: [],
  clients: [], users: [], projectStatuses: [], taskStatuses: [],
  projectCategories: [], projectPriorities: [], onNavigate: () => {}, onSelectProject: () => {},
};

describe('Dashboard M3 presentation', () => {
  it('lists every live project forecast for the selected month, regardless of status', () => {
    const month = currentForecastMonth();
    const items = [
      { id: 'pending', title: 'Projeto para instalar', clientId: 'client', installProjectNo: 'IP-123', statusId: 'preparation', forecastDate: `${month}-01`, deleted: false },
      { id: 'installed', title: 'Projeto já iniciado', clientId: 'client', statusId: 'installation', forecastDate: `${month}-01`, deleted: false },
      { id: 'closed', title: 'Projeto concluído', clientId: 'client', statusId: 'completed', forecastDate: `${month}-01`, deleted: false },
      { id: 'other-month', title: 'Projeto de outro mês', statusId: 'preparation', forecastDate: `${offsetForecastMonth(month, 1)}-01`, deleted: false },
      { id: 'deleted', title: 'Projeto eliminado em Forecast', statusId: 'preparation', forecastDate: `${month}-01`, deleted: true },
    ];
    const html = renderToStaticMarkup(<Dashboard {...props} projects={items as typeof props.projects}
      clients={[{ id: 'client', clientName: 'Cliente Forecast' }] as typeof props.clients}
      projectStatuses={[{ id: 'preparation', name: 'Preparação', scale: 3 }, { id: 'installation', name: 'Instalação', scale: 4 }, { id: 'completed', name: 'Concluído', scale: 5 }]} />);
    const forecastPanel = html.split('Projetos ativos esta semana')[0];
    expect(forecastPanel).toContain('Projeto para instalar');
    expect(forecastPanel).toContain('Projeto já iniciado');
    expect(forecastPanel).toContain('Projeto concluído');
    expect(forecastPanel).toContain('Cliente Forecast');
    expect(forecastPanel).toContain('IP-123');
    expect(forecastPanel).toContain('Instalação');
    expect(forecastPanel).not.toContain('Projeto de outro mês');
    expect(forecastPanel).not.toContain('Projeto eliminado em Forecast');
  });

  it('renders Foundation cards and readable sections without the active-project pipeline', () => {
    const html = renderToStaticMarkup(<Dashboard {...props} />);
    expect(html).toContain('m3-dashboard');
    // The page shell owns the Dashboard title; cards retain semantic headings.
    expect(html).toMatch(/<h2\b[^>]*>/);
    for (const title of ['Projetos ativos esta semana', 'Projetos com maior carga horária', 'Comentários recentes', 'Ausências da equipa']) expect(html).toContain(title);
    expect(html).not.toContain('<h2 class="text-heading-sm text-text-primary">Projetos Ativos</h2>');
    expect(html).toContain('Nenhum projeto ativo registado.');
    expect(html).toContain('Nenhuma ausência registada.');
    expect(html).not.toContain('bg-slate-900');
    expect(html.match(/rounded-card/g)?.length).toBeGreaterThanOrEqual(8);
    expect(html).toContain('Projetos em Forecast');
    expect(html).toContain('aria-label="Filtrar mês do Forecast"');
    for (const offset of [-1, 0, 1]) {
      const month = offsetForecastMonth(currentForecastMonth(), offset);
      const name = new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' })
        .format(new Date(`${month}-01T00:00:00Z`)).replace(/^./, first => first.toLocaleUpperCase('pt-PT'));
      expect(html).toContain(name);
    }
    expect(html).not.toContain('m3-segment__check');
    expect(html).toMatch(/<h2 class="text-heading-sm text-text-primary">Projetos em Forecast<\/h2>/);
    expect(html).toContain('Tarefas abertas');
    expect(html).toContain('m3-dashboard-summary');
  });

  it('shows comments only from the last 15 days', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const project = { id: 'p', deleted: false } as typeof props.projects[number];
    const comments = [
      { id: 'recent', projectId: 'p', authorId: 'u', comment: 'Comentário recente', createdDate: daysAgo(14) },
      { id: 'old', projectId: 'p', authorId: 'u', comment: 'Comentário antigo', createdDate: daysAgo(16) },
      { id: 'future', projectId: 'p', authorId: 'u', comment: 'Comentário futuro', createdDate: daysAgo(-1) },
      { id: 'invalid', projectId: 'p', authorId: 'u', comment: 'Comentário sem data', createdDate: 'invalid' },
    ] as typeof props.comments;
    const html = renderToStaticMarkup(<Dashboard {...props} projects={[project]} comments={comments} />);
    expect(html).toContain('Comentário recente');
    expect(html).not.toContain('Comentário antigo');
    expect(html).not.toContain('Comentário futuro');
    expect(html).not.toContain('Comentário sem data');
  });

  it('limits workload totals to active project status scales', () => {
    const project = { id: 'p-active', title: 'Projeto de teste', clientId: 'c', projectManagerId: 'u', statusId: 'custom', createdDate: '2026-01-01', deliveryDate: '2026-12-01', deleted: false };
    const statuses = [{ id: 'custom', name: 'Estado configurado', color: 'laranja', scale: 1 }, { id: 'finished', name: 'Concluído', scale: 5 }];
    const html = renderToStaticMarkup(<Dashboard {...props}
      projects={[project, { ...project, id: 'deleted', title: 'Projeto eliminado', deleted: true }, { ...project, id: 'closed', title: 'Projeto concluído', statusId: 'finished' }] as typeof props.projects}
      projectStatuses={statuses}
      clients={[{ id: 'c', clientName: 'Cliente de teste' }] as typeof props.clients}
      users={[{ id: 'u', name: 'Técnico de teste' }]}
      tasks={[{ id: 't', projectId: 'p-active', statusId: 'ts-1', assigneeIds: ['u', 'u2'], estimatedHours: '04:00', actualHours: '', deleted: false }] as typeof props.tasks}
    />);
    expect(html).toContain('Cliente de teste');
    expect(html).toContain('8h');
    expect(html).not.toContain('Projeto eliminado');
    expect(html).not.toContain('Projeto concluído');
    expect(html).toContain('aria-label="Abrir projeto Projeto de teste"');
  });

  it('keeps callbacks, pagination and keyboard project activation in the presentation', () => {
    const source = readFileSync(new URL('../components/BentoDashboard.tsx', import.meta.url), 'utf8');
    expect(source).toContain("onNavigate('tarefas')");
    expect(source).toContain("onNavigate('ausencias')");
    expect(source).toContain('hasActiveProjectScale');
    expect(source).toContain("event.key === 'Enter' || event.key === ' '");
    expect(source).not.toMatch(/<(button|input)\b/);
    expect(source).not.toMatch(/text-\[(9|10|11)px\]|text-xs|bg-slate/);
  });
});

describe('Filled button foreground contract', () => {
  for (const variant of ['primary', 'danger', 'destructive', 'success'] as const) {
    it(`${variant} keeps white labels even when a local text utility conflicts`, () => {
      const html = renderToStaticMarkup(<Button variant={variant} className="text-primary"><span className="text-error">Ação</span></Button>);
      expect(html).toContain('data-filled="true"');
    });
  }

  it('covers filled M3 and icon buttons but not clear, tinted or selected backgrounds', () => {
    expect(renderToStaticMarkup(<M3Button danger>Eliminar</M3Button>)).toContain('data-filled="true"');
    expect(renderToStaticMarkup(<IconButton variant="danger" aria-label="Eliminar" />)).toContain('data-filled="true"');
    for (const variant of ['secondary', 'outline', 'ghost'] as const) expect(renderToStaticMarkup(<Button variant={variant}>Ação</Button>)).not.toContain('data-filled="true"');
    expect(renderToStaticMarkup(<Button selected>Ação</Button>)).not.toContain('data-filled="true"');
    expect(renderToStaticMarkup(<Button className="bg-surface">Ação</Button>)).not.toContain('data-filled="true"');
    expect(renderToStaticMarkup(<M3Button tone="tonal">Ação</M3Button>)).not.toContain('data-filled="true"');
  });

  it('recognizes opaque custom backgrounds without confusing hover colors or light tints', () => {
    for (const background of ['bg-green-700', 'bg-blue-600', 'bg-red-600', 'bg-slate-900', 'bg-success-strong']) expect(hasFilledButtonBackground(background, false)).toBe(true);
    for (const background of ['bg-primary/10', 'bg-green-50', 'bg-transparent', 'hover:bg-blue-600']) expect(hasFilledButtonBackground(background, false)).toBe(false);
    expect(hasFilledButtonBackground('bg-blue-600 bg-surface', true)).toBe(false);
    expect(renderToStaticMarkup(<Button variant="outline" className="bg-green-700 text-green-900">Ação</Button>)).toContain('data-filled="true"');
  });

  it('CSS enforces white for the filled contract and nested labels/icons', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).toMatch(/button\[data-filled="true"\],\s*button\[data-filled="true"\] :where\(span, svg\)\s*\{\s*color: #ffffff;/);
    expect(css).toContain('--color-success-strong: #007a2e');
  });
});
