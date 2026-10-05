'use client';
import React, { useMemo, useState } from 'react';
import type { Client, Project, ProjectMaterial } from '../lib/types';
import { buildProjectAnalytics } from '../lib/projectAnalytics';
import { Card } from './ui/Card';
import { MetricCard } from './ui/MetricCard';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { M3SectionHeader, M3SegmentedControl } from './M3';

export default function ProjectAnalytics({ projects, projectStatuses, categories, users, clients = [], materials = [], onSelectProject }:
  { projects: Project[]; projectStatuses: any[]; categories: any[]; users: any[]; clients?: Client[]; materials?: ProjectMaterial[]; onSelectProject: (id: string) => void }) {
  const [windowDays, setWindowDays] = useState(30);
  const data = useMemo(() => buildProjectAnalytics(projects, projectStatuses, materials, windowDays), [projects, projectStatuses, materials, windowDays]);
  const userName = (id: string) => users.find(u => u.id === id)?.name || 'Sem responsável';
  const panel = (title: string, count: number, note?: string) => <MetricCard title={title} value={count} note={note} />;
  const bars = (rows: { id: string; count: number }[], name: (id: string) => string, emptyMessage = 'Sem projetos nesta janela.') => rows.length ? <ul className="space-y-3">{rows.map(row => <li key={row.id} className="space-y-1">
    <div className="flex justify-between gap-3 text-body-sm"><span>{name(row.id)}</span><span>{row.count}</span></div>
    <div className="h-2 rounded-control bg-surface-muted"><div className="h-2 rounded-control bg-primary" style={{ width: `${row.count / Math.max(...rows.map(r => r.count), 1) * 100}%` }} /></div>
  </li>)}</ul> : <p className="text-body-sm text-text-secondary">{emptyMessage}</p>;
  return <div className="space-y-5">
    <M3SectionHeader title="Análise de projetos" description="Indicadores de projetos e distribuição de responsabilidades." />
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <M3SegmentedControl label="Janela de análise" value={String(windowDays)} onChange={value => setWindowDays(Number(value))}
          options={[7, 30, 60, 90].map(days => ({ value: String(days), label: `${days} dias` }))} />
        <Badge>{data.scoped.length} projetos analisados</Badge>
      </div>
      <p className="text-caption text-text-secondary">A janela por data de criação aplica-se às categorias e à classificação comercial. Ativos, atrasos, indicadores mensais, material e gestores de projeto são independentes desta janela.</p>
    </Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {panel('Projetos ativos', data.active.length)}{panel('Projetos em atraso', data.overdue.length)}
      {panel('Projetos do mês corrente', data.currentMonth.length, 'Data agendada → previsão de entrega real → data de entrega')}{panel('Projetos do mês seguinte', data.nextMonth.length, 'Data agendada → previsão de entrega real → data de entrega')}
    </div>
    <Card className="p-5 space-y-4"><h3 className="text-heading-sm">Projetos por categoria de projeto</h3>{bars(data.categories, id => categories.find(c => c.id === id)?.name || 'Sem categoria')}</Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5 space-y-3"><h3 className="text-heading-sm">Projetos com material em falta/atraso</h3><Badge>{data.missing.length} projetos</Badge>
        {data.missing.length ? <ul>{data.missing.map(p => <li key={p.id}><Button variant="ghost" size="sm" className="h-auto min-h-9 whitespace-normal text-left justify-start" onClick={() => onSelectProject(p.id)}>
          {clients.find(c => String(c.id) === String(p.clientId))?.clientName || 'Cliente'} · {p.title} ({p.installProjectNo || 'Sem IP'})
        </Button></li>)}</ul> : <p className="text-body-sm text-text-secondary">Sem projetos com material em falta/atraso.</p>}
      </Card>
      <Card className="p-5 space-y-4"><h3 className="text-heading-sm">Nº de projetos por gestor de projeto</h3><p className="text-caption text-text-secondary">Todos os projetos ativos · níveis 1 a 4</p>{bars(data.managers, userName, 'Sem projetos ativos.')}</Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      {[
        { title: 'Projetos adjudicados este mês', summary: data.awardedCurrentMonth },
        { title: 'Projetos adjudicados o mês anterior', summary: data.awardedPreviousMonth },
      ].map(({ title, summary }) => <Card key={title} className="p-5 space-y-3">
        <h3 className="text-heading-sm">{title}</h3>
        <p className="text-heading-lg text-text-primary">{summary.count} <span className="text-body-sm text-text-secondary">projetos</span></p>
        <p className="text-heading-md text-text-primary">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(summary.saleValue)}</p>
        <p className="text-caption text-text-secondary">Por data de início · Valor de venda</p>
      </Card>)}
      <Card className="p-5 space-y-3"><h3 className="text-heading-sm">Gestores comerciais com mais projetos</h3>
        <ol className="space-y-2">{data.sales.filter(r => r.id).map((row, idx) => <li key={row.id} className={`flex justify-between gap-2 p-3 rounded-control ${idx < 3 ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary'}`}>
          <span>{idx + 1}º · {userName(row.id)}</span><Badge>{row.count}</Badge></li>)}</ol>
        {!data.sales.some(r => r.id) && <p className="text-body-sm text-text-secondary">Sem gestor comercial atribuído nesta janela.</p>}
      </Card>
    </div>
  </div>;
}
