import {
  Briefcase, Calendar, ChartNoAxesCombined, CheckSquare, Compass, LayoutDashboard, PenTool, Settings,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type SectionId = 'dashboard' | 'meu-foco' | 'projetos' | 'desenho-mecanico' | 'tarefas' | 'relatorios' | 'calendario' | 'configuracoes';

export interface AppSection {
  id: SectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermission?: string;
}

/** Single metadata registry consumed by the main navigation and its access gate. */
export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'meu-foco', label: 'O meu foco', icon: Compass },
  { id: 'projetos', label: 'Projetos', icon: Briefcase, requiredPermission: 'projects_read' },
  { id: 'desenho-mecanico', label: 'Desenho mecânico', icon: PenTool },
  { id: 'tarefas', label: 'Tarefas', icon: CheckSquare, requiredPermission: 'tasks_read' },
  { id: 'relatorios', label: 'Relatórios', icon: ChartNoAxesCombined, requiredPermission: 'reports_read' },
  { id: 'calendario', label: 'Calendário', icon: Calendar, requiredPermission: 'calendar_read' },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, requiredPermission: 'config_read' },
];
