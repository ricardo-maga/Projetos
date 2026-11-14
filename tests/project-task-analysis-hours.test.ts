import { describe, expect, it } from 'bun:test';
import { getProjectTaskAnalysisMinutes } from '../domains/projects/ui/ProjectSection';

describe('individual project analysis hours', () => {
  it('keeps the same workload before and after API hour normalization', () => {
    const assigneeIds = ['technician-a', 'technician-b'];
    const planned = { actualHours: null, assigneeIds };
    expect(getProjectTaskAnalysisMinutes({ ...planned, estimatedHours: '04:00' }).workload).toBe(480);
    expect(getProjectTaskAnalysisMinutes({ ...planned, estimatedHours: '4' }).workload).toBe(480);
    expect(getProjectTaskAnalysisMinutes({ ...planned, estimatedHours: '4 hours' }).workload).toBe(480);
    expect(getProjectTaskAnalysisMinutes({ ...planned, estimatedHours: '04:00:00' }).workload).toBe(480);
  });

  it('uses actual hours per technician and zero workload without technicians', () => {
    expect(getProjectTaskAnalysisMinutes({ estimatedHours: '4', actualHours: '03:00', assigneeIds: ['a', 'b'] }).workload).toBe(360);
    expect(getProjectTaskAnalysisMinutes({ estimatedHours: '4', actualHours: null, assigneeIds: [] }).workload).toBe(0);
  });
});
