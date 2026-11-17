# Matriz de validação de toda a aplicação

Fecho: 17/11/2026. Base integrada: main `13c330d17ba2d7e56bd19a9d1e82b8681003aa86`. Código da aplicação validado: `4d65e98207c876fab5b317384b5ed692a052aa48`.

## Objetivo e estado real

**Validação visual transversal concluída: sete temas × três dimensões, com 4533 casos revistos.** Os fluxos funcionais foram exercitados em staging e confrontados com a API e a persistência. O inventário estático, os testes, a revisão visual e a publicação são evidências distintas. Os limites de execução estão explicitados abaixo; não se atribui cobertura a operações inexistentes ou a confirmações irreversíveis que não foram aceites pela interface.

Fontes: `lib/sectionCatalog.ts`, composição em `app/page.tsx`, secções e subsecções em `domains`/`components`, APIs em `app/api`, temas em `ConfigSection.tsx` e testes existentes. A enumeração deve ser reconciliada com a navegação e os modais durante a execução; uma superfície descoberta acrescenta uma linha, não fica fora do âmbito.

## Dimensões obrigatórias

- **Temas:** Domino Institucional (`domino`), Azul Clássico (`blue`), Verde Esmeralda (`emerald`), Violeta Elegante (`violet`), Âmbar Solar (`amber`), Cinzento Minimal (`slate`), Rosa Coral (`rose`). Verificar também o alias persistido `default` e o arranque sem tema guardado.
- **Viewports:** desktop 1440×900, tablet 768×1024, móvel 390×844. Confirmar mudança de breakpoint e as larguras intermédias quando houver quebra. Não confundir viewport pedido com dimensão efetiva: registar ambos.
- **Perfis:** administrador de teste, utilizador com leitura apenas, utilizador operacional com permissões específicas e anónimo. Presales/desenho mecânico exigem ainda os papéis que permitem pedir, coordenar e executar. Derivar a configuração efetiva da matriz RBAC do ambiente, sem presumir que o nome do papel garante acesso.
- **Estados:** carregamento, vazio, preenchido, pesquisa sem resultados, erro, validação obrigatória, foco por teclado, seleção, desativado, submissão pendente, sucesso, conflito e acesso negado, quando aplicáveis.
- **Interação:** entrada pelo menu, atalhos, links internos, notificações e URL direto; abrir/fechar modais, cancelar sem gravar, confirmação, submissão e atualização da vista.

Não basta rever a página inicial de cada módulo. Cada formulário e modal aplicável tem de ser aberto nos sete temas e três viewports. A equivalência funcional de uma operação pode usar testes de integração partilhados; a apresentação dos seus estados tem cobertura visual própria. A matriz contém resultados separados para visual, CRUD, API/autorização e efeitos externos.

## Superfícies e fluxos

As linhas abaixo definem o âmbito; o registo de execução no final distingue os resultados já obtidos das combinações ainda pendentes. `CRUD` significa criar, consultar, editar e eliminar/restaurar quando essa ação existe no produto; ações não suportadas devem ser marcadas N/A com motivo, nunca simuladas como sucesso.

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

## Execução e evidência

O [registo sanitizado por caso](application-validation-evidence.json) contém as combinações, os papéis, as dimensões efetivas, os commits de evidência, a reconciliação funcional e a limpeza. As capturas e o registo bruto ficam privados, fora do Git; o ficheiro publicado inclui o SHA-256 do conjunto assinado. As capturas iniciais inconsistentes e a imagem histórica anterior à correção da timeline não contam para aprovação.

