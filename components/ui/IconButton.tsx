'use client';

import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, children, variant = 'ghost', size = 'md', isLoading, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center transition-all duration-200 outline-none select-none rounded-control active:scale-[0.95]",
          "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
          "disabled:opacity-50 disabled:pointer-events-none disabled:scale-100",
          
          variant === 'primary' && "bg-primary text-white hover:bg-primary-hover active:bg-primary-active shadow-raised",
          variant === 'secondary' && "bg-surface-muted text-text-primary hover:bg-border border border-border shadow-raised",
          variant === 'outline' && "bg-transparent text-text-primary border border-border hover:bg-surface-muted",
          variant === 'ghost' && "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary",
          variant === 'danger' && "bg-error text-white hover:opacity-90 shadow-raised",

          // Sizing with exact aspect ratios ensuring compliant touch targets (sm=36px, md=44px, lg=48px)
          size === 'sm' && "w-9 h-9 text-body-sm",
          size === 'md' && "w-11 h-11 text-body",
          size === 'lg' && "w-12 h-12 text-heading-sm",

          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
        ) : (
          children
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };
export default IconButton;
