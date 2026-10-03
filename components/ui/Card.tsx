import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  hoverable = false,
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-border rounded-card shadow-flat transition-all text-text-primary",
        hoverable && "hover:border-text-disabled hover:shadow-raised cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export default Card;

