'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { M3Button, M3IconButton, M3SegmentedControl } from '../M3';

interface DateViewNavigatorProps {
  periodDays: 7 | 14;
  onPeriodDaysChange: (period: 7 | 14) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  label?: string;
  isToday?: boolean;
  className?: string;
}

export default function DateViewNavigator({
  periodDays,
  onPeriodDaysChange,
  onPrev,
  onNext,
  onToday,
  label,
  isToday = false,
  className = '',
}: DateViewNavigatorProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      {/* 7 vs 14 days toggle on the Left */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label font-bold text-text-primary">Período para visualização:</span>
        <M3SegmentedControl<7 | 14>
          label="Período de visualização"
          value={periodDays}
          onChange={onPeriodDaysChange}
          options={[{ value: 7, label: '7 dias' }, { value: 14, label: '14 dias' }]}
        />
      </div>

      {/* Centralized Date Range Label if provided */}
      {label && (
        <div aria-live="polite" aria-atomic="true" className="text-label font-semibold text-text-primary px-3 py-2">
          {label}
        </div>
      )}

      {/* Navigation buttons: Prev, Today, Next on the Right */}
      <div role="group" aria-label="Navegação de datas" className="flex items-center gap-1">
        <M3IconButton
          onClick={onPrev}
          title={`Recuar ${periodDays} dias`}
          label="Período anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </M3IconButton>
        <M3Button tone="tonal"
          onClick={onToday}
          disabled={isToday}
          title="Ir para a data atual"
        >
          Hoje
        </M3Button>
        <M3IconButton
          onClick={onNext}
          title={`Avançar ${periodDays} dias`}
          label="Período seguinte"
        >
          <ChevronRight className="w-4 h-4" />
        </M3IconButton>
      </div>
    </div>
  );
}


