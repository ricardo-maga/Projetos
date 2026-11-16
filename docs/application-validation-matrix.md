# Matriz de validação de toda a aplicação

Data: 16/11/2026. Base: main `23516e15fc2f2904ccea88c94852485901a5d310`.

## Objetivo e estado real

O inventário de estilos e a suite automatizada não demonstram que todos os ecrãs, temas e fluxos funcionam visualmente. Este documento inventaria a cobertura necessária para fechar a validação transversal. **A matriz ainda não está executada.** As verificações anteriores são evidência parcial de determinadas vistas; não são aprovação automática das linhas abaixo.

Fontes: `lib/sectionCatalog.ts`, composição em `app/page.tsx`, secções e subsecções em `domains`/`components`, APIs em `app/api`, temas em `ConfigSection.tsx` e testes existentes. A enumeração deve ser reconciliada com a navegação e os modais durante a execução; uma superfície descoberta acrescenta uma linha, não fica fora do âmbito.

## Dimensões obrigatórias

- **Temas:** Domino Institucional (`domino`), Azul Clássico (`blue`), Verde Esmeralda (`emerald`), Violeta Elegante (`violet`), Âmbar Solar (`amber`), Cinzento Minimal (`slate`), Rosa Coral (`rose`). Verificar também o alias persistido `default` e o arranque sem tema guardado.
- **Viewports:** desktop 1440×900, tablet 768×1024, móvel 390×844. Confirmar mudança de breakpoint e as larguras intermédias quando houver quebra. Não confundir viewport pedido com dimensão efetiva: registar ambos.
- **Perfis:** administrador de teste, utilizador com leitura apenas, utilizador operacional com permissões específicas e anónimo. Presales/desenho mecânico exigem ainda os papéis que permitem pedir, coordenar e executar. Derivar a configuração efetiva da matriz RBAC do ambiente, sem presumir que o nome do papel garante acesso.
- **Estados:** carregamento, vazio, preenchido, pesquisa sem resultados, erro, validação obrigatória, foco por teclado, seleção, desativado, submissão pendente, sucesso, conflito e acesso negado, quando aplicáveis.
- **Interação:** entrada pelo menu, atalhos, links internos, notificações e URL direto; abrir/fechar modais, cancelar sem gravar, confirmação, submissão e atualização da vista.

Não basta rever a página inicial de cada módulo. Cada formulário e modal aplicável tem de ser aberto nos sete temas e três viewports. A equivalência funcional de uma operação pode usar testes de integração partilhados; a apresentação dos seus estados tem cobertura visual própria. A matriz contém resultados separados para visual, CRUD, API/autorização e efeitos externos.

## Superfícies e fluxos

Todas as linhas começam com estado **por executar** nesta matriz. `CRUD` significa criar, consultar, editar e eliminar/restaurar quando essa ação existe no produto; ações não suportadas devem ser marcadas N/A com motivo, nunca simuladas como sucesso.

