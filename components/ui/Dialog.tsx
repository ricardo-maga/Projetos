'use client';

import React, { useEffect } from 'react';
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
}

export default function Dialog({ isOpen, onClose, title, children, className }: DialogProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
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
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className={cn(
              "relative w-full max-w-lg bg-surface border border-border rounded-dialog shadow-modal z-10 flex flex-col overflow-hidden text-left",
              className
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-muted/30">
              {title ? (
                <h2 className="text-heading-sm font-bold text-text-primary tracking-tight">
                  {title}
                </h2>
              ) : (
                <div />
              )}
              <IconButton 
                variant="ghost" 
                size="sm" 
                onClick={onClose} 
                aria-label="Close dialog"
                className="hover:bg-surface-muted hover:text-text-primary rounded-full"
              >
                <X className="w-4 h-4" />
              </IconButton>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto max-h-[70vh] text-body-sm text-text-secondary leading-relaxed">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
