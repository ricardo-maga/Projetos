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
import { TicketSection } from '../components/TicketSection';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { logAuditEventToSupabase } from '../lib/supabaseSync';
import { hasPermission } from '../lib/permissions';
import AppLogo from '../components/AppLogo';

import { 
  LayoutDashboard, Briefcase, CheckSquare, Building, FileText, 
  Package, Users, Settings, LogOut, Menu, X, HelpCircle, Calendar, Link2, Compass, RefreshCw,
  Bell, Zap, ShieldCheck, Database, ListTodo, Loader2, Ticket as TicketIcon, Eye, EyeOff, AlertCircle
} from 'lucide-react';

import { clearClientSession, setClientSession, getClientToken } from '../lib/clientAuth';

export default function Page() {
  const [mounted, setMounted] = React.useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeConfigTab, setActiveConfigTab] = useState('sistema');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Login state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginStatusMessage, setLoginStatusMessage] = useState('');
  
  // Change password state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);

  // Restore session from HttpOnly cookies or active bearer token
  React.useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = getClientToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch('/api/auth/session', { method: 'GET', headers });
        let data: any = null;
        try {
          data = await res.json();
        } catch {}

        if (res.ok && data && data.success && data.user) {
          setCurrentUser(data.user);
        } else {
          if (res.status === 401) {
            clearClientSession();
            setCurrentUser(null);
          } else setCurrentUser(null);
        }
      } catch (fetchErr) {
        console.warn('Erro na verificação de sessão com o servidor:', fetchErr);
        setCurrentUser(null);
      } finally {
        setMounted(true);
      }
    };
    restoreSession();
  }, []);

  // Listen for session expiration events from write operations
  React.useEffect(() => {
    const handleSessionExpired = (e: any) => {
      clearClientSession();
      setCurrentUser(null);
      const msg = e?.detail?.message || 'A sua sessão expirou ou é inválida. Por favor, faça login novamente.';
      setLoginError(msg);
    };
    window.addEventListener('erp_auth_session_expired', handleSessionExpired);
    return () => window.removeEventListener('erp_auth_session_expired', handleSessionExpired);
  }, []);

  const {
    isInitialDataLoaded,
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
    // Tickets
    addTicket,
    updateTicket,
    deleteTicket,
    validateAndApproveTicket,
    convertTicketToTask,
    resolveTicketDirectly,
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
    refreshFromDatabase,
    // Planning Allocations & Capacity (FASE 23C / 23D)
    planningAllocations,
    planningLoading,
    fetchPlanningAllocations,
    createPlanningAllocation,
    updatePlanningAllocation,
    cancelPlanningAllocation,
    deletePlanningAllocation,
    planningCapacity,
    planningResourceLoad,
    planningCapacityLoading,
    fetchPlanningCapacity,
    fetchPlanningResourceLoad,
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
        setActiveTab(tabParam);
      }
      if (projectParam) {
        setSelectedProjectId(projectParam);
      }
    }
  }, [mounted, state]);

  // Synchronize active theme attribute on document.documentElement for global styling
  React.useEffect(() => {
    const cachedTheme = typeof window !== 'undefined' ? localStorage.getItem('erp_theme') : null;
    const currentTheme = state?.appConfig?.theme || cachedTheme || 'default';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', currentTheme);
      document.body?.setAttribute('data-theme', currentTheme);
      const root = document.getElementById('main-root');
      if (root) {
        root.setAttribute('data-theme', currentTheme);
      }
    }
  }, [state?.appConfig?.theme]);

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
    setIsLoggingIn(true);
    setLoginStatusMessage('A validar credenciais com o servidor...');
    
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

      let responseText = '';
      try {
        responseText = await res.text();
      } catch (readErr) {
        console.warn('Erro ao ler resposta:', readErr);
      }

      let data: any = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          console.warn('Resposta não JSON:', responseText.substring(0, 100));
        }
      }

      if (res.ok && data?.success) {
        setLoginStatusMessage('Autenticado com sucesso! A carregar sistema...');
        
        // Save bearer token for robust cross-origin, iframe and API requests
        if (data.token) {
          setClientSession(data.token, data.user, rememberMe);
        }

        // Show loading screen immediately and activate user session
        setIsTransitioning(true);
        setCurrentUser(data.user);

        // Fetch authoritative database records directly using the active session token
        try {
          await refreshFromDatabase();
        } catch (refreshErr) {
          console.warn('Erro ao atualizar dados após autenticação:', refreshErr);
        } finally {
          setIsTransitioning(false);
          setIsLoggingIn(false);
          setLoginStatusMessage('');
        }
      } else {
        let errorMessage = 
          data?.error?.message || 
          data?.message || 
          data?.error?.details?.fieldErrors?.password?.[0] || 
          data?.error?.details?.fieldErrors?.email?.[0];

        if (!errorMessage) {
          if (res.status === 401) {
            errorMessage = 'Email ou palavra-passe incorretos.';
          } else if (res.status === 403) {
            errorMessage = 'Este utilizador ainda aguarda aprovação por um administrador.';
          } else if (res.status === 429) {
            errorMessage = 'Demasiadas tentativas de autenticação. Por favor, aguarde um minuto.';
          } else if (res.status >= 500) {
            errorMessage = 'O servidor está temporariamente indisponível. Por favor, tente novamente.';
          } else {
            errorMessage = 'Email ou palavra-passe incorretos.';
          }
        }

        setLoginError(errorMessage);
        setIsLoggingIn(false);
        setLoginStatusMessage('');
      }
    } catch (err) {
      console.error('Error logging in:', err);
      setLoginError('Ocorreu um erro ao ligar ao servidor de autenticação. Por favor, tente novamente.');
      setIsLoggingIn(false);
      setLoginStatusMessage('');
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
    if (newPassword && newPassword.length < 12) {
      setChangePasswordError('A password deve ter pelo menos 12 caracteres.');
      return;
    }

    const updates: any = {};
    if (profileName && profileName !== currentUser.name) {
      updates.name = profileName;
    }
    if (newPassword) {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }) });
      if (!response.ok) { setChangePasswordError('Não foi possível alterar a password.'); return; }
    }

    if (Object.keys(updates).length > 0) {
      updateUser(currentUser.id, updates);
      
      const updatedUser = { ...currentUser, ...updates };
      setCurrentUser(updatedUser);
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
      { id: 'tickets', label: 'Tickets', icon: TicketIcon, permission: 'tickets_read' },
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
        setActiveTab('dashboard');
      }
    }
  }, [activeTab, tabs, mounted, state, currentUser]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" id="session-check-screen">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 p-8 text-center space-y-6 animate-fade-in">
          <AppLogo 
            logoUrl={state?.appConfig?.logoImagePath || state?.appConfig?.logo} 
            appName={state?.appConfig?.appName || ''}
            className="w-72 max-w-full h-16 rounded-2xl bg-white p-2.5 flex items-center justify-center mx-auto shadow-sm border border-slate-100 animate-pulse"
            fallbackIconClassName="w-8 h-8 text-blue-600"
          />
          <div>
            <h1 className="text-xl font-bold text-slate-800 font-sans tracking-tight">
              A carregar dados...
            </h1>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">
              A aguardar dados da base de dados.
            </p>
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
          <div className="p-8 pb-6 bg-slate-800 text-white text-center flex flex-col items-center">
            <AppLogo 
              logoUrl={state?.appConfig?.logoImagePath || state?.appConfig?.logo} 
              appName={state?.appConfig?.appName || ''}
              className="w-72 max-w-full h-16 rounded-2xl bg-white p-2.5 mb-4 shadow-md mx-auto"
              fallbackIconClassName="w-8 h-8 text-blue-600"
            />
            {state?.appConfig?.appName ? (
              <h1 className="text-2xl font-bold font-sans tracking-tight">{state.appConfig.appName}</h1>
            ) : null}
            {state?.appConfig?.appDescription ? (
              <p className="text-slate-400 text-sm mt-1">{state.appConfig.appDescription}</p>
            ) : null}
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
                type="email" 
                value={loginEmail}
                onChange={e => {
                  setLoginEmail(e.target.value);
                  if (loginError) setLoginError('');
                }}
                autoComplete="username"
                placeholder="nome@empresa.com"
                disabled={isLoggingIn}
                className="w-full p-3 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                required
              />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium text-slate-700">Password</label>

              </div>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={loginPassword}
                  onChange={e => {
                    setLoginPassword(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  autoComplete="current-password"
                  placeholder="Introduza a password"
                  disabled={isLoggingIn}
                  className="w-full p-3 pr-10 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  tabIndex={-1}
                  title={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className={`flex items-center gap-2 text-xs font-semibold select-none ${isLoggingIn ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 cursor-pointer'}`}>
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  disabled={isLoggingIn}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                Lembrar
              </label>
              <span className="text-[10px] text-slate-400">
                {rememberMe ? '30 dias' : '8 horas'}
              </span>
            </div>
            
            <button 
              type="submit"
              disabled={isLoggingIn}
              className={`w-full py-3 text-white rounded-xl font-bold transition-all duration-200 shadow-sm flex items-center justify-center gap-2.5 ${
                isLoggingIn 
                  ? 'bg-blue-500/90 cursor-wait' 
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer'
              }`}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>A autenticar...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </button>

            {/* Instant feedback message immediately upon clicking */}
            {isLoggingIn && (
              <div className="p-3 bg-blue-50 border border-blue-200/70 rounded-xl flex items-center gap-2.5 text-xs text-blue-800 font-semibold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>{loginStatusMessage || 'A validar credenciais com o servidor...'}</span>
              </div>
            )}
            
            <div className="pt-4 text-center text-xs text-slate-400">
              <p>Acesso Restrito - Uso Interno</p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 3. Authenticated user: DB error on initial authoritative load
  if (syncStatus === 'error' && !isInitialDataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" id="db-error-screen">
        <div className="w-full max-w-md bg-white rounded-2xl border border-rose-100 p-8 text-center space-y-6 shadow-sm animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-800 font-sans tracking-tight">
              Erro ao carregar os dados
            </h1>
            <p className="text-slate-500 text-xs font-medium leading-relaxed">
              {syncError || 'Não foi possível obter os dados autoritativos da base de dados.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refreshFromDatabase()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Authenticated user: Authoritative data not yet loaded or transition in progress
  if (!isInitialDataLoaded || isTransitioning) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" id="loading-screen">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 p-8 text-center space-y-6 animate-fade-in">
          <AppLogo 
            logoUrl={state?.appConfig?.logoImagePath || state?.appConfig?.logo} 
            appName={state?.appConfig?.appName || ''}
            className="w-72 max-w-full h-16 rounded-2xl bg-white p-2.5 flex items-center justify-center mx-auto shadow-sm border border-slate-100 animate-pulse"
            fallbackIconClassName="w-8 h-8 text-blue-600"
          />
          <div>
            <h1 className="text-xl font-bold text-slate-800 font-sans tracking-tight">
              A carregar dados...
            </h1>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">
              A aguardar dados da base de dados.
            </p>
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

  const appConfig = state?.appConfig || {};

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-800" id="main-root" data-theme={appConfig.theme || 'default'}>
      
      {/* HEADER BAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 h-14 sm:h-16 px-2.5 sm:px-4 shadow-2xs flex items-center justify-between shrink-0 overflow-x-hidden" id="app-header">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 rounded-xl md:hidden text-slate-600 transition-colors shrink-0"
            id="toggle-sidebar"
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-9 h-9 items-center justify-center hover:bg-slate-100 rounded-xl hidden md:flex text-slate-500 transition-colors shrink-0"
            title={isCollapsed ? "Expandir menu" : "Colapsar menu"}
            id="toggle-desktop-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div 
            className="flex items-center gap-2 cursor-pointer select-none hover:opacity-90 transition-opacity min-w-0"
            onClick={() => handleTabChange('dashboard')}
            title="Ir para o Dashboard"
          >
            <AppLogo 
              logoUrl={appConfig.logoImagePath || appConfig.logo} 
              appName={appConfig.appName}
              className="w-auto max-w-[238px] sm:max-w-[320px] h-9 sm:h-10 bg-transparent border-0 shadow-none p-0 shrink"
            />
            <div className="min-w-0 hidden sm:block">
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-none truncate">{appConfig.appName}</h1>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5 truncate">{appConfig.appDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          
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
          className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-85 transition-all" 
          id="user-profile"
        >
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs border border-slate-200 shadow-sm uppercase shrink-0">
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
              if (currentUser) {
                logAuditEventToSupabase({
                  userId: currentUser.id,
                  userName: currentUser.name,
                  userEmail: currentUser.email,
                  action: 'LOGOUT',
                  entityType: 'USER',
                  entityId: currentUser.id,
                  entityName: currentUser.name,
                  details: `Sessão terminada por ${currentUser.name}`
                }).catch(() => {});
              }
              clearClientSession();
              fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
              setCurrentUser(null);
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
      <div className="flex-1 flex relative" id="body-wrapper">

        {/* Mobile drawer backdrop overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 top-14 sm:top-16 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden animate-fade-in"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          />
        )}
        
        {/* SIDEBAR NAVIGATION - Positioned strictly below header, collapsible on mobile & desktop */}
        <aside 
          className={`fixed top-14 sm:top-16 bottom-0 left-0 z-40 h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] transform ${
            sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          } md:static md:top-auto md:bottom-auto md:h-auto md:translate-x-0 md:shadow-none md:flex flex-col ${
            isCollapsed ? 'md:w-16' : 'md:w-64'
          } w-72 max-w-[85vw] bg-white border-r border-slate-200 transition-all duration-200 ease-in-out`}
          id="sidebar-nav"
        >
          <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = (tab as any).disabled;

              if (tab.id === 'configuracoes') {
                const configSubItems = [
                  { id: 'sistema', label: 'Configurações do Sistema', icon: Settings },
                  { id: 'campos', label: 'Campos Auxiliares', icon: ListTodo },
                  { id: 'dias', label: 'Dias Especiais', icon: Calendar },
                  { id: 'tarefas', label: 'Tarefas Modelo', icon: CheckSquare },
                  { id: 'utilizadores', label: 'Utilizadores e Equipas', icon: Users },
                  { id: 'notificacoes', label: 'Notificações', icon: Bell },
                  { id: 'automacoes', label: 'Automações', icon: Zap },
                  { id: 'auditoria', label: 'Registo de Auditoria', icon: ShieldCheck },
                  { id: 'importacao', label: 'Importação e Backup', icon: Database },
                ];

                return (
                  <div key={tab.id} className="space-y-1">
                    <button
                      disabled={isDisabled}
                      onClick={() => {
                        if (!isDisabled) {
                          handleTabChange(tab.id);
                        }
                      }}
                      className={`w-full flex items-center ${
                        isCollapsed ? 'md:justify-center md:px-2' : 'gap-3 px-3'
                      } py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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

                    {/* Submenu under Configurações */}
                    {isActive && (
                      <div className={`${isCollapsed ? 'md:pl-0' : 'pl-3 pr-1'} py-1 space-y-1 my-1`}>
                        {configSubItems.map(sub => {
                          const SubIcon = sub.icon;
                          const isSubActive = activeConfigTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => {
                                handleTabChange('configuracoes');
                                setActiveConfigTab(sub.id);
                              }}
                              className={`w-full flex items-center ${
                                isCollapsed ? 'md:justify-center md:px-2' : 'gap-2.5 px-3'
                              } py-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                isSubActive
                                  ? 'bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600'
                                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/70 border-l-2 border-transparent'
                              }`}
                              title={isCollapsed ? sub.label : undefined}
                            >
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-blue-600' : 'text-slate-400'}`} />
                              <span className={`truncate ${isCollapsed ? 'md:hidden' : 'block'}`}>{sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

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
                    <span className="font-bold text-rose-600 flex items-center gap-0.5">● Base de Dados Não Configurada</span>
                  ) : syncStatus === 'syncing' ? (
                    <span className="font-bold text-amber-500 flex items-center gap-0.5 animate-pulse">● A gravar na BD...</span>
                  ) : syncStatus === 'error' ? (
                    <span className="font-bold text-rose-600 flex items-center gap-0.5 cursor-help" title={syncError || 'Erro ao sincronizar'}>● Erro BD (Revertido)</span>
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
        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6 overflow-x-hidden" id="main-content">
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

            {/* Error or Rollback Notification */}
            {syncStatus === 'error' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-800 text-xs font-semibold shadow-xs" id="db-error-banner">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0 animate-ping" />
                  <div>
                    <span className="font-bold">Aviso de Integridade da Base de Dados: </span>
                    <span>{syncError || 'A última operação não pôde ser gravada na base de dados e foi revertida para proteção de dados.'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => refreshFromDatabase()}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Recarregar da Base de Dados
                </button>
              </div>
            )}

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
                  taskStatuses={state.taskStatuses}
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
                  specialDays={state.specialDays || []}
                  notifications={state.notifications || []}
                  taskStatuses={state.taskStatuses}
                  taskTypes={state.taskTypes}
                  userAbsences={state.userAbsences}
                  projectStatuses={state.projectStatuses}
                  markNotificationAsRead={markNotificationAsRead}
                  markAllNotificationsAsRead={markAllNotificationsAsRead}
                  updateTask={updateTask}
                  onSelectProject={handleSelectProject}
                  onNavigateTab={handleTabChange}
                  appConfig={state.appConfig}
                />
              )}

              {activeTab === 'tickets' && (
                <TicketSection 
                  tickets={state.tickets || []}
                  users={state.users || []}
                  clients={state.clients || []}
                  projects={state.projects || []}
                  tasks={state.tasks || []}
                  taskStatuses={state.taskStatuses || []}
                  taskTypes={state.taskTypes || []}
                  projectPriorities={state.projectPriorities || []}
                  ticketStatuses={state.ticketStatuses || []}
                  userGroups={state.userGroups || []}
                  currentUser={currentUser}
                  onAddTicket={addTicket}
                  onUpdateTicket={updateTicket}
                  onDeleteTicket={deleteTicket}
                  onValidateAndApprove={validateAndApproveTicket}
                  onConvertToTask={convertTicketToTask}
                  onResolveDirectly={resolveTicketDirectly}
                  onNavigateToProject={handleSelectProject}
                  onAddClient={addClient}
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
                  taskTypes={state.taskTypes || []}
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
                  taskTypes={state.taskTypes || []}
                  addTask={addTask}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                  appConfig={state.appConfig}
                  planningAllocations={planningAllocations}
                  createPlanningAllocation={createPlanningAllocation}
                  updatePlanningAllocation={updatePlanningAllocation}
                  cancelPlanningAllocation={cancelPlanningAllocation}
                  deletePlanningAllocation={deletePlanningAllocation}
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
                  taskTypes={state.taskTypes || []}
                  projectStatuses={state.projectStatuses}
                  specialDays={state.specialDays}
                  projectRiskItems={state.projectRiskItems || []}
                  addTask={addTask}
                  updateTask={updateTask}
                  onSelectProject={handleSelectProject}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                  appConfig={state.appConfig}
                  planningAllocations={planningAllocations}
                  planningLoading={planningLoading}
                  fetchPlanningAllocations={fetchPlanningAllocations}
                  createPlanningAllocation={createPlanningAllocation}
                  updatePlanningAllocation={updatePlanningAllocation}
                  cancelPlanningAllocation={cancelPlanningAllocation}
                  deletePlanningAllocation={deletePlanningAllocation}
                  planningCapacity={planningCapacity}
                  planningResourceLoad={planningResourceLoad}
                  planningCapacityLoading={planningCapacityLoading}
                  fetchPlanningCapacity={fetchPlanningCapacity}
                  fetchPlanningResourceLoad={fetchPlanningResourceLoad}
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
                  activeConfigTab={activeConfigTab}
                  onChangeConfigTab={setActiveConfigTab}
                  config={appConfig}
                  specialDays={state.specialDays}
                  updateConfig={updateConfig}
                  onResetDemoData={resetToDefault}
                  onClearDemoData={clearAllData}
                  onRefreshFromDatabase={refreshFromDatabase}
                  addSpecialDay={addSpecialDay!}
                  deleteSpecialDay={deleteSpecialDay!}
                  defaultTasks={state.defaultTasks || []}
                  addDefaultTask={addDefaultTask!}
                  updateDefaultTask={updateDefaultTask!}
                  deleteDefaultTask={deleteDefaultTask!}
                  projectCategories={state.projectCategories || []}
                  projectStatuses={state.projectStatuses || []}
                  taskStatuses={state.taskStatuses || []}
                  taskTypes={state.taskTypes || []}
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