| ID | Área/superfície | Fluxos e verificações |
|---|---|---|
| AUTH-01 | Acesso | Login válido/inválido, campos obrigatórios, mostrar password, lembrar login, carregamento, indisponibilidade, logout e regresso à rota protegida |
| AUTH-02 | Perfil | Abrir/fechar, editar nome, erros, atualização no cabeçalho; alteração de password apenas em conta descartável e com entrada pelo utilizador |
| SHELL-01 | Estrutura e navegação | Cabeçalho, logótipo, sincronização, menu expandido/compacto, drawer e backdrop, submenu, overflow, foco e links diretos |
| DASH-01 | Dashboard | KPIs, Forecast/mês, estados, listas, paginação, comentários, calendário de ausências, atalhos e abertura de projeto |
| FOCUS-01 | O meu foco | Projetos, tarefas e riscos; filtros, paginação, Forecast, ações rápidas, abertura de detalhes e links permitidos |
| PROJ-01 | Lista de projetos | Pesquisa, fases, gestor, paginação, vazio/erro, links e badges; estado persistido após atualização |
| PROJ-02 | Formulário de projeto | Criar/editar, campos auxiliares, obrigatórios, IP duplicado, datas opcionais, seletores de pessoas, cancelar, submissão e erros |
| PROJ-03 | Detalhe de projeto | Visão geral, mudança de estado/Forecast, atividade, tarefas, calendário mensal, cronograma e análise; atualização sem dados obsoletos |
| PROJ-04 | Materiais e fornecedores | CRUD, agrupamento/pesquisa, entregas/encomenda, estados, modais e atualização de lista/contadores |
| PROJ-05 | Riscos | CRUD, probabilidade/impacto, cálculo, contraste do resumo, prioridades, estado e atualização do risco agregado |
| PROJ-06 | Comentários | Criar/editar/eliminar quando permitido, Markdown, validação, autor/data, atualização em atividade e Dashboard |
| PROJ-07 | Análise de projetos | KPIs, gráficos, períodos, legendas, carga por gestor e abertura dos projetos associados |
| TASK-01 | Lista operacional | Pesquisa, filtros, responsáveis, agrupamento, ordenação, datas, horas e paginação |
| TASK-02 | Tarefa e responsáveis | Criar/editar/duplicar/eliminar; estados, projeto opcional, datas, horas, pesquisa/seleção de responsáveis, execução e validação |
| TASK-03 | Análise de tarefas | Séries, legendas, tooltip, eixos, filtros temporais, empty states e tabelas; cores consistentes com as séries |
| CAL-01 | Calendário operacional | Seleção de técnicos/período, Hoje, navegação, tarefas e modais, expandir/ecrã cheio, colunas e scroll |
| CAL-02 | Timeline de projetos | Fases/filtros, períodos, datas especiais, colunas compactas, cabeçalho flutuante e scrollbar sincronizada, drag/drop e conflitos em dados de teste |
| CAL-03 | Subscrições de calendário | Criar/listar/revogar, copiar URL e feeds do âmbito correto; nunca divulgar tokens nas capturas ou relatórios |
| PRE-01 | Pedidos Presales | Lista, filtros, CRUD de pedidos, detalhe, responsáveis, estados e transições permitidas por papel |
| PRE-02 | Registo e modelos Presales | CRUD do registo, datas opcionais, proposta/resultado, templates/origens; tarefas associadas e editor de texto |
| PRE-03 | Anexos Presales | Upload, consulta e eliminação com ficheiro fictício; erros, limites e permissões |
| MECH-01 | Desenho mecânico | Pedido, aceitação, coordenação, tarefas, execução e entregas; transições e ações permitidas por papel |
| REPORT-01 | Relatórios | Cada opção do seletor, resultados vazios/preenchidos, detalhe, navegação e paginação quando disponível |
| CONFIG-01 | Aplicação e temas | Identidade, logótipo, rodapé, sete temas, alias default, persistência, recarregamento, erros e estados de gravação |
| CONFIG-02 | Campos auxiliares | Cada família do catálogo real: CRUD, escalas, cores, ordenação, duplicados, campos em uso e reflexo nos formulários |
| CONFIG-03 | Dias especiais | CRUD, tipos, datas e reflexo em calendário/timeline |
| CONFIG-04 | Tarefas modelo | CRUD, seletores, responsáveis, ordenação e aplicação a pedidos/projetos quando disponível |
| CLIENT-01 | Clientes | Lista, pesquisa, paginação, CRUD, validação, referências e restrições de acesso |
| ABS-01 | Ausências | Calendário/lista, períodos e filtros, CRUD e efeito no Dashboard/calendário operacional |
| USER-01 | Utilizadores | Lista, pesquisa, criação/edição/desativação apenas de contas de teste; pendentes/externos e seletores de elegibilidade |
| RBAC-01 | Funções e permissões | Gestão de papéis, associações e catálogo; ações condicionadas, atualização de sessão, menus/atalhos e URL direto; proteger último administrador |
| NOTIF-01 | Notificações | Dropdown, vazio/preenchido, leitura individual/global, links permitidos e estado após recarregar |
| NOTIF-02 | Configuração de avisos | Cada família/tipo, destinatários e antecedência, gravação/erros; eventos e entrega apenas em destinatários/sinks de teste |
| AUTO-01 | Automações | CRUD de regra, condições/ações, ativação, execução e resultado, prevenção de duplicados; editor vazio/preenchido e modal |
| SYSTEM-01 | Auditoria | Carregamento/erro, filtros, consulta, tabela, paginação e evidência das operações de teste |
| SYSTEM-02 | Base de dados | Todas as operações efetivamente expostas no painel: configuração, importação/exportação e respetivos estados; operações destrutivas apenas em instância descartável |
| DOC-01 | Documentação | Interface interativa, JSON, guia, iframe e navegação, erros de carregamento e adaptação móvel; não executar mutações via Swagger em produção |
| INTEG-01 | Integrações e API | Autenticação, scopes, consulta/mutação de projetos/tarefas, alterações, erros e rate limits; inventariar separadamente qualquer UI disponível |
| ERR-01 | Estados globais | Páginas de erro/404, falha de rede/sessão, sincronização e recuperação; ausência de dados antigos após acesso negado |

