'use client';

import React, { useId, useRef } from 'react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

export interface SingleChoiceOption {
  value: string;
  label: string;
  className?: string;
}

export function getNextChoiceIndex(key: string, index: number, count: number): number | undefined {
  if (!count) return undefined;
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (index + 1) % count;
    case 'ArrowLeft': case 'ArrowUp': return (index + count - 1) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return undefined;
  }
}

// Native buttons with radio semantics: one tab stop, arrow navigation and a
// stable border/ring geometry. Domain colors are supplied by the caller.
export function SingleChoice({ label, value, options, onChange, disabled = false, field, error }: {
  label: string;
  value: string;
  options: SingleChoiceOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  field?: string;
  error?: string;
}) {
  const errorId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex(option => option.value === value);
  return (
    <>
    <div ref={groupRef} role="radiogroup" aria-label={label} aria-disabled={disabled} data-field={field}
      aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
      tabIndex={error ? -1 : undefined} className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <Button
          key={option.value}
          type="button"
          variant="outline"
          size="sm"
          role="radio"
          aria-checked={index === selectedIndex}
          tabIndex={index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1}
          disabled={disabled}
          className={cn('max-w-full min-w-0 h-auto min-h-9 whitespace-normal break-words text-label border rounded-control font-semibold', option.className, index === selectedIndex && 'ring-2 ring-current')}
          onClick={() => { if (!disabled) onChange(option.value); }}
          onKeyDown={event => {
            if (disabled || !options.length) return;
            const next = getNextChoiceIndex(event.key, index, options.length);
            if (next === undefined) return;
            event.preventDefault();
            onChange(options[next].value);
            groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
    {error && <p id={errorId} className="text-caption text-error">{error}</p>}
    </>
  );
}
