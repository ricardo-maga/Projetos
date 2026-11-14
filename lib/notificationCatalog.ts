/** Server-owned test content: never accept recipients or arbitrary messages from clients. */
export const notificationTypes: Record<string, { name: string; sample: string }> = {
  new_project: { name: 'Novo projeto', sample: 'Foi criado o projeto fictício «Projeto de demonstração».' },
  project_allocation: { name: 'Alocação a projeto', sample: 'Foi adicionado à equipa do projeto fictício «Projeto de demonstração».' },
  project_due_date: { name: 'Prazo do projeto', sample: 'O projeto fictício «Projeto de demonstração» tem entrega amanhã.' },
  project_scheduled_date: { name: 'Data agendada do projeto', sample: 'O projeto fictício «Projeto de demonstração» está agendado para amanhã.' },
  project_comment: { name: 'Novo comentário no projeto', sample: 'Ana Exemplo comentou no projeto fictício «Projeto de demonstração»: «Validação concluída.»' },
  project_closed: { name: 'Projeto concluído/cancelado', sample: 'O projeto fictício «Projeto de demonstração» passou para o nível 5: concluído/cancelado.' },
  task_allocation: { name: 'Alocação a tarefa', sample: 'Foi alocado à tarefa fictícia «Preparar demonstração».' },
  task_due_date: { name: 'Prazo da tarefa', sample: 'A tarefa fictícia «Preparar demonstração» tem prazo amanhã.' },
  presales_assignment: { name: 'Novo pedido Presales', sample: 'Foi criado o pedido fictício «Proposta de demonstração».' },
  presales_due_date: { name: 'Prazo Presales', sample: 'O pedido fictício «Proposta de demonstração» tem prazo amanhã.' },
  presales_result: { name: 'Resultado Presales', sample: 'O pedido fictício «Proposta de demonstração» foi ganho.' },
  mechanical_design_assignment: { name: 'Novo pedido de projeto mecânico', sample: 'Foi criado o pedido fictício «Desenho de demonstração».' },
  mechanical_design_due_date: { name: 'Prazo do projeto mecânico', sample: 'O pedido fictício «Desenho de demonstração» tem prazo amanhã.' },
  mechanical_design_result: { name: 'Resultado do projeto mecânico', sample: 'O pedido fictício «Desenho de demonstração» foi entregue.' },
};
