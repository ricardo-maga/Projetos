'use client';

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalInteraction } from '@/hooks/useModalInteraction';

interface ExpandedViewProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function ExpandedView({ open, onClose, title, children }: ExpandedViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalInteraction(open, onClose, dialogRef);

  if (!open) return <>{children}</>;
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-scrim/50 p-2 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="h-full w-full overflow-y-auto rounded-card bg-background shadow-raised outline-none">
        {children}
      </div>
    </div>, document.body,
  );
}
