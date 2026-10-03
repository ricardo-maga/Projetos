'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      {/* 7 vs 14 days toggle on the Left */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-700">Datas de visualização:</span>
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => onPeriodDaysChange(7)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              periodDays === 7 
                ? 'bg-white text-slate-900 shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Modo de 7 dias"
          >
            7 Dias
          </button>
          <button
            type="button"
            onClick={() => onPeriodDaysChange(14)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              periodDays === 14 
                ? 'bg-white text-slate-900 shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Modo de 14 dias"
          >
            14 Dias
          </button>
        </div>
      </div>

      {/* Centralized Date Range Label if provided */}
      {label && (
        <div className="text-xs font-black text-slate-800 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/80">
          {label}
        </div>
      )}

      {/* Navigation buttons: Prev, Today, Next on the Right */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
        <button
          type="button"
          onClick={onPrev}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          title={`Recuar ${periodDays} dias`}
          aria-label="Período anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          disabled={isToday}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
            isToday
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-70'
              : 'hover:bg-slate-100 text-slate-700 cursor-pointer'
          }`}
          title="Ir para a data atual"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onNext}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          title={`Avançar ${periodDays} dias`}
          aria-label="Período seguinte"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

