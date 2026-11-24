// Synthetic browser fixture for the real operational screens. No real account or backend.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TaskSection from '../../domains/tasks/ui/TaskSection';
import ProjectSection from '../../domains/projects/ui/ProjectSection';
import CalendarSubscriptions from '../../domains/calendar/ui/CalendarSubscriptions';
import CalendarSection from '../../domains/calendar/ui/CalendarSection';
import BentoDashboard from '../../domains/monitoring/ui/BentoDashboard';
import { formatDateToYYYYMMDD, addCivilDays } from '../../domains/calendar/modules/operationalCalendar';

const today = formatDateToYYYYMMDD(new Date());
const permissions = ['projects.read', 'projects.write', 'projects.delete', 'tasks.read', 'tasks.write', 'tasks.delete', 'calendar.read', 'calendar.write'];
const scenario = new URLSearchParams(location.search);
const readonly = scenario.has('readonly');
const planningScenario = scenario.has('provisoria');
const currentUser = { id: 'mobile-qa-user', name: 'Ana de exemplo', roleId: 'qa-team', roleIds: ['qa-team'], type: 'Team', deleted: false,
  permissions: readonly ? permissions.filter(permission => permission.endsWith('.read')) : permissions };
const users = [currentUser, { ...currentUser, id: 'mobile-qa-second', name: 'Técnico com nome bastante comprido para testar a apresentação' }];
const clients = [{ id: 'qa-client', clientName: 'Indústria alimentar de exemplo com designação extensa', deleted: false }];
const projectStatuses = [{ id: 'ps-2', name: 'Em curso', scale: 2, color: 'azul' }];
const taskStatuses = [{ id: 'ts-1', name: 'Planeada', scale: 1, color: 'azul' }, { id: 'ts-3', name: 'Concluída', scale: 3, color: 'verde' }];
const projects: any[] = Array.from({ length: 27 }, (_, i) => ({ id: `qa-project-${i}`, title: i === 0 ? 'Linha de embalagem com título extenso e identificação industrial' : `Projeto de exemplo ${i}`,
  clientId: 'qa-client', statusId: 'ps-2', installProjectNo: `IP-${i}`, deleted: false, projectManagerId: currentUser.id,
  startDate: today, deliveryDate: addCivilDays(today, 5), scheduledDate: addCivilDays(today, 3), forecastDate: i === 0 ? `${today.slice(0, 7)}-01` : '', priorityId: '', categoryIds: [], teamsInvolvedIds: [], partnersIds: [], description: '' }));
const tasks: any[] = Array.from({ length: 27 }, (_, i) => ({ id: `qa-task-${i}`, title: i === 0 ? 'Afinação do equipamento e verificação dos sensores com título extenso' : `Tarefa de exemplo ${i}`,
  projectId: i === 2 ? null : projects[0].id, statusId: 'ts-1', estimatedDate: i === 1 ? '' : today, estimatedHours: '02:30', actualHours: '',
  startDate: i === 3 ? today : '', endDate: i === 3 ? addCivilDays(today, 2) : '', assigneeIds: i === 1 ? [] : [currentUser.id], deleted: false, description: '' }));
const absences: any[] = [{ id: 'qa-absence', userId: currentUser.id, absenceStartDate: today, absenceEndDate: today, reason: 'Férias de exemplo', deleted: false }];
const deliveredProjects = [
  { ...projects[0], id: 'qa-delivered', title: 'Linha entregue com dois ajustes', statusId: 'ps-5', forecastDate: '' },
  { ...projects[1], id: 'qa-delivered-second', title: 'Instalação entregue com um ajuste', statusId: 'ps-5', forecastDate: '' },
];
const pendingTasks = tasks.slice(0, 3).map((task, index) => ({
  ...task,
  projectId: deliveredProjects[index === 2 ? 1 : 0].id,
}));
localStorage.setItem(`task-calendar-selected-users-v1:${currentUser.id}`, JSON.stringify(users.map(user => user.id)));

