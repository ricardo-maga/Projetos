'use client';

import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, variant = 'primary', size = 'md', isLoading, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Base styles with focused and animated transitions
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 outline-none select-none active:scale-[0.98] whitespace-nowrap",
          "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
          "disabled:opacity-50 disabled:pointer-events-none disabled:scale-100",
          
          // Variants
          variant === 'primary' && "bg-primary text-white hover:bg-primary-hover active:bg-primary-active border border-transparent shadow-raised",
          variant === 'secondary' && "bg-surface-muted text-text-primary hover:bg-border border border-border shadow-raised",
          variant === 'outline' && "bg-transparent text-text-primary border border-border hover:bg-surface-muted",
          variant === 'danger' && "bg-error text-white hover:opacity-90 border border-transparent shadow-raised",
          variant === 'success' && "bg-success text-white hover:opacity-90 border border-transparent shadow-raised",
          variant === 'ghost' && "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary border border-transparent",

          // Sizes (md satisfies 44-48px height standard perfectly for modern web/touch apps)
          size === 'sm' && "h-9 px-3 text-body-sm rounded-control",
          size === 'md' && "h-11 px-5 text-body rounded-control",
          size === 'lg' && "h-12 px-6 text-heading-sm rounded-control",
          
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
