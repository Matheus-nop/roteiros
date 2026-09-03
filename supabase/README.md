# Banco de dados (Supabase / PostgreSQL)

## Como aplicar

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

## Papéis

| Papel      | O que pode                                                             |
|------------|------------------------------------------------------------------------|
| ADMIN      | Tudo, incluindo usuários                                               |
| PCM        | Fila, planejamento, roteiros, pendências, cadastros, histórico         |
| COMERCIAL  | Lançar e triar demandas na fila                                        |
| EXPEDICAO  | Expedição e pré-carga (separação, fechamento do dia)                   |
| TECNICO    | Imp. técnico e roteiro (finalizar / pendente)                          |

A RLS libera leitura para qualquer usuário autenticado e restringe escrita por papel.
O front esconde/desabilita o que o papel não pode fazer, mas a proteção real é no banco.

## Auditoria

Toda criação, mudança de status/separação/técnico/data/veículo e exclusão de demanda
grava uma linha em `historico` com `snapshot` da linha anterior. A tela **Histórico**
permite restaurar uma demanda excluída a partir do snapshot.
