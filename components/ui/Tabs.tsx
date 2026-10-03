'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export interface TabOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabOption[];
  activeTabId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'line' | 'pill';
}

export function Tabs({ 
  tabs, 
  items, 
  activeTabId, 
  activeId, 
  onChange, 
  className, 
  variant = 'line' 
}: TabsProps & { items?: TabOption[]; activeId?: string }) {
  const effectiveTabs = tabs || items || [];
  const effectiveActiveId = activeTabId || activeId || '';

  return (
    <div 
      className={cn(
        "flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth",
        variant === 'line' ? "border-b border-border w-full" : "p-1 bg-surface-muted rounded-control border border-border",
        className
      )}
    >
      {effectiveTabs.map((tab) => {
        const isActive = tab.id === effectiveActiveId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-4 py-2.5 text-body-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-2 select-none outline-none cursor-pointer",
              variant === 'line' 
                ? isActive ? "text-primary" : "text-text-secondary hover:text-text-primary"
                : isActive ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {tab.icon ? <span className="shrink-0">{tab.icon}</span> : null}
            <span>{tab.label}</span>

            {isActive && variant === 'line' && (
              <motion.div
                layoutId="active-tab-line"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}

            {isActive && variant === 'pill' && (
              <motion.div
                layoutId="active-tab-pill"
                className="absolute inset-0 bg-surface rounded-control border border-border -z-10 shadow-raised"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
