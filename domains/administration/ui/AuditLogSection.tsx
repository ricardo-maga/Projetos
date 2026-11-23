'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { M3SectionHeader } from '@/components/M3';
import { authenticatedRequest, getAuthHeaders } from '@/lib/clientAuth';
import { auditModuleLabels, auditActionLabel, auditFieldLabel, auditSourceLabels, auditOutcomeLabels } from '../modules/auditPresentation';

type Change = { before?: unknown; after?: unknown; changed?: boolean };
type Event = {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityName?: string;
  entityId?: string;
  userName?: string;
  source: string;
  outcome?: string;
  requestId?: string;
  changes?: Record<string, Change>;
};
type Page = { success: boolean; message?: string; data: Event[]; nextCursor: string | null };

function display(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const dateTime = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'medium' });

function dateFilter(value: FormDataEntryValue, lastDay: boolean) {
  const date = new Date(`${value}T00:00:00Z`);
  if (lastDay) date.setUTCDate(date.getUTCDate() + 1);
  const lisbonHour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23',
  }).format(date);
  date.setUTCHours(-Number(lisbonHour));
  return date.toISOString();
}

export default function AuditLogSection({ projectId }: { projectId?: string }) {
  const endpoint = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/history` : '/api/audit';
  const [filters, setFilters] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [page, setPage] = useState<Page>();
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [previousCursors, setPreviousCursors] = useState<(string | undefined)[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(filters);
    params.set('limit', '25');
    if (cursor) params.set('cursor', cursor);

    setLoading(true);
    setError('');
    authenticatedRequest(`${endpoint}?${params}`, { headers: getAuthHeaders(), cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json() as Page;
        if (!response.ok || !result.success) throw new Error(result.message);
        if (!controller.signal.aborted) setPage(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPage(undefined);
          setError('Não foi possível carregar os eventos.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, filters, cursor, retry]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      params.set(name, name === 'from' || name === 'to' ? dateFilter(value, name === 'to') : value.trim());
    }
    setExportError('');
    setPreviousCursors([]);
    setCursor(undefined);
    setFilters(params.toString());
    setRetry(value => value + 1);
  }

  async function exportCsv() {
    setExporting(true);
    setExportError('');
    try {
      const params = new URLSearchParams(filters);
      const response = await authenticatedRequest(`/api/audit/export?${params}`, { method: 'POST', headers: getAuthHeaders(), cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'registo-de-auditoria.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error && err.message ? err.message : 'Não foi possível exportar o registo.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-4" aria-label={projectId ? 'Histórico de alterações' : 'Registo de auditoria'}>
      {!projectId && <M3SectionHeader title="Registo de auditoria" />}
      <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1">Pesquisar<Input name="search" maxLength={120} /></label>
        <label className="grid gap-1">Desde<Input type="date" name="from" /></label>
        <label className="grid gap-1">Até<Input type="date" name="to" /></label>
        {!projectId && <>
          <label className="grid gap-1">Módulo<Select name="module">
            <option value="">Todos</option>
            {Object.entries(auditModuleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></label>
          <label className="grid gap-1">Origem<Select name="source">
            <option value="">Todas</option>
            {Object.entries(auditSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></label>
          <label className="grid gap-1">Resultado<Select name="outcome">
            <option value="">Todos</option>
            {Object.entries(auditOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></label>
          <label className="grid gap-1">Código da ação<Input name="action" maxLength={80} placeholder="task.deleted" /></label>
          <label className="grid gap-1">ID do autor<Input name="actor" maxLength={36} /></label>
          <label className="grid gap-1">ID do registo<Input name="entity" maxLength={36} /></label>
        </>}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <Button type="submit">Aplicar filtros</Button>
          {!projectId && <Button type="button" variant="secondary" disabled={exporting || loading || !page?.data.length}
            onClick={() => void exportCsv()}>{exporting ? 'A exportar…' : 'Exportar CSV'}</Button>}
        </div>
      </form>
      {exportError && <p role="alert" className="text-body-sm">{exportError}</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2">
        <span>{error}</span><Button type="button" variant="secondary" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button>
      </div>}
      {loading ? <p role="status" className="text-body-sm text-text-secondary">A carregar…</p> : !error && !page?.data.length ? (
        <p className="text-body-sm text-text-secondary">Nenhum evento encontrado.</p>
      ) : !error && (
        <ul className="divide-y divide-border-subtle rounded-control border border-border bg-surface">
          {page?.data.map(event => <li key={event.id} className="px-4 py-3 [overflow-wrap:anywhere]">
            <details>
              <summary className="cursor-pointer">
                <span className="font-semibold">{auditActionLabel(event.action)}</span>
                {event.entityName && <span> · {event.entityName}</span>}
                <span className="block text-body-sm text-text-secondary sm:inline sm:pl-2">
                  <time dateTime={event.timestamp}>{dateTime.format(new Date(event.timestamp))}</time>
                  {' · '}{event.userName || 'Autor desconhecido'}
                  {event.source === 'automation' && ' · Automação'}
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-body-sm">
                {!projectId && <p>{auditSourceLabels[event.source] || event.source}{event.outcome && ` · ${auditOutcomeLabels[event.outcome] || event.outcome}`}</p>}
                {event.entityId && <p>ID do registo {event.entityId}</p>}
                {event.requestId && <p>Pedido {event.requestId}</p>}
                {event.changes && Object.entries(event.changes)
                  .filter(([, change]) => change.changed || change.before != null || change.after != null)
                  .map(([field, change]) => (
                  <div className="grid gap-1 sm:grid-cols-3" key={field}>
                    <strong>{auditFieldLabel(field)}</strong>
                    {change.changed ? <span>Alterado</span> : <>
                      <span><span className="text-text-muted">Antes </span>{display(change.before)}</span>
                      <span><span className="text-text-muted">Depois </span>{display(change.after)}</span>
                    </>}
                  </div>
                ))}
              </div>
            </details>
          </li>)}
        </ul>
      )}
      <nav className="flex gap-2" aria-label="Páginas de auditoria">
        {previousCursors.length > 0 && (
          <Button type="button" variant="secondary" disabled={loading} onClick={() => {
            setCursor(previousCursors.at(-1));
            setPreviousCursors(previousCursors.slice(0, -1));
          }}>Anterior</Button>
        )}
        {page?.nextCursor && (
          <Button type="button" variant="secondary" disabled={loading} onClick={() => {
            setPreviousCursors([...previousCursors, cursor]);
            setCursor(page.nextCursor!);
          }}>Seguinte</Button>
        )}
      </nav>
    </section>
  );
}
