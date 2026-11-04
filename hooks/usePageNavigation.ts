'use client';

import React, { useState } from 'react';

const CONFIG_TAB_SLUGS: Record<string, string> = {
  sistema: 'configuration',
  campos: 'aux-fields',
  dias: 'special-days',
  clientes: 'clients',
  ausencias: 'absences',
  tarefas: 'task-templates',
  utilizadores: 'users',
  notificacoes: 'notifications',
  automacoes: 'automations',
  auditoria: 'audit-log',
  importacao: 'import-database',
};

const CONFIG_SLUG_TABS = Object.fromEntries(
  Object.entries(CONFIG_TAB_SLUGS).map(([tab, slug]) => [slug, tab])
);

export function usePageNavigation(mounted: boolean, hasState: boolean) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMechanicalRequestId, setSelectedMechanicalRequestId] = useState<string | null>(null);
  const [selectedPresalesRequestId, setSelectedPresalesRequestId] = useState<string | null>(null);
  const [activeConfigTab, setActiveConfigTab] = useState('sistema');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navKey, setNavKey] = useState(0);
  const hasProcessedDeepLink = React.useRef(false);

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

  React.useEffect(() => {
    scrollToTop();
    const timer = setTimeout(scrollToTop, 0);
    const raf = requestAnimationFrame(scrollToTop);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [activeTab, selectedProjectId, navKey, scrollToTop]);

  React.useEffect(() => {
    if (mounted && hasState && !hasProcessedDeepLink.current) {
      hasProcessedDeepLink.current = true;
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const projectParam = params.get('project');
      const requestParam = params.get('request');

      if (tabParam) {
        const configTab = CONFIG_SLUG_TABS[tabParam];
        if (configTab) {
          if (configTab === 'clientes' || configTab === 'ausencias') {
            setActiveTab(configTab);
          } else {
            setActiveTab('configuracoes');
            setActiveConfigTab(configTab);
          }
        } else {
          setActiveTab(({ 'meu-foco': 'my-focus', 'relatorios': 'reports', 'desenho-mecanico': 'mechanical-design' } as Record<string, string>)[tabParam] || tabParam);
        }
      }
      if (projectParam) setSelectedProjectId(projectParam);
      if (requestParam && tabParam === 'presales') setSelectedPresalesRequestId(requestParam);
      else if (requestParam) setSelectedMechanicalRequestId(requestParam);
    }
  }, [mounted, hasState]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSelectedProjectId(null);
    setNavKey(prev => prev + 1);
    setSidebarOpen(false);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', tabId === 'configuracoes'
        ? CONFIG_TAB_SLUGS[activeConfigTab] || CONFIG_TAB_SLUGS.sistema
        : tabId);
      params.delete('project');
      window.history.pushState(null, '', '?' + params.toString());
      scrollToTop();
    }
  };

  const handleConfigTabChange = (configTab: string) => {
    const isNestedPage = configTab === 'clientes' || configTab === 'ausencias';
    setActiveTab(isNestedPage ? configTab : 'configuracoes');
    setActiveConfigTab(configTab);
    setSelectedProjectId(null);
    setNavKey(prev => prev + 1);
    setSidebarOpen(false);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', CONFIG_TAB_SLUGS[configTab] || CONFIG_TAB_SLUGS.sistema);
      params.delete('project');
      window.history.pushState(null, '', '?' + params.toString());
      scrollToTop();
    }
  };

  const handleSelectProject = (projId: string | null) => {
    setSelectedProjectId(projId);
    if (projId) setActiveTab('projetos');
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

  return {
    activeTab, setActiveTab, activeConfigTab, selectedProjectId,
    selectedMechanicalRequestId, setSelectedMechanicalRequestId,
    selectedPresalesRequestId, setSelectedPresalesRequestId,
    sidebarOpen, setSidebarOpen, navKey,
    handleTabChange, handleConfigTabChange, handleSelectProject,
  };
}
