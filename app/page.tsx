'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useERP } from '../hooks/useERP';
import { resolveNavigationTarget, usePageNavigation } from '../hooks/usePageNavigation';
import { useFieldErrors } from '../hooks/useFieldErrors';
import { useSlowRead } from '../hooks/useSlowRead';
import { ApplicationFeedbackProvider, useApplicationFeedback } from '../components/ApplicationFeedback';
import Button from '../components/ui/Button';
import BentoDashboard from '@/domains/monitoring/ui/BentoDashboard';
import NotificationDropdown from '@/domains/communication/ui/NotificationDropdown';
import { hasPermission } from '../lib/permissions';
import { APP_SECTIONS, canOpenSection } from '../lib/sectionCatalog';
import AppLogo from '../components/AppLogo';
import AppLoadingScreen from '../components/AppLoadingScreen';
import IconButton from '../components/ui/IconButton';
import { cn } from '../lib/utils';
import { getPresentationTheme, normalizeApplicationTheme, normalizePreferredTheme, type ApplicationTheme, type ColorSchemeId } from '../lib/presentationTheme';

import {
  LayoutDashboard, Briefcase, CheckSquare, Building, FileText,
  Package, Users, Settings, Menu, X, HelpCircle, Calendar, Link2, Compass, RefreshCw,
  Bell, ShieldCheck, Database, ListTodo, Loader2, Eye, EyeOff, AlertCircle
} from 'lucide-react';

import {
  apiRequestError, clearClientSession, CONNECTION_INTERRUPTED_EVENT,
  getAuthHeaders, getClientUser, readRequest, SESSION_EXPIRED_EVENT, setCheckingConnection, setClientUser,
} from '../lib/clientAuth';

function SectionLoading() {
  const slow = useSlowRead(true);
  return <div role="status" className="flex min-h-32 items-center justify-center gap-3 text-body-sm text-text-secondary">
    <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    {slow ? 'Está a demorar mais do que o habitual.' : 'A carregar…'}
  </div>;
}

function SectionDataFeedback({ status, retry, blocked }: {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  retry: () => Promise<void>;
  blocked: boolean;
}) {
  if (blocked) return <p role="status" className="p-4 text-body-sm text-text-secondary">Dados disponíveis quando a ligação for restabelecida.</p>;
  if (status !== 'error') return <SectionLoading />;
  return <div className="flex flex-wrap items-center gap-3 p-4 text-body-sm">
    <span role="alert">Não foi possível carregar os dados desta secção.</span>
    <Button type="button" variant="secondary" size="sm" onClick={() => void retry()}>Tentar novamente</Button>
  </div>;
}

// Load feature screens when their tab is visited. The dashboard stays in the
// initial bundle because it is the default view after authentication.
const ProjectSection = dynamic(() => import('@/domains/projects/ui/ProjectSection'), { loading: SectionLoading });
const TaskSection = dynamic(() => import('@/domains/tasks/ui/TaskSection'), { loading: SectionLoading });
const MechanicalDesignSection = dynamic(() => import('../components/MechanicalDesignSection'), { loading: SectionLoading });
const PresalesSection = dynamic(() => import('../components/PresalesRegistrySection'), { loading: SectionLoading });
const ClientSection = dynamic(() => import('@/domains/clients/ui/ClientSection'), { loading: SectionLoading });
const AbsencesSection = dynamic(() => import('@/domains/absences/ui/AbsencesSection'), { loading: SectionLoading });
const ConfigSection = dynamic(() => import('@/domains/administration/ui/ConfigSection'), { loading: SectionLoading });
const CalendarSection = dynamic(() => import('@/domains/calendar/ui/CalendarSection'), { loading: SectionLoading });
const ProfilePage = dynamic(() => import('@/domains/administration/ui/ProfilePage'), { loading: SectionLoading });
const MyFocusSection = dynamic(() => import('@/domains/monitoring/ui/MyFocusSection'), { loading: SectionLoading });
const ReportsSection = dynamic(() => import('@/domains/reports/ui/ReportsSection'), { loading: SectionLoading });
const TaskDetailsModal = dynamic(() => import('@/domains/tasks/ui/TaskDetailsModal'));

const AUTH_SCREEN = 'min-h-screen flex items-center justify-center bg-surface-muted p-6';
const AUTH_INPUT = 'w-full p-3 border border-border rounded-card font-medium focus:ring-2 focus:ring-action-500 focus:border-action-500 outline-none disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed transition-colors';