Ambiente funcional: Supabase staging `caaiydcycrnwcqefdldz`, contas e dados fictícios com prefixo de execução. Preview do código validado: [4d65e98](https://projex-n8qxy34wi-gestao-de-projetos.vercel.app). As escritas foram feitas em staging. A conta deliberadamente eliminada nunca foi usada ou reativada.

Cada caso visual aprovado usa viewport completo, dimensão efetiva verificada, estado observado e imagem revista. Foram repetidos os consumidores afetados por alterações a tokens, modais, foco, contraste, gráficos ou layout. As capturas aguardam o fim das animações dos diálogos; a documentação aguarda a renderização dos endpoints Swagger. Uma recolha de imagem, isoladamente, não constitui aprovação.

| Tema | Móvel | Tablet | Desktop | Resultado |
|---|---:|---:|---:|---|
| Domino Institucional | 216 | 220 | 215 | Passou |
| Azul Clássico | 215 | 216 | 221 | Passou |
| Verde Esmeralda | 215 | 216 | 215 | Passou |
| Violeta Elegante | 215 | 216 | 215 | Passou |
| Âmbar Solar | 215 | 216 | 215 | Passou |
| Cinzento Minimal | 215 | 216 | 215 | Passou |
| Rosa Coral | 215 | 216 | 215 | Passou |

Os alvos principais são 390×844, 768×1024 e 1440×900 CSS px. O registo mantém as medidas efetivas dos acessos anónimos e dos testes adicionais de breakpoint, sem as substituir pelas medidas pedidas. As diferenças nas contagens correspondem a verificações adicionais de navegação e a repetições focadas.

## Resultado funcional por superfície

Os formulários, modais e estados visuais aplicáveis das áreas abaixo foram revistos nas 21 combinações. A operação de negócio é verificada com dados fictícios e confirmação de persistência; não se repete uma mutação real para cada cor. As eliminações persistidas foram exercitadas na API. As confirmações da interface foram abertas/canceladas; não se confunde cancelar uma confirmação com executar a eliminação.

| IDs do inventário | Resultado/evidência funcional |
|---|---|
| AUTH-01, AUTH-02 | Login válido/inválido, campos obrigatórios, opções, sessão, logout e edição do nome. Alteração de password pela UI: N/A nesta execução, porque exige entrada pelo utilizador. As contas fictícias foram criadas pela API. |
| SHELL-01 | Menu expandido/compacto/drawer, foco, submenus e URLs. Verificados 768, 779, 780, 1023 e 1024 px; abaixo de `lg`/1024 px arranca compacto. A expansão manual mantém-se disponível. |
| DASH-01, FOCUS-01 | KPIs, Forecast, listas vazias/preenchidas, comentários, ausências, filtros, calendário e abertura de detalhes. |
| PROJ-01, PROJ-02, PROJ-03 | Criar/editar pela UI, validar identificador duplicado, descrição e campos; detalhe, atividade, calendário e cronograma. Eliminação pela API confirmada na limpeza. |
| PROJ-04, PROJ-05, PROJ-06 | Material, estados, risco agregado e comentário formatado gravados pela UI e confrontados com a API; eliminações confirmadas na API. Edição de comentário: N/A, não existe na UI atual. |
| PROJ-07, TASK-03 | Análises globais e de detalhe, períodos, tabelas, nomes longos, tooltips, scroll horizontal por teclado e geometria dos gráficos. |
| TASK-01, TASK-02 | Pesquisa, agrupamento, filtros, formulários de criação/edição/duplicação, responsáveis, datas e execução. Criação/edição/execução pela UI com persistência; eliminação pela API. Duplicação tem cobertura do formulário e do contrato partilhado de criação. |
| CAL-01, CAL-02 | Seleção de pessoas/período, vazio/preenchido, modais, expandir/ecrã cheio, datas especiais e scroll. Arrasto real de tarefa entre dias confirmado na API e após atualização; data original reposta. |
| CAL-03 | Criar/copiar/revogar pela UI; feeds `mine`/`all`, conteúdo iCalendar e recusa do token revogado na API. Tokens não são publicados. |
| PRE-01, PRE-02 | Registo Presales sem datas opcionais, consulta, edição e estados. O pedido legado criado já aceite não volta a ser aceite: essa transição redundante é N/A. Documento, revisão, bloqueio e autorização verificados pela API. |
| PRE-03 | Upload fictício, assinatura do formato, leitura e controlo de acesso pela API. Editor/anexos legados não têm navegação ativa; não foram reativados. Eliminação de anexo publicado: N/A, não há essa operação na UI/API atual e a revisão é imutável. |
| MECH-01 | Criar, atribuir, iniciar, bloquear, retomar, concluir e reabrir pela UI; persistência e execução por Técnico na API. Entrega exige metadados do ficheiro. Pedido criado já aceite não repete aceitação. Arquivar pedidos iniciados é recusado pela regra de negócio. |
| REPORT-01 | Todas as opções expostas, resultados, detalhes e ligações. |
| CONFIG-01 | Identidade, pré-visualização do logótipo, sete temas com gravação/reload, alias `default` e arranque sem tema guardado. Configuração original restaurada. |
| CONFIG-02, CONFIG-03, CONFIG-04 | Todas as famílias auxiliares, dias especiais e tarefas modelo: criação/edição, validações, reflexo nos formulários e eliminação. Ordenação real por teclado confirmada após reload; ordem completa original reposta, incluindo registos ocultos na apresentação. Aplicação de tarefa modelo a projeto confirmada pela UI. |
| CLIENT-01, ABS-01 | Clientes: criar/editar, pesquisar, eliminar e restaurar; persistência confirmada. Ausências: criar, consultar, filtrar e eliminar; edição não é uma operação exposta. |
| USER-01, RBAC-01 | Contas e funções fictícias, permissões e associações; verificações API de elegibilidade/autorização. Comparação UI de menus e edição com permissões efetivas para Viewer, Técnico, Comercial, Soluções, Administrador e função personalizada; Super Admin e Gestor de Projeto exercitados na matriz completa. URLs administrativos proibidos regressam ao dashboard. |
| NOTIF-01, NOTIF-02 | Dropdown, leitura, ligações e quatro famílias de configuração. Testes dos 14 tipos dirigidos às contas fictícias; não se declara validação de entrega externa a pessoas reais. Switch testado com foco de teclado nos dois estados e valor original reposto. |
| AUTO-01 | CRUD de regras fictícias desativadas, editor/condições/ações, preview/resultado e execução controlada na API, incluindo preservação do tipo de tarefa. |
| SYSTEM-01, SYSTEM-02 | Auditoria e filtros; painel de base de dados, SQL apresentado e importação CSV com linha válida/rejeitada. Reset/reconstrução destrutiva de base partilhada: N/A; não foi executado para produzir cobertura. |
| DOC-01 | Swagger com endpoints carregados, JSON, guia e 404 em três dimensões. Documentação tem paleta própria/iframe: repetição pelos sete temas ERP é N/A. Não foram executadas mutações via Swagger em produção. |
| INTEG-01 | Integração com scopes/âmbito de projeto, leitura de projetos/tarefas, revogação e recusa posterior. Endpoints sem UI são verificados na API. |
| ERR-01 | Carregamento, falha temporária de leitura e recuperação real por “Tentar novamente”, em três dimensões, através de proxy local limitado a GET/HEAD. Sem alteração ao servidor ou à base para simular a falha. |

Confirmações nativas pertencem ao browser e não herdam os temas ERP. O cancelamento da desativação de função foi feito fechando o separador temporário; a função permaneceu ativa até à desativação posterior pela API. Não se controlaram aplicações do PC durante o fecho.

## Testes e reconciliação

- Suite local do código da aplicação: **1131 aprovados, quatro casos reservados à integração física, zero falhas**. Integração física de staging executada separadamente: **15 aprovados**.
- Typecheck, OpenAPI, guardas de migrations, inventário visual e build de staging aprovados. O CI do commit da aplicação terminou com sucesso; o PR acompanha também os checks do commit final de documentação.
- **386 verificações funcionais brutas**: as 17 falhas históricas têm resolução explícita no JSON, preservando o resultado original. Incluem pressupostos incorretos do teste, repetição após erro transitório e o alinhamento de staging descrito abaixo. Não existem falhas por reconciliar.
- Foram corrigidos contraste de texto sobre seleções, texto M3, foco de switches em temas sem elevação, rótulos/gráficos estreitos, cabeçalho de dias especiais, identidade do logótipo, navegação tablet e quebra das ações/visão geral do projeto em móvel. Os respetivos consumidores foram repetidos.

## Limpeza e isolamento

A confirmação final encontrou **zero projetos, tarefas, clientes, pedidos, funções ou perfis desta execução ativos**, **zero sessões Auth** e oito contas Auth bloqueadas. Foram restaurados o tema Âmbar e as associações de papéis anteriores à execução. Materiais, riscos, comentários, ausências, opções auxiliares, dias especiais, tarefas modelo e automações fictícias foram removidos das vistas ativas; a integração e os feeds tinham sido revogados.

As revisões Presales publicadas, a imagem fictícia referenciada e o histórico de domínio/auditoria foram preservados. Três pedidos de desenho já iniciados e as suas três tarefas tiveram arquivo administrativo reversível, restrito aos IDs desta execução e após cópia privada. A regra da aplicação que impede eliminar pedidos iniciados manteve-se intacta; esta manutenção não é contabilizada como sucesso desse endpoint. Não foram removidos triggers nem alterados grants para contornar a imutabilidade.

Na eliminação dos projetos detetou-se uma divergência de staging: a RPC ainda referenciava a antiga tabela `quotes`, inexistente nesse ambiente. A função de produção foi consultada e já tinha as dependências corretas. Só staging foi alinhado, preservando o bloqueio de linha existente; os cinco projetos foram depois eliminados com HTTP 200 pela API. Não foi necessária uma alteração de schema em produção.

## Publicação

Esta evidência refere-se ao código `4d65e98`; as alterações finais são documentação/evidência sanitizada. O estado de integração, CI e deployment acompanha o [PR #157](https://github.com/ricardo-maga/Projetos/pull/157). A passagem de produção após a publicação é autenticada e limitada a leitura/navegação em Domino; não substitui os CRUD de staging.
