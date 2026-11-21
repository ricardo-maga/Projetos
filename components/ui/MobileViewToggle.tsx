'use client';

import { Button } from './Button';

export default function MobileViewToggle({ grid, onChange, label }: {
  grid: boolean; onChange: (grid: boolean) => void; label: string;
}) {
  return <div role="group" aria-label={`Apresentação do ${label}`} className="mobile-controls flex flex-wrap gap-2 md:hidden">
    <Button type="button" variant={grid ? 'outline' : 'primary'} aria-pressed={!grid} onClick={() => onChange(false)}>Vista móvel</Button>
    <Button type="button" variant={grid ? 'primary' : 'outline'} aria-pressed={grid} onClick={() => onChange(true)}>Grelha completa</Button>
  </div>;
}
