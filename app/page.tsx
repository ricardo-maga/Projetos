'use client';

import React, { useState } from 'react';
import { useERP } from '../hooks/useERP';
import BentoDashboard from '../components/BentoDashboard';
import ProjectSection from '../components/ProjectSection';
import TaskSection from '../components/TaskSection';
import ClientSection from '../components/ClientSection';
import QuoteSection from '../components/QuoteSection';
import InventorySection from '../components/InventorySection';
import UserSection from '../components/UserSection';
import ConfigSection from '../components/ConfigSection';
import NotificationDropdown from '../components/NotificationDropdown';
import CalendarSection from '../components/CalendarSection';
import MyFocusSection from '../components/MyFocusSection';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { hasPermission } from '../lib/permissions';

import { 
  LayoutDashboard, Briefcase, CheckSquare, Building, FileText, 
  Package, Users, Settings, LogOut, Menu, X, HelpCircle, Calendar, Link2, Compass
} from 'lucide-react';

import { hashPassword } from '../lib/utils';

export default function Page() {
  const [mounted, setMounted] = React.useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Login state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Change password state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);

  // Restore session and set mounted status on mount
  React.useEffect(() => {
    const restoreSession = async () => {
      if (typeof window !== 'undefined') {
        const sessionStr = localStorage.getItem('erp_session');
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            if (Date.now() < session.expiresAt && session.token) {
              try {
                const res = await fetch('/api/auth/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: session.token })
                });
                const contentType = res.headers.get('content-type') || '';
                if (res.ok && contentType.includes('application/json')) {
                  const data = await res.json();
                  if (data && data.success) {
                    setCurrentUser(data.user);
                  } else {
                    console.warn('Sessão inválida ou expirada no servidor');
                    localStorage.removeItem('erp_session');
                  }
                } else {
                  console.warn('Servidor respondeu com erro ao verificar sessão');
                }
              } catch (fetchErr) {
                console.warn('Erro na verificação de sessão com o servidor:', fetchErr);
              }
            } else {
              localStorage.removeItem('erp_session');
            }
          } catch (e) {
            console.error('Error parsing erp_session:', e);
          }
        }
      }
      setMounted(true);
    };
    restoreSession();
  }, []);

  const {
    loading,
    state,
    resetToDefault,
    clearAllData,
    importState,
    addProject,
    updateProject,
    deleteProject,
    addTask,
    addTasks,
    updateTask,
    deleteTask,
    addComment,
    deleteComment,
    addAbsence,
    deleteAbsence,
    addUser,
    updateUser,
    deleteUser,
    addClient,
    updateClient,
    deleteClient,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    addQuote,
    updateQuote,
    deleteQuote,
    addBOMItem,
    updateBOMItem,
    deleteBOMItem,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    addProjectMaterial,
    updateProjectMaterial,
    deleteProjectMaterial,
    addProjectRiskItem,
    updateProjectRiskItem,
    deleteProjectRiskItem,
    updateConfig,
    addAuxRecord,
    updateAuxRecord,
    deleteAuxRecord,
    reorderAuxRecords,
    addSpecialDay,
    deleteSpecialDay,
    addDefaultTask,
    updateDefaultTask,
    deleteDefaultTask,
    updateNotificationSetting,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    addNotification,
    addAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    toggleAutomationRule,
    runAutomationRule,
    syncStatus,
    syncError,
    isDbConfigured,
  } = useERP();

  const hasProcessedDeepLink = React.useRef(false);

  const [navKey, setNavKey] = useState(0);

  const scrollToTop = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const mainElem = document.getElementById('main-content');
      if (mainElem) mainElem.scrollTop = 0;
      const bodyWrapper = document.getElementById('body-wrapper');
      if (bodyWrapper) bodyWrapper.scrollTop = 0;
      const activeContent = document.getElementById('active-tab-content');
      if (activeContent) activeContent.scrollTop = 0;
      const mainRoot = document.getElementById('main-root');
      if (mainRoot) mainRoot.scrollTop = 0;
    }
  }, []);

  // Ensure scroll is at top whenever active tab, selected project, or nav key changes
  React.useEffect(() => {
    scrollToTop();
    const timer = setTimeout(scrollToTop, 0);
    const raf = requestAnimationFrame(scrollToTop);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [activeTab, selectedProjectId, navKey, scrollToTop]);

  // Handle direct deep links
  React.useEffect(() => {
    if (mounted && state && !hasProcessedDeepLink.current) {
      hasProcessedDeepLink.current = true;
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const projectParam = params.get('project');
      
      if (tabParam) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab(tabParam);
      }
      if (projectParam) {
        setSelectedProjectId(projectParam);
      }
    }
  }, [mounted, state]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSelectedProjectId(null);
    setNavKey(prev => prev + 1);
    setSidebarOpen(false);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', tabId);
      params.delete('project');
      window.history.pushState(null, '', '?' + params.toString());
      scrollToTop();
    }
  };

  const handleSelectProject = (projId: string | null) => {
    setSelectedProjectId(projId);
    if (projId) {
      setActiveTab('projetos');
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (projId) {
        params.set('tab', 'projetos');
        params.set('project', projId);
      } else {
        params.delete('project');
      }
      window.history.pushState(null, '', '?' + params.toString());
      scrollToTop();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          rememberMe
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setLoginError('O servidor está a inicializar ou indisponível. Por favor, tente novamente em alguns segundos.');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setIsTransitioning(true);
        const expireHours = rememberMe ? 30 * 24 : 8;
        const expiresAt = Date.now() + expireHours * 60 * 60 * 1000;
        localStorage.setItem('erp_session', JSON.stringify({ 
          user: data.user, 
          token: data.token, 
          expiresAt 
        }));
        
        // Refresh page to load secure synchronized state from Supabase proxy using authorization token
        window.location.reload();
      } else {
        setLoginError(data.message || 'Email ou palavra-passe incorretos.');
      }
    } catch (err) {
      console.error('Error logging in:', err);
      setLoginError('Ocorreu um erro ao ligar ao servidor de autenticação. Por favor, tente novamente.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess(false);

    if (newPassword && newPassword !== confirmNewPassword) {
      setChangePasswordError('As passwords não coincidem.');
      return;
    }
    if (newPassword && newPassword.length < 5) {
      setChangePasswordError('A password deve ter pelo menos 5 caracteres.');
      return;
    }

    const updates: any = {};
    if (profileName && profileName !== currentUser.name) {
      updates.name = profileName;
    }
    if (newPassword) {
      const hashedNewPassword = await hashPassword(newPassword);
      updates.password = hashedNewPassword;
    }

    if (Object.keys(updates).length > 0) {
      updateUser(currentUser.id, updates);
      
      const updatedUser = { ...currentUser, ...updates };
      setCurrentUser(updatedUser);

      // update session storage
      if (typeof window !== 'undefined') {
        const sessionStr = localStorage.getItem('erp_session');
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            session.user = updatedUser;
            localStorage.setItem('erp_session', JSON.stringify(session));
          } catch (e2) {
            console.error(e2);
          }
        }
      }
    }
    
    setChangePasswordSuccess(true);
    setTimeout(() => {
      setIsChangingPassword(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setChangePasswordSuccess(false);
    }, 2000);
  };

  const tabs = React.useMemo(() => {
    if (!state || !currentUser) return [];
    return [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'meu-foco', label: 'O meu foco', icon: Compass },
      { id: 'projetos', label: 'Projetos', icon: Briefcase, permission: 'projects_read' },
      { id: 'tarefas', label: 'Tarefas', icon: CheckSquare, permission: 'tasks_read' },
      { id: 'calendario', label: 'Calendário', icon: Calendar, permission: 'calendar_read' },
      { id: 'clientes', label: 'Clientes', icon: Building, permission: 'clients_read' },
      { id: 'ausencias', label: 'Registo de ausências', icon: Users, permission: 'absences_read' },
      { id: 'configuracoes', label: 'Configurações', icon: Settings, permission: 'config_read' },
    ].filter(tab => !tab.permission || hasPermission(currentUser, tab.permission as any, state?.userGroups || []));
  }, [state, currentUser]);

  // Fallback if active tab is not allowed
  React.useEffect(() => {
    if (mounted && state && currentUser && tabs.length > 0) {
      const allowed = tabs.some(t => t.id === activeTab);
      if (!allowed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab('dashboard');
      }
    }
  }, [activeTab, tabs, mounted, state, currentUser]);

  if (!mounted || isTransitioning || (currentUser && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" id="loading-screen">
        <div className="w-full max-w-sm bg-white rounded-2xl -xl border border-slate-100 p-8 text-center space-y-6 animate-fade-in">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto -lg animate-pulse">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 font-sans tracking-tight">A carregar o sistema...</h1>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">Por favor, aguarde enquanto ligamos à base de dados.</p>
          </div>
          <div className="flex justify-center items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce"></span>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md bg-white rounded-2xl -xl border border-slate-100 overflow-hidden">
          <div className="p-8 pb-6 bg-slate-800 text-white text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 -lg">
              <Briefcase className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold font-sans tracking-tight">Portal</h1>
            <p className="text-slate-400 text-sm mt-2">Gestão de projetos</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium text-center border border-red-100">
                {loginError}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">E-mail</label>
              <input 
                type="text" 
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="Introduza o seu email"
                className="w-full p-3 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input 
                type="password" 
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="A sua password (ex: 12345)"
                className="w-full p-3 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                Lembrar login
              </label>
              <span className="text-[10px] text-slate-400">
                {rememberMe ? 'Sessão dura 30 dias' : 'Sessão dura 8 horas'}
              </span>
            </div>
            
            <button 
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors -sm"
            >
              Entrar
            </button>
            
            <div className="pt-4 text-center text-xs text-slate-400">
              <p>Acesso Restrito - Uso Interno</p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const { appConfig } = state;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-800" id="main-root" data-theme={appConfig.theme || 'default'}>
      
      {/* HEADER BAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-3 -sm flex items-center justify-between" id="app-header">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-slate-100 rounded-lg md:hidden text-slate-500"
            id="toggle-sidebar"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 hover:bg-slate-100 rounded-lg hidden md:block text-slate-500 transition-colors"
            title={isCollapsed ? "Expandir menu" : "Colapsar menu"}
            id="toggle-desktop-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div 
            className="flex items-center gap-2 cursor-pointer select-none hover:opacity-90 transition-opacity"
            onClick={() => handleTabChange('dashboard')}
            title="Ir para o Dashboard"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-extrabold text-sm -md -blue-100">
              N
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-none">{appConfig.appName}</h1>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{appConfig.appDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          
                    <NotificationDropdown 
            notifications={(state.notifications || []).filter(n => !n.userId || n.userId === currentUser.id || n.userId === 'all')}
            markAsRead={markNotificationAsRead}
            markAllAsRead={() => markAllNotificationsAsRead(currentUser.id)}
          />
          
          <div
            onClick={() => {
            setProfileName(currentUser.name);
            setNewPassword('');
            setConfirmNewPassword('');
            setIsChangingPassword(true);
          }}
          className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-all" 
          id="user-profile"
        >
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs border border-slate-200 -sm uppercase">
            {(() => {
              const parts = (currentUser.name || '').trim().split(/\s+/);
              if (parts.length >= 2) {
                return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
              }
              return (parts[0] || '').charAt(0).toUpperCase();
            })()}
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setCurrentUser(null);
              localStorage.removeItem('erp_session');
            }}
            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
            title="Terminar sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </header>

      {/* BODY WRAPPER */}
      <div className="flex-1 flex" id="body-wrapper">
        
        {/* SIDEBAR NAVIGATION */}
        <aside 
          className={`fixed top-[57px] bottom-0 left-0 transform ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:static md:translate-x-0 md:flex flex-col ${
            isCollapsed ? 'md:w-16' : 'md:w-64'
          } w-64 bg-white border-r border-slate-200 z-30 transition-all duration-200 ease-in-out`}
          id="sidebar-nav"
        >
          <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = (tab as any).disabled;
              return (
                <button
                  key={tab.id}
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled) {
                      handleTabChange(tab.id);
                    }
                  }}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'md:justify-center md:px-2' : 'gap-3 px-3'
                  } py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isDisabled 
                      ? 'opacity-40 cursor-not-allowed text-slate-400' 
                      : isActive 
                        ? 'bg-slate-900 text-white -sm' 
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                  id={`tab-${tab.id}`}
                  title={isCollapsed ? (isDisabled ? `${tab.label} (Desativado)` : tab.label) : undefined}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isDisabled ? 'text-slate-300' : isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span className={`${isCollapsed ? 'md:hidden' : 'block'}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* System metadata line in sidebar footer */}
          {!isCollapsed && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-[10px] text-slate-400 font-medium space-y-1">
              <div className="flex justify-between">
                <span>Nível de Acesso:</span>
                <span className="font-bold text-slate-600 font-mono">
                  {state.userGroups?.find(g => g.id === currentUser?.roleId)?.name || currentUser?.type || 'Utilizador'}
                </span>
              </div>
              <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between items-center w-full">
                  <span>Sincronização:</span>
                  {!isDbConfigured ? (
                    <span className="font-bold text-red-500 flex items-center gap-0.5">● Memória (Sem base de dados)</span>
                  ) : syncStatus === 'syncing' ? (
                    <span className="font-bold text-amber-500 flex items-center gap-0.5 animate-pulse">● A guardar...</span>
                  ) : syncStatus === 'error' ? (
                    <span className="font-bold text-red-600 flex items-center gap-0.5 cursor-help" title={syncError || 'Erro ao sincronizar'}>● Erro base de dados</span>
                  ) : (
                    <span className="font-bold text-emerald-600 flex items-center gap-0.5">● Base de dados (Live)</span>
                  )}
                </div>
                {syncError && (
                  <div className="text-[9px] text-red-500 font-mono mt-1 leading-tight break-words bg-red-50 p-2 rounded border border-red-100 max-h-24 overflow-y-auto">
                    {syncError}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* MAIN PANEL CONTENT */}
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden" id="main-content">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Header info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/60 pb-4" id="main-section-title">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {activeTab === 'dashboard' && 'Visão global e indicadores de performance'}
                  {activeTab === 'meu-foco' && 'O teu plano de trabalho, tarefas atribuídas, projetos e calendário'}
                  {activeTab === 'projetos' && 'Pipeline de execução e planeamento de projetos'}
                  {activeTab === 'tarefas' && 'Gestão global de tarefas'}
                  {activeTab === 'calendario' && 'Linha temporal integrada de projetos, tarefas e planeamento'}
                  {activeTab === 'clientes' && 'Diretório de clientes'}
                  {activeTab === 'ausencias' && 'Registo e escala de ausências da equipa'}
                  {activeTab === 'configuracoes' && 'Definições da aplicação'}
                </p>
              </div>
            </div>

            {/* Content view switcher */}
            <div id="active-tab-content" key={`${activeTab}-${navKey}`}>
              {activeTab === 'dashboard' && (
                <BentoDashboard 
                  projects={state.projects}
                  tasks={state.tasks}
                  absences={state.userAbsences}
                  materials={state.materials}
                  projectMaterials={state.projectMaterials || []}
                  projectRiskItems={state.projectRiskItems || []}
                  quotes={state.quotes}
                  comments={state.comments}
                  clients={state.clients}
                  users={state.users}
                  projectStatuses={state.projectStatuses}
                  projectCategories={state.projectCategories}
                  projectPriorities={state.projectPriorities}
                  onNavigate={handleTabChange}
                  onSelectProject={handleSelectProject}
                />
              )}

              {activeTab === 'meu-foco' && (
                <MyFocusSection 
                  currentUser={currentUser}
                  users={state.users}
                  userGroups={state.userGroups}
                  tasks={state.tasks}
                  projects={state.projects}
                  clients={state.clients}
                  notifications={state.notifications || []}
                  taskStatuses={state.taskStatuses}
                  projectStatuses={state.projectStatuses}
                  markNotificationAsRead={markNotificationAsRead}
                  markAllNotificationsAsRead={markAllNotificationsAsRead}
                  updateTask={updateTask}
                  onSelectProject={handleSelectProject}
                  onNavigateTab={handleTabChange}
                />
              )}

              {activeTab === 'projetos' && (
                <ProjectSection 
                  projects={state.projects}
                  clients={state.clients}
                  users={state.users}
                  tasks={state.tasks}
                  comments={state.comments}
                  absences={state.userAbsences}
                  projectStatuses={state.projectStatuses}
                  projectCategories={state.projectCategories}
                  projectRisks={state.projectRisks}
                  projectPriorities={state.projectPriorities}
                  projectTeams={state.projectTeams}
                  projectPartners={state.projectPartners}
                  addProject={addProject}
                  updateProject={updateProject}
                  deleteProject={deleteProject}
                  addClient={addClient}
                  addComment={addComment}
                  deleteComment={deleteComment}
                  addTask={addTask}
                  addTasks={addTasks}
                  updateTask={updateTask}
                  taskStatuses={state.taskStatuses}
                  specialDays={state.specialDays}
                  selectedProjectId={selectedProjectId}
                  setSelectedProjectId={handleSelectProject}
                  defaultTasks={state.defaultTasks || []}
                  appConfig={state.appConfig}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                  projectMaterials={state.projectMaterials || []}
                  addProjectMaterial={addProjectMaterial}
                  updateProjectMaterial={updateProjectMaterial}
                  deleteProjectMaterial={deleteProjectMaterial}
                  projectRiskItems={state.projectRiskItems || []}
                  riskCategories={state.riskCategories || []}
                  riskStatuses={state.riskStatuses || []}
                  riskPriorities={state.riskPriorities || []}
                  addProjectRiskItem={addProjectRiskItem}
                  updateProjectRiskItem={updateProjectRiskItem}
                  deleteProjectRiskItem={deleteProjectRiskItem}
                />
              )}

              {activeTab === 'tarefas' && (
                <TaskSection 
                  tasks={state.tasks}
                  projects={state.projects}
                  clients={state.clients}
                  users={state.users}
                  taskStatuses={state.taskStatuses}
                  addTask={addTask}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                />
              )}

              {activeTab === 'calendario' && (
                <CalendarSection 
                  projects={state.projects}
                  tasks={state.tasks}
                  absences={state.userAbsences}
                  users={state.users}
                  clients={state.clients}
                  taskStatuses={state.taskStatuses}
                  projectStatuses={state.projectStatuses}
                  specialDays={state.specialDays}
                  projectRiskItems={state.projectRiskItems || []}
                  addTask={addTask}
                  updateTask={updateTask}
                  onSelectProject={handleSelectProject}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                />
              )}

              {activeTab === 'clientes' && (
                <ClientSection 
                  clients={state.clients}
                  projects={state.projects || []}
                  onSelectProject={handleSelectProject}
                  addClient={addClient}
                  updateClient={updateClient}
                  deleteClient={deleteClient}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                />
              )}

              {activeTab === 'ausencias' && (
                <UserSection 
                  absences={state.userAbsences}
                  users={state.users}
                  userGroups={state.userGroups}
                  addAbsence={addAbsence}
                  deleteAbsence={deleteAbsence}
                  addUser={addUser}
                  updateUser={updateUser}
                  deleteUser={deleteUser}
                  hideUsers={true}
                  specialDays={state.specialDays}
                  updateAuxRecord={updateAuxRecord}
                  currentUser={currentUser}
                />
              )}

              {activeTab === 'configuracoes' && (
                <ConfigSection 
                  config={appConfig}
                  specialDays={state.specialDays}
                  updateConfig={updateConfig}
                  onResetDemoData={resetToDefault}
                  onClearDemoData={clearAllData}
                  addSpecialDay={addSpecialDay!}
                  deleteSpecialDay={deleteSpecialDay!}
                  defaultTasks={state.defaultTasks || []}
                  addDefaultTask={addDefaultTask!}
                  updateDefaultTask={updateDefaultTask!}
                  deleteDefaultTask={deleteDefaultTask!}
                  projectCategories={state.projectCategories || []}
                  projectStatuses={state.projectStatuses || []}
                  projectRisks={state.projectRisks || []}
                  projectPriorities={state.projectPriorities || []}
                  projectTeams={state.projectTeams || []}
                  projectPartners={state.projectPartners || []}
                  addAuxRecord={addAuxRecord}
                  updateAuxRecord={updateAuxRecord}
                  deleteAuxRecord={deleteAuxRecord}
                  reorderAuxRecords={reorderAuxRecords}
                  state={state}
                  importState={importState}
                  addProject={addProject}
                  clients={state.clients}
                  addClient={addClient}
                  addAbsence={addAbsence}
                  deleteAbsence={deleteAbsence}
                  addUser={addUser}
                  updateUser={updateUser}
                  deleteUser={deleteUser}
                  updateNotificationSetting={updateNotificationSetting}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                  automationRules={state.automationRules || []}
                  addAutomationRule={addAutomationRule}
                  updateAutomationRule={updateAutomationRule}
                  deleteAutomationRule={deleteAutomationRule}
                  toggleAutomationRule={toggleAutomationRule}
                  runAutomationRule={runAutomationRule}
                />
              )}
            </div>

          </div>
        </main>

      </div>

      {/* FOOTER COYPRIGHT */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-[10px] text-slate-400 font-medium" id="app-footer-copyright">
        {appConfig.footerCopyrightText}
      </footer>

      {/* CHANGE PASSWORD MODAL */}
      {isChangingPassword && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden -2xl">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Editar Perfil</h3>
              
              {changePasswordSuccess ? (
                <div className="p-4 bg-green-50 text-green-700 rounded-lg text-sm text-center font-medium">
                  Perfil atualizado com sucesso!
                </div>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {changePasswordError && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs font-medium border border-red-100">
                      {changePasswordError}
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Nome</label>
                    <input 
                      type="text"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-bold"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Nova password (Opcional)</label>
                    <input 
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Deixe em branco para manter a atual"
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Confirmar nova password</label>
                    <input 
                      type="password"
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      placeholder="Deixe em branco para manter a atual"
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="pt-2 flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsChangingPassword(false)}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
