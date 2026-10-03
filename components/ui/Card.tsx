import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  hoverable = false,
  className = '',
  ...props
}, ref) => {
  const baseClasses = 'bg-white border border-slate-200 rounded-2xl shadow-2xs transition-all';
  const hoverClasses = hoverable ? 'hover:border-slate-300 hover:shadow-xs cursor-pointer' : '';

  return (
    <div
      ref={ref}
      className={`${baseClasses} ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';
