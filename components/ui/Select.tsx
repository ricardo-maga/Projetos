'use client';

import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options = [], children, disabled, id, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    return (
      <div className="w-full space-y-1.5 text-left">
        {label ? (
          <label 
            htmlFor={selectId} 
            className="block text-label font-semibold text-text-secondary select-none"
          >
            {label}
          </label>
        ) : null}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={cn(
              "w-full h-11 px-3.5 pr-10 text-body bg-surface text-text-primary rounded-control border border-border shadow-flat transition-all outline-none appearance-none cursor-pointer",
              "hover:border-text-disabled",
              "focus:border-primary focus:ring-2 focus:ring-primary/20",
              "disabled:bg-surface-muted disabled:text-text-disabled disabled:border-border disabled:pointer-events-none disabled:cursor-not-allowed",
              
              error && "border-error hover:border-error focus:border-error focus:ring-error/20",
              
              className
            )}
            {...props}
          >
            {children || options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Custom Chevron indicator */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-text-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error ? (
          <p className="text-caption text-error font-medium animate-fade-in">{error}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
export default Select;
