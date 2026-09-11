export interface Project {
  id: string;
  demo: boolean;
  clientId: string; // Relation: Clients table
  title: string;
  description: string;
  categoryId: string; // Relation: Project category table
  categoryIds?: string[]; // Relation: Multiple Project categories
  statusId: string; // Relation: Project status table
  projectManagerId: string; // Relation: Users table (team type)
  fieldManagerId: string; // Relation: Users table (team type)
  salesRepId: string; // Relation: Users table (sales type)
  startDate: string;
  deliveryDate: string;
  estimatedDate: string;
  scheduledDate: string;
  installProjectNo: string;
  sfOpportunityNo: string;
  riskId?: string; // Relation: Project risk table (legacy/optional)
  priorityId: string; // Relation: Project priority table
  teamsInvolvedIds: string[]; // Relation: Project teams table
  partnersIds: string[]; // Relation: Project partners table
  documents: string[]; // List of file names
  budgetValue: number;
  createdById: string; // Relation: Users table
  deleted: boolean;
  createdDate: string;
  updatedDate: string;
  clientContactName?: string;
  clientContactEmail?: string;
  clientContactPhone?: string;
}

export interface Task {
  id: string;
  projectId: string; // Relation: Projects table
  title: string;
  statusId: string; // Relation: Task status table
  taskTypeId?: string; // Relation: Task types table
  assigneeIds: string[]; // Relation: Users table (team type)
  estimatedDate: string;
  description: string;
  estimatedHours: string; // e.g. "08:00"
  actualHours: string; // e.g. "04:30"
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  notes: string;
  deleted: boolean;
  createdDate: string;
  isMilestone?: boolean; // Retrocompatibilidade (substituído pelo tipo de tarefa "Marco de projeto")
}

export interface TaskType {
  id: string;
  name: string;
  scale: number; // Nível da tarefa
  deleted?: boolean;
  sort_order?: number;
}

export interface TaskStatus {
  id: string;
  name: string;
  scale: number;
  deleted?: boolean;
  sort_order?: number;
}

export interface Comment {
  id: string;
  projectId: string; // Relation: Projects table
  authorId: string; // Relation: Users table
  comment: string;
  createdDate: string;
}

export interface UserAbsence {
  id: string;
  userId: string; // Relation: Users table (team type)
  absenceStartDate: string;
  absenceEndDate: string;
  reason: 'Vacation' | 'Sick leave' | 'Other' | string;
  createdDate: string;
}

export interface User {
  id: string;
  type: 'Team' | 'Sales' | 'External' | 'Other';
  name: string;
  email: string;
  password?: string;
  roleId: string; // Relation: User groups table
  approved: boolean;
  deleted: boolean;
  createdDate: string;
  isAdmin?: boolean;
}

export interface UserGroup {
  id: string;
  name: string;
  deleted: boolean;
  permissions?: any;
  sort_order?: number;
}

export interface ProjectStatus {
  id: string;
  name: string;
  scale: number;
  deleted: boolean;
  sort_order?: number;
}

export interface ProjectCategory {
  id: string;
  name: string;
  deleted: boolean;
  sort_order?: number;
}

export interface ProjectRisk {
  id: string;
  name: string;
  scale: number;
  deleted: boolean;
  sort_order?: number;
}

export interface ProjectPriority {
  id: string;
  name: string;
  scale: number;
  deleted: boolean;
  sort_order?: number;
}

export interface ProjectTeam {
  id: string;
  name: string;
  deleted: boolean;
  sort_order?: number;
}

export interface ProjectPartner {
  id: string;
  name: string;
  deleted: boolean;
  sort_order?: number;
}

export interface RiskCategory {
  id: string;
  name: string;
  deleted?: boolean;
  sort_order?: number;
}

export interface RiskStatus {
  id: string;
  name: string;
  deleted?: boolean;
  sort_order?: number;
}

export interface RiskPriority {
  id: string;
  name: string;
  scale?: number;
  deleted?: boolean;
  sort_order?: number;
}

export interface ProjectRiskItem {
  id: string;
  projectId: string; // Relation: Projects table
  title: string;
  categoryId: string; // Relation: RiskCategory
  identificationDate: string; // YYYY-MM-DD
  ownerId: string; // Relation: Users table
  description: string;
  consequence: string; // Impactos caso o risco se concretize
  probability: number; // 1-5
  impact: number; // 1-5
  mitigationPlan: string; // Ações preventivas
  contingencyPlan: string; // Ações caso se concretize
  reviewDate: string; // Data de revisão
  statusId: string; // Relation: RiskStatus
  priorityId: string; // Relation: RiskPriority
  deleted?: boolean;
  createdDate?: string;
}

