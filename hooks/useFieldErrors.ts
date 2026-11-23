import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ClientRequestError } from '@/lib/clientAuth';

export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  function show(fields: Record<string, string>) {
    pendingFocus.current = true;
    setErrors(fields);
  }

  function showApiError(error: unknown) {
    if (!(error instanceof ClientRequestError)) return false;
    const fields = Object.entries(error.fieldErrors).filter(([name, messages]) =>
      messages[0] && (form.current?.elements.namedItem(name) ||
        Array.from(form.current?.querySelectorAll<HTMLElement>('[data-field]') || []).some(el => el.dataset.field === name)));
    if (!fields.length) return false;
    show(Object.fromEntries(fields.map(([name, messages]) => [name, messages[0]])));
    return true;
  }

  function clear() {
    setErrors(previous => Object.keys(previous).length ? {} : previous);
  }

  function clearChanged(event: FormEvent<HTMLFormElement>) {
    const name = (event.target as HTMLInputElement).name;
    clearField(name);
  }

  function clearField(name: string) {
    if (!name || !errors[name]) return;
    setErrors(previous => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }

  return { errors, form, show, showApiError, clear, clearField, clearChanged };
}
