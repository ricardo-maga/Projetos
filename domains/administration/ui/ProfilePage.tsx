'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, LockKeyhole, LogOut, Palette } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import UserInitialsBadge from '@/components/ui/UserInitialsBadge';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import CalendarSubscriptions from '@/domains/calendar/ui/CalendarSubscriptions';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiRequestError, authenticatedRequest, getApiErrorMessage, getAuthHeaders } from '@/lib/clientAuth';
import { COLOR_SCHEMES, normalizePreferredTheme, type ApplicationTheme, type ColorSchemeId } from '@/lib/presentationTheme';

type ProfileDetails = { name: string; preferredTheme: ColorSchemeId | null };
type Feedback = { message: string; error?: boolean };

interface ProfilePageProps {
  user: ProfileDetails & { email?: string };
  applicationTheme: ApplicationTheme;
  writesBlocked: boolean;
  onSaved: (profile: ProfileDetails) => void;
  onLogout: () => void;
}

function FormFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-body-sm text-error' : 'text-body-sm text-success'}>
      {feedback.message}
    </p>
  );
}

function PasswordForm({ writesBlocked }: { writesBlocked: boolean }) {
  const { busy, run } = useAsyncAction();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writesBlocked) return;
    setFeedback(null);
    if (password !== confirmation) {
      setConfirmationError('As palavras-passe não coincidem.');
      confirmationInput.current?.focus();
      return;
    }

    await run(async () => {
      const fallback = 'Não foi possível alterar a palavra-passe.';
      try {
        const response = await authenticatedRequest('/api/auth/password', {
          method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ currentPassword, password }),
        });
        const result = await response.json().catch(() => null);
        if (response.status === 403) throw new Error(getApiErrorMessage(result, fallback));
        if (!response.ok || result?.success !== true) throw apiRequestError(response, result, fallback);
        setCurrentPassword('');
        setPassword('');
        setConfirmation('');
        setFeedback({ message: result.message || 'Palavra-passe alterada.' });
      } catch (error) {
        setFeedback({ error: true, message: error instanceof Error ? error.message : fallback });
      }
    });
  }

  return (
    <Card className="p-4 sm:p-5">
      <form aria-labelledby="profile-password-heading" onSubmit={save} className="space-y-4">
        <h2 id="profile-password-heading" className="flex items-center gap-2.5 text-heading-sm">
          <LockKeyhole aria-hidden="true" className="size-5 text-primary-ink" /> Palavra-passe
        </h2>
        <Input id="profile-current-password" label="Palavra-passe atual" type="password" autoComplete="current-password"
          value={currentPassword} onChange={event => { setCurrentPassword(event.target.value); setFeedback(null); }}
          required maxLength={1024} disabled={busy} />
        <Input id="profile-password" label="Nova palavra-passe" type="password" autoComplete="new-password"
          aria-describedby="profile-password-help" value={password}
          onChange={event => { setPassword(event.target.value); setConfirmationError(''); setFeedback(null); }}
          required minLength={12} maxLength={1024} disabled={busy} />
        <p id="profile-password-help" className="text-caption text-text-secondary">Use pelo menos 12 caracteres.</p>
        <Input id="profile-password-confirm" ref={confirmationInput} label="Confirmar nova palavra-passe" type="password"
          autoComplete="new-password" value={confirmation} error={confirmationError}
          onChange={event => { setConfirmation(event.target.value); setConfirmationError(''); setFeedback(null); }}
          required maxLength={1024} disabled={busy} />
        <FormFeedback feedback={feedback} />
        <Button type="submit" variant="secondary" className="min-h-11 w-full" disabled={busy || writesBlocked}>
          {busy ? 'A alterar…' : 'Alterar palavra-passe'}
        </Button>
      </form>
    </Card>
  );
}

