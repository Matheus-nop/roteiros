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

## Migrações

Rode na ordem, uma vez cada, no SQL Editor. Todas são idempotentes — rodar de novo não
quebra nada.

| Arquivo | O que traz |
|---|---|
| `0001_schema.sql` | tabelas, índices, triggers (updated_at, histórico), perfis, RLS, realtime |
| `0002_expedicao_prioridade.sql` | prioridade da demanda e etiquetas avulsas |
| `0003_roteiros_arquivo.sql` | arquivo digital do roteiro, como foi montado |
| `0004_rls_tecnico.sql` | o técnico só enxerga o roteiro dele |
| `0005_autoria.sql` | quem lançou a demanda (`created_by` com default) |
| `0006_localidades.sql` | `v_localidades` — sugestão do campo Local |
| `0007_marcos_de_tempo.sql` | `pendente_desde` e `reagendado_em` |
| `0008_relatorios_e_vocabulario.sql` | `v_rel_demandas` (relatórios), `v_clientes_uso`, `v_equipamentos_uso`, cadastro criado no lançamento |

Scripts avulsos ficam em `scripts/` e **não** fazem parte da sequência: são correções
pontuais e testes, cada um com a explicação no topo do arquivo. Um deles é obrigatório
em quem instalou antes desta correção: `scripts/separar-aegea-de-aguas-do-rio.sql` — o
seed antigo cadastrava AEGEA como apelido de ÁGUAS DO RIO, e são clientes diferentes.

> **Apelido é variação de escrita do MESMO cliente** — acento, abreviação, erro de
> digitação. Nunca use apelido para juntar empresas parentes: o formulário troca o nome
> digitado pelo oficial, e a demanda de uma passa a sair no nome da outra.

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
| COMERCIAL  | Lançar e triar demandas na fila; **criar** (não editar) cliente e equipamento |
| EXPEDICAO  | Expedição e pré-carga (separação, fechamento do dia)                   |
| TECNICO    | Imp. técnico e roteiro (finalizar / pendente)                          |

A migração foi validada num PostgreSQL 16 local com um shim do schema `auth`
(triggers de histórico, perfil automático, RLS por papel e reordenação de paradas).

A RLS libera leitura para qualquer usuário autenticado e restringe escrita por papel.
O front esconde/desabilita o que o papel não pode fazer, mas a proteção real é no banco.

O COMERCIAL ganhou INSERT em `clientes` e `equipamentos` na 0008, e só INSERT: é o que
faz o cadastro automático do lançamento funcionar sem abrir a porta para renomear ou
apagar cadastro (renomear reescreve o passado de todo mundo). A prova disso está em
`scripts/testar-rls-0008.sql`, que roda num Postgres local e espera 18 "OK".

## Auditoria

Toda criação, mudança de status/separação/técnico/data/veículo e exclusão de demanda
grava uma linha em `historico` com `snapshot` da linha anterior. A tela **Histórico**
permite restaurar uma demanda excluída a partir do snapshot.