export interface AppConfiguration {
  appName: string;
  appDescription: string;
  footerText: string;
  logo: string; // Base64 or placeholder
  footerCopyrightText?: string;
  logoImagePath?: string;
  theme?: string;
  salesRepGroupId?: string;
  projManagerGroupId?: string;
  fieldManagerGroupId?: string;
  salesRepGroupIds?: string[];
  projManagerGroupIds?: string[];
  fieldManagerGroupIds?: string[];
}

export interface Client {
  id: string;
  clientName: string;
  shortName: string;
  location: string;
  taxId: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  notes?: string;
  deleted: boolean;
  createdDate: string;
}

export interface Material {
  id: string;
  name: string;
  reference: string;
  manufacturerReference: string;
  unit: string; // pcs, m, kg
  unitCost: number;
  supplier: string;
  deleted: boolean;
  createdDate: string;
}

export interface ProjectMaterial {
  id: string;
  projectId: string;
  description: string; // Obrigatório
  supplier: string; // Obrigatório (fornecedor)
  quantity: number;
  reference?: string;
  budget?: string | number; // N° de orçamento
  costPrice?: number; // Preço custo
  salePrice?: number; // Preço venda
  expectedDeliveryDate?: string; // Data prevista de entrega
  status: 'por_encomendar' | 'encomendado' | 'em_armazem' | string; // 'por_encomendar' | 'encomendado' | 'em_armazem'
  deleted?: boolean;
  createdDate?: string;
}

export interface Quote {
  id: string;
  projectId: string; // Relation: Projects table (or empty if Client-only)
  clientId: string; // Relation: Clients table (if project is not yet created)
  projectIdOrClientId?: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | string;
  version: string | number;
  totalValue: number;
  validUntil: string;
  responsibleId: string; // Relation: Users table
  responsible?: string;
  deleted: boolean;
  createdDate: string;
}

export interface BillOfMaterial {
  id: string;
  quoteId: string; // Relation: Quotes table
  materialId: string; // Relation: Material table
  quantity: number;
  deleted: boolean;
  createdDate: string;
}

export interface Equipment {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  projectId: string; // Relation: Projects table (or empty)
  clientId: string; // Relation: Clients table (or empty)
  projectIdOrClientId?: string;
  status: 'Active' | 'Inactive' | 'Decommissioned' | string;
  installationDate: string;
  deleted: boolean;
  createdDate: string;
}

export interface SpecialDay {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface DefaultTask {
  id: string;
  title: string;
  description: string;
  estimatedHours: string;
  taskTypeId?: string;
}

export interface AutomationAction {
  type: 'create_default_tasks' | 'change_project_status' | 'send_notification' | 'assign_user';
  params?: {
    targetStatusId?: string;
    notificationTitle?: string;
    notificationMessage?: string;
    targetUserId?: string;
  };
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: 'project_status_changed' | 'task_status_changed' | 'task_created' | 'quote_approved';
  triggerCondition?: {
    fromStatusId?: string;
    toStatusId?: string;
  };
  actions: AutomationAction[];
  createdDate: string;
}

export interface NotificationSetting {
  id: string;
  type: string; // 'new_project', 'project_allocation', 'task_allocation', 'task_due_date', 'project_due_date', 'project_scheduled_date'
  name: string;
  enabled: boolean;
  daysBefore: number;
  targetGroup: 'all' | 'allocated' | 'managers';
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdDate: string;
  linkUrl?: string;
}

export interface ERPState {
  projects: Project[];
  tasks: Task[];
  taskStatuses: TaskStatus[];
  taskTypes?: TaskType[];
  comments: Comment[];
  userAbsences: UserAbsence[];
  users: User[];
  userGroups: UserGroup[];
  projectStatuses: ProjectStatus[];
  projectCategories: ProjectCategory[];
  projectRisks: ProjectRisk[];
  projectPriorities: ProjectPriority[];
  projectTeams: ProjectTeam[];
  projectPartners: ProjectPartner[];
  appConfig: AppConfiguration;
  clients: Client[];
  materials: Material[];
  projectMaterials?: ProjectMaterial[];
  quotes: Quote[];
  billOfMaterials: BillOfMaterial[];
  equipmentList: Equipment[];
  specialDays: SpecialDay[];
  defaultTasks?: DefaultTask[];
  notificationSettings?: NotificationSetting[];
  notifications?: Notification[];
  projectRiskItems?: ProjectRiskItem[];
  riskCategories?: RiskCategory[];
  riskStatuses?: RiskStatus[];
  riskPriorities?: RiskPriority[];
  automationRules?: AutomationRule[];
}
