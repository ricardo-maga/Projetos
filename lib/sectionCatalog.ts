import {
  Briefcase, Calendar, ChartNoAxesCombined, CheckSquare, Compass, LayoutDashboard, PenTool, Settings,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type SectionId = 'dashboard' | 'my-focus' | 'projetos' | 'mechanical-design' | 'tarefas' | 'reports' | 'calendario' | 'configuracoes';

export interface AppSection {
  id: SectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermission?: string;
}

/** Single metadata registry consumed by the main navigation and its access gate. */
export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-focus', label: 'O meu foco', icon: Compass },
  { id: 'projetos', label: 'Projetos', icon: Briefcase, requiredPermission: 'projects_read' },
  { id: 'mechanical-design', label: 'Desenho mecânico', icon: PenTool, requiredPermission: 'mechanical_design_read' },
  { id: 'tarefas', label: 'Tarefas', icon: CheckSquare, requiredPermission: 'tasks_read' },
  { id: 'reports', label: 'Relatórios', icon: ChartNoAxesCombined, requiredPermission: 'reports_read' },
  { id: 'calendario', label: 'Calendário', icon: Calendar, requiredPermission: 'calendar_read' },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, requiredPermission: 'config_read' },
];
