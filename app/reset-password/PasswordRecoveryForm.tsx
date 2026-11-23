'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { getApiErrorMessage } from '@/lib/clientAuth';

const field = 'block w-full min-h-11 px-3 rounded-control border border-border bg-surface text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none';

export function PasswordRecoveryForm({ canReset, expired }: { canReset: boolean; expired: boolean }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string }>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    if (canReset && values.get('password') !== values.get('confirmation')) {
      setResult({ error: 'As palavras-passe não coincidem.' });
      return;
    }
    setPending(true);
    setResult({});
    try {
      const response = await fetch(`/api/auth/reset-password${canReset ? '/complete' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canReset ? { password: values.get('password') } : { email: values.get('email') }),
      });
      const data = await response.json();
      if (response.ok) {
        setResult({ message: canReset ? 'A palavra-passe foi alterada. Pode iniciar sessão novamente.' : data.message });
      } else {
        setResult({ error: getApiErrorMessage(data, 'Não foi possível processar o pedido.') });
      }
    } catch {
      setResult({ error: 'Não foi possível processar o pedido. Tente novamente.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-muted p-6">
      <section className="w-full max-w-md space-y-5 rounded-card border border-border bg-surface p-7 shadow-raised">
        <h1 className="text-xl font-bold text-text-primary">{canReset ? 'Definir nova palavra-passe' : 'Recuperar palavra-passe'}</h1>
        {expired && !result.message && <p role="status" className="text-text-secondary">A ligação expirou ou já foi usada. Peça uma nova ligação.</p>}
        {result.error && <p role="alert" className="text-destructive">{result.error}</p>}
        {result.message ? <p role="status" className="text-text-primary">{result.message}</p> : (
          <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
            {canReset ? <>
              <label className="block space-y-1">
                <span>Nova palavra-passe</span>
                <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required className={field} />
              </label>
              <label className="block space-y-1">
                <span>Confirmar palavra-passe</span>
                <input name="confirmation" type="password" autoComplete="new-password" required className={field} />
              </label>
            </> : <>
              <p className="text-text-secondary">Abra a ligação do email neste navegador.</p>
              <label className="block space-y-1">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" maxLength={254} required className={field} />
              </label>
            </>}
            <button type="submit" disabled={pending} className="w-full min-h-11 rounded-control bg-action-600 px-4 font-bold text-inverse hover:bg-action-700 disabled:opacity-60">
              {pending ? 'A processar…' : canReset ? 'Guardar palavra-passe' : 'Enviar ligação'}
            </button>
          </form>
        )}
        <Link href="/" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Voltar ao início de sessão</Link>
      </section>
    </main>
  );
}
