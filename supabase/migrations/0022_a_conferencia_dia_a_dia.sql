-- 0022 · A conferência da carga, dia a dia e técnico a técnico
--
-- "Não tenho um campo onde consigo ver a conferência de carga de todos os
--  dias, de cada técnico, por dia, por técnico — para saber se o cara
--  conferiu a carga, ou, se der erro na carga, em qual foi e quando foi."
--
-- O relatório (0020) responde "quem erra mais, e em quê", somando o período.
-- A pergunta agora é a do dia: ESTE técnico conferiu ESTA carga? E a que não
-- bateu, qual era e quando foi vista? Para isso a `v_rel_demandas` precisa de
-- três colunas que a 0020 deixou de fora:
--
--   conferido_em   a hora em que o técnico conferiu — o "quando foi";
--   om, patrimonio a carga em si — o "em qual foi", além de cliente e
--                  equipamento, que já estavam lá.
--
-- Só a view muda; a conta é da tela (`src/lib/conferencias.ts`), como manda a
-- 0008. As três entram NO FIM: `create or replace view` não aceita coluna nova
-- no meio sem derrubar a view.

create or replace view v_rel_demandas
with (security_invoker = true) as
select
  d.id,
  coalesce(d.data_planejada, d.data_abertura, d.created_at::date)                    as data,
  to_char(coalesce(d.data_planejada, d.data_abertura, d.created_at::date), 'YYYY-MM') as mes,
  coalesce(c.nome, ca.nome, d.cliente_nome)                                         as cliente,
  d.equipamento_nome                                                                as equipamento,
  d.local                                                                           as localidade,
  d.tipo,
  d.status,
  d.tecnico_id,
  t.nome                                                                            as tecnico,
  d.quantidade,
  coalesce(r.reagendamentos, 0)::int                                                as reagendamentos,
  d.pendente_desde,
  d.finalizado_em,
  -- ── 0019/0020: a segunda vista sobre a carga ──
  d.conferencia,
  d.conferido_por,
  -- Quem separou. É este o nome que o ranking de divergências usa — não o de
  -- quem conferiu.
  d.separado_por,
  d.divergencia,
  -- ── 0022: quando conferiu, e qual carga era ──
  d.conferido_em,
  d.om,
  d.patrimonio
from demandas d
left join clientes c on c.id = d.cliente_id
left join tecnicos t on t.id = d.tecnico_id
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
  where h.demanda_id = d.id
    -- O gatilho também registra o nascimento da demanda. Sem isto, uma importada
    -- já como REAGENDADO nasceria com um reagendamento.
    and h.acao is distinct from 'criada'
    and (
      -- 1. voltou ao planejamento depois de já ter saído para um dia
      (h.status_novo = 'AGUARDANDO_ROTEIRIZACAO'
       and h.status_anterior in
           ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO', 'PENDENTE', 'REAGENDADO'))
      -- 2. já era pendência e foi empurrada para outro dia de novo
      or ((h.snapshot ->> 'herdado_de_pendencia')::boolean
          and h.acao like '%data planejada%')
      -- 3. planilha antiga, importada com o status literal
      or h.status_novo = 'REAGENDADO'
    )
) r on true;

comment on view v_rel_demandas is
  'Uma linha por demanda, com as dimensões do relatório resolvidas. Desde a 0020 '
  'traz a conferência da carga; desde a 0022, quando foi conferida e a OM e o '
  'patrimônio da carga.';

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
--
-- O editor do Supabase mostra só o resultado da ÚLTIMA instrução — por isso
-- toda migração termina se conferindo. Espere três linhas, todas "ok".
-- E confira que não há texto selecionado na tela: com seleção, o editor roda
-- SÓ o trecho selecionado, e o resto desta migração não sobe.

select item, situacao, detalhe from (
  select 1 as ordem, 'as três colunas novas na view' as item,
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_rel_demandas'
                       and column_name in ('conferido_em', 'om', 'patrimonio')) = 3
              then 'ok' else 'FALTOU' end as situacao,
         'conferido_em, om, patrimonio' as detalhe

  union all
  select 2, 'o que já existia continua lá',
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_rel_demandas') >= 21
              then 'ok' else 'FALTOU' end,
         'a view não perdeu coluna ao ser recriada'

  union all
  select 3, 'cargas conferidas nos últimos 30 dias',
         case when (select count(*) from v_rel_demandas) >= 0 then 'ok' else 'FALTOU' end,
         (select count(*)::text || ' conferida(s), ' ||
                 count(*) filter (where conferencia = 'DIVERGENTE')::text || ' com divergência'
            from v_rel_demandas
           where conferencia <> 'NAO_CONFERIDO' and data >= current_date - 30)
) t order by ordem;