export default function Page() {
  const [mounted, setMounted] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  // Login state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState('');
  const loginValidation = useFieldErrors();
  const [connection, setConnection] = useState<'ready' | 'offline' | 'checking' | 'unavailable'>('ready');
  const [sessionDenied, setSessionDenied] = useState(false);
  const sessionCheck = React.useRef(0);
  const manualSignIn = React.useRef(false);
  const writesBlocked = connection !== 'ready';
  const { feedback, saved, setSaved, capture, discard, notice, notify } = useApplicationFeedback(currentUser?.id, writesBlocked);
  const [logoutPending, setLogoutPending] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const loginInFlight = React.useRef(false);
  const [cachedTheme, setCachedTheme] = useState<ApplicationTheme | null>(null);
  const [globalThemePreview, setGlobalThemePreview] = useState<{ userId: string; theme: ColorSchemeId } | null>(null);

  const {
    isInitialDataLoaded,
    loading,
    state,
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
    updateSpecialDay,
    deleteSpecialDay,
    addDefaultTask,
    updateDefaultTask,
    deleteDefaultTask,
    updateNotificationSetting,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    addAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    toggleAutomationRule,
    syncStatus,
    publicAppConfig,
    syncError,
    isDbConfigured,
    refreshFromDatabase,
    refreshProgress,
    resetAuthorizedData,
    loadWork,
    workStatus,
    loadActivity,
    activityStatus,
    loadProjectMaterials,
    materialsStatus,
    loadConfigRuntime,
    configRuntimeStatus,
    loadDefaultTasks,
    defaultTasksStatus,
  } = useERP(currentUser?.id);

  const expireSession = React.useCallback(() => {
    const user = getClientUser();
    if (!user) return;
    capture(user.id);
    manualSignIn.current = true;
    sessionCheck.current += 1;
    resetAuthorizedData();
    clearClientSession();
    setCurrentUser(null);
    setPendingTaskId(null);
    setGlobalThemePreview(null);
    setLoginError('A sua sessão expirou. Inicie sessão novamente.');
    const next = navigator.onLine === false ? 'offline' : 'ready';
    setCheckingConnection(next !== 'ready');
    setConnection(next);
  }, [capture, resetAuthorizedData]);

  const checkSession = React.useCallback(async () => {
    const generation = ++sessionCheck.current;
    const existing = getClientUser();
    if (navigator.onLine === false) {
      setCheckingConnection(true);
      setConnection('offline');
      setMounted(true);
      return;
    }
    if (manualSignIn.current) {
      setCheckingConnection(false);
      setConnection('ready');
      return;
    }
    setCheckingConnection(true);
    setConnection('checking');
    try {
      const response = await readRequest('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
      if (sessionCheck.current !== generation) return;
      if (response.status === 401) {
        if (existing) { expireSession(); return; }
        setSessionDenied(false);
        clearClientSession();
      } else if (response.status === 403) {
        discard();
        resetAuthorizedData();
        clearClientSession();
        setPendingTaskId(null);
        setGlobalThemePreview(null);
        setCurrentUser(null);
        setSessionDenied(true);
      } else {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const result = await response.json();
        if (sessionCheck.current !== generation) return;
        if (!result.success || !result.user?.id) throw new Error('Resposta de sessão inválida');
        const permissionsChanged = existing?.id === result.user.id &&
          JSON.stringify([existing.roleId, existing.isAdmin, [...(existing.permissions || [])].sort()]) !==
          JSON.stringify([result.user.roleId, result.user.isAdmin, [...(result.user.permissions || [])].sort()]);
        if (existing && (existing.id !== result.user.id || permissionsChanged)) {
          if (permissionsChanged) capture(existing.id);
          else discard();
          resetAuthorizedData();
          setPendingTaskId(null);
          setGlobalThemePreview(null);
        }
        setSessionDenied(false);
        setClientUser(result.user);
        setCurrentUser(result.user);
        if (existing?.id === result.user.id && !await refreshFromDatabase()) {
          if (sessionCheck.current === generation) setConnection('unavailable');
          return;
        }
      }
      if (sessionCheck.current !== generation) return;
      setCheckingConnection(false);
      setConnection('ready');
    } catch (error) {
      if (sessionCheck.current !== generation) return;
      console.warn('[SESSION CHECK]', error);
      setConnection(navigator.onLine ? 'unavailable' : 'offline');
    } finally {
      if (sessionCheck.current === generation) setMounted(true);
    }
  }, [capture, discard, expireSession, refreshFromDatabase, resetAuthorizedData]);

  React.useEffect(() => {
    clearClientSession();
    void checkSession();
    const offline = () => {
      sessionCheck.current += 1;
      setCheckingConnection(true);
      setMounted(true);
      setConnection('offline');
    };
    const online = () => { void checkSession(); };
    const interrupted = () => {
      sessionCheck.current += 1;
      setCheckingConnection(true);
      setConnection('unavailable');
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    window.addEventListener(CONNECTION_INTERRUPTED_EVENT, interrupted);
    return () => {
      sessionCheck.current += 1;
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
      window.removeEventListener(CONNECTION_INTERRUPTED_EVENT, interrupted);
    };
  }, [checkSession, expireSession]);

  const {
    navigationReady, activeTab, activeConfigTab, selectedProjectId,
    selectedMechanicalRequestId, setSelectedMechanicalRequestId,
    selectedPresalesRequestId, setSelectedPresalesRequestId,
    sidebarOpen, setSidebarOpen, navKey,
    handleTabChange, handleConfigTabChange, handleSelectProject,
  } = usePageNavigation(mounted, isInitialDataLoaded);

  const pendingTask = pendingTaskId ? state?.tasks.find(task => task.id === pendingTaskId && !task.deleted) : undefined;
  const openPendingTask = hasPermission(currentUser, 'tasks_read') ? (id: string) => setPendingTaskId(id) : undefined;

  React.useEffect(() => {
    // Match Tailwind's existing lg boundary between tablet and desktop.
    const compactViewport = window.matchMedia('(width < 64rem)');
    const applyViewport = () => {
      setIsCollapsed(compactViewport.matches);
      if (compactViewport.matches) setSidebarOpen(false);
    };
    applyViewport();
    compactViewport.addEventListener('change', applyViewport);
    return () => compactViewport.removeEventListener('change', applyViewport);
  }, [setSidebarOpen]);

  const canReadActiveTab = canOpenSection(currentUser, activeTab, activeConfigTab);
  const requiresWork = navigationReady && canReadActiveTab && activeTab !== 'perfil' && (activeTab !== 'configuracoes' || activeConfigTab === 'utilizadores');
  React.useEffect(() => {
    if (currentUser && !writesBlocked && isInitialDataLoaded && requiresWork && workStatus === 'idle') void loadWork();
  }, [currentUser, writesBlocked, isInitialDataLoaded, requiresWork, workStatus, loadWork]);
  const requiresActivity = navigationReady && canReadActiveTab && ['dashboard', 'my-focus', 'projetos', 'reports', 'tarefas', 'calendario', 'ausencias', 'utilizadores'].includes(activeTab) || (navigationReady && canReadActiveTab && activeTab === 'configuracoes' && activeConfigTab === 'utilizadores');
  React.useEffect(() => {
    if (currentUser && !writesBlocked && isInitialDataLoaded && requiresActivity && activityStatus === 'idle') void loadActivity();
  }, [currentUser, writesBlocked, isInitialDataLoaded, requiresActivity, activityStatus, loadActivity]);
  const requiresProjectMaterials = canReadActiveTab && ['dashboard', 'projetos', 'reports'].includes(activeTab);
  React.useEffect(() => {
    if (currentUser && !writesBlocked && isInitialDataLoaded && requiresProjectMaterials && materialsStatus === 'idle') {
      void loadProjectMaterials();
    }
  }, [currentUser, writesBlocked, isInitialDataLoaded, requiresProjectMaterials, materialsStatus, loadProjectMaterials]);

  const requiresConfigRuntime = canReadActiveTab && activeTab === 'configuracoes' && (activeConfigTab === 'notificacoes' || activeConfigTab === 'automacoes');
  React.useEffect(() => {
    if (currentUser && !writesBlocked && isInitialDataLoaded && requiresConfigRuntime && configRuntimeStatus === 'idle') {
      void loadConfigRuntime();
    }
  }, [currentUser, writesBlocked, isInitialDataLoaded, requiresConfigRuntime, configRuntimeStatus, loadConfigRuntime]);

  const requiresDefaultTasks = Boolean(currentUser && hasPermission(currentUser, 'config_read')) &&
    (activeTab === 'projetos' || (activeTab === 'configuracoes' && activeConfigTab === 'tarefas'));
  React.useEffect(() => {
    if (currentUser && !writesBlocked && isInitialDataLoaded && requiresDefaultTasks && defaultTasksStatus === 'idle') {
      void loadDefaultTasks();
    }
  }, [currentUser, writesBlocked, isInitialDataLoaded, requiresDefaultTasks, defaultTasksStatus, loadDefaultTasks]);

  const [logoResult, setLogoResult] = useState<'synced' | 'error' | null>(null);
  const previousSyncStatus = React.useRef(syncStatus);
  React.useEffect(() => {
    const previous = previousSyncStatus.current;
    previousSyncStatus.current = syncStatus;
    if (previous !== 'syncing' || (syncStatus !== 'synced' && syncStatus !== 'error')) return;
    setLogoResult(syncStatus);
    const timeout = window.setTimeout(() => setLogoResult(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [syncStatus]);

  const configuredTheme = (currentUser && isInitialDataLoaded ? normalizeApplicationTheme(state?.appConfig?.theme) : null)
    ?? normalizeApplicationTheme(publicAppConfig?.theme);
  const applicationTheme = getPresentationTheme(Boolean(currentUser && isInitialDataLoaded), state?.appConfig?.theme, publicAppConfig?.theme, cachedTheme);
  const preferredTheme = normalizePreferredTheme(currentUser?.preferredTheme);
  const previewTheme = globalThemePreview && globalThemePreview.userId === currentUser?.id ? globalThemePreview.theme : null;
  const effectiveTheme = preferredTheme ?? previewTheme ?? applicationTheme;

  React.useEffect(() => {
    try { setCachedTheme(normalizeApplicationTheme(localStorage.getItem('erp_theme'))); }
    catch { /* Storage is optional. */ }
  }, []);

  React.useEffect(() => {
    if (!configuredTheme) return;
    setCachedTheme(configuredTheme);
    try { localStorage.setItem('erp_theme', configuredTheme); }
    catch { /* Storage is optional. */ }
  }, [configuredTheme]);

  React.useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.body.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  const applySavedProfile = (profile: { name: string; preferredTheme: ColorSchemeId | null }) => {
    const signedInUser = getClientUser();
    if (!signedInUser || signedInUser.id !== currentUser?.id) return;
    const updatedUser = { ...signedInUser, ...profile };
    setClientUser(updatedUser);
    setCurrentUser(updatedUser);
    if (profile.name !== signedInUser.name) void refreshFromDatabase();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInFlight.current || logoutPending || writesBlocked) return;
    loginInFlight.current = true;
    loginValidation.clear();
    setLoginError('');
    setIsLoggingIn(true);

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

        if (saved && saved.userId !== data.user.id) discard();
        resetAuthorizedData();
        setClientUser(data.user);
        setCurrentUser(data.user);
        manualSignIn.current = false;
        setSessionDenied(false);
        setLoginPassword('');
      } else {
        if (res.status === 422 && loginValidation.showApiError(apiRequestError(res, data, 'Verifique os dados de acesso.'))) return;
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
      }
    } catch (err) {
      console.error('Error logging in:', err);
      setLoginError('Ocorreu um erro ao ligar ao servidor de autenticação. Por favor, tente novamente.');
    }
    finally {
      setIsLoggingIn(false);
      loginInFlight.current = false;
    }
  };

  const tabs = React.useMemo(() => APP_SECTIONS.filter(section => canOpenSection(currentUser, section.id)), [currentUser]);
  const canReadAudit = canOpenSection(currentUser, 'configuracoes', 'auditoria');
  const accessRestricted = !canReadActiveTab;

  const canOpenNotificationLink = (destination: string) => {
    try {
      const url = new URL(destination, window.location.origin);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      if (url.origin !== window.location.origin || url.pathname !== '/') return true;
      const target = resolveNavigationTarget(url.searchParams);
      return canOpenSection(currentUser, target.tab, target.configTab);
    } catch {
      return false;
    }
  };

  const resumeDraft = saved?.userId === currentUser?.id && isInitialDataLoaded ? saved?.draft : null;
  const draftTab = resumeDraft?.kind === 'project' ? 'projetos' : resumeDraft?.kind === 'client' ? 'clientes' : 'tarefas';
  const draftRecords = resumeDraft?.kind === 'project' ? state.projects : resumeDraft?.kind === 'client' ? state.clients : state.tasks;
  const draftRecord = resumeDraft?.recordId && draftRecords.find(row => row.id === resumeDraft.recordId && !row.deleted);
  const [draftRead, draftWrite] = resumeDraft?.kind === 'project' ? ['projects_read', 'projects_write'] as const
    : resumeDraft?.kind === 'client' ? ['clients_read', 'clients_write'] as const : ['tasks_read', 'tasks_write'] as const;
  const canResume = resumeDraft && hasPermission(currentUser, draftRead) && hasPermission(currentUser, draftWrite) &&
    (!resumeDraft.recordId || (draftRecord && (draftRecord.version ?? 0) === (resumeDraft.version ?? 0))) &&
    (!resumeDraft.projectId || state.projects.some(project => project.id === resumeDraft.projectId && !project.deleted));
  const refreshSlow = useSlowRead(refreshProgress !== null);

  const logout = async () => {
    manualSignIn.current = true;
    sessionCheck.current += 1;
    discard();
    resetAuthorizedData();
    clearClientSession();
    setCurrentUser(null);
    setPendingTaskId(null);
    setGlobalThemePreview(null);
    setLogoutPending(true);
    try {
      const result = await fetch('/api/auth/session', { method: 'DELETE', headers: getAuthHeaders() });
      if (!result.ok) throw new Error('HTTP ' + result.status);
    } catch (error) {
      console.warn('[LOGOUT]', error);
      setLoginError('Não foi possível confirmar o fim da sessão no servidor.');
    } finally {
      setLogoutPending(false);
    }
  };

  // useERP exposes a clean baseline before authenticated data loads; never let
  // its default branding override the public configuration on a fresh login.
  const loginBranding = publicAppConfig || (isInitialDataLoaded ? state?.appConfig : null);

  if (connection !== 'ready' && connection !== 'checking' && !isInitialDataLoaded) {
    return <main className={AUTH_SCREEN}>
      <div className="w-full max-w-md space-y-4 rounded-card border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-bold">{connection === 'offline' ? 'Sem ligação' : 'Serviço temporariamente indisponível'}</h1>
        <p role="status" className="text-body-sm text-text-secondary">
          {connection === 'offline' ? 'Verifique a ligação à internet.' : 'Não foi possível confirmar a sessão ou atualizar os dados.'}
        </p>
        <Button type="button" onClick={() => void checkSession()}>Tentar novamente</Button>
      </div>
    </main>;
  }

  if (sessionDenied) {
    return <main className={AUTH_SCREEN}>
      <div className="w-full max-w-md space-y-4 rounded-card border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p role="alert" className="text-body-sm text-text-secondary">A sua conta não pode aceder à aplicação. Contacte um administrador.</p>
        <Button type="button" onClick={() => { setSessionDenied(false); void logout(); }}>Voltar ao início de sessão</Button>
      </div>
    </main>;
  }

  if (!mounted || (!currentUser && connection === 'checking')) {
    return (
      <AppLoadingScreen id="session-check-screen" />
    );
  }

  if (!currentUser) {
    return (
      <div className={AUTH_SCREEN}>
        <div className="w-full max-w-md bg-surface rounded-card shadow-modal border border-border-subtle overflow-hidden">
          <div className="p-8 pb-6 bg-overlay text-inverse text-center flex flex-col items-center">
            <AppLogo
              logoUrl={loginBranding?.logoImagePath || loginBranding?.logo}
              appName={loginBranding?.appName || ''}
              className="w-72 max-w-full h-16 rounded-card bg-surface p-2.5 mb-4 shadow-raised mx-auto"
              fallbackIconClassName="w-8 h-8 text-action-600"
            />
            {loginBranding?.appName ? (
              <h1 className="text-2xl font-bold font-sans tracking-tight">{loginBranding.appName}</h1>
            ) : null}
            {loginBranding?.appDescription ? (
              <p className="text-on-inverse text-sm mt-1">{loginBranding.appDescription}</p>
            ) : null}
          </div>

          <form ref={loginValidation.form} onChangeCapture={loginValidation.clearChanged} onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div role="alert" className="p-3 bg-feedback-error-50 text-feedback-error-600 rounded-control text-sm font-medium text-center border border-feedback-error-100">
                {loginError}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="login-email" className="block text-sm font-medium text-text-primary">E-mail</label>
              <input id="login-email" name="email"
                aria-invalid={!!loginValidation.errors.email}
                aria-describedby={loginValidation.errors.email ? 'login-email-error' : undefined}
                type="email"
                value={loginEmail}
                onChange={e => {
                  setLoginEmail(e.target.value);
                  if (loginError) setLoginError('');
                }}
                autoComplete="username"
                placeholder="nome@empresa.com"
                disabled={isLoggingIn || logoutPending}
                className={AUTH_INPUT}
                required
              />
                {loginValidation.errors.email && <p id="login-email-error" className="text-caption text-error">{loginValidation.errors.email}</p>}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label htmlFor="login-password" className="block text-sm font-medium text-text-primary">Password</label>

              </div>
              <div className="relative">
                <input id="login-password" name="password"
                aria-invalid={!!loginValidation.errors.password}
                aria-describedby={loginValidation.errors.password ? 'login-password-error' : undefined}
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => {
                    setLoginPassword(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  autoComplete="current-password"
                  placeholder="Introduza a password"
                  disabled={isLoggingIn || logoutPending}
                  className={`${AUTH_INPUT} pr-10`}
                  required
                />
                {loginValidation.errors.password && <p id="login-password-error" className="text-caption text-error">{loginValidation.errors.password}</p>}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer p-1"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                  title={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  disabled={isLoggingIn || logoutPending}
                  className="rounded-badge border-border text-action-600 focus:ring-action-500 w-4 h-4"
                />
                Lembrar login
              </label>
              <span className="text-micro text-text-muted">
                {rememberMe ? '30 dias' : 'Até fechar o navegador'}
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || logoutPending}
              className={`w-full py-3 text-inverse rounded-card font-bold transition-all duration-200 shadow-raised flex items-center justify-center gap-2.5 ${
                isLoggingIn
                  ? 'bg-action-500/90 cursor-wait'
                  : 'bg-action-600 hover:bg-action-700 active:scale-[0.99] cursor-pointer'
              }`}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-inverse" />
                  <span>A autenticar...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </button>



            <Link href="/reset-password" className="flex min-h-11 items-center justify-center text-sm font-semibold text-primary underline underline-offset-4">
              Esqueci-me da palavra-passe
            </Link>
            <div className="pt-4 text-center text-xs text-text-muted">
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
      <div className={AUTH_SCREEN} id="db-error-screen">
        <div className="w-full max-w-md bg-surface rounded-card border border-feedback-danger-100 p-8 text-center space-y-6 shadow-raised animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-feedback-danger-50 text-feedback-danger-600 flex items-center justify-center mx-auto border border-feedback-danger-100">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-text-primary font-sans tracking-tight">
              Erro ao carregar os dados
            </h1>
            <p className="text-text-secondary text-xs font-medium leading-relaxed">
              {syncError || 'Não foi possível obter os dados autoritativos da base de dados.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refreshFromDatabase()}
            className="w-full py-3 px-4 bg-action-600 hover:bg-action-700 active:scale-[0.99] text-inverse rounded-card text-xs font-bold transition-all shadow-raised flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Authenticated user: Authoritative data not yet loaded or transition in progress
  if (!isInitialDataLoaded) {
    return (
      <AppLoadingScreen id="loading-screen" progress={refreshProgress} />
    );
  }

  const appConfig = state?.appConfig || {};

  return (
    <ApplicationFeedbackProvider value={feedback}>
    <div className="min-h-screen flex flex-col bg-background text-text-primary" id="main-root" data-active-tab={activeTab} data-theme={effectiveTheme}>

      {/* HEADER BAR (Gmail / Material inspired contract: exactly 3 zones) */}
      <header className="m3-top-app-bar sticky top-0 z-50 h-16 px-4 flex items-center justify-between shrink-0" id="app-header">
        {/* Zone 1: Burger + Brand logo wordmark */}
        <div className="flex items-center gap-3 min-w-0">
          <IconButton
            variant="ghost"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden text-text-secondary hover:bg-surface-muted hover:text-text-primary rounded-full shrink-0"
            id="toggle-sidebar"
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </IconButton>

          <IconButton
            variant="ghost"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:inline-flex text-text-secondary hover:bg-surface-muted hover:text-text-primary rounded-full shrink-0"
            title={isCollapsed ? "Expandir menu" : "Colapsar menu"}
            id="toggle-desktop-sidebar"
            aria-label="Alternar menu lateral"
          >
            <Menu className="w-5 h-5" />
          </IconButton>

          <Link
            href="/?tab=dashboard"
            aria-label="Ir para o Dashboard"
            className="flex items-center gap-3 cursor-pointer select-none hover:opacity-90 transition-opacity min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-control"
            onClick={event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); handleTabChange('dashboard');
            }}
            title="Ir para o Dashboard"
          >
            <AppLogo
              logoUrl={appConfig.logoImagePath || appConfig.logo}
              appName={appConfig.appName}
              busy={syncStatus === 'syncing' && isDbConfigured}
              result={syncStatus === 'syncing' ? null : logoResult}
              className="w-auto max-w-[200px] h-10 bg-transparent border-0 shadow-none p-0 shrink"
            />
            <div className="min-w-0 hidden md:block">
              <h1 className="text-body font-bold text-text-primary tracking-tight leading-tight truncate">{appConfig.appName}</h1>
              <p className="text-caption text-text-muted font-medium truncate">{appConfig.appDescription}</p>
            </div>
          </Link>
        </div>

        {/* Zone 2 & 3: Actions + Notification + Profile dropdown */}
        <div className="flex items-center gap-3 shrink-0">

          <NotificationDropdown
            notifications={(state.notifications || []).filter(n => !n.userId || n.userId === currentUser.id || n.userId === 'all')}
            canOpenLink={canOpenNotificationLink}
            markAsRead={markNotificationAsRead}
            markAllAsRead={() => markAllNotificationsAsRead(currentUser.id)}
          />

          <Link
            href="/?tab=perfil"
            aria-label="Editar perfil"
            aria-current={activeTab === 'perfil' ? 'page' : undefined}
            onClick={event => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              if (activeTab !== 'perfil') handleTabChange('perfil');
            }}
            className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-all p-1.5 hover:bg-surface-muted rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            id="user-profile"
            title="Editar perfil"
          >
            <div className="w-8 h-8 rounded-full bg-primary text-inverse flex items-center justify-center font-bold text-caption border border-border shadow-raised uppercase shrink-0">
              {(() => {
                const parts = (currentUser.name || '').trim().split(/\s+/);
                if (parts.length >= 2) {
                  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
                }
                return (parts[0] || '').charAt(0).toUpperCase();
              })()}
            </div>

          </Link>
        </div>
      </header>

      {/* BODY WRAPPER */}
      <div className="flex-1 flex relative" id="body-wrapper">

        {/* Mobile drawer backdrop overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-16 bg-scrim/40 backdrop-blur-xs z-30 md:hidden animate-fade-in"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          />
        )}

        {/* SIDEBAR NAVIGATION - Gmail/Material inspired sidebar */}
        <aside
          className={`fixed top-16 bottom-0 left-0 z-40 h-[calc(100dvh-4rem)] transform ${
            sidebarOpen ? 'translate-x-0 shadow-overlay' : '-translate-x-full'
          } md:static md:top-auto md:bottom-auto md:h-auto md:translate-x-0 md:shadow-none md:flex flex-col ${
            isCollapsed ? 'md:w-20' : 'md:w-64'
          } w-72 max-w-[85vw] m3-nav-rail transition-all duration-200 ease-in-out`}
          id="sidebar-nav"
        >
          <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = (tab as any).disabled;

              if (tab.id === 'configuracoes') {
                const configSubItems = [
                  { id: 'aplicacao-menu', label: 'Configurações da aplicação', icon: Settings },
                  { id: 'clientes', label: 'Clientes', icon: Building, permission: 'clients_read' },
                  { id: 'ausencias', label: 'Registo de ausências', icon: Users, permission: 'absences_read' },
                  { id: 'utilizadores', label: 'Utilizadores', icon: Users },
                  { id: 'notificacoes', label: 'Notificações e Automações', icon: Bell },
                  { id: 'sistema-menu', label: 'Sistema', icon: Database },
                ];
                const visibleConfigSubItems = configSubItems.filter(
                  sub => !sub.permission || hasPermission(currentUser, sub.permission as any)
                );
                const isConfigSectionActive = isActive || visibleConfigSubItems.some(
                  sub => (sub.id === 'clientes' || sub.id === 'ausencias') && sub.id === activeTab
                );

                return (
                  <div key={tab.id} className="space-y-1">
                    <button
                      disabled={isDisabled}
                      onClick={() => {
                        if (!isDisabled) {
                          handleConfigTabChange('sistema');
                        }
                      }}
                      className={cn(
                        "m3-nav-item w-full flex items-center gap-3 py-3 font-semibold transition-all duration-150 cursor-pointer select-none",
                        isCollapsed ? 'md:justify-center md:px-0 md:border-l-0' : 'px-4',
                        isDisabled
                          ? 'opacity-40 cursor-not-allowed text-text-disabled border-transparent'
                          : isConfigSectionActive
                            ? 'is-active'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted border-transparent'
                      )}
                      id={`tab-${tab.id}`}
                      title={isCollapsed ? (isDisabled ? `${tab.label} (Desativado)` : tab.label) : undefined}
                    >
                      <Icon className={cn(
                        "w-5 h-5 flex-shrink-0 transition-colors",
                        isDisabled ? 'text-text-disabled' : isActive ? 'text-primary-ink' : 'text-text-muted'
                      )} />
                      <span className={cn("text-body truncate", isCollapsed ? 'md:hidden' : 'block')}>{tab.label}</span>
                    </button>

                    {/* Submenu under Configurações */}
                    {isConfigSectionActive && (
                      <div className={cn("space-y-1.5 my-1.5", isCollapsed ? 'md:pl-0' : 'pl-5 pr-1')}>
                        {visibleConfigSubItems.map(sub => {
                          const SubIcon = sub.icon;
                          const isSubActive = sub.id === 'clientes' || sub.id === 'ausencias'
                            ? activeTab === sub.id
                            : activeTab === 'configuracoes' && (sub.id === 'aplicacao-menu'
                              ? ['sistema', 'campos', 'dias', 'tarefas'].includes(activeConfigTab)
                              : sub.id === 'sistema-menu'
                                ? ['auditoria', 'importacao'].includes(activeConfigTab)
                                : activeConfigTab === sub.id);
                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleConfigTabChange(sub.id === 'aplicacao-menu' ? 'sistema' : sub.id === 'sistema-menu' ? (canReadAudit ? 'auditoria' : 'importacao') : sub.id)}
                              className={cn(
                                "w-full flex items-center gap-2.5 py-2 rounded-control text-caption font-semibold transition-all duration-150 cursor-pointer select-none border-l-2",
                                isCollapsed ? 'md:justify-center md:px-0 md:border-l-0' : 'px-3',
                                isSubActive
                                  ? 'bg-primary/5 text-primary-ink font-bold border-primary'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted border-transparent'
                              )}
                              title={isCollapsed ? sub.label : undefined}
                            >
                              <SubIcon className={cn(
                                "w-4 h-4 shrink-0 transition-colors",
                                isSubActive ? 'text-primary-ink' : 'text-text-muted'
                              )} />
                              <span className={cn("truncate", isCollapsed ? 'md:hidden' : 'block')}>{sub.label}</span>
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
                  className={cn(
                    "m3-nav-item w-full flex items-center gap-3 py-3 font-semibold transition-all duration-150 cursor-pointer select-none",
                    isCollapsed ? 'md:justify-center md:px-0 md:border-l-0' : 'px-4',
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed text-text-disabled border-transparent'
                      : isActive
                        ? 'is-active'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted border-transparent'
                  )}
                  id={`tab-${tab.id}`}
                  title={isCollapsed ? (isDisabled ? `${tab.label} (Desativado)` : tab.label) : undefined}
                >
                  <Icon className={cn(
                    "w-5 h-5 flex-shrink-0 transition-colors",
                    isDisabled ? 'text-text-disabled' : isActive ? 'text-primary-ink' : 'text-text-muted'
                  )} />
                  <span className={cn("text-body truncate", isCollapsed ? 'md:hidden' : 'block')}>{tab.label}</span>
                </button>
              );
            })}
          </div>

        </aside>

        {/* MAIN PANEL CONTENT */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 overflow-y-auto bg-background" id="main-content">
          <div className="max-w-7xl mx-auto space-y-6">


            {connection !== 'ready' && <div role="status" className="rounded-card border border-border bg-surface p-4 text-body-sm">
              <strong>{connection === 'offline' ? 'Sem ligação' : connection === 'checking' ? 'A verificar a ligação…' : 'Ligação indisponível'}</strong>
              <p className="text-text-secondary">Pode consultar os dados já carregados. As gravações ficam disponíveis após a verificação.</p>
              {connection === 'unavailable' && <Button type="button" size="sm" className="mt-2" onClick={() => void checkSession()}>Tentar novamente</Button>}
            </div>}

            {syncStatus === 'error' && connection === 'ready' && (
              <div id="db-error-banner" className="flex flex-wrap items-center gap-3 rounded-card border border-error/20 bg-surface p-4 text-body-sm">
                <span role="alert">{syncError || 'Não foi possível concluir a operação.'}</span>
                <Button type="button" variant="secondary" size="sm" onClick={() => void refreshFromDatabase()}>Atualizar dados</Button>
              </div>
            )}
            {refreshSlow && <p role="status" className="text-body-sm text-text-secondary">A atualização está a demorar mais do que o habitual.</p>}

            {resumeDraft && !writesBlocked && <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 text-body-sm">
              <span role="status">{canResume ? 'Tem uma edição por concluir.' : 'A edição anterior já não pode ser retomada. O acesso ou o registo mudou.'}</span>
              {canResume && <Button type="button" size="sm" onClick={() => {
                setPendingTaskId(null);
                handleTabChange(draftTab);
                feedback.setResume(resumeDraft);
                setSaved(null);
              }}>Retomar edição</Button>}
              <Button type="button" variant="ghost" size="sm" onClick={() => setSaved(null)}>Descartar</Button>
            </div>}

            {notice && <div className="flex flex-wrap items-center gap-3 rounded-card border border-success/30 bg-surface p-4 text-body-sm">
              <span role="status">{notice.message}</span>
              {notice.target?.kind === 'project' && hasPermission(currentUser, 'projects_read') &&
                <Button type="button" size="sm" variant="secondary" onClick={() => { handleSelectProject(notice.target!.id); notify(null); }}>Ver projeto</Button>}
              {notice.target?.kind === 'task' && hasPermission(currentUser, 'tasks_read') &&
                <Button type="button" size="sm" variant="secondary" onClick={() => { handleTabChange('tarefas'); setPendingTaskId(notice.target!.id); notify(null); }}>Ver tarefa</Button>}
              <Button type="button" size="sm" variant="ghost" onClick={() => notify(null)}>Fechar</Button>
            </div>}

            {accessRestricted ? (
              <section className="rounded-card border border-border bg-surface p-8 text-center space-y-3" aria-labelledby="restricted-title">
                <h1 id="restricted-title" className="text-xl font-bold">Acesso restrito</h1>
                <p role="alert" className="text-body-sm text-text-secondary">Esta secção requer permissões adicionais. Contacte um administrador para as solicitar.</p>
                <Button type="button" onClick={() => handleTabChange('dashboard')}>Voltar ao Dashboard</Button>
              </section>
            ) : (
            <div id="active-tab-content" key={`${activeTab}-${navKey}`} className="animate-fade-in">
              {!navigationReady ? <SectionLoading /> : requiresWork && workStatus !== 'loaded' ? <SectionDataFeedback status={workStatus} retry={loadWork} blocked={writesBlocked} /> : requiresActivity && activityStatus !== 'loaded' ? <SectionDataFeedback status={activityStatus} retry={loadActivity} blocked={writesBlocked} /> : <>

              {activeTab === 'perfil' && <ProfilePage key={currentUser.id}
                user={{ name: currentUser.name, email: currentUser.email, preferredTheme }} applicationTheme={applicationTheme}
                onSaved={applySavedProfile} onLogout={() => void logout()} writesBlocked={writesBlocked} />}

              {activeTab !== 'projetos' && requiresProjectMaterials && materialsStatus !== 'loaded' &&
                <SectionDataFeedback status={materialsStatus} retry={loadProjectMaterials} blocked={writesBlocked} />}
              {activeTab !== 'projetos' && requiresDefaultTasks && defaultTasksStatus !== 'loaded' &&
                <SectionDataFeedback status={defaultTasksStatus} retry={loadDefaultTasks} blocked={writesBlocked} />}
              {activeTab === 'dashboard' && materialsStatus === 'loaded' && (
                <BentoDashboard
                  projects={state.projects}
                  tasks={state.tasks}
                  absences={state.userAbsences}
                  specialDays={state.specialDays}
                  projectMaterials={state.projectMaterials || []}
                  projectRiskItems={state.projectRiskItems || []}
                  riskStatuses={state.riskStatuses || []}
                  comments={state.comments}
                  clients={state.clients}
                  users={state.users}
                  projectStatuses={state.projectStatuses}
                  taskStatuses={state.taskStatuses}
                  projectCategories={state.projectCategories}
                  projectPriorities={state.projectPriorities}
                  onNavigate={handleTabChange}
                  onSelectProject={handleSelectProject}
                  onSelectTask={openPendingTask}
                  canOpenProjects={hasPermission(currentUser, 'projects_read')}
                />
              )}

              {activeTab === 'my-focus' && (
                <MyFocusSection
                  key={currentUser.id}
                  currentUser={currentUser}
                  users={state.users}
                  userGroups={state.userGroups}
                  tasks={state.tasks}
                  projects={state.projects}
                  clients={state.clients}
                  specialDays={state.specialDays || []}
                  taskStatuses={state.taskStatuses}
                  taskTypes={state.taskTypes}
                  userAbsences={state.userAbsences}
                  projectStatuses={state.projectStatuses}
                  projectRiskItems={state.projectRiskItems || []}
                  riskStatuses={state.riskStatuses || []}
                  updateTask={updateTask}
                  addTask={addTask}
                  deleteTask={deleteTask}
                  onSelectProject={handleSelectProject}
                  onSelectMechanicalRequest={id => { setSelectedMechanicalRequestId(id); handleTabChange('mechanical-design'); }}
                  onSelectPresalesRequest={id => { setSelectedPresalesRequestId(id); handleTabChange('presales'); }}
                  appConfig={state.appConfig}
                />
              )}

              {activeTab === 'reports' && materialsStatus === 'loaded' && (
                <ReportsSection
                  projects={state.projects || []}
                  tasks={state.tasks || []}
                  projectMaterials={state.projectMaterials || []}
                  clients={state.clients || []}
                  projectPriorities={state.projectPriorities || []}
                  taskStatuses={state.taskStatuses || []}
                  projectStatuses={state.projectStatuses || []}
                  users={state.users || []}
                  onSelectProject={handleSelectProject}
                  onSelectTask={openPendingTask}
                  canOpenProjects={hasPermission(currentUser, 'projects_read')}
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
                  defaultTasksFeedback={requiresDefaultTasks && defaultTasksStatus !== 'loaded'
                    ? <SectionDataFeedback status={defaultTasksStatus} retry={loadDefaultTasks} blocked={writesBlocked} /> : undefined}
                  materialsFeedback={materialsStatus !== 'loaded'
                    ? <SectionDataFeedback status={materialsStatus} retry={loadProjectMaterials} blocked={writesBlocked} /> : undefined}
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
                  projectStatuses={state.projectStatuses}
                  clients={state.clients}
                  users={state.users}
                  absences={state.userAbsences || []}
                  taskStatuses={state.taskStatuses}
                  taskTypes={state.taskTypes || []}
                  projectPriorities={state.projectPriorities || []}
                  addTask={addTask}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                  appConfig={state.appConfig}
                />
              )}

              {activeTab === 'mechanical-design' && (
                <MechanicalDesignSection currentUser={currentUser} users={state.users}
                  projects={state.projects} projectStatuses={state.projectStatuses} projectPriorities={state.projectPriorities}
                  initialRequestId={selectedMechanicalRequestId}
                  onTasksChanged={refreshFromDatabase} />
              )}

              {activeTab === 'presales' && (
                <PresalesSection currentUser={currentUser} users={state.users} clients={state.clients || []} projectPriorities={state.projectPriorities || []}
                  initialRequestId={selectedPresalesRequestId} onTasksChanged={refreshFromDatabase} />
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
                  projectPriorities={state.projectPriorities || []}
                  projectStatuses={state.projectStatuses}
                  specialDays={state.specialDays}
                  projectRiskItems={state.projectRiskItems || []}
                  addTask={addTask}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  onSelectProject={handleSelectProject}
                  currentUser={currentUser}
                  userGroups={state.userGroups}
                  appConfig={state.appConfig}
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
                <AbsencesSection
                  absences={state.userAbsences}
                  users={state.users}
                  activeRoles={state.activeRoles}
                  addAbsence={addAbsence}
                  deleteAbsence={deleteAbsence}
                  appConfig={state.appConfig}
                  specialDays={state.specialDays}
                  currentUser={currentUser}
                />
              )}

              {requiresConfigRuntime && configRuntimeStatus !== 'loaded' &&
                <SectionDataFeedback status={configRuntimeStatus} retry={loadConfigRuntime} blocked={writesBlocked} />}
              {activeTab === 'configuracoes' && (!requiresConfigRuntime || configRuntimeStatus === 'loaded') && (!requiresDefaultTasks || defaultTasksStatus === 'loaded') && (
                <ConfigSection
                  onPreviewTheme={theme => setGlobalThemePreview(theme ? { userId: currentUser.id, theme } : null)}
                  activeConfigTab={activeConfigTab}
                  onChangeConfigTab={handleConfigTabChange}
                  config={appConfig}
                  specialDays={state.specialDays}
                  updateConfig={updateConfig}
                  onRefreshFromDatabase={refreshFromDatabase}
                  canReadAudit={canReadAudit}
                  addSpecialDay={addSpecialDay!}
                  updateSpecialDay={updateSpecialDay!}
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
                  databaseStatus={syncStatus}
                  databaseError={syncError}
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
                />
              )}
              </>}
            </div>
            )}

          </div>
        </main>

      </div>

      {/* FOOTER COPYRIGHT */}
      <footer className="bg-surface border-t border-border py-3 px-6 text-center text-caption text-text-muted font-medium" id="app-footer-copyright">
        {appConfig.footerCopyrightText}
      </footer>

      {pendingTask && hasPermission(currentUser, 'tasks_read') && !accessRestricted && (activeTab === 'dashboard' || activeTab === 'reports' || activeTab === 'tarefas') && <TaskDetailsModal
        key={pendingTask.id}
        isOpen
        task={pendingTask}
        mode={activeTab === 'tarefas' ? 'view' : 'edit'}
        onClose={() => setPendingTaskId(null)}
        onSaveSuccess={() => setPendingTaskId(null)}
        onDeleteSuccess={() => setPendingTaskId(null)}
        updateTask={updateTask}
        deleteTask={deleteTask}
        taskStatuses={state.taskStatuses}
        taskTypes={state.taskTypes || []}
        projectPriorities={state.projectPriorities || []}
        users={state.users}
        userGroups={state.userGroups}
        appConfig={state.appConfig}
        projects={state.projects}
        clients={state.clients}
        absences={state.userAbsences || []}
        tasks={state.tasks}
        canWrite={hasPermission(currentUser, 'tasks_write')}
        canDelete={hasPermission(currentUser, 'tasks_delete')}
      />}

    </div>
    </ApplicationFeedbackProvider>
  );
}
