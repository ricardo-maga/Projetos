'use client';

import React, { useRef } from 'react';
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
export function SingleChoice({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: SingleChoiceOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex(option => option.value === value);
  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} aria-disabled={disabled} className="flex flex-wrap gap-2">
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
          className={cn('text-label border rounded-control font-semibold', option.className, index === selectedIndex && 'ring-2 ring-current')}
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
  );
}
