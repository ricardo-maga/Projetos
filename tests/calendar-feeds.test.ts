import { describe, expect, it } from 'bun:test';
import { renderCalendarFeed, taskCalendarDate, type FeedTask } from '../lib/calendarFeeds';

const base: FeedTask = {
  id: 'task-1', project_id: 'project-1', task_title: 'Instalação',
  start_date: null, end_date: null, estimated_date: '2026-10-23',
  created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-22T10:00:00Z',
  version: 2, assigneeIds: ['user-pc'],
};
const common = {
  ownerId: 'user-pc',
  projects: [{ id: 'project-1', client_id: 'client-1', install_project_no: 'IP-999999', deleted: false, updated_at: null }],
  clients: [{ id: 'client-1', client_name: 'Cliente', deleted: false, updated_at: null }],
  users: [
    { id: 'user-pc', name: 'Pedro Costa', updated_at: null },
    { id: 'user-am', name: 'Ana Martins', updated_at: null },
  ],
};

describe('calendários iCalendar', () => {
  it('usa a mesma data operacional e DTEND exclusivo', () => {
    expect(taskCalendarDate({ ...base, start_date: '2026-10-25', end_date: '2026-10-27' })).toBe('2026-10-25');
    expect(taskCalendarDate({ ...base, start_date: '2026-10-25', end_date: null })).toBe('2026-10-23');
    const ics = renderCalendarFeed({ ...common, scope: 'mine', tasks: [base] });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261023\r\nDTEND;VALUE=DATE:20261024');
    expect(ics).toContain('SUMMARY:Cliente - Instalação (IP-999999)');
    expect(ics).toContain('UID:task-1-mine@material3.calendar');
    expect(ics).toContain('SEQUENCE:2');
  });

  it('inclui todas as tarefas uma vez, com todos os responsáveis ou [-]', () => {
    const tasks = [base, { ...base, id: 'task-2', assigneeIds: ['user-pc', 'user-am'] },
      { ...base, id: 'task-3', assigneeIds: [] }];
    const ics = renderCalendarFeed({ ...common, scope: 'all', tasks });
    expect((ics.match(/BEGIN:VEVENT/g) || [])).toHaveLength(3);
    expect(ics).toContain('SUMMARY:[PC] Cliente - Instalação (IP-999999)');
    expect(ics).toContain('SUMMARY:[PC\\, AM] Cliente - Instalação (IP-999999)');
    expect(ics).toContain('SUMMARY:[-] Cliente - Instalação (IP-999999)');
  });

  it('remove tarefas sem data ou sem atribuição pessoal e reflete mudanças', () => {
    const ics = renderCalendarFeed({ ...common, scope: 'mine', tasks: [
      base, { ...base, id: 'task-2', assigneeIds: ['user-am'] },
      { ...base, id: 'task-3', estimated_date: null },
    ] });
    expect((ics.match(/BEGIN:VEVENT/g) || [])).toHaveLength(1);
    const moved = renderCalendarFeed({ ...common, scope: 'mine', tasks: [{ ...base, estimated_date: '2026-10-27', task_title: 'Arranque' }] });
    expect(moved).toContain('DTSTART;VALUE=DATE:20261027');
    expect(moved).toContain('SUMMARY:Cliente - Arranque (IP-999999)');
    expect(moved).toContain('UID:task-1-mine@material3.calendar');
  });

  it('escapa texto e dobra linhas longas sem quebrar caracteres UTF-8', () => {
    const ics = renderCalendarFeed({ ...common, scope: 'all', tasks: [
      { ...base, task_title: `Instalação, fase; 1\n${'á'.repeat(50)}` },
    ] });
    expect(ics).toContain('Instalação\\, fase\\; 1\\n');
    expect(ics).toContain('\r\n ');
    expect(ics.endsWith('\r\n')).toBe(true);
  });
});