export default function ProfilePage({ user, applicationTheme, writesBlocked, onSaved, onLogout }: ProfilePageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { busy, run } = useAsyncAction();
  const [nameDraft, setNameDraft] = useState<string>();
  const [themeDraft, setThemeDraft] = useState<ColorSchemeId | null>();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const name = nameDraft ?? user.name;
  const selectedTheme = themeDraft === undefined ? user.preferredTheme : themeDraft;
  const globalScheme = COLOR_SCHEMES.find(scheme => scheme.id === applicationTheme) ?? COLOR_SCHEMES[0];
  const choices = [{ id: null, name: 'Usar o esquema da aplicação', swatch: globalScheme.swatch }, ...COLOR_SCHEMES];
  const nameChanged = nameDraft !== undefined && name.trim() !== user.name;
  const themeChanged = selectedTheme !== user.preferredTheme;

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writesBlocked || (!nameChanged && !themeChanged)) return;

    await run(async () => {
      setFeedback(null);
      const fallback = 'Não foi possível guardar o perfil.';
      try {
        const response = await authenticatedRequest('/api/auth/profile', {
          method: 'PATCH', headers: getAuthHeaders(),
          body: JSON.stringify({ ...(nameChanged ? { name: name.trim() } : {}), ...(themeChanged ? { preferredTheme: selectedTheme } : {}) }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.success !== true || typeof result.profile?.name !== 'string') {
          throw apiRequestError(response, result, fallback);
        }
        onSaved({ name: result.profile.name, preferredTheme: normalizePreferredTheme(result.profile.preferredTheme) });
        setNameDraft(undefined);
        setThemeDraft(undefined);
        setFeedback({ message: 'Perfil atualizado.' });
      } catch (error) {
        setFeedback({ error: true, message: error instanceof Error ? error.message : fallback });
      }
    });
  }

  return (
    <section aria-labelledby="profile-heading" className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center gap-4 rounded-container border border-border-subtle bg-surface-muted px-4 py-5 sm:px-6">
        <UserInitialsBadge name={user.name} />
        <h1 id="profile-heading" ref={heading} tabIndex={-1} className="text-heading-lg focus:outline-none">Editar perfil</h1>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <form id="profile-details-form" aria-label="Dados pessoais e esquema de cores" onSubmit={save}>
            <Card className="space-y-4 p-4 sm:p-5">
              <h2 className="text-heading-sm">Dados pessoais</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Input id="profile-name" label="Nome" autoComplete="name" value={name} required minLength={2} maxLength={200}
                  onChange={event => { setNameDraft(event.target.value); setFeedback(null); }} disabled={busy} />
                <Input id="profile-email" label="Email" type="email" value={user.email ?? ''} readOnly className="bg-surface-muted" />
              </div>
            </Card>

          </form>
          <PasswordForm writesBlocked={writesBlocked} />
          <Card className="p-4 sm:p-5"><CalendarSubscriptions writesBlocked={writesBlocked} /></Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <fieldset disabled={busy} className="min-w-0">
              <legend className="mb-4 flex items-center gap-2.5 text-heading-sm">
                <Palette aria-hidden="true" className="size-5 text-primary-ink" /> Esquema de cores
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {choices.map(scheme => (
                  <label key={scheme.id ?? 'application'} className={scheme.id === null ? 'relative sm:col-span-2' : 'relative'}>
                    <input type="radio" form="profile-details-form" name="profile-color-scheme" value={scheme.id ?? 'application'}
                      checked={selectedTheme === scheme.id} className="peer sr-only"
                      onChange={() => { setThemeDraft(scheme.id); setFeedback(null); }} />
                    <span className="flex min-h-12 items-center gap-3 rounded-control border border-border px-3 py-2.5 text-body-sm font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-enabled:cursor-pointer peer-enabled:hover:bg-surface-muted peer-disabled:opacity-60">
                      <span aria-hidden="true" className="size-5 shrink-0 rounded-full border border-scrim/10" style={{ backgroundColor: scheme.swatch }} />
                      <span className="min-w-0 flex-1">
                        <span className="block">{scheme.name}</span>
                        {scheme.id === null && <span className="block text-caption text-text-secondary">{globalScheme.name}</span>}
                      </span>
                      {selectedTheme === scheme.id && <Check aria-hidden="true" className="size-4 shrink-0 text-primary-ink" />}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <FormFeedback feedback={feedback} />
            <Button type="submit" form="profile-details-form" className="ml-auto min-h-11" disabled={busy || writesBlocked || (!nameChanged && !themeChanged)}>
              {busy ? 'A guardar…' : 'Guardar'}
            </Button>
          </div>
          <Button type="button" variant="outline" className="min-h-11 w-full border-error/30 text-error hover:bg-error/10" onClick={onLogout}>
            <LogOut aria-hidden="true" className="size-4" /> Terminar sessão
          </Button>
        </div>
      </div>
    </section>
  );
}
