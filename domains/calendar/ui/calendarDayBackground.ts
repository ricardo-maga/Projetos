export function calendarDayBackground(isWeekend: boolean, isSpecial: boolean): string {
  if (isSpecial) return 'bg-category-purple-100';
  return isWeekend ? 'bg-calendar-weekend' : '';
}
