import type { CSSProperties, ReactNode } from 'react';

/** Preserve category spacing while keeping narrow screens scrollable by keyboard. */
export function ScrollableChart({ label, categoryCount, children }: {
  label: string;
  categoryCount: number;
  children: ReactNode;
}) {
  return <div role="region" aria-label={label} tabIndex={0}
    className="w-full overflow-x-auto mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <div className="chart-categorical-plot" data-empty={categoryCount === 0}
      style={{ '--chart-category-count': Math.max(1, categoryCount) } as CSSProperties}>
      {children}
    </div>
  </div>;
}
