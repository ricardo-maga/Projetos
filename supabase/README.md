# Base de dados Supabase

O PostgreSQL é a fonte de verdade dos dados operacionais. A aplicação acede aos
dados por APIs no servidor, que validam autenticação e permissões antes de usar
o cliente administrativo. O browser usa apenas a chave pública para a sessão.
Não executar `schema.sql` nem os scripts `001`–`010` sobre staging ou produção:
são material histórico de instalação, não uma sequência de migrations já
reconciliada com o histórico remoto.

## Alterações de esquema e permissões

1. Consultar [o inventário e o procedimento](../docs/database-baseline.md) para
   confirmar o projeto Supabase alvo, o estado das migrations e os grants.
2. Criar a migration com `supabase migration new <nome>` e acrescentar SQL
   idempotente. Não alterar versões de migrations já aplicadas.
3. Executar `npm run check:migrations`, validar em staging, consultar os advisors
   e repetir as consultas de verificação.
4. Publicar o código e aplicar em produção na ordem exigida pelas dependências.
   Confirmar o histórico remoto, as permissões e o comportamento da API.

O ficheiro [access_inventory.sql](diagnostics/access_inventory.sql) contém
consultas de metadados sem leitura de registos de utilizadores. A CI valida a
nomenclatura e unicidade das novas migrations; a comparação com o histórico de
staging e produção é uma verificação separada.
