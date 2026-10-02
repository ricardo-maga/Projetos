'use client';

import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export default function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-caption font-semibold rounded-badge border whitespace-nowrap",
        
        variant === 'neutral' && "bg-surface-muted text-text-secondary border-border",
        variant === 'primary' && "bg-primary/5 text-primary border-primary/20",
        variant === 'success' && "bg-success/5 text-success border-success/20",
        variant === 'warning' && "bg-warning/5 text-warning border-warning/20",
        variant === 'error' && "bg-error/5 text-error border-error/20",
        variant === 'info' && "bg-primary/5 text-primary border-primary/20",

        className
      )}
    >
      {children}
    </span>
  );
}
