'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authenticatedRequest, getApiErrorMessage, getAuthHeaders } from '@/lib/clientAuth';
import type { CalendarFeedScope } from '@/domains/calendar/modules/calendarFeeds';

const feeds: { scope: CalendarFeedScope; title: string }[] = [
  { scope: 'mine', title: 'As minhas tarefas' },
  { scope: 'all', title: 'Todas as tarefas' },
];

type Subscription = { configured: boolean; path: string | null };

async function requestSubscription(scope: CalendarFeedScope, fallback: string, init?: RequestInit): Promise<Subscription> {
  const response = await authenticatedRequest(`/api/calendar/subscriptions/${scope}`, {
    ...init, cache: 'no-store', headers: getAuthHeaders(),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.configured !== 'boolean') throw new Error(getApiErrorMessage(result, fallback));
  const path = typeof result.path === 'string' ? result.path : null;
  if (init?.method === 'POST' && !path) throw new Error(fallback);
  return { configured: result.configured, path };
}

export default function CalendarSubscriptions({ writesBlocked = false }: { writesBlocked?: boolean }) {
  const [subscriptions, setSubscriptions] = useState<Partial<Record<CalendarFeedScope, Subscription>>>({});
  const [busy, setBusy] = useState<CalendarFeedScope | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<CalendarFeedScope | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fallback = 'Não foi possível consultar a subscrição.';
    for (const { scope } of feeds) {
      requestSubscription(scope, fallback, { signal: controller.signal }).then(subscription => {
        if (!controller.signal.aborted) setSubscriptions(previous => ({ ...previous, [scope]: subscription }));
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : fallback);
      });
    }
    return () => controller.abort();
  }, []);

  async function mutate(scope: CalendarFeedScope, method: 'POST' | 'DELETE') {
    setBusy(scope);
    setError('');
    setCopied(null);
    const fallback = method === 'POST' ? 'Não foi possível gerar o endereço.' : 'Não foi possível desativar o endereço.';
    try {
      const updated = await requestSubscription(scope, fallback, { method });
      setSubscriptions(previous => ({ ...previous, [scope]: updated }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  async function copy(scope: CalendarFeedScope, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(scope);
      setError('');
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o endereço apresentado.');
    }
  }

  return <section className="space-y-4" aria-labelledby="calendar-subscriptions-title">
    <h2 id="calendar-subscriptions-title" className="text-heading-sm text-text-primary">Subscrições de calendário</h2>
    <p className="text-body-sm text-text-secondary">Subscreva as tarefas numa aplicação de calendário externa.</p>
    {feeds.map(feed => {
      const subscription = subscriptions[feed.scope];
      const url = subscription?.path ? `${window.location.origin}${subscription.path}` : null;
      return <div key={feed.scope} className="border-t border-border-subtle pt-3 space-y-2">
        <h3 className="font-semibold text-body-sm text-text-primary">{feed.title}</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="min-h-11" disabled={!subscription || busy !== null || writesBlocked} onClick={() => mutate(feed.scope, 'POST')}>
            {subscription?.configured ? 'Renovar endereço' : 'Criar endereço'}
          </Button>
          {subscription?.configured && <>
            <Button type="button" variant="outline" className="min-h-11" disabled={!url || busy !== null} onClick={() => { if (url) void copy(feed.scope, url); }}>
              {copied === feed.scope ? 'Copiado' : 'Copiar endereço'}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" disabled={busy !== null || writesBlocked} onClick={() => mutate(feed.scope, 'DELETE')}>
              Desativar endereço
            </Button>
          </>}
        </div>
        {url && <Input readOnly aria-label={`Endereço de ${feed.title}`} value={url}
          onFocus={event => event.currentTarget.select()} />}
        {subscription?.configured && !url && <p className="text-caption text-text-secondary">
          Renove este endereço para ativar a cópia. Após a renovação, substitua o endereço na aplicação de calendário.
        </p>}
      </div>;
    })}
    {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
  </section>;
}
