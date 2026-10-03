'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export default function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  const generatedId = React.useId();
  const switchId = id || generatedId;

  return (
    <label
      htmlFor={switchId}
      className={cn(
        "inline-flex items-center gap-3 cursor-pointer select-none group text-left",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
    >
      <div className="relative">
        <input
          type="checkbox"
          id={switchId}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        {/* Track */}
        <div className={cn(
          "w-11 h-6 rounded-full transition-colors duration-200 shadow-flat border border-transparent",
          checked ? "bg-primary" : "bg-border-token bg-neutral-200"
        )}>
          {/* Thumb */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="w-5 h-5 rounded-full bg-white shadow-raised mt-0.5 ml-0.5"
            animate={{ x: checked ? 20 : 0 }}
          />
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
