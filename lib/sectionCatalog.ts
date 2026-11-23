import {
  Briefcase, Calendar, ChartNoAxesCombined, CheckSquare, Compass, LayoutDashboard, PenTool, Settings, FileText,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { hasPermission, type GroupPermissions } from './permissions';

export type SectionId = 'dashboard' | 'my-focus' | 'projetos' | 'presales' | 'mechanical-design' | 'tarefas' | 'reports' | 'calendario' | 'configuracoes';

export interface AppSection {
  id: SectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermission?: keyof GroupPermissions;
}

/** Single metadata registry consumed by the main navigation and its access gate. */
export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-focus', label: 'O meu foco', icon: Compass },
  { id: 'projetos', label: 'Projetos', icon: Briefcase, requiredPermission: 'projects_read' },
  { id: 'tarefas', label: 'Tarefas', icon: CheckSquare, requiredPermission: 'tasks_read' },
  { id: 'calendario', label: 'Calendário', icon: Calendar, requiredPermission: 'calendar_read' },
  { id: 'presales', label: 'Presales', icon: FileText, requiredPermission: 'presales_read' },
  { id: 'mechanical-design', label: 'Desenho mecânico', icon: PenTool, requiredPermission: 'mechanical_design_read' },
  { id: 'reports', label: 'Relatórios', icon: ChartNoAxesCombined, requiredPermission: 'reports_read' },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, requiredPermission: 'config_read' },
];


export function canOpenSection(user: Parameters<typeof hasPermission>[0], tab: string, configTab?: string) {
  if (!user) return false;
  if (tab === 'clientes' || tab === 'ausencias') {
    return hasPermission(user, tab === 'clientes' ? 'clients_read' : 'absences_read');
  }
  const section = APP_SECTIONS.find(item => item.id === tab);
  if (!section || (section.requiredPermission && !hasPermission(user, section.requiredPermission))) return false;
  if (tab === 'configuracoes' && configTab === 'auditoria') {
    return Boolean(user.isAdmin || (Array.isArray(user.permissions) && user.permissions.includes('admin.access')));
  }
  return true;
}
