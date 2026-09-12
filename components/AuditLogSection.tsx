'use client';

import React, { useState, useMemo } from 'react';
import { AuditLog, User } from '../lib/types';
import { 
  ShieldCheck, Search, Download, RefreshCw, Filter, 
  Clock, User as UserIcon, AlertTriangle, CheckCircle, Info, Database, Layers
} from 'lucide-react';
import { fetchAuditLogsFromSupabase } from '../lib/supabaseSync';

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
  const [remoteLogs, setRemoteLogs] = useState<AuditLog[] | null>(null);

  // Combine local audit logs from state and remote logs if fetched
  const logsToDisplay = useMemo(() => {
    return remoteLogs || auditLogs || [];
  }, [remoteLogs, auditLogs]);

  const handleRefresh = async () => {
    setLoading(true);
    const res = await fetchAuditLogsFromSupabase(200);
    if (res.success && res.data) {
      setRemoteLogs(res.data);
    }
    setLoading(false);
    if (onRefresh) onRefresh();
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
      const matchesAction = filterAction === 'ALL' || log.action === filterAction;

      // Filter Entity
      const matchesEntity = filterEntity === 'ALL' || log.entityType === filterEntity;

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
    const creates = logsToDisplay.filter(l => l.action === 'CREATE').length;
    const deletes = logsToDisplay.filter(l => l.action === 'DELETE').length;
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
        return <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md uppercase tracking-wider">Criar</span>;
      case 'UPDATE':
        return <span className="px-2 py-0.5 text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 rounded-md uppercase tracking-wider">Editar</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 rounded-md uppercase tracking-wider">Eliminar</span>;
      case 'LOGIN':
      case 'LOGOUT':
        return <span className="px-2 py-0.5 text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200 rounded-md uppercase tracking-wider">{action}</span>;
      case 'RESTORE':
        return <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 rounded-md uppercase tracking-wider">Restauro</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 rounded-md uppercase tracking-wider">{action}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id="audit-log-section">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 -sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-800">
              Registos de Auditoria do Sistema (Audit Logs)
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Rastreabilidade total e histórico inalterável de todas as ações de utilizadores, alterações de registos e acessos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportToCSV}
            disabled={filteredLogs.length === 0}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl -sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 -sm flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Registado</div>
            <div className="text-lg font-black text-slate-800">{stats.total}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 -sm flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Criações</div>
            <div className="text-lg font-black text-slate-800">{stats.creates}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 -sm flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Eliminações</div>
            <div className="text-lg font-black text-slate-800">{stats.deletes}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 -sm flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Autenticações</div>
            <div className="text-lg font-black text-slate-800">{stats.logins}</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 -sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Pesquisar utilizador, ação, detalhes ou entidade..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Filter Action */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Ação:</span>
              <select
                value={filterAction}
                onChange={e => {
                  setFilterAction(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold outline-none cursor-pointer"
              >
                <option value="ALL">Todas as Ações</option>
                <option value="CREATE">Criar (CREATE)</option>
                <option value="UPDATE">Editar (UPDATE)</option>
                <option value="DELETE">Eliminar (DELETE)</option>
                <option value="LOGIN">Autenticação (LOGIN)</option>
                <option value="RESTORE">Restauro (RESTORE)</option>
                <option value="SETTINGS">Definições (SETTINGS)</option>
              </select>
            </div>

            {/* Filter Entity */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Entidade:</span>
              <select
                value={filterEntity}
                onChange={e => {
                  setFilterEntity(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold outline-none cursor-pointer"
              >
                <option value="ALL">Todas as Entidades</option>
                <option value="PROJECT">Projetos</option>
                <option value="TASK">Tarefas</option>
                <option value="CLIENT">Clientes</option>
                <option value="USER">Utilizadores</option>
                <option value="MATERIAL">Materiais</option>
                <option value="RISK">Riscos</option>
                <option value="SYSTEM">Sistema</option>
              </select>
            </div>

            {/* Page Size */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold outline-none cursor-pointer"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 -sm overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                <th className="p-3.5">Data e Hora</th>
                <th className="p-3.5">Utilizador</th>
                <th className="p-3.5">Ação</th>
                <th className="p-3.5">Entidade</th>
                <th className="p-3.5">Detalhes do Registo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                    <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    Nenhum registo de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, index) => (
                  <tr key={log.id || index} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-PT') : 'N/A'}
                      </div>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{log.userName || 'Sistema'}</div>
                      {log.userEmail && <div className="text-[10px] text-slate-400 font-mono">{log.userEmail}</div>}
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <div className="font-extrabold text-slate-700 font-mono text-[11px]">
                        {log.entityType || 'GERAL'}
                      </div>
                      {log.entityName && (
                        <div className="text-[10px] text-slate-500 max-w-[150px] truncate">
                          {log.entityName}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 text-slate-700 font-medium">
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
          <div className="p-4 border-t border-slate-150 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <span className="text-xs font-semibold text-slate-500">
              A mostrar <strong className="text-slate-800">{((currentPage - 1) * pageSize) + 1}</strong> a <strong className="text-slate-800">{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> de <strong className="text-slate-800">{filteredLogs.length}</strong> registos de auditoria
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>
              <span className="px-3 text-xs font-bold text-slate-600">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
              >
                Seguinte
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
