import React from 'react';
import { formatHoursDisplay } from '../lib/planning/summary';

interface ResourceCapacityBarProps {
  plannedHours: number;
  capacityHours: number;
  utilizationPercent?: number;
  showDetails?: boolean;
}

export default function ResourceCapacityBar({
  plannedHours,
  capacityHours,
  utilizationPercent,
  showDetails = true,
}: ResourceCapacityBarProps) {
  const cap = Math.max(0, capacityHours);
  const plan = Math.max(0, plannedHours);
  const util = utilizationPercent !== undefined ? utilizationPercent : (cap > 0 ? (plan / cap) * 100 : (plan > 0 ? 999 : 0));
  const isOver = cap > 0 && plan > cap;
  const excess = isOver ? plan - cap : 0;
  const isZeroCap = cap === 0;

  const percentBar = isZeroCap ? 0 : Math.min(100, (plan / cap) * 100);

  let barColor = 'bg-blue-600';
  if (isZeroCap) {
    barColor = 'bg-slate-300';
  } else if (isOver) {
    barColor = 'bg-amber-500';
  } else if (util >= 100) {
    barColor = 'bg-emerald-600';
  }

  return (
    <div className="space-y-1 w-full">
      {showDetails && (
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
          <span>
            {isZeroCap ? (
              <strong className="text-slate-400 uppercase tracking-wider text-[10px]">Indisponível</strong>
            ) : (
              <>
                <strong className="text-slate-900">{formatHoursDisplay(plan)}</strong> / {formatHoursDisplay(cap)}
              </>
            )}
          </span>
          <span className={isOver ? 'text-amber-700 font-bold' : 'text-slate-600'}>
            {isZeroCap ? 'N/A' : `${Math.round(util)}%`}
            {isOver && <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold">+{(excess).toFixed(1)}h</span>}
          </span>
        </div>
      )}
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentBar}%` }}
        />
      </div>
    </div>
  );
}
