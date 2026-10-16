'use client';

import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Client, Project, ProjectMaterial, ProjectPriority, Task, TaskStatus } from '../lib/types';
import { REPORT_CATALOG, buildReport, type ReportId } from '../lib/reports';
import { M3SectionHeader } from './M3';
import { Badge, Button, Card, Select } from './ui';

export default function ReportsSection({ projects, tasks, projectMaterials, clients, projectPriorities, taskStatuses, onSelectProject }: {
  projects: Project[]; tasks: Task[]; projectMaterials: ProjectMaterial[]; clients: Client[]; projectPriorities: ProjectPriority[]; taskStatuses: TaskStatus[];
  onSelectProject: (id: string) => void;
}) {
  const [reportId, setReportId] = useState<ReportId>('overdue-materials');
  const report = useMemo(() => buildReport(reportId, { projects, tasks, projectMaterials, clients, projectPriorities, taskStatuses }), [reportId, projects, tasks, projectMaterials, clients, projectPriorities, taskStatuses]);
  const meta = REPORT_CATALOG.find(item => item.id === reportId)!;

  return <div className="space-y-5">
    <M3SectionHeader title="Relatórios" description="Análise operacional baseada nos dados atuais do sistema." />
    <Card className="p-4 space-y-4">
      <div className="min-w-60">
        <label htmlFor="report-select" className="text-label font-bold">Relatório</label>
        <Select id="report-select" value={reportId} onChange={event => setReportId(event.target.value as ReportId)} className="mt-1 w-full">
          {REPORT_CATALOG.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </div>
      <p className="text-caption text-text-secondary">{meta.description}</p>
    </Card>
    <Card className="p-4"><p className="text-caption text-text-secondary">Resultados</p><p className="text-heading-lg">{report.total}</p></Card>
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border"><h3 className="text-heading-sm">Detalhe</h3></div>
      <div className="divide-y divide-border-subtle">
        {report.details.length ? report.details.map(row => <div key={row.id} className="p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><p className="font-bold text-body-sm truncate">{row.primary}</p><p className="text-caption text-text-secondary truncate">{row.secondary}</p></div>
          {row.date && <span className="text-caption">{row.date.split('-').reverse().join('/')}</span>}
          <Badge>{row.value}</Badge>
          {row.projectId && <Button variant="ghost" size="sm" onClick={() => onSelectProject(row.projectId)} title="Abrir projeto"><ExternalLink className="w-4 h-4" /></Button>}
        </div>) : <p className="p-6 text-body-sm text-text-secondary text-center">
          {reportId === 'critical-open-tasks' ? 'Sem tarefas com prioridade de nível 3 e estado de nível 1 ou 2. Confirme a prioridade das tarefas.' : 'Sem materiais em atraso.'}
        </p>}
      </div>
    </Card>
  </div>;
}
