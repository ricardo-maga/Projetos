'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { getUserInitials } from '@/lib/utils';

export default function TimelineAbsenceBadge({ name, description }: {
  name: string; description: string;
}) {
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const show = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) { setPosition(null); return; }
    const above = window.innerHeight - rect.bottom < 160;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)), top: above ? rect.top - 6 : rect.bottom + 6, above });
  }, []);
  const open = !!position;
  useEffect(() => {
    if (!open) return;
    const reposition = () => show();
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open, show]);

  return <>
    <Button ref={trigger} variant="ghost" size="sm" aria-label={description}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}
      onClick={show}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setPosition(null); } }}
      className="w-full min-h-6 h-auto px-0 py-0.5 border rounded-control bg-surface-muted text-text-secondary border-border">
      <span className="w-5 h-5 rounded-full bg-primary text-inverse flex items-center justify-center text-micro font-bold shrink-0" aria-hidden="true">{getUserInitials(name)}</span>
    </Button>
    {position && createPortal(<div id={tooltipId} role="tooltip"
      className="fixed z-[100] w-72 max-w-[calc(100vw-16px)] rounded-control bg-text-primary text-inverse px-3 py-2 text-caption shadow-raised pointer-events-none"
      style={{ left: position.left, top: position.top, transform: position.above ? 'translateY(-100%)' : undefined }}>{description}</div>, document.body)}
  </>;
}
