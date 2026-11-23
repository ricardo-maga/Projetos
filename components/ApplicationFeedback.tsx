'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type DraftKind = 'project' | 'task' | 'client';

export interface FormDraft<Values = unknown> {
  kind: DraftKind;
  recordId: string | null;
  version?: number;
  projectId?: string;
  mode?: 'create' | 'edit' | 'execute';
  values: Values;
}

interface SuccessNotice {
  message: string;
  target?: { kind: 'task' | 'project'; id: string };
}

interface Feedback {
  register: (read: () => FormDraft | null) => () => void;
  resume: FormDraft | null;
  setResume: (draft: FormDraft | null) => void;
  notify: (notice: SuccessNotice) => void;
  writesBlocked: boolean;
}

const Context = createContext<Feedback | null>(null);
export const ApplicationFeedbackProvider = Context.Provider;
export const useFeedback = () => useContext(Context);

export function useApplicationFeedback(writesBlocked: boolean) {
  const readers = useRef(new Set<() => FormDraft | null>());
  const [saved, setSaved] = useState<{ userId: string; draft: FormDraft } | null>(null);
  const [resume, setResume] = useState<FormDraft | null>(null);
  const [notice, notify] = useState<SuccessNotice | null>(null);

  const register = useCallback<Feedback['register']>(read => {
    readers.current.add(read);
    return () => { readers.current.delete(read); };
  }, []);

  const capture = useCallback((userId: string) => {
    const draft = Array.from(readers.current, read => read()).reverse().find(Boolean);
    if (draft) setSaved({ userId, draft });
    setResume(null);
    notify(null);
  }, []);

  const discard = useCallback(() => {
    setSaved(null);
    setResume(null);
    notify(null);
  }, []);

  const feedback = useMemo(() => ({ register, resume, setResume, notify, writesBlocked }), [register, resume, writesBlocked]);
  return { feedback, saved, setSaved, capture, discard, notice, notify };
}

export function useFormDraft<Values>(
  kind: DraftKind,
  draft: FormDraft<Values> | null,
  restore: (draft: FormDraft<Values>) => void,
  ready = true,
) {
  const context = useFeedback();
  const register = context?.register;
  const active = !!draft;
  const latest = useRef(draft);
  const restored = useRef<FormDraft | null>(null);

  useLayoutEffect(() => { latest.current = draft; });
  useLayoutEffect(() => {
    if (active) return register?.(() => latest.current);
  }, [active, register]);

  const resume = context?.resume;
  useEffect(() => {
    if (!ready || resume?.kind !== kind || restored.current === resume) return;
    restored.current = resume;
    restore(resume as FormDraft<Values>);
    context?.setResume(null);
  }, [context, kind, ready, restore, resume]);

  return () => { latest.current = null; };
}
