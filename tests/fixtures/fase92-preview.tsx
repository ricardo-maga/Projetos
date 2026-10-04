// Local browser QA only. All task updates are in-memory; no API/auth/database calls.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TaskDetailsModal, { TaskModalMode } from '../../components/TaskDetailsModal';
import { Button } from '../../components/ui/Button';
import type { Task, User } from '../../lib/types';

const users: User[] = [
  { id: 'qa-ana', name: 'Ana Exemplo', email: 'ana@example.invalid', type: 'Team', roleId: 'qa-team', approved: true, deleted: false, createdDate: '2026-10-04' },
  { id: 'qa-pedro', name: 'Pedro Exemplo', email: 'pedro@example.invalid', type: 'Team', roleId: 'qa-team', approved: true, deleted: false, createdDate: '2026-10-04' },
];
const statuses = [
  { id: 'ts-1', name: 'A preparar', color: 'laranja', scale: 1 },
  { id: 'ts-2', name: 'Em execução', color: 'vermelho', scale: 2 },
  { id: 'ts-3', name: 'Validada', color: 'azul', scale: 3 },
];
function Preview() {
  const [mode, setMode] = useState<TaskModalMode>('execute');
  const [open, setOpen] = useState(true);
  const [payload, setPayload] = useState('Ainda não submetido');
  const [task, setTask] = useState<Task>({ id: 'qa-task', projectId: null, title: 'Tarefa de demonstração', description: 'Planeamento bloqueado no modo Execute.', statusId: 'ts-1', taskTypeId: 'qa-type', estimatedDate: '2026-10-04', estimatedHours: '8', actualHours: '2', startDate: '2026-10-04', startTime: '09:00', endDate: '2026-10-04', endTime: '11:00', notes: 'Registo de execução', assigneeIds: ['qa-ana'], deleted: false, createdDate: '2026-10-04', version: 7 });
  return <div id="main-root" data-active-tab="tarefas" className="min-h-screen p-6">
    <div className="flex gap-2">{(['execute', 'edit', 'view'] as const).map(value => <Button key={value} onClick={() => { setMode(value); setOpen(true); }}>{value}</Button>)}</div>
    <pre className="mt-6 text-body-sm" aria-label="Payload de demonstração">{payload}</pre>
    <TaskDetailsModal isOpen={open} mode={mode} task={task} taskStatuses={statuses} taskTypes={[{ id: 'qa-type', name: 'Instalação', scale: 1 }]} users={users} userGroups={[{ id: 'qa-team', name: 'Técnicos' }]} appConfig={{ taskAssigneeGroupIds: ['qa-team'] }} projects={[]} clients={[]} onClose={() => setOpen(false)} updateTask={async (_id, updates) => {
      setPayload(JSON.stringify(updates, null, 2));
      const updated = { ...task, ...updates, version: (task.version || 1) + 1 };
      setTask(updated);
      return updated;
    }} />
  </div>;
}
createRoot(document.getElementById('preview')!).render(<Preview />);
