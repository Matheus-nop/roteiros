# Banco de dados (Supabase / PostgreSQL)

## Como aplicar

> Ordem importa: **primeiro** a migração, **depois** o seed. Os dois podem ser
> executados mais de uma vez sem problema (são idempotentes).

1. Crie um projeto em https://supabase.com.
2. No painel, abra **SQL Editor** e execute, nesta ordem:
   - `migrations/0001_schema.sql`
   - `seed.sql`
3. Em **Authentication > Providers**, mantenha *Email* habilitado.
   Crie o primeiro usuário em **Authentication > Users** ("Add user"): ele vira `ADMIN` automaticamente.
   Os próximos usuários entram como `PCM`; ajuste o papel na tabela `perfis`
   (ou pelo app, tela Cadastros > Usuários, como ADMIN).
4. Copie **Project URL** e **anon public key** (Settings > API) para o `.env` do front:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Erro `column "veiculo_padrao" of relation "tecnicos" does not exist`

Acontece quando o projeto já tinha uma tabela `tecnicos` (ou outra do app) com
estrutura diferente, sobra de uma tentativa anterior: o `create table if not exists`
não altera tabelas existentes. Duas saídas:

1. **Rode `migrations/0001_schema.sql` de novo.** A versão atual reconcilia tabelas
   pré-existentes adicionando as colunas que faltam. Depois rode `seed.sql`.
   Registros que já existiam (ex.: um técnico com o mesmo nome) são mantidos e
   não recebem o veículo padrão do seed; ajuste na tela Técnicos.
2. **Instalação limpa:** se as tabelas antigas não têm dados que importem, rode
   `reset.sql` (apaga todas as tabelas do app), depois `0001_schema.sql` e `seed.sql`.

## Papéis

| Papel      | O que pode                                                             |
|------------|------------------------------------------------------------------------|
| ADMIN      | Tudo, incluindo usuários                                               |
| PCM        | Fila, planejamento, roteiros, pendências, cadastros, histórico         |
| COMERCIAL  | Lançar e triar demandas na fila                                        |
| EXPEDICAO  | Expedição e pré-carga (separação, fechamento do dia)                   |
| TECNICO    | Imp. técnico e roteiro (finalizar / pendente)                          |

A migração foi validada num PostgreSQL 16 local com um shim do schema `auth`
(triggers de histórico, perfil automático, RLS por papel e reordenação de paradas).

A RLS libera leitura para qualquer usuário autenticado e restringe escrita por papel.
O front esconde/desabilita o que o papel não pode fazer, mas a proteção real é no banco.

## Auditoria

Toda criação, mudança de status/separação/técnico/data/veículo e exclusão de demanda
grava uma linha em `historico` com `snapshot` da linha anterior. A tela **Histórico**
permite restaurar uma demanda excluída a partir do snapshot.
