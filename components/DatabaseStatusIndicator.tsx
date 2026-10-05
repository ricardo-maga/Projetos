'use client';
import React from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';

interface DatabaseStatusIndicatorProps {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  configured: boolean;
  loaded: boolean;
  error?: string | null;
}

export default function DatabaseStatusIndicator({ status, configured, loaded, error }: DatabaseStatusIndicatorProps) {
  const failed = !configured || status === 'error';
  const busy = !failed && status === 'syncing';
  const active = !failed && !busy && loaded && status === 'synced';
  const label = failed ? 'SQL: em erro' : busy ? (loaded ? 'SQL: a gravar / sincronizar' : 'SQL: a carregar dados')
    : active ? 'SQL: ativo' : 'SQL: a aguardar confirmação';
  const description = failed ? (!configured ? 'Ligação à base de dados não configurada.' : error || 'A última operação SQL falhou.')
    : active ? 'Última operação concluída com sucesso. Este indicador não é uma monitorização permanente do servidor.'
    : busy ? 'Pedido à base de dados em curso, incluindo gravações ou atualização de dados.' : 'Ainda não foi confirmada uma operação com a base de dados.';
  const Icon = failed ? CircleAlert : LoaderCircle;
  return <span role="status" aria-live="polite" aria-atomic="true" tabIndex={0}
    title={`${label}. ${description}`} data-database-status={failed ? 'error' : busy ? 'busy' : active ? 'active' : 'idle'}
    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
    <Icon aria-hidden="true" className={`h-5 w-5 ${failed ? 'text-error' : busy ? 'text-warning animate-spin motion-reduce:animate-none' : active ? 'text-success-strong' : 'text-text-muted'}`} />
    <span className="sr-only">{label}</span>
  </span>;
}
