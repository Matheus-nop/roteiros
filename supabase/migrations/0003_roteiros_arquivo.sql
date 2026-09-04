-- =====================================================================
-- Migração 0003: arquivo digital dos roteiros
-- (idempotente; rode no SQL Editor depois da 0002)
-- =====================================================================
--
-- POR QUE UMA TABELA NOVA, E NÃO UMA VIEW
--
-- O roteiro é montado uma vez e depois se desfaz: a demanda reagendada muda de data
-- e sai do dia, a finalizada é arquivada, a cancelada some das telas. Uma view sobre
-- `demandas` responderia "onde cada demanda está hoje" — nunca "como o roteiro do dia
-- 12 foi montado". Para isso é preciso guardar o retrato no momento em que ele fecha.
--
-- É um registro histórico, não um cálculo derivado: nada aqui é recalculável a partir
-- do estado atual, e por isso nada aqui pode ser recomputado depois.

create table if not exists roteiros_arquivo (
  id            uuid primary key default gen_random_uuid(),

  -- FK para navegar, nome em texto para o arquivo sobreviver ao cadastro:
  -- técnico desligado ou renomeado não pode reescrever o passado.
  tecnico_id    uuid references tecnicos(id) on delete set null,
  tecnico_nome  text not null,
  data          date not null,
  veiculo       text,

  arquivado_em  timestamptz not null default now(),
  arquivado_por uuid,
  -- false quando o PCM arquivou na mão (fechou o roteiro), true quando fechou sozinho
  -- por não restar item em rota.
  automatico    boolean not null default true,

  -- O roteiro como foi montado: paradas na ordem, com os itens de cada uma e o
  -- desfecho de cada item. Ver `lib/arquivo.ts` para o formato.
  paradas       jsonb not null default '[]'::jsonb,

  total         integer not null default 0,
  concluidos    integer not null default 0,
  reagendados   integer not null default 0,
  cancelados    integer not null default 0
);

-- Um roteiro por técnico por dia. Reabrir e fechar de novo reescreve o mesmo registro
-- em vez de criar um segundo — senão o arquivo teria duas versões do mesmo dia.
create unique index if not exists roteiros_arquivo_tecnico_data
  on roteiros_arquivo (tecnico_id, data);

create index if not exists idx_roteiros_arquivo_data on roteiros_arquivo (data desc);

alter table roteiros_arquivo enable row level security;

-- Leitura: qualquer usuário autenticado (o app filtra por papel).
drop policy if exists roteiros_arquivo_select on roteiros_arquivo;
create policy roteiros_arquivo_select on roteiros_arquivo
  for select to authenticated using (true);

-- Escrita: quem opera o roteiro. O TECNICO entra porque o arquivamento automático
-- dispara no mesmo clique em que ele conclui o último item do dia.
drop policy if exists roteiros_arquivo_insert on roteiros_arquivo;
create policy roteiros_arquivo_insert on roteiros_arquivo
  for insert to authenticated
  with check (papel_atual() in ('ADMIN','PCM','EXPEDICAO','TECNICO'));

drop policy if exists roteiros_arquivo_update on roteiros_arquivo;
create policy roteiros_arquivo_update on roteiros_arquivo
  for update to authenticated
  using (papel_atual() in ('ADMIN','PCM','EXPEDICAO','TECNICO'))
  with check (papel_atual() in ('ADMIN','PCM','EXPEDICAO','TECNICO'));

-- Apagar do arquivo é apagar história: só ADMIN.
drop policy if exists roteiros_arquivo_delete on roteiros_arquivo;
create policy roteiros_arquivo_delete on roteiros_arquivo
  for delete to authenticated using (papel_atual() = 'ADMIN');
