'use client';

import React, { useState, useMemo, useRef } from 'react';
import { AuditLog, User } from '@/lib/types';
import {
  ShieldCheck, Search, Download, RefreshCw, Filter,
  Clock, User as UserIcon, AlertTriangle, CheckCircle, Info, Database, Layers,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { fetchAuditLogsFromSupabase } from '@/lib/supabaseSync';
import { M3SectionHeader } from '@/components/M3';
import { auditActionCategory, auditEntityCategory } from '../modules/auditPresentation';

interface AuditLogSectionProps {
  auditLogs?: AuditLog[];
  currentUser?: User | null;
  onRefresh?: () => void;
}

export default function AuditLogSection({ auditLogs = [], currentUser, onRefresh }: AuditLogSectionProps) {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterEntity, setFilterEntity] = useState('ALL');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const refreshInFlight = useRef(false);
  const [remoteLogs, setRemoteLogs] = useState<AuditLog[] | null>(null);

  // Combine local audit logs from state and remote logs if fetched
  const logsToDisplay = useMemo(() => {
    return remoteLogs || auditLogs || [];
  }, [remoteLogs, auditLogs]);

  const handleRefresh = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    try {
      const res = await fetchAuditLogsFromSupabase(200);
      if (res.success && res.data) setRemoteLogs(res.data);
      if (onRefresh) await onRefresh();
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  };

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logsToDisplay.filter(log => {
      // Search
      const searchLower = search.toLowerCase();
      const matchesSearch = !search ||
        (log.userName && log.userName.toLowerCase().includes(searchLower)) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(searchLower)) ||
        (log.details && log.details.toLowerCase().includes(searchLower)) ||
        (log.entityName && log.entityName.toLowerCase().includes(searchLower)) ||
        (log.action && log.action.toLowerCase().includes(searchLower));

      // Filter Action
      const matchesAction = filterAction === 'ALL' || auditActionCategory(log.action) === filterAction;

      // Filter Entity
      const matchesEntity = filterEntity === 'ALL' || auditEntityCategory(log.entityType || '') === filterEntity;

      return matchesSearch && matchesAction && matchesEntity;
    });
  }, [logsToDisplay, search, filterAction, filterEntity]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = logsToDisplay.length;
    const creates = logsToDisplay.filter(l => auditActionCategory(l.action) === 'CREATE').length;
    const deletes = logsToDisplay.filter(l => auditActionCategory(l.action) === 'DELETE').length;
    const logins = logsToDisplay.filter(l => l.action === 'LOGIN' || l.action === 'LOGOUT').length;
    return { total, creates, deletes, logins };
  }, [logsToDisplay]);

  // Export CSV
  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['ID', 'Data/Hora', 'Utilizador', 'Email', 'Ação', 'Entidade', 'ID Entidade', 'Nome Entidade', 'Detalhes'];
    const rows = filteredLogs.map(l => [
      l.id || '',
      l.timestamp ? new Date(l.timestamp).toLocaleString('pt-PT') : '',
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      `"${(l.userEmail || '').replace(/"/g, '""')}"`,
      l.action || '',
      l.entityType || '',
      l.entityId || '',
      `"${(l.entityName || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Badge rendering helper
  const getActionBadge = (action: string) => {
    switch (action?.toUpperCase()) {
      case 'CREATE':
        return <span className="px-2 py-0.5 text-micro font-extrabold bg-feedback-success-50 text-feedback-success-700 border border-feedback-success-200 rounded-control uppercase tracking-wider">Criar</span>;
      case 'UPDATE':
        return <span className="px-2 py-0.5 text-micro font-extrabold bg-action-50 text-action-700 border border-action-200 rounded-control uppercase tracking-wider">Editar</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 text-micro font-extrabold bg-feedback-danger-50 text-feedback-danger-700 border border-feedback-danger-200 rounded-control uppercase tracking-wider">Eliminar</span>;
      case 'LOGIN':
      case 'LOGOUT':
        return <span className="px-2 py-0.5 text-micro font-extrabold bg-category-purple-50 text-category-purple-700 border border-category-purple-200 rounded-control uppercase tracking-wider">{action}</span>;
      default:
        return <span className="px-2 py-0.5 text-micro font-extrabold bg-surface-muted text-text-secondary border border-border rounded-control uppercase tracking-wider">{action}</span>;
    }
  };

  return (
    <div className="m3-config space-y-6 animate-fade-in" id="audit-log-section">
      {/* Header */}
      <div className="bg-surface rounded-card border border-border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-category-indigo-50 border border-category-indigo-100 rounded-control text-category-indigo-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <M3SectionHeader title="Registo de auditoria" description="Histórico de ações, alterações de registos e acessos." />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-2 bg-surface-muted hover:bg-surface-elevated text-text-secondary font-bold text-xs rounded-control transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportToCSV}
            disabled={filteredLogs.length === 0}
            className="m3-button m3-button--filled flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-card border border-border flex items-center gap-3">
          <div className="p-2.5 bg-action-50 text-primary-ink rounded-control border border-action-100">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-micro font-extrabold text-text-muted uppercase tracking-wider">Total Registado</div>
            <div className="text-lg font-black text-text-primary">{stats.total}</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-card border border-border flex items-center gap-3">
          <div className="p-2.5 bg-feedback-success-50 text-feedback-success-600 rounded-control border border-feedback-success-100">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-micro font-extrabold text-text-muted uppercase tracking-wider">Criações</div>
            <div className="text-lg font-black text-text-primary">{stats.creates}</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-card border border-border flex items-center gap-3">
          <div className="p-2.5 bg-feedback-danger-50 text-feedback-danger-600 rounded-control border border-feedback-danger-100">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-micro font-extrabold text-text-muted uppercase tracking-wider">Eliminações</div>
            <div className="text-lg font-black text-text-primary">{stats.deletes}</div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-card border border-border flex items-center gap-3">
          <div className="p-2.5 bg-category-purple-50 text-category-purple-600 rounded-control border border-category-purple-100">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-micro font-extrabold text-text-muted uppercase tracking-wider">Autenticações</div>
            <div className="text-lg font-black text-text-primary">{stats.logins}</div>
          </div>
        </div>
      </div>

      {/* Audit Log Table Container with Filters Toolbar */}
      <div className="bg-surface rounded-card border border-border shadow-subtle overflow-hidden">
        {/* Filters Toolbar */}
        <div className="p-4 sm:p-5 border-b border-border/80 bg-surface-muted/60 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full md:flex-1 md:max-w-md">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              aria-label="Pesquisar auditoria"
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Pesquisar utilizador, ação, detalhes ou entidade..."
              className="w-full pl-9 pr-3.5 py-2 bg-surface border border-border rounded-control text-xs font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-action-100 focus:border-action-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Filter Action */}
            <select
              aria-label="Filtrar auditoria por ação"
              value={filterAction}
              onChange={e => {
                setFilterAction(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-surface border border-border rounded-control text-xs font-semibold text-text-secondary outline-none focus:ring-2 focus:ring-action-100 focus:border-action-500 transition-all cursor-pointer"
            >
              <option value="ALL">Todas as Ações</option>
              <option value="CREATE">Criar (CREATE)</option>
              <option value="UPDATE">Editar (UPDATE)</option>
              <option value="DELETE">Eliminar (DELETE)</option>
              <option value="LOGIN">Autenticação (LOGIN)</option>
              <option value="SETTINGS">Definições (SETTINGS)</option>
            </select>

            {/* Filter Entity */}
            <select
              aria-label="Filtrar auditoria por entidade"
              value={filterEntity}
              onChange={e => {
                setFilterEntity(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-surface border border-border rounded-control text-xs font-semibold text-text-secondary outline-none focus:ring-2 focus:ring-action-100 focus:border-action-500 transition-all cursor-pointer"
            >
              <option value="ALL">Todas as Entidades</option>
              <option value="PROJECT">Projetos</option>
              <option value="TASK">Tarefas</option>
              <option value="CLIENT">Clientes</option>
              <option value="USER">Utilizadores</option>
              <option value="RISK">Riscos</option>
              <option value="SYSTEM">Sistema</option>
            </select>

            {/* Page Size */}
            <div className="flex items-center gap-1.5 pl-1">
              <span className="text-xs text-text-muted font-medium whitespace-nowrap">Mostrar:</span>
              <select
                aria-label="Registos de auditoria por página"
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-surface border border-border rounded-control text-xs font-semibold text-text-secondary cursor-pointer outline-none focus:ring-1 focus:ring-action-500"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-surface-muted/90 text-small-label uppercase tracking-wider text-text-muted font-bold border-b border-border/80 whitespace-nowrap select-none">
              <tr>
                <th className="px-5 py-3.5 text-left">Data e Hora</th>
                <th className="px-5 py-3.5 text-left">Utilizador</th>
                <th className="px-5 py-3.5 text-left">Ação</th>
                <th className="px-5 py-3.5 text-left">Entidade</th>
                <th className="px-5 py-3.5 text-left">Detalhes do Registo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-xs font-medium">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-text-muted font-medium">
                    <Info className="w-6 h-6 mx-auto mb-2 text-text-muted" />
                    Nenhum registo de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, index) => (
                  <tr key={log.id || index} className="hover:bg-surface-muted/60 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap text-text-muted font-mono text-small-label">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-text-muted" />
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-PT') : 'N/A'}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-bold text-text-primary">{log.userName || 'Sistema'}</div>
                      {log.userEmail && <div className="text-micro text-text-muted font-mono">{log.userEmail}</div>}
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-extrabold text-text-secondary font-mono text-small-label">
                        {log.entityType || 'GERAL'}
                      </div>
                      {log.entityName && (
                        <div className="text-micro text-text-muted max-w-[150px] truncate">
                          {log.entityName}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-text-secondary font-medium">
                      <span className="leading-relaxed break-words">{log.details}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredLogs.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-surface-muted/70 border-t border-border/80 text-xs gap-3 font-medium">
            <span className="text-text-muted">
              A mostrar <strong className="text-text-primary">{((currentPage - 1) * pageSize) + 1}</strong> a <strong className="text-text-primary">{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> de <strong className="text-text-primary">{filteredLogs.length}</strong> registos
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 bg-surface border border-border rounded-control font-bold text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
                <span className="px-3 text-xs font-bold text-text-secondary">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 bg-surface border border-border rounded-control font-bold text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Seguinte</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
