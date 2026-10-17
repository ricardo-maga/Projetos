import { describe, expect, it } from 'bun:test';
import { getTaskDisplayHours } from '../lib/tasks/displayHours';

describe('task list hours', () => {
  it('uses real hours times the number of assignees when filled', () => {
    expect(getTaskDisplayHours({ actualHours: '2:30', estimatedHours: '8', assigneeIds: ['a', 'b'] })).toEqual({ hours: 5, isActual: true });
  });
  it('uses planned hours when real hours are empty or zero', () => {
    expect(getTaskDisplayHours({ actualHours: '', estimatedHours: '8', assigneeIds: ['a', 'b'] })).toEqual({ hours: 8, isActual: false });
    expect(getTaskDisplayHours({ actualHours: '0', estimatedHours: '8', assigneeIds: ['a', 'b'] })).toEqual({ hours: 8, isActual: false });
    expect(getTaskDisplayHours({ actualHours: 0, estimatedHours: '6:30', assigneeIds: ['a'] })).toEqual({ hours: 6.5, isActual: false });
    expect(getTaskDisplayHours({ actualHours: '00:00', estimatedHours: '4', assigneeIds: ['a'] })).toEqual({ hours: 4, isActual: false });
  });
});
