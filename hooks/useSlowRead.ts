import { useEffect, useState } from 'react';
import { SLOW_READ_MS } from '@/lib/clientAuth';

export function useSlowRead(pending: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_READ_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [pending]);
  return pending && slow;
}