// Only the component's paginated read is simulated. Unexpected requests fail visibly.
const browserFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  if (url.pathname.startsWith('/api/calendar/subscriptions/')) return browserFetch(input, init);
  if (url.pathname === '/api/v1/projects') {
    const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('pageSize') || 25);
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const filtered = projects.filter(project => !search || `${project.title} ${project.installProjectNo}`.toLowerCase().includes(search));
    return new Response(JSON.stringify({ success: true, data: filtered.slice((page - 1) * limit, page * limit), total: filtered.length }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected fixture request: ${url.pathname}`);
};

function Preview() {
  const [screen, setScreen] = useState('Tarefas');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [planningTasks, setPlanningTasks] = useState(() => [
    { ...tasks[0], title: 'Instalação confirmada', taskTypeId: 'qa-type', estimatedHours: '3', planningStatus: 'planned' },
  ]);
  const addPlanningTask = async (payload: any) => {
    const task = { ...payload, id: 'qa-reserve', deleted: false };
    setPlanningTasks(previous => [...previous, task]);
    return task;
  };
  const updatePlanningTask = async (id: string, updates: any) => {
    const updated = { ...planningTasks.find(task => task.id === id), ...updates };
    setPlanningTasks(previous => previous.map(task => task.id === id ? updated : task));
    return updated;
  };
  const noop = () => {};
  const shared = { projects, tasks: planningScenario ? planningTasks : tasks, clients, users, taskStatuses, projectStatuses, currentUser,
    absences: planningScenario ? [] : absences,
    riskStatuses: [{ id: 'risk-open', name: 'Aberto', scale: 1, deleted: false }],
    projectRiskItems: [{ id: 'qa-risk', projectId: projects[0].id, title: 'Risco de exemplo', probability: 5, impact: 4, statusId: 'risk-open', deleted: false } as any],
    appConfig: { taskAssigneeGroupIds: ['qa-team'] }, userGroups: [{ id: 'qa-team', name: 'Equipa', deleted: false }],
    taskTypes: planningScenario ? [{ id: 'qa-type', name: 'Instalação', scale: 1 }] : [],
    addTask: planningScenario ? addPlanningTask : noop, updateTask: planningScenario ? updatePlanningTask : noop, deleteTask: async () => { setAction('Tarefa eliminada'); return true; } };
  if (scenario.has('subscricoes')) return <main className="bg-background p-4"><CalendarSubscriptions /></main>;
  return <main id="main-root" data-theme="violet" className="min-w-0 bg-background p-4 text-text-primary">
    <nav aria-label="Ecrã de teste" className="mb-4 flex flex-wrap gap-2">{['Tarefas', 'Projetos', 'Calendário', 'Dashboard'].map(label => <button key={label} className="min-h-11 rounded-control border border-border px-3" onClick={() => setScreen(label)}>{label}</button>)}</nav>
    <output>{action}</output>
    {screen === 'Tarefas' && <TaskSection {...shared} />}
    {screen === 'Projetos' && <ProjectSection {...shared} comments={[]} projectCategories={[]} projectRisks={[]} projectPriorities={[]} projectTeams={[]} projectPartners={[]}
      selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} addProject={noop} updateProject={noop} deleteProject={noop} addClient={noop} addComment={noop} deleteComment={noop} />}
    {screen === 'Calendário' && <CalendarSection {...shared} specialDays={[{ id: 'qa-special', date: today, name: 'Dia especial de exemplo' } as any]} onSelectProject={id => { setAction(`Projeto ${id}`); }} />}
    {screen === 'Dashboard' && <BentoDashboard {...shared} projects={[projects[0], ...deliveredProjects]} tasks={pendingTasks}
      projectStatuses={[...projectStatuses, { id: 'ps-5', name: 'Entregue', scale: 5, color: 'verde' }]}
      comments={[]} projectCategories={[]} projectPriorities={[]} onNavigate={noop}
      onSelectProject={id => setAction(`Projeto ${id}`)} onSelectTask={id => setAction(`Tarefa ${id}`)} />}
  </main>;
}
createRoot(document.getElementById('preview')!).render(<Preview />);
