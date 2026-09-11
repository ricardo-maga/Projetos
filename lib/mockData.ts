import { ERPState } from './types';

export const INITIAL_ERP_STATE: ERPState = {
  userGroups: [
    { id: 'ug-1', name: 'Administrator', deleted: false },
    { id: 'ug-2', name: 'Project Manager', deleted: false },
    { id: 'ug-3', name: 'Technician', deleted: false },
    { id: 'ug-4', name: 'Viewer', deleted: false },
  ],
  projectStatuses: [
    { id: 'ps-1', name: 'Por iniciar', scale: 1, deleted: false },
    { id: 'ps-2', name: 'Iniciado', scale: 2, deleted: false },
    { id: 'ps-3', name: 'Preparação', scale: 3, deleted: false },
    { id: 'ps-4', name: 'Ensaios', scale: 4, deleted: false },
    { id: 'ps-5', name: 'Implementação', scale: 5, deleted: false },
    { id: 'ps-6', name: 'Concluído', scale: 6, deleted: false },
    { id: 'ps-7', name: 'Em pausa', scale: 7, deleted: false },
    { id: 'ps-8', name: 'Melhorias', scale: 8, deleted: false },
  ],
  projectCategories: [
    { id: 'pc-1', name: 'Internal', deleted: false },
    { id: 'pc-2', name: 'Standard', deleted: false },
    { id: 'pc-3', name: 'Labeling', deleted: false },
    { id: 'pc-4', name: 'Weighing', deleted: false },
    { id: 'pc-5', name: 'Vision/Scanner', deleted: false },
    { id: 'pc-6', name: 'Cross-team support', deleted: false },
    { id: 'pc-7', name: 'Other', deleted: false },
  ],
  projectRisks: [
    { id: 'pr-1', name: 'Low', scale: 1, deleted: false },
    { id: 'pr-2', name: 'Medium', scale: 2, deleted: false },
    { id: 'pr-3', name: 'High', scale: 3, deleted: false },
  ],
  projectPriorities: [
    { id: 'pp-1', name: 'Medium', scale: 1, deleted: false },
    { id: 'pp-2', name: 'High', scale: 2, deleted: false },
    { id: 'pp-3', name: 'Urgent', scale: 3, deleted: false },
  ],
  projectTeams: [
    { id: 'pt-1', name: 'Software', deleted: false },
    { id: 'pt-2', name: 'Installations', deleted: false },
    { id: 'pt-3', name: 'Repairs', deleted: false },
    { id: 'pt-4', name: 'Partner', deleted: false },
  ],
  projectPartners: [
    { id: 'par-1', name: 'JDG', deleted: false },
    { id: 'par-2', name: 'Machserv', deleted: false },
    { id: 'par-3', name: 'Inovasense', deleted: false },
    { id: 'par-4', name: 'TSMaq', deleted: false },
    { id: 'par-5', name: 'Make Industry', deleted: false },
    { id: 'par-6', name: 'Aidomotic', deleted: false },
    { id: 'par-7', name: 'Dibal', deleted: false },
    { id: 'par-8', name: 'FFonseca', deleted: false },
  ],
  taskStatuses: [
    { id: 'ts-1', name: 'Por iniciar', scale: 1 },
    { id: 'ts-2', name: 'Em andamento', scale: 2 },
    { id: 'ts-3', name: 'Completa', scale: 3 },
    { id: 'ts-4', name: 'Suspensa', scale: 4 },
  ],
  riskCategories: [
    { id: 'rc-1', name: 'Técnico / Engenharia', deleted: false, sort_order: 0 },
    { id: 'rc-2', name: 'Fornecedor / Equipamentos', deleted: false, sort_order: 1 },
    { id: 'rc-3', name: 'Prazo / Cronograma', deleted: false, sort_order: 2 },
    { id: 'rc-4', name: 'Financeiro / Orçamento', deleted: false, sort_order: 3 },
    { id: 'rc-5', name: 'Operacional / Recursos', deleted: false, sort_order: 4 },
    { id: 'rc-6', name: 'Legal / Regulamentar', deleted: false, sort_order: 5 },
  ],
  riskStatuses: [
    { id: 'rs-1', name: 'Aberto', deleted: false, sort_order: 0 },
    { id: 'rs-2', name: 'Em avaliação', deleted: false, sort_order: 1 },
    { id: 'rs-3', name: 'Mitigação em curso', deleted: false, sort_order: 2 },
    { id: 'rs-4', name: 'Monitorização', deleted: false, sort_order: 3 },
    { id: 'rs-5', name: 'Fechado', deleted: false, sort_order: 4 },
    { id: 'rs-6', name: 'Incidente', deleted: false, sort_order: 5 },
  ],
  riskPriorities: [
    { id: 'rp-1', name: 'Baixa', scale: 1, deleted: false, sort_order: 0 },
    { id: 'rp-2', name: 'Média', scale: 2, deleted: false, sort_order: 1 },
    { id: 'rp-3', name: 'Alta', scale: 3, deleted: false, sort_order: 2 },
    { id: 'rp-4', name: 'Crítica', scale: 4, deleted: false, sort_order: 3 },
  ],
  projectRiskItems: [
    {
      id: 'pri-1',
      projectId: 'p-1',
      title: 'Atraso no fornecimento do módulo de PLC Siemens S7-1200',
      categoryId: 'rc-2',
      identificationDate: '2026-07-05',
      ownerId: 'u-1',
      description: 'Rotura de stock reportada pelo fornecedor oficial com previsão de atraso de 2 semanas.',
      consequence: 'Possível paragem do teste de integração em bancada e adiamento do comissionamento.',
      probability: 3,
      impact: 4,
      mitigationPlan: 'Acompanhamento semanal com o distribuidor e consulta de unidades em stock interno secundário.',
      contingencyPlan: 'Montar bancada temporária com CPU em stock de demonstração para pré-validação do código.',
      reviewDate: '2026-08-05',
      statusId: 'rs-3',
      priorityId: 'rp-3',
      deleted: false,
      createdDate: '2026-07-05T10:00:00Z'
    }
  ],
  appConfig: {
    appName: 'Gestão de Projetos e ERP',
    appDescription: 'Plataforma integrada de planeamento, orçamentação e controlo de projetos industriais.',
    footerText: '© 2026 Gestão de Projetos e ERP. Todos os direitos reservados.',
    logo: '',
    footerCopyrightText: '© 2026 Gestão de Projetos e ERP. Todos os direitos reservados.',
    logoImagePath: '',
    theme: 'default',
  },
  users: [],
  clients: [
    { id: 'c-1', clientName: 'Cliente 1', shortName: 'LactNorte', location: 'Porto, Portugal', taxId: 'PT501234567', contactPerson: 'Manuel Sousa', contactEmail: 'm.sousa@lactnorte.pt', contactPhone: '+351 912 345 678', deleted: false, createdDate: '2026-01-05T08:00:00Z' },
    { id: 'c-2', clientName: 'Cliente 2', shortName: 'SuperGlobais', location: 'Lisboa, Portugal', taxId: 'PT509876543', contactPerson: 'Ana Rita', contactEmail: 'arrita@superglobais.pt', contactPhone: '+351 931 987 654', deleted: false, createdDate: '2026-01-11T12:00:00Z' },
    { id: 'c-3', clientName: 'Cliente 3', shortName: 'IMAve', location: 'Guimarães, Portugal', taxId: 'PT505555555', contactPerson: 'Rui Costa', contactEmail: 'rcosta@imave.pt', contactPhone: '+351 253 111 222', deleted: false, createdDate: '2026-02-10T15:30:00Z' },
  ],
  materials: [
    { id: 'm-1', name: 'Módulo PLC Siemens S7-1200', reference: '6ES7214-1AG40-0XB0', manufacturerReference: 'Siemens CPU 1214C', unit: 'pcs', unitCost: 350.00, supplier: 'FFonseca', deleted: false, createdDate: '2026-01-15T09:00:00Z' },
    { id: 'm-2', name: 'Cabo de Rede Ethernet Cat6 LSZH', reference: 'CAB-ETH-CAT6-100', manufacturerReference: 'General Cable', unit: 'm', unitCost: 1.25, supplier: 'FFonseca', deleted: false, createdDate: '2026-01-15T09:10:00Z' },
    { id: 'm-3', name: 'Célula de Carga 50kg Inox', reference: 'HBM-PW15AH-50KG', manufacturerReference: 'HBM LoadCells', unit: 'pcs', unitCost: 185.00, supplier: 'Dibal', deleted: false, createdDate: '2026-01-20T11:00:00Z' },
    { id: 'm-4', name: 'Câmara de Visão Artificial 5MP', reference: 'COGNEX-ISM8402', manufacturerReference: 'Cognex In-Sight', unit: 'pcs', unitCost: 1450.00, supplier: 'Inovasense', deleted: false, createdDate: '2026-01-22T14:30:00Z' },
    { id: 'm-5', name: 'Impressora Aplicadora de Etiquetas Industrial', reference: 'ZEBRA-ZE511', manufacturerReference: 'Zebra Technologies', unit: 'pcs', unitCost: 3200.00, supplier: 'TSMaq', deleted: false, createdDate: '2026-02-01T10:00:00Z' },
  ],
  projectMaterials: [
    { id: 'pm-1', projectId: 'p-1', description: 'Módulo PLC Siemens S7-1200', supplier: 'FFonseca', quantity: 2, reference: '6ES7214-1AG40-0XB0', budget: 'ORÇ-2026/01', costPrice: 350, salePrice: 480, expectedDeliveryDate: '2026-08-05', status: 'encomendado', deleted: false, createdDate: '2026-07-01T10:00:00Z' },
    { id: 'pm-2', projectId: 'p-1', description: 'Célula de Carga 50kg Inox', supplier: 'Dibal', quantity: 4, reference: 'HBM-PW15AH-50KG', budget: 'ORÇ-2026/02', costPrice: 185, salePrice: 250, expectedDeliveryDate: '2026-08-02', status: 'em_armazem', deleted: false, createdDate: '2026-07-01T10:00:00Z' },
    { id: 'pm-3', projectId: 'p-2', description: 'Câmara de Visão Artificial 5MP', supplier: 'Inovasense', quantity: 1, reference: 'COGNEX-ISM8402', budget: 'ORÇ-2026/03', costPrice: 1450, salePrice: 1900, expectedDeliveryDate: '2026-08-10', status: 'por_encomendar', deleted: false, createdDate: '2026-07-15T11:00:00Z' },
  ],
  projects: [
    {
      id: 'p-1',
      demo: false,
      clientId: 'c-1',
      title: 'Implementação de Linha de Pesagem e Rotulagem Automática',
      description: 'Projeto para instalar um sistema integrado de pesagem em contínuo com aplicador automático de etiquetas de peso/preço para a linha de embalamento de queijos.',
      categoryId: 'pc-4', // Weighing
      statusId: 'ps-4', // Testing/FAT
      projectManagerId: 'u-1', // Sofia Mendes
      fieldManagerId: 'u-1', // Carlos Antunes
      salesRepId: 'u-1', // Pedro Marques
      startDate: '2026-05-01',
      deliveryDate: '2026-08-30',
      estimatedDate: '2026-08-15',
      scheduledDate: '2026-08-10',
      installProjectNo: 'IP-2026-088',
      sfOpportunityNo: 'SF-OPP-99221',
      riskId: 'pr-2', // Medium
      priorityId: 'pp-2', // High
      teamsInvolvedIds: ['pt-1', 'pt-2'], // Software, Installations
      partnersIds: ['par-7', 'par-4'], // Dibal, TSMaq
      documents: ['Esquema_Eletrico_v1.pdf', 'Layout_Linha_Pesagem.dwg'],
      budgetValue: 18500.00,
      createdById: 'u-1',
      deleted: false,
      createdDate: '2026-03-01T10:00:00Z',
      updatedDate: '2026-07-09T12:00:00Z'
    },
    {
      id: 'p-2',
      demo: true,
      clientId: 'c-2',
      title: 'Sistema de Visão Artificial para Inspeção de Garrafas',
      description: 'Demonstrador tecnológico de inspeção de integridade de tampas e nível de enchimento em garrafas de vidro a alta velocidade utilizando câmaras inteligentes Cognex.',
      categoryId: 'pc-5', // Vision/Scanner
      statusId: 'ps-1', // Planning
      projectManagerId: 'u-1', // Ricardo Silva
      fieldManagerId: 'u-3', // Carlos Antunes
      salesRepId: 'u-4', // Pedro Marques
      startDate: '2026-07-01',
      deliveryDate: '2026-10-15',
      estimatedDate: '2026-10-01',
      scheduledDate: '2026-09-25',
      installProjectNo: 'IP-2026-104',
      sfOpportunityNo: 'SF-OPP-10492',
      riskId: 'pr-1', // Low
      priorityId: 'pp-1', // Medium
      teamsInvolvedIds: ['pt-1'], // Software
      partnersIds: ['par-3'], // Inovasense
      documents: ['Estudo_Luminosidade_Cognex.pdf'],
      budgetValue: 8900.00,
      createdById: 'u-1',
      deleted: false,
      createdDate: '2026-06-15T15:00:00Z',
      updatedDate: '2026-07-05T10:30:00Z'
    }
  ],
  tasks: [
    {
      id: 't-1',
      projectId: 'p-1',
      title: 'Programação do PLC Siemens S7-1200',
      statusId: 'ts-2', // In progress
      assigneeIds: ['u-1'], // Ricardo Silva
      estimatedDate: '2026-07-15',
      description: 'Desenvolvimento do programa de controlo em TIA Portal para as esteiras de pesagem, integração com o protocolo Dibal e controlo do cilindro pneumático de rejeição.',
      estimatedHours: '40:00',
      actualHours: '18:30',
      startDate: '2026-07-01',
      startTime: '09:00',
      endDate: '',
      endTime: '',
      notes: 'Lógica das esteiras concluída. Falta implementar rotina de comunicação Modbus TCP com o aplicador de etiquetas.',
      deleted: false,
      createdDate: '2026-06-20T09:00:00Z'
    },
    {
      id: 't-2',
      projectId: 'p-1',
      title: 'Montagem Mecânica da Estrutura de Pesagem',
      statusId: 'ts-3', // Completed
      assigneeIds: ['u-3'], // Carlos Antunes
      estimatedDate: '2026-06-30',
      description: 'Fixação das células de carga e montagem do quadro elétrico de comando na estrutura principal em aço inox.',
      estimatedHours: '16:00',
      actualHours: '14:45',
      startDate: '2026-06-28',
      startTime: '08:30',
      endDate: '2026-06-29',
      endTime: '17:30',
      notes: 'Montagem efetuada com sucesso. Células calibradas inicialmente com pesos padrão de 5kg e 10kg.',
      deleted: false,
      createdDate: '2026-06-20T09:15:00Z'
    },
    {
      id: 't-3',
      projectId: 'p-2',
      title: 'Configuração da Câmara Cognex e Algoritmo OCR',
      statusId: 'ts-1', // Not started
      assigneeIds: ['u-1', 'u-2'], // Ricardo e Sofia
      estimatedDate: '2026-07-25',
      description: 'Configuração de lentes, focagem, filtros de cor polarizadores e criação da rotina de deteção de presença/ausência de tampa na ferramenta Cognex In-Sight Explorer.',
      estimatedHours: '12:00',
      actualHours: '00:00',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      notes: 'Aguarda chegada das amostras físicas de garrafas pelo cliente LactNorte para testes de reflexão de luz.',
      deleted: false,
      createdDate: '2026-06-25T11:00:00Z'
    }
  ],
  comments: [
    { id: 'com-1', projectId: 'p-1', authorId: 'u-2', comment: 'Reunião com o parceiro TSMaq correu muito bem. Confirmaram que entregam a impressora Zebra no nosso armazém até ao fim desta semana.', createdDate: '2026-07-05T14:22:00Z' },
    { id: 'com-2', projectId: 'p-1', authorId: 'u-3', comment: 'Células de carga calibradas com sucesso. Desvio linear está abaixo de 0.1%. Pronto para testes dinâmicos.', createdDate: '2026-07-08T16:45:00Z' },
  ],
  userAbsences: [
    { id: 'abs-1', userId: 'u-3', absenceStartDate: '2026-07-20', absenceEndDate: '2026-07-24', reason: 'Vacation', createdDate: '2026-06-10T09:00:00Z' },
    { id: 'abs-2', userId: 'u-2', absenceStartDate: '2026-07-12', absenceEndDate: '2026-07-13', reason: 'Sick leave', createdDate: '2026-07-11T18:00:00Z' },
  ],
  quotes: [
    { id: 'q-1', projectId: 'p-1', clientId: 'c-1', status: 'Approved', version: 1, totalValue: 5625.00, validUntil: '2026-06-15', responsibleId: 'u-4', deleted: false, createdDate: '2026-04-10T10:00:00Z' },
    { id: 'q-2', projectId: '', clientId: 'c-3', status: 'Draft', version: 1, totalValue: 1450.00, validUntil: '2026-08-30', responsibleId: 'u-4', deleted: false, createdDate: '2026-07-01T15:00:00Z' },
  ],
  billOfMaterials: [
    { id: 'bom-1', quoteId: 'q-1', materialId: 'm-1', quantity: 1, deleted: false, createdDate: '2026-04-10T10:15:00Z' }, // 1 * 350
    { id: 'bom-2', quoteId: 'q-1', materialId: 'm-2', quantity: 100, deleted: false, createdDate: '2026-04-10T10:16:00Z' }, // 100 * 1.25 = 125
    { id: 'bom-3', quoteId: 'q-1', materialId: 'm-3', quantity: 4, deleted: false, createdDate: '2026-04-10T10:17:00Z' }, // 4 * 185 = 740
    { id: 'bom-4', quoteId: 'q-1', materialId: 'm-5', quantity: 1, deleted: false, createdDate: '2026-04-10T10:18:00Z' }, // 1 * 3200 = 3200
    // Total for q-1 is around 4415 (unitCost) + service margin which can be dynamic or set as 5625
    { id: 'bom-5', quoteId: 'q-2', materialId: 'm-4', quantity: 1, deleted: false, createdDate: '2026-07-01T15:10:00Z' }, // 1 * 1450 = 1450
  ],
  equipmentList: [
    { id: 'eq-1', serialNumber: 'EQ-SN-99120', brand: 'Dibal', model: 'Dibal LS-4000', projectId: 'p-1', clientId: 'c-1', status: 'Active', installationDate: '2026-06-29', deleted: false, createdDate: '2026-06-29T11:00:00Z' },
    { id: 'eq-2', serialNumber: 'EQ-SN-10294', brand: 'Cognex', model: 'In-Sight 8402', projectId: '', clientId: 'c-2', status: 'Inactive', installationDate: '', deleted: false, createdDate: '2026-07-05T09:00:00Z' },
  ],
  specialDays: [
    { id: 'sd-1', date: '2026-08-15', name: 'Assunção de Nossa Senhora' },
    { id: 'sd-2', date: '2026-10-05', name: 'Implantação da República' }
  ],
  defaultTasks: [
    { id: 'dt-1', title: 'Levantamento de Requisitos e Layout', description: 'Visita técnica de levantamento de campo e definição final do desenho físico.', estimatedHours: '08:00' },
    { id: 'dt-2', title: 'Programação de PLC & IHM', description: 'Criação do código lógico em TIA Portal e desenho das janelas de supervisão.', estimatedHours: '40:00' },
    { id: 'dt-3', title: 'Montagem de Quadro e Cablagem', description: 'Instalação elétrica de disjuntores, fontes, PLC e cablagens de potência e sinal.', estimatedHours: '16:00' },
    { id: 'dt-4', title: 'Testes de Aceitação em Fábrica (FAT)', description: 'Validação da lógica, calibrações e sensores nas nossas instalações na presença do cliente.', estimatedHours: '08:00' },
    { id: 'dt-5', title: 'Instalação Física e Comissionamento (SAT)', description: 'Montagem final na fábrica do cliente, interligação de esteiras e arranque produtivo.', estimatedHours: '24:00' }
  ],
  notificationSettings: [
    { id: 'ns-1', type: 'new_project', name: 'Novo projeto', enabled: true, daysBefore: 0, targetGroup: 'all' },
    { id: 'ns-2', type: 'project_allocation', name: 'Alocação de utilizadores a projeto', enabled: true, daysBefore: 0, targetGroup: 'allocated' },
    { id: 'ns-3', type: 'task_allocation', name: 'Alocação de utilizador a tarefa', enabled: true, daysBefore: 0, targetGroup: 'allocated' },
    { id: 'ns-4', type: 'task_due_date', name: 'Data da tarefa (aviso prévio)', enabled: true, daysBefore: 1, targetGroup: 'allocated' },
    { id: 'ns-5', type: 'project_due_date', name: 'Aviso de prazo de entrega do projeto', enabled: true, daysBefore: 3, targetGroup: 'managers' },
    { id: 'ns-6', type: 'project_scheduled_date', name: 'Aviso de data agendada do projeto', enabled: true, daysBefore: 2, targetGroup: 'managers' }
  ],
  notifications: [],
  automationRules: [
    {
      id: 'rule-1',
      name: 'Gerar tarefas padrão ao iniciar projeto',
      description: 'Quando o estado de um projeto é alterado para "Em Curso", cria automaticamente o conjunto de tarefas pré-definidas.',
      enabled: true,
      triggerType: 'project_status_changed',
      triggerCondition: {
        toStatusId: 'ps-2' // 'Em Curso'
      },
      actions: [
        { type: 'create_default_tasks' }
      ],
      createdDate: '2026-08-01T10:00:00Z'
    },
    {
      id: 'rule-2',
      name: 'Concluir projeto após conclusão de todas as tarefas',
      description: 'Quando todas as tarefas de um projeto ficam marcadas como Concluídas, altera automaticamente o estado do projeto para "Entregue".',
      enabled: true,
      triggerType: 'task_status_changed',
      triggerCondition: {
        toStatusId: 'ts-3' // 'Concluída'
      },
      actions: [
        { type: 'change_project_status', params: { targetStatusId: 'ps-4' } }
      ],
      createdDate: '2026-08-01T10:05:00Z'
    },
    {
      id: 'rule-3',
      name: 'Notificar gestores após aprovação de orçamento',
      description: 'Gera uma notificação no sistema para os gestores quando um orçamento é aprovado pelo cliente.',
      enabled: true,
      triggerType: 'quote_approved',
      actions: [
        { 
          type: 'send_notification', 
          params: { 
            notificationTitle: 'Orçamento Aprovado!', 
            notificationMessage: 'Um novo orçamento foi aprovado e está pronto para adjudicação do projeto.' 
          } 
        }
      ],
      createdDate: '2026-08-01T10:10:00Z'
    }
  ]
};
