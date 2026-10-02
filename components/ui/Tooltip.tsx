'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export default function Tooltip({ children, content, position = 'top', className }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={cn(
              "absolute z-50 px-2.5 py-1.5 text-caption font-medium text-white bg-text-primary rounded-badge shadow-raised whitespace-nowrap pointer-events-none",
              
              position === 'top' && "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
              position === 'bottom' && "top-full left-1/2 -translate-x-1/2 mt-1.5",
              position === 'left' && "right-full top-1/2 -translate-y-1/2 mr-1.5",
              position === 'right' && "left-full top-1/2 -translate-y-1/2 ml-1.5",

              className
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
