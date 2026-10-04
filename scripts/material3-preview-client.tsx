import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Menu } from 'lucide-react';
import { M3Button, M3IconButton, M3SectionHeader, M3SegmentedControl } from '../components/M3';
import MyFocusSection from '../components/MyFocusSection';
import OperationalUserCalendar from '../components/OperationalUserCalendar';
import type { User } from '../lib/types';

const user: User = { id: 'qa-synthetic-user', name: 'Ana Exemplo', email: 'qa@example.invalid', deleted: false, type: 'Team', roleId: 'admin', approved: true, createdDate: '2026-10-04' };
const noop = () => {};

function Preview() {
  const [tab, setTab] = useState<'focus' | 'calendar'>('focus');
  const [view, setView] = useState<'weekly' | 'timeline'>('weekly');
  const [createCount, setCreateCount] = useState(0);
  return (
    <div id="main-root" data-active-tab={tab === 'focus' ? 'meu-foco' : 'calendario'} data-theme="violet" className="min-h-screen p-3 sm:p-6">
      <header className="m3-top-app-bar flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex items-center gap-3"><M3IconButton label="Menu"><Menu className="h-5 w-5" /></M3IconButton><h1 className="text-lg font-medium">Gestão de projetos</h1></div>
        <M3SegmentedControl label="Módulo da pré-visualização" value={tab} onChange={setTab} options={[{ value: 'focus', label: 'O meu foco' }, { value: 'calendar', label: 'Calendário' }]} />
      </header>
      <main id="active-tab-content" className="max-w-7xl mx-auto space-y-4">
        {tab === 'focus' ? (
          <MyFocusSection currentUser={user} users={[user]} tasks={[]} projects={[]} clients={[]} notifications={[]} taskStatuses={[]} projectStatuses={[]} markNotificationAsRead={noop} markAllNotificationsAsRead={noop} updateTask={noop} onSelectProject={noop} onNavigateTab={noop} />
        ) : (
          <>
            <div className="m3-card p-4 sm:p-5">
              <M3SectionHeader title="Calendário & Planeamento" description="Revisão local — dados fictícios." actions={<M3SegmentedControl label="Vista do calendário" value={view} onChange={setView} options={[{ value: 'weekly', label: 'Calendário semanal' }, { value: 'timeline', label: 'Timeline de projetos' }]} />} />
            </div>
            {view === 'weekly' ? <OperationalUserCalendar currentUser={user} appConfig={{ taskAssigneeGroupIds: ['admin'] }} tasks={[]} users={[user]} projects={[]} clients={[]} taskStatuses={[]} onSelectTask={noop} canCreateTask onQuickCreateTask={() => setCreateCount(count => count + 1)} /> : <div className="m3-card p-6 flex items-center gap-3"><CalendarDays />Vista selecionada: timeline de projetos</div>}
            <p role="status" className="text-sm text-text-secondary">Ações de criação testadas: {createCount} (sem gravar dados)</p>
          </>
        )}
        <div className="m3-card p-4 flex flex-wrap items-center gap-3">
          <M3Button>Primário</M3Button><M3Button tone="tonal">Tonal</M3Button><M3Button tone="outlined">Outlined</M3Button><M3Button tone="text" danger>Eliminar</M3Button><M3Button disabled>Desativado</M3Button><M3Button isLoading>A gravar</M3Button>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('preview')!).render(<Preview />);