Rotas internas de preview, endpoints legados/retirados e ações sem UI entram no inventário de API/autorizações. Verificar que continuam indisponíveis quando essa é a regra. Não ativar uma funcionalidade retirada para fabricar cobertura visual.

## Ambiente encontrado e pré-requisitos

- Supabase `solprojetos-staging` está `ACTIVE_HEALTHY` na consulta desta data.
- O projeto Vercel `projex` tem produção em `solprojetos.vercel.app`. Os overrides de staging encontrados pertencem à branch histórica `codex/planning-center-20261102`, não à main atual.
- A worktree não tem `.env` operacional, apenas `.env.example`.
- Preparar um preview da main atual ligado explicitamente ao staging; confirmar o destino pelo deployment/configuração e por leitura no backend antes de qualquer gravação. O nome “preview” sozinho não prova isolamento.
- Confirmar equivalência de schema/migrations e disponibilidade das APIs atuais em staging antes de interpretar uma falha como regressão visual.
- Usar contas e dados fictícios com prefixo de execução. A conta `ricardo75@gmail.com` permanece eliminada e nunca é usada nem reativada.
- Preparar perfis de teste e um destino isolado para notificações/automações. Não enviar avisos a pessoas reais durante testes.
- Confirmar que existe um modo de recuperação para os dados criados; operações irreversíveis ficam numa instância descartável. Não usar o staging partilhado como descartável sem confirmar os dados existentes.

A preparação de staging e o acesso autenticado são pendências de execução, não razões para reduzir o âmbito. Alterar temas na UI chama `updateConfig` e pode afetar toda a aplicação; os sete temas devem ser exercitados no ambiente isolado.

## Registo por caso e critério de fecho

Cada execução deve registar: ID, commit/deployment, ambiente, tema, viewport efetivo, papel, estado/dados de teste, passos, resultado esperado/observado, screenshot, resultado API/persistência quando aplicável, limpeza e defeitos relacionados.

Estados de cobertura: **por executar**, **passou**, **falhou**, **bloqueado** (com causa), **N/A** (com justificação). Uma falha corrigida exige repetir o caso afetado e os consumidores do componente partilhado alterado.

Só fechar a validação global quando todas as combinações aplicáveis tiverem resultado ou N/A justificado, os defeitos bloqueantes estiverem corrigidos, a limpeza de teste estiver confirmada e houver uma passagem final da produção no tema Domino. A passagem de produção é leitura/navegação; não substitui os CRUD em staging.

Não atribuir “passou” por existir um teste unitário, por o build estar verde ou por a Vercel estar READY. A suite atual `e2e/production-security.spec.ts` usa sobretudo `APIRequestContext`: não percorre todos os ecrãs CRUD nem todos os temas.
