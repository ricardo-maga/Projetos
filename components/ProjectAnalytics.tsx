'use client';
import React, { useMemo, useState } from 'react';
import type { Client, Project, ProjectMaterial } from '../lib/types';
import { buildProjectAnalytics, commercialProjectsInWindow, fiscalYearStart, projectAnalyticsDate, type CommercialProjectWindow } from '../lib/projectAnalytics';
import { Card } from './ui/Card';
import { MetricCard } from './ui/MetricCard';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { M3SectionHeader } from './M3';

export default function ProjectAnalytics({ projects, projectStatuses, categories, users, clients = [], materials = [], onSelectProject }:
  { projects: Project[]; projectStatuses: any[]; categories: any[]; users: any[]; clients?: Client[]; materials?: ProjectMaterial[]; onSelectProject: (id: string) => void }) {
  const [categoryWindowDays, setCategoryWindowDays] = useState(30);
  const [salesWindowDays, setSalesWindowDays] = useState(30);
  const [commercialWindow, setCommercialWindow] = useState<CommercialProjectWindow>(30);
  const [selectedSalesRepId, setSelectedSalesRepId] = useState('');
  const now = new Date();
  const todayKey = now.toDateString();
  const currentFiscalYear = fiscalYearStart(now);
  const data = useMemo(() => buildProjectAnalytics(projects, projectStatuses, materials, categoryWindowDays), [projects, projectStatuses, materials, categoryWindowDays]);
  const sales = useMemo(() => buildProjectAnalytics(projects, projectStatuses, materials, salesWindowDays).sales, [projects, projectStatuses, materials, salesWindowDays]);
  const commercialProjects = useMemo(() => commercialProjectsInWindow(projects, commercialWindow, now), [projects, commercialWindow, todayKey]);
  const userName = (id: string) => users.find(u => u.id === id)?.name || 'Sem responsável';
  const commercialManagers = [...new Set(commercialProjects.map(project => project.salesRepId))]
    .sort((a, b) => userName(a).localeCompare(userName(b), 'pt-PT'));
  const activeSalesRepId = commercialManagers.includes(selectedSalesRepId) ? selectedSalesRepId : (commercialManagers[0] || '');
  const selectedCommercialProjects = commercialProjects.filter(project => project.salesRepId === activeSalesRepId);
  const commercialWindows: { value: CommercialProjectWindow; label: string }[] = [
    { value: 30, label: '30 dias' }, { value: 60, label: '60 dias' }, { value: 90, label: '90 dias' },
    { value: 'previousFY', label: `FY${String(currentFiscalYear - 1).slice(-2)}` },
    { value: 'currentFY', label: `FY${String(currentFiscalYear).slice(-2)}` },
  ];
  const initials = (id: string) => (users.find(u => u.id === id)?.name || '').trim().split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').toLocaleUpperCase('pt-PT') || '—';
  const monthName = (offset: number) => { const now = new Date(); return new Intl.DateTimeFormat('pt-PT', { month: 'long' }).format(new Date(now.getFullYear(), now.getMonth() + offset, 1)).replace(/^./, first => first.toLocaleUpperCase('pt-PT')); };
  const windowFilter = (label: string, value: number, onChange: (days: number) => void) => <div role="group" aria-label={label} className="flex shrink-0 flex-wrap gap-1">
    {[30, 60, 90].map(days => <button key={days} type="button" aria-pressed={value === days} onClick={() => onChange(days)}
      className={`rounded-full px-2.5 py-1 text-caption font-medium transition-colors ${value === days ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:text-text-primary'}`}>{days} dias</button>)}
  </div>;
  const panel = (title: string, count: number, note?: string) => <MetricCard title={title} value={count} note={note} />;
  const bars = (rows: { id: string; count: number }[], name: (id: string) => string, emptyMessage = 'Sem projetos nesta janela.') => rows.length ? <ul className="space-y-3">{rows.map(row => <li key={row.id} className="space-y-1">
    <div className="flex justify-between gap-3 text-body-sm"><span>{name(row.id)}</span><span>{row.count}</span></div>
    <div className="h-2 rounded-control bg-surface-muted"><div className="h-2 rounded-control bg-primary" style={{ width: `${row.count / Math.max(...rows.map(r => r.count), 1) * 100}%` }} /></div>
  </li>)}</ul> : <p className="text-body-sm text-text-secondary">{emptyMessage}</p>;
  return <div className="space-y-5">
    <M3SectionHeader title="Análise de projetos" description="Indicadores de projetos e distribuição de responsabilidades." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {panel('Projetos ativos', data.active.length)}
      <Card className="p-5 space-y-2"><h3 className="text-label text-text-secondary">Projetos FY{String(data.fiscalCurrent.year).slice(-2)}</h3><p className="text-heading-lg text-text-primary tabular-nums">{data.fiscalCurrent.projects.length}</p><div className="border-t border-outline-variant pt-2 text-caption text-text-secondary">Projetos FY{String(data.fiscalPrevious.year).slice(-2)} · {data.fiscalPrevious.projects.length}</div></Card>
      {panel(`Projetos para ${monthName(0)}`, data.currentMonth.length)}{panel(`Projetos para ${monthName(1)}`, data.nextMonth.length)}
    </div>
    <Card className="p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-heading-sm">Projetos por categoria de projeto</h3>{windowFilter('Janela das categorias', categoryWindowDays, setCategoryWindowDays)}</div>{bars(data.categories, id => categories.find(c => c.id === id)?.name || 'Sem categoria')}</Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5 space-y-3"><h3 className="text-heading-sm">Projetos com material em falta/atraso</h3>
        {data.missing.length ? <ul>{data.missing.map(p => <li key={p.id}><Button variant="ghost" size="sm" className="h-auto min-h-9 whitespace-normal text-left justify-start" onClick={() => onSelectProject(p.id)}>
          {clients.find(c => String(c.id) === String(p.clientId))?.clientName || 'Cliente'} · {p.title} ({p.installProjectNo || 'Sem IP'})
        </Button></li>)}</ul> : <p className="text-body-sm text-text-secondary">Sem projetos com material em falta/atraso.</p>}
      </Card>
      <Card className="p-5 space-y-4"><h3 className="text-heading-sm">Nº de projetos ativos por gestor de projeto</h3>{bars(data.managers, userName, 'Sem projetos ativos.')}</Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {[
        { title: 'Projetos adjudicados este mês', summary: data.awardedCurrentMonth },
        { title: 'Projetos adjudicados o mês anterior', summary: data.awardedPreviousMonth },
      ].map(({ title, summary }) => <Card key={title} className="p-5 space-y-3">
        <h3 className="text-heading-sm">{title}</h3>
        <p className="text-heading-lg text-text-primary">{summary.count} <span className="text-body-sm text-text-secondary">projetos</span></p>
        <p className="text-heading-md text-text-primary">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(summary.saleValue)}</p>
        {summary.projects.length > 0 && <ul className="space-y-1 border-t border-outline-variant pt-2">{summary.projects.map(project => <li key={project.id} className="text-body-sm text-text-secondary">{clients.find(c => String(c.id) === String(project.clientId))?.clientName || 'Cliente'} - {project.title} ({initials(project.salesRepId)})</li>)}</ul>}
      </Card>)}
      <Card className="p-5 space-y-3 lg:col-span-2"><div className="flex items-center justify-between gap-3"><h3 className="text-heading-sm">Ranking comerciais</h3>{windowFilter('Janela do ranking comercial', salesWindowDays, setSalesWindowDays)}</div>
        <ol className="space-y-2">{sales.filter(r => r.id).map((row, idx) => <li key={row.id} className={`flex justify-between gap-2 p-3 rounded-control ${idx < 3 ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary'}`}>
          <span>{idx + 1}º · {userName(row.id)}</span><Badge>{row.count}</Badge></li>)}</ol>
        {!sales.some(r => r.id) && <p className="text-body-sm text-text-secondary">Sem gestor comercial atribuído nesta janela.</p>}
      </Card>
    </div>
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-heading-sm">Projetos por gestor comercial</h3>
        <div role="group" aria-label="Período dos projetos por gestor comercial" className="flex flex-wrap gap-1">
          {commercialWindows.map(option => <button key={option.value} type="button" aria-pressed={commercialWindow === option.value}
            onClick={() => setCommercialWindow(option.value)}
            className={`rounded-full px-2.5 py-1 text-caption font-medium transition-colors ${commercialWindow === option.value ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:text-text-primary'}`}>
            {option.label}
          </button>)}
        </div>
      </div>
      {commercialManagers.length > 0 ? <>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Gestor comercial" className="flex flex-wrap gap-2">
            {commercialManagers.map(id => <button key={id} type="button" aria-pressed={activeSalesRepId === id}
              onClick={() => setSelectedSalesRepId(id)}
              className={`rounded-control border px-3 py-2 text-body-sm font-medium transition-colors ${activeSalesRepId === id ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text-primary hover:border-primary'}`}>
              {userName(id)}
            </button>)}
          </div>
          <Badge>{selectedCommercialProjects.length} projetos</Badge>
        </div>
        <ul className="divide-y divide-border-subtle">
          {selectedCommercialProjects.map(project => <li key={project.id}>
            <Button variant="ghost" size="sm" className="w-full h-auto min-h-11 px-0 py-2 text-left justify-between gap-3 whitespace-normal" onClick={() => onSelectProject(project.id)}>
              <span>{clients.find(client => String(client.id) === String(project.clientId))?.clientName || 'Cliente'} · {project.title}{project.installProjectNo && ` · ${project.installProjectNo}`}</span>
              <span className="shrink-0 text-caption text-text-secondary">{new Date(`${projectAnalyticsDate(project.startDate)}T00:00:00`).toLocaleDateString('pt-PT')}</span>
            </Button>
          </li>)}
        </ul>
      </> : <p className="text-body-sm text-text-secondary">Sem projetos com gestor comercial neste período.</p>}
    </Card>
  </div>;
}

