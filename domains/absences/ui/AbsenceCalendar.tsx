'use client';

import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SpecialDay, UserAbsence } from '@/lib/types';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import IconButton from '@/components/ui/IconButton';
import { M3SectionHeader } from '@/components/M3';

type CalendarUser = { id: string; name: string };

interface AbsenceCalendarProps {
  absences: UserAbsence[];
  users: CalendarUser[];
  specialDays?: SpecialDay[];
  userIdFilter?: string | 'all';
  className?: string;
  variant?: 'default' | 'dashboard';
  footer?: ReactNode;
}

export default function AbsenceCalendar({
  absences, users, specialDays = [], userIdFilter = 'all', className = '', variant = 'default', footer,
}: AbsenceCalendarProps) {
  const [currentCalendarDate, setCurrentCalendarDate] = useState(() => new Date());
  const calendarAbsences = useMemo(() => userIdFilter === 'all'
    ? absences
    : absences.filter(absence => absence.userId === userIdFilter), [absences, userIdFilter]);
  const userNames = useMemo(() => new Map(users.map(user => [user.id, user.name])), [users]);
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const startingDayOfWeek = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const getUserColorClass = (uid: string) => {
    const colors = [
      'bg-primary/10 text-primary-ink border-primary/20',
      'bg-brand-green/10 text-success-strong border-brand-green/20',
      'bg-surface-muted text-text-primary border-border',
    ];
    let hash = 0;
    for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const cells = [];
  const totalCells = Math.ceil((startingDayOfWeek + totalDaysInMonth) / 7) * 7;
  for (let index = 0; index < totalCells; index++) {
    const currentDate = new Date(year, month, index - startingDayOfWeek + 1);
    const day = currentDate.getDate();
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isOutsideMonth = currentDate.getMonth() !== month;
    const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
    const specialDay = specialDays.find(item => item.date === dateStr);
    const dayAbsences = calendarAbsences.filter(absence => absence.absenceStartDate <= dateStr && absence.absenceEndDate >= dateStr);
    cells.push(
      <div key={dateStr} data-date={dateStr} data-outside-month={isOutsideMonth} className={`min-h-[80px] p-1.5 border-b border-r border-border relative transition-colors flex flex-col justify-between ${isOutsideMonth ? 'bg-surface-muted hover:bg-surface-muted' : `hover:bg-surface-muted/50 ${isWeekend || specialDay ? 'bg-surface-muted/60' : 'bg-surface'}`}`}>
        <div className="flex justify-between items-start mb-1 select-none">
          <time dateTime={dateStr} title={new Intl.DateTimeFormat('pt-PT', { dateStyle: 'long' }).format(currentDate)} className={`inline-flex items-center justify-center w-7 h-7 text-center rounded-full font-bold text-caption ${dateStr === todayStr ? 'bg-primary text-inverse font-black' : isOutsideMonth ? 'text-text-muted' : 'text-text-secondary'}`}>
            {day}
          </time>
          {specialDay && <span className="text-caption font-extrabold text-text-primary bg-warning/10 border border-warning/20 px-1 py-0.5 rounded-badge truncate max-w-[50px]" title={specialDay.name}>{specialDay.name}</span>}
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {dayAbsences.map(absence => {
            const name = userNames.get(absence.userId) || 'Utilizador';
            const initials = name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
            return <span key={absence.id} className={`inline-flex items-center justify-center w-5 h-5 text-caption font-bold rounded-full border transition-all cursor-help ${getUserColorClass(absence.userId)}`} title={`${name} (Ausente: ${absence.absenceStartDate} a ${absence.absenceEndDate})`}>{initials}</span>;
          })}
        </div>
      </div>
    );
  }

  return (
    <Card className={`${variant === 'dashboard' ? 'p-5' : 'p-4 sm:p-5'} space-y-4 min-w-0 ${className}`}>
      <div className={variant === 'dashboard'
        ? 'flex flex-wrap justify-between items-start gap-x-4 gap-y-3'
        : 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4'}>
        {variant === 'dashboard'
          ? <h3 className="text-heading-sm text-text-primary">Calendário mensal de ausências</h3>
          : <M3SectionHeader title="Calendário mensal" description="Ausências registadas." />}
        <div className="flex flex-wrap items-center gap-2 select-none">
          <IconButton size="sm" aria-label="Mês anterior" onClick={() => setCurrentCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} title="Mês anterior"><ChevronLeft className="w-4 h-4" /></IconButton>
          <span className="text-body-sm font-bold text-text-secondary min-w-[130px] text-center uppercase tracking-wider">
            {new Intl.DateTimeFormat('pt', { month: 'long', year: 'numeric' }).format(currentCalendarDate)}
          </span>
          <IconButton size="sm" aria-label="Mês seguinte" onClick={() => setCurrentCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} title="Mês seguinte"><ChevronRight className="w-4 h-4" /></IconButton>
          <Button variant="secondary" size="sm" onClick={() => setCurrentCalendarDate(new Date())}>Hoje</Button>
        </div>
      </div>
      <div className="bg-surface border border-border rounded-control overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-caption font-bold text-text-secondary uppercase text-center select-none">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day} className="py-2 border-r border-border last:border-0">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 text-body-sm">{cells}</div>
      </div>
      {footer}
    </Card>
  );
}
