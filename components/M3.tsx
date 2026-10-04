'use client';

import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Check, Loader2 } from 'lucide-react';
import { hasFilledButtonBackground } from './ui/buttonAppearance';

const classes = (...values: Parameters<typeof clsx>) => twMerge(clsx(...values));
type Tone = 'filled' | 'tonal' | 'outlined' | 'text';

export function M3Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={classes('m3-card', className)} {...props}>{children}</section>;
}

export interface M3ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  danger?: boolean;
  isLoading?: boolean;
}

export const M3Button = forwardRef<HTMLButtonElement, M3ButtonProps>(function M3Button(
  { tone = 'filled', danger = false, isLoading = false, type = 'button', className, children, disabled, ...props }, ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      data-filled={hasFilledButtonBackground(className, tone === 'filled') ? 'true' : undefined}
      disabled={disabled || isLoading}
      aria-busy={isLoading || props['aria-busy']}
      className={classes('m3-button inline-flex items-center justify-center gap-2', `m3-button--${tone}`, danger && 'm3-button--danger', className)}
    >
      {isLoading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export const M3IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function M3IconButton(
  { className, label, type = 'button', children, ...props }, ref,
) {
  return (
    <button {...props} ref={ref} type={type} className={classes('m3-icon-button inline-flex shrink-0', className)} aria-label={label} title={props.title ?? label}>
      {children}
    </button>
  );
});

export function M3SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="m3-section-header">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {actions && <div className="m3-section-header__actions">{actions}</div>}
    </div>
  );
}

interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function M3SegmentedControl<T extends string | number>({ label, value, options, onChange, className }: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={classes('m3-segmented-control', className)}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className="m3-segment"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          <span className="m3-segment__check" aria-hidden="true">{value === option.value && <Check className="h-4 w-4" />}</span>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function M3FilterChip({ selected, className, children, type = 'button', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button {...props} type={type} aria-pressed={selected} className={classes('m3-filter-chip inline-flex items-center gap-2', className)}>
      <span className="inline-flex h-4 w-4 shrink-0" aria-hidden="true">{selected && <Check className="h-4 w-4" />}</span>
      {children}
    </button>
  );
}

