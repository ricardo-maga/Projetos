# Gestão de projetos e planeamento

Aplicação web para gerir projetos, tarefas, clientes, planeamento de recursos e pedidos de desenho mecânico.

## Tecnologias

- **Aplicação:** Next.js 15, React 19 e TypeScript.
- **Base de dados e autenticação:** Supabase (PostgreSQL).
- **Interface:** Tailwind CSS.
- **Publicação:** Vercel.
- **Desenvolvimento:** Codex, com código versionado neste repositório GitHub.

O PostgreSQL é a **fonte única de verdade** dos dados operacionais. As operações protegidas são realizadas através das APIs do servidor, sujeitas a autenticação, autorização e validação. Não usar o browser para contornar as APIs nem a segurança da base de dados.

## Executar localmente

**Pré-requisitos:** Node.js compatível com `package.json` e npm. Para executar os testes automatizados, instalar também Bun.

1. Instalar as dependências:

   ```bash
   npm ci
   ```

2. Criar `.env.local` a partir de `.env.example` e configurar as credenciais adequadas ao ambiente. Nunca publicar ficheiros `.env*` nem introduzir segredos no código.

3. Iniciar o servidor:

   ```bash
   npm run dev
   ```

A aplicação fica disponível em `http://localhost:3000`.

### Variáveis de ambiente principais

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave pública do Supabase utilizada pelo cliente para a sessão.
- `SUPABASE_SERVICE_ROLE_KEY`: chave **exclusiva do servidor**; nunca expor em componentes do browser ou variáveis `NEXT_PUBLIC_*`.
- `APP_URL`: URL pública da aplicação, quando necessária à configuração do ambiente.

O bootstrap administrativo está desativado por predefinição. Consultar `RECOVERY.md` antes de qualquer operação de recuperação de acesso.

## Staging e base de dados

Para usar o ambiente de staging isolado, seguir [docs/staging-local.md](docs/staging-local.md). O launcher de staging recusa ficheiros dotenv locais para evitar misturas de credenciais entre ambientes.

Para trabalhar com o esquema SQL, seguir [supabase/README.md](supabase/README.md) e [docs/database-baseline.md](docs/database-baseline.md). **Não executar migrations históricas indiscriminadamente** sobre staging ou produção.

## Verificações

```bash
npm run typecheck:app
npm run lint
npm run build
npm run check:openapi
npm run check:migrations
npm run test:ci
```

A execução de `npm run test:ci` requer Bun. Os testes E2E de segurança são executados separadamente com `npm run test:e2e:security` e dependem da configuração apropriada do ambiente e de credenciais de teste.

## Publicação

A publicação é feita através da integração do repositório com o Vercel. Rever as verificações de CI e os efeitos sobre as migrations antes de promover alterações para produção. Consultar [docs/production-readiness.md](docs/production-readiness.md) e [docs/migration-reconciliation.md](docs/migration-reconciliation.md).
