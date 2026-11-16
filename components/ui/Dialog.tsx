'use client';

import React, { useEffect, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import IconButton from './IconButton';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

let openDialogs: HTMLElement[] = [];
let previousBodyOverflow = '';
const focusableSelector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export function Dialog({ isOpen, onClose, title, children, className, bodyClassName }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!openDialogs.length) previousBodyOverflow = document.body.style.overflow;
    openDialogs.push(dialog);
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => element.getClientRects().length);
    (controls()[0] || dialog).focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      openDialogs = openDialogs.filter(element => element !== dialog);
      if (!openDialogs.length) document.body.style.overflow = previousBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-scrim/40 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Diálogo'}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className={cn(
              "relative min-w-0 w-full max-w-lg max-h-[calc(100dvh-2rem)] bg-surface border border-border rounded-dialog shadow-modal z-10 flex flex-col overflow-hidden text-left",
              className
            )}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between p-5 border-b border-border bg-surface-muted/30">
              {title ? (
                <h2 id={titleId} className="text-heading-sm font-bold text-text-primary tracking-tight">
                  {title}
                </h2>
              ) : (
                <div />
              )}
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Fechar diálogo"
                className="hover:bg-surface-muted hover:text-text-primary rounded-full"
              >
                <X className="w-4 h-4" />
              </IconButton>
            </div>

            {/* Content Body */}
            <div className={cn("min-h-0 p-6 overflow-y-auto text-body-sm text-text-secondary leading-relaxed", bodyClassName)}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Dialog;
