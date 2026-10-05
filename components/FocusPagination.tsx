'use client';
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { Select } from './ui/Select';
import { readFocusPagination, type FocusPageSize, type FocusPaginationPreference } from '../lib/myFocus';

export const FOCUS_TASK_SIZES: FocusPageSize[] = [5, 10, 20, 'all'];
export const FOCUS_PROJECT_SIZES: FocusPageSize[] = [5, 10, 'all'];
export function useFocusPagination(userId: string, section: string, defaultSize: FocusPageSize, allowed: FocusPageSize[]) {
  const key = `focus_pagination_${userId}_${section}`;
  const [preference, setPreference] = useState<FocusPaginationPreference>({ size: defaultSize, page: 1 });
  useEffect(() => {
    try { setPreference(readFocusPagination(localStorage.getItem(key), defaultSize, allowed)); }
    catch { setPreference({ size: defaultSize, page: 1 }); }
  }, [key, defaultSize, allowed]);
  const update = (next: FocusPaginationPreference) => {
    setPreference(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep preferences in memory when storage is unavailable. */ }
  };
  return { preference, update };
}
export function FocusPagination({ label, total, page, pages, preference, allowed, update }: {
  label: string; total: number; page: number; pages: number; preference: FocusPaginationPreference; allowed: FocusPageSize[];
  update: (next: FocusPaginationPreference) => void;
}) {
  return <div className="p-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3"><span className="text-caption text-text-secondary">{total} {label}</span>
      <Select aria-label={`Número de ${label} por página`} className="h-9" value={String(preference.size)}
        onChange={e => update({ size: e.target.value === 'all' ? 'all' : Number(e.target.value) as FocusPageSize, page: 1 })}
        options={allowed.map(size => ({ value: String(size), label: size === 'all' ? 'Todos' : String(size) }))} />
    </div>
    <nav aria-label={`Paginação de ${label}`} className="flex items-center gap-2">
      <IconButton size="sm" aria-label={`Página anterior de ${label}`} disabled={page <= 1} onClick={() => update({ ...preference, page: page - 1 })}><ChevronLeft className="w-4 h-4" /></IconButton>
      <span className="text-caption text-text-secondary" aria-live="polite">{page} / {pages}</span>
      <IconButton size="sm" aria-label={`Página seguinte de ${label}`} disabled={page >= pages} onClick={() => update({ ...preference, page: page + 1 })}><ChevronRight className="w-4 h-4" /></IconButton>
    </nav>
  </div>;
}
