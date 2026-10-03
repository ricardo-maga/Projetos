'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

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
      <div className="flex items-center gap-2">
        <span className="text-label font-bold text-text-primary">Datas de visualização:</span>
        <div className="flex items-center bg-surface-muted p-1 rounded-control border border-border">
          <button
            type="button"
            onClick={() => onPeriodDaysChange(7)}
            className={cn(
              "px-3 py-1.5 rounded-control text-label font-bold transition-all cursor-pointer",
              periodDays === 7 
                ? 'bg-surface text-text-primary shadow-raised border border-border' 
                : 'text-text-secondary hover:text-text-primary'
            )}
            title="Modo de 7 dias"
          >
            7 Dias
          </button>
          <button
            type="button"
            onClick={() => onPeriodDaysChange(14)}
            className={cn(
              "px-3 py-1.5 rounded-control text-label font-bold transition-all cursor-pointer",
              periodDays === 14 
                ? 'bg-surface text-text-primary shadow-raised border border-border' 
                : 'text-text-secondary hover:text-text-primary'
            )}
            title="Modo de 14 dias"
          >
            14 Dias
          </button>
        </div>
      </div>

      {/* Centralized Date Range Label if provided */}
      {label && (
        <div className="text-label font-bold text-text-primary bg-surface-muted/80 px-3 py-1.5 rounded-control border border-border">
          {label}
        </div>
      )}

      {/* Navigation buttons: Prev, Today, Next on the Right */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-control p-0.5 shadow-flat">
        <button
          type="button"
          onClick={onPrev}
          className="p-1.5 hover:bg-surface-muted rounded-control text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          title={`Recuar ${periodDays} dias`}
          aria-label="Período anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          disabled={isToday}
          className={cn(
            "px-3 py-1 rounded-control text-label font-bold transition-colors",
            isToday
              ? 'bg-surface-muted text-text-disabled cursor-not-allowed opacity-70'
              : 'hover:bg-surface-muted text-text-secondary hover:text-text-primary cursor-pointer'
          )}
          title="Ir para a data atual"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onNext}
          className="p-1.5 hover:bg-surface-muted rounded-control text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          title={`Avançar ${periodDays} dias`}
          aria-label="Período seguinte"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}


