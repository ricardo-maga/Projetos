'use client';

import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: boolean;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, checked, disabled, id, onChange, ...props }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;
    return (
      <label 
        htmlFor={checkboxId}
        className={cn(
          "inline-flex items-center gap-3 cursor-pointer select-none group text-left",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <div className="relative flex items-center justify-center">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="sr-only"
            {...props}
          />
          <div className={cn(
            "w-5 h-5 rounded-md border border-border bg-surface transition-all flex items-center justify-center shadow-flat",
            "group-hover:border-text-disabled",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
            
            checked && "bg-primary border-primary group-hover:bg-primary-hover group-hover:border-primary-hover",
            error && "border-error group-hover:border-error"
          )}>
            {checked ? (
              <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
            ) : null}
          </div>
        </div>
        {label ? (
          <span className="text-body-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">
            {label}
          </span>
        ) : null}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
export default Checkbox;
