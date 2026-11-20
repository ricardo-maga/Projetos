'use client';

import { useEffect, useRef, useState } from 'react';
import MarkdownContent from './MarkdownContent';

export default function MarkdownBody({ text, collapsible = false }: { text: string; collapsible?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !collapsible) return;
    const measure = () => setOverflowing(content.scrollHeight > content.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text, expanded, collapsible]);

  return (
    <div className="min-w-0">
      <div ref={contentRef} className={`min-w-0 break-words text-text-secondary [overflow-wrap:anywhere] ${collapsible && !expanded ? 'max-h-28 overflow-hidden' : ''}`}>
        <MarkdownContent text={text} />
      </div>
      {collapsible && (overflowing || expanded) && (
        <button type="button" onClick={() => setExpanded(value => !value)} className="mt-1 text-caption font-semibold text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-primary">
          {expanded ? 'Mostrar menos' : 'Mostrar mais'}
        </button>
      )}
    </div>
  );
}
