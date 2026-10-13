'use client';

import { useCallback, useRef, useState } from 'react';

/** A synchronous guard prevents a second click before React renders disabled controls. */
export function useAsyncAction() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T> | T): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
