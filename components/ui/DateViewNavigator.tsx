'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { M3Button, M3IconButton, M3SegmentedControl } from '../M3';

interface DateViewNavigatorProps<T extends 7 | 14 | 21 | 28> {
  periodDays: T;
  onPeriodDaysChange: (period: T) => void;
  periods?: readonly T[];
  navigationStepDays?: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isToday?: boolean;
  className?: string;
}

export default function DateViewNavigator<T extends 7 | 14 | 21 | 28>({
  periodDays,
  onPeriodDaysChange,
  periods = [7, 14] as T[],
  navigationStepDays = periodDays,
  onPrev,
  onNext,
  onToday,
  isToday = false,
  className = '',
}: DateViewNavigatorProps<T>) {
  return (
    <div className={cn("flex flex-wrap items-center justify-start gap-3", className)}>
      {/* Period selection on the left */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label font-bold text-text-primary">Período para visualização:</span>
        <M3SegmentedControl<T>
          label="Período de visualização"
          value={periodDays}
          onChange={onPeriodDaysChange}
          options={periods.map(value => ({ value, label: `${value} dias` }))}
        />
      </div>

      {/* Navigation immediately follows the period selection. */}
      <div role="group" aria-label="Navegação de datas" className="flex items-center gap-1">
        <M3IconButton
          onClick={onPrev}
          title={`Recuar ${navigationStepDays} dias`}
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
          title={`Avançar ${navigationStepDays} dias`}
          label="Período seguinte"
        >
          <ChevronRight className="w-4 h-4" />
        </M3IconButton>
      </div>
    </div>
  );
}


