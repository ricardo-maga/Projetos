'use client';

import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import type { CalendarFeedScope } from '../lib/calendarFeeds';

const feeds: { scope: CalendarFeedScope; title: string; description: string }[] = [
  { scope: 'mine', title: 'As minhas tarefas', description: 'Apenas tarefas que lhe estão atribuídas.' },
  { scope: 'all', title: 'Todas as tarefas', description: 'Todas as tarefas com data marcada, com as iniciais dos responsáveis.' },
];

export default function CalendarSubscriptions() {
  const [configured, setConfigured] = useState<Record<CalendarFeedScope, boolean>>({ mine: false, all: false });
  const [urls, setUrls] = useState<Partial<Record<CalendarFeedScope, string>>>({});
  const [busy, setBusy] = useState<CalendarFeedScope | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<CalendarFeedScope | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all(feeds.map(async feed => {
      const response = await fetch(`/api/calendar/subscriptions/${feed.scope}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível consultar as subscrições.');
      const result = await response.json();
      return [feed.scope, Boolean(result.configured)] as const;
    })).then(rows => {
      if (active) setConfigured(Object.fromEntries(rows) as Record<CalendarFeedScope, boolean>);
    }).catch(() => { if (active) setError('Não foi possível consultar as subscrições.'); });
    return () => { active = false; };
  }, []);

  async function generate(scope: CalendarFeedScope) {
    setBusy(scope);
    setError('');
    setCopied(null);
    try {
      const response = await fetch(`/api/calendar/subscriptions/${scope}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.path) throw new Error(result.error || 'Não foi possível gerar o endereço.');
      setUrls(previous => ({ ...previous, [scope]: `${window.location.origin}${result.path}` }));
      setConfigured(previous => ({ ...previous, [scope]: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o endereço.');
    } finally { setBusy(null); }
  }

  async function copy(scope: CalendarFeedScope) {
    const url = urls[scope];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(scope);
      setError('');
    } catch { setError('Não foi possível copiar automaticamente. Selecione e copie o endereço apresentado.'); }
  }

  async function revoke(scope: CalendarFeedScope) {
    setBusy(scope);
    setError('');
    try {
      const response = await fetch(`/api/calendar/subscriptions/${scope}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível desativar o endereço.');
      setConfigured(previous => ({ ...previous, [scope]: false }));
      setUrls(previous => ({ ...previous, [scope]: undefined }));
      setCopied(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desativar o endereço.');
    } finally { setBusy(null); }
  }

  return <Card className="p-4 space-y-4">
    <div>
      <h3 className="font-bold text-text-primary">Calendários para Outlook</h3>
      <p className="text-body-sm text-text-secondary">Subscreva o endereço no Outlook para receber atualizações. Importar um ficheiro .ics cria apenas uma cópia. A atualização no Outlook pode demorar mais de 24 horas.</p>
      <p className="text-body-sm text-text-secondary">Cada endereço dá acesso aos dados desse calendário. Guarde-o em privado; ao renovar, o anterior deixa de funcionar.</p>
    </div>
    {feeds.map(feed => <div key={feed.scope} className="border-t border-border-subtle pt-3 space-y-2">
      <div><strong className="text-body-sm">{feed.title}</strong><p className="text-body-sm text-text-secondary">{feed.description}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => generate(feed.scope)}>
          {configured[feed.scope] ? 'Renovar endereço' : 'Criar endereço'}
        </Button>
        {urls[feed.scope] && <Button type="button" variant="outline" size="sm" onClick={() => copy(feed.scope)}>
          {copied === feed.scope ? 'Copiado' : 'Copiar endereço'}
        </Button>}
        {configured[feed.scope] && <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => revoke(feed.scope)}>
          Desativar endereço
        </Button>}
      </div>
      {urls[feed.scope] ? <Input readOnly aria-label={`Endereço de ${feed.title}`} value={urls[feed.scope]}
        onFocus={event => event.currentTarget.select()} />
        : configured[feed.scope] && <p className="text-caption text-text-secondary">O endereço só é mostrado quando é criado ou renovado.</p>}
    </div>)}
    {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
  </Card>;
}
