'use client';

import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  success?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, success, disabled, id, rows = 4, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    return (
      <div className="w-full space-y-1.5 text-left">
        {label ? (
          <label 
            htmlFor={textareaId} 
            className="block text-label font-semibold text-text-secondary select-none"
          >
            {label}
          </label>
        ) : null}
        <div className="relative">
          <textarea
            ref={ref}
            id={textareaId}
            rows={rows}
            disabled={disabled}
            className={cn(
              "w-full p-3.5 text-body bg-surface text-text-primary rounded-control border border-border shadow-flat transition-all outline-none resize-none",
              "placeholder:text-text-disabled",
              "hover:border-text-disabled",
              "focus:border-primary focus:ring-2 focus:ring-primary/20",
              "disabled:bg-surface-muted disabled:text-text-disabled disabled:border-border disabled:pointer-events-none",
              
              // Error state
              error && "border-error hover:border-error focus:border-error focus:ring-error/20",
              
              // Success state
              success && !error && "border-success hover:border-success focus:border-success focus:ring-success/20",
              
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-caption text-error font-medium animate-fade-in">{error}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
