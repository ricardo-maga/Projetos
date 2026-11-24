'use client';

import React, { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import IconButton from './IconButton';
import { useModalInteraction } from '@/hooks/useModalInteraction';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Dialog({ isOpen, onClose, title, headerAction, children, className, bodyClassName }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalInteraction(isOpen, onClose, dialogRef);

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
            <div className={cn('flex shrink-0 items-center justify-between p-5 border-b border-border bg-surface-muted/30', headerAction && 'gap-2')}>
              {title ? (
                <h2 id={titleId} title={headerAction ? title : undefined} className={cn('text-heading-sm font-bold text-text-primary tracking-tight',
                  headerAction && 'min-w-0 flex-1 line-clamp-2 [overflow-wrap:anywhere]')}>
                  {title}
                </h2>
              ) : (
                <div />
              )}
              {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Fechar diálogo"
                className="shrink-0 hover:bg-surface-muted hover:text-text-primary rounded-full"
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
