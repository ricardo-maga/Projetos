# MCP de leitura para Microsoft 365 Copilot

Endpoint Streamable HTTP: `https://solprojetos.vercel.app/api/mcp`. Expõe `list_projects` e `list_project_tasks`. As respostas usam a API de integrações existente: só projetos e tarefas dentro do âmbito da chave configurada, com paginação e limites de taxa. Não há ferramentas de escrita.

## Ativação

1. Criar uma aplicação Microsoft Entra **single tenant** para proteger a API MCP. Expor a permissão delegada `access_as_user` e anotar o tenant ID e o valor de `aud` dos tokens destinados à aplicação. Um administrador Microsoft 365 deve criar a configuração Entra SSO do plugin MCP no Teams Developer Portal ou Agents Toolkit e associá-la ao agente Copilot. O URL base deve ser exatamente o endpoint acima.
2. Criar na aplicação Projetos uma chave de integração com `projects:read` e `tasks:read`, limitada aos clientes/projetos necessários. A chave expira e pode ser revogada pela API de integrações. Nunca inserir a chave no manifesto Microsoft 365.
3. Definir no ambiente de produção da aplicação:
   - `M365_MCP_TENANT_ID`: GUID do tenant Entra.
   - `M365_MCP_AUDIENCE`: audiência exata (`aud`) do token de acesso para esta API.
   - `M365_MCP_ALLOWED_USER_IDS`: lista de GUIDs `oid` de utilizadores autorizados, separados por vírgula. Não usar emails.
   - `M365_MCP_INTEGRATION_KEY`: chave de integração só de leitura do passo 2.
   - `M365_MCP_PUBLIC_URL`: `https://solprojetos.vercel.app/api/mcp` (ou o domínio HTTPS efetivo, sem barra final).
4. Voltar a publicar após configurar o ambiente e testar com uma conta Entra da lista. Confirmar também que uma conta fora da lista recebe 401 e que projetos fora do âmbito da chave não surgem.

Sem todas estas variáveis, o endpoint responde 503. O servidor verifica assinatura, emissor, audiência, tenant, expiração, permissão `access_as_user` e `oid` permitido. A lista de utilizadores é uma autorização específica desta integração; a visibilidade dos dados é comum a todos os utilizadores permitidos e é definida pela chave de integração. Para permissões individuais por utilizador, será necessária uma associação explícita entre identidades Entra e utilizadores da aplicação antes de ampliar o público.

## Operação

- Rodar ou revogar a chave de integração independentemente da aplicação Entra.
- Manter o âmbito da chave restrito e rever periodicamente a lista de `oid` permitidos.
- Não adicionar `M365_MCP_INTEGRATION_KEY` a variáveis `NEXT_PUBLIC_*`, ao manifesto, ao repositório ou a logs.
- O endpoint não usa o OAuth Server do Supabase; não é necessário alterar o esquema da base de dados.
