'use client';
import React, { useState } from 'react';
import { CalendarDays, GanttChart } from 'lucide-react';
import type { Project, Task, UserAbsence, User, Client, SpecialDay, ProjectRiskItem, TaskType } from '../lib/types';
import { hasPermission } from '../lib/permissions';
import OperationalUserCalendar from './OperationalUserCalendar';
import TaskDetailsModal from './TaskDetailsModal';
import { Tabs } from './ui/Tabs';
import ProjectTimeline from './ProjectTimeline';
import { Card } from './ui/Card';

interface CalendarSectionProps {
  projects: Project[]; tasks: Task[]; absences: UserAbsence[]; users: User[]; clients: Client[];
  specialDays?: SpecialDay[]; projectRiskItems?: ProjectRiskItem[]; projectStatuses?: any[];
  onSelectProject?: (id: string) => void;
  addTask?: (task: any) => any; updateTask?: (id: string, updates: any) => any; deleteTask?: (id: string) => any;
  taskStatuses: any[]; taskTypes?: TaskType[]; currentUser?: any; userGroups?: any[]; appConfig?: any;
}

// One daily planning source: canonical task dates, hours and assignees.
export default function CalendarSection({ projects = [], tasks = [], absences = [], users = [], clients = [],
  specialDays = [], projectRiskItems = [], projectStatuses = [], onSelectProject, addTask, updateTask, deleteTask, taskStatuses = [], taskTypes = [],
  currentUser, userGroups = [], appConfig }: CalendarSectionProps) {
  const [view, setView] = useState<'users' | 'projects'>('users');
  const [modal, setModal] = useState<{ task: Task | null; mode: 'create' | 'edit' | 'view'; date?: string; userId?: string; projectId?: string } | null>(null);
  const canRead = hasPermission(currentUser, 'calendar_read', userGroups);
  const canWriteTasks = hasPermission(currentUser, 'tasks_write', userGroups);
  const canWriteCalendar = hasPermission(currentUser, 'calendar_write', userGroups);
  const canCreate = canWriteTasks || canWriteCalendar;
  const openTask = (task: Task) => setModal({ task, mode: canWriteTasks ? 'edit' : 'view' });
  const createTask = (date: string, userId?: string, projectId?: string) => {
    if (canCreate) setModal({ task: null, mode: 'create', date, userId, projectId });
  };
  if (!canRead) return <Card className="p-6 text-body text-text-secondary">Sem permissão para consultar o calendário.</Card>;
  return <div className="space-y-6">
    <Tabs tabs={[{ id: 'users', label: 'Calendário semanal', icon: <CalendarDays className="w-4 h-4" /> },
      { id: 'projects', label: 'Timeline de projetos', icon: <GanttChart className="w-4 h-4" /> }]}
      activeTabId={view} onChange={value => setView(value as 'users' | 'projects')} variant="line" />
    {view === 'users' ? <OperationalUserCalendar tasks={tasks} users={users} projects={projects} clients={clients}
      absences={absences} taskStatuses={taskStatuses} taskTypes={taskTypes} specialDays={specialDays} userGroups={userGroups}
      onSelectTask={openTask} onQuickCreateTask={(userId, date, projectId) => createTask(date, userId, projectId)}
      canCreateTask={canCreate} canMoveTask={canWriteTasks && canWriteCalendar} updateTask={updateTask} appConfig={appConfig} currentUser={currentUser} />
    : <ProjectTimeline projects={projects} tasks={tasks} clients={clients} users={users} projectStatuses={projectStatuses} taskStatuses={taskStatuses}
      projectRiskItems={projectRiskItems} specialDays={specialDays} canCreate={canCreate}
      onSelectProject={onSelectProject} onSelectTask={openTask} onCreateTask={(date, projectId) => createTask(date, undefined, projectId)} />}
    {modal && <TaskDetailsModal isOpen task={modal.task} mode={modal.mode} initialDate={modal.date} initialAssigneeId={modal.userId} initialProjectId={modal.projectId}
      onClose={() => setModal(null)} createTask={addTask} updateTask={updateTask} deleteTask={deleteTask} taskStatuses={taskStatuses} taskTypes={taskTypes}
      users={users} userGroups={userGroups} appConfig={appConfig} projects={projects} clients={clients} absences={absences} tasks={tasks} canWrite={canCreate} />}
  </div>;
}
