-- =====================================================================
-- Migração 0008: relatórios e vocabulário que aprende
-- (idempotente; rode no SQL Editor depois da 0007)
-- =====================================================================
--
-- Três coisas, todas pela mesma razão: o sistema já sabe as respostas, só não estava
-- sendo perguntado.
--
--   1. `criado_automaticamente` em clientes e equipamentos — procedência, não cálculo.
--      Quando alguém digita um equipamento que não existia, ele passa a existir. Sem
--      essa marca, ninguém saberia depois quais linhas do cadastro nasceram de um
--      lançamento apressado e merecem revisão.
--   2. `v_clientes_uso` e `v_equipamentos_uso` — o mesmo que a 0006 fez com localidade:
--      sugerir primeiro o que a equipe mais usa, em vez de ordem alfabética. "AGUAS DO
--      RIO" no topo vale mais que "ACQUA" só por começar com A.
--   3. `v_rel_demandas` — a base dos relatórios.
--
-- POR QUE UMA VIEW DE FATO, E NÃO UMA VIEW POR RELATÓRIO
--
-- Uma view por pergunta ("clientes que mais reagendam", "equipamento que mais dá
-- manutenção") vira uma view nova a cada pergunta nova, e nenhuma delas aceita recorte
-- de período — o group by já aconteceu. `v_rel_demandas` devolve UMA LINHA POR DEMANDA
-- com as dimensões já resolvidas (cliente oficial, nome do técnico, quantas vezes foi
-- reagendada); quem soma é a tela, e assim qualquer corte novo é código, não migração.
--
-- A coluna `mes` existe para o recorte: o app filtra por ela (`in`) e nunca baixa mais
-- período do que está olhando.
--
-- Nada aqui é gravado. Continua valendo a regra: número derivado é view.

-- ---------------------------------------------------------------------
-- 1. Procedência do cadastro criado durante o lançamento
-- ---------------------------------------------------------------------
alter table clientes     add column if not exists criado_automaticamente boolean not null default false;
alter table equipamentos add column if not exists criado_automaticamente boolean not null default false;

comment on column clientes.criado_automaticamente is
  'true quando a linha nasceu de um nome digitado no lançamento, e não de um cadastro feito à mão. Serve para revisão.';
comment on column equipamentos.criado_automaticamente is
  'true quando a linha nasceu de um nome digitado no lançamento, e não de um cadastro feito à mão. Serve para revisão.';

-- ---------------------------------------------------------------------
-- 2. Quem a equipe mais usa (alimenta a sugestão dos formulários)
-- ---------------------------------------------------------------------
-- Lê TODAS as demandas, inclusive as arquivadas: um corte que manda tudo para o
-- histórico não pode zerar o vocabulário (mesmo motivo da 0006).

create or replace view v_clientes_uso
with (security_invoker = true) as
select
  coalesce(c.nome, ca.nome, d.cliente_nome)                      as nome,
  count(*)::int                                                  as usos,
  max(coalesce(d.data_planejada, d.data_abertura, d.created_at::date)) as ultimo_uso
from demandas d
left join clientes c on c.id = d.cliente_id
-- Mesma resolução por apelido da `v_rel_demandas`: o cliente que aparece com dois
-- nomes soltos não pode ficar com metade dos usos em cada um e sumir do topo.
left join lateral (
  select c2.nome
  from clientes c2
  where d.cliente_id is null
    and (upper(btrim(d.cliente_nome)) = upper(c2.nome)
         or upper(btrim(d.cliente_nome)) in (select upper(a) from unnest(c2.apelidos) a))
  limit 1
) ca on true
where btrim(coalesce(c.nome, ca.nome, d.cliente_nome, '')) <> ''
group by coalesce(c.nome, ca.nome, d.cliente_nome);

comment on view v_clientes_uso is
  'Clientes já usados em demandas, com quantas vezes e quando foi a última. Ordena a sugestão do campo Cliente.';

create or replace view v_equipamentos_uso
with (security_invoker = true) as
select
  d.equipamento_nome                                             as nome,
  count(*)::int                                                  as usos,
  max(coalesce(d.data_planejada, d.data_abertura, d.created_at::date)) as ultimo_uso
from demandas d
where btrim(coalesce(d.equipamento_nome, '')) <> ''
group by d.equipamento_nome;

comment on view v_equipamentos_uso is
  'Equipamentos já usados em demandas, com quantas vezes e quando foi a última. Ordena a sugestão do campo Equipamento.';

-- ---------------------------------------------------------------------
-- 3. Base dos relatórios: uma linha por demanda, dimensões resolvidas
-- ---------------------------------------------------------------------
create or replace view v_rel_demandas
with (security_invoker = true) as
select
  d.id,
  -- Data de referência: quando foi executada; na falta, quando foi aberta.
  coalesce(d.data_planejada, d.data_abertura, d.created_at::date)                    as data,
  to_char(coalesce(d.data_planejada, d.data_abertura, d.created_at::date), 'YYYY-MM') as mes,
  -- Nome oficial do cadastro quando houver: senão "AEGEA" e "ÁGUAS DO RIO" viram
  -- dois clientes no ranking do mesmo cliente. Quando a demanda é antiga e não tem FK,
  -- ainda dá para unificar pelo apelido — foi para isso que o apelido existe.
  coalesce(c.nome, ca.nome, d.cliente_nome)                                         as cliente,
  d.equipamento_nome                                                                as equipamento,
  d.local                                                                           as localidade,
  d.tipo,
  d.status,
  d.tecnico_id,
  t.nome                                                                            as tecnico,
  d.quantidade,
  -- Quantas vezes ESTA demanda voltou para reagendamento. Sai do histórico, que é
  -- onde cada troca de status ficou registrada — a demanda em si só guarda a última.
  coalesce(r.reagendamentos, 0)::int                                                as reagendamentos,
  d.pendente_desde,
  d.finalizado_em
from demandas d
left join clientes c on c.id = d.cliente_id
left join tecnicos t on t.id = d.tecnico_id
-- Sem FK: procura o cadastro pelo nome ou por um dos apelidos.
left join lateral (
  select c2.nome
  from clientes c2
  where d.cliente_id is null
    and (upper(btrim(d.cliente_nome)) = upper(c2.nome)
         or upper(btrim(d.cliente_nome)) in (select upper(a) from unnest(c2.apelidos) a))
  limit 1
) ca on true
left join lateral (
  select count(*)::int as reagendamentos
  from historico h
  -- `acao <> 'criada'` porque o gatilho também registra o nascimento da demanda: sem
  -- isso, uma demanda importada já como REAGENDADO nasceria com um reagendamento.
  where h.demanda_id = d.id and h.status_novo = 'REAGENDADO' and h.acao is distinct from 'criada'
) r on true;

comment on view v_rel_demandas is
  'Uma linha por demanda com as dimensões dos relatórios resolvidas (cliente oficial, técnico, nº de reagendamentos). Filtre por `mes` para recortar o período.';

grant select on v_clientes_uso     to authenticated;
grant select on v_equipamentos_uso to authenticated;
grant select on v_rel_demandas     to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS: o comercial precisa poder CRIAR cadastro ao lançar
-- ---------------------------------------------------------------------
--
-- Quem lança demanda é o comercial, e é ele quem digita o equipamento que faltava. A
-- política da 0001 (`clientes_write` / `equipamentos_write`) dá escrita só a ADMIN e
-- PCM, então o cadastro automático morreria com "row-level security" justamente no
-- caminho em que ele existe para servir.
--
-- A permissão é a menor possível: INSERT, e só. Alterar e apagar cadastro continua com
-- ADMIN e PCM — nomear é diferente de renomear, e renomear reescreve o passado de todo
-- mundo. Políticas permissivas se somam (OR), então esta apenas abre o insert sem
-- afrouxar nada do que já existia.

drop policy if exists clientes_insert_lancamento on clientes;
create policy clientes_insert_lancamento on clientes
  for insert to authenticated
  with check (papel_atual() in ('ADMIN','PCM','COMERCIAL'));

drop policy if exists equipamentos_insert_lancamento on equipamentos;
create policy equipamentos_insert_lancamento on equipamentos
  for insert to authenticated
  with check (papel_atual() in ('ADMIN','PCM','COMERCIAL'));
