-- 0020 · A conferência da carga entra no relatório
--
-- A 0019 gravou o que o técnico vê ao carregar. Esta migração leva esse dado
-- para o único lugar onde ele responde a pergunta do gestor: "quem erra mais,
-- e em quê" — sem ninguém anotar nada à mão.
--
-- Quatro colunas na `v_rel_demandas`, e nada mais. Quem soma é a tela, como já
-- é para cliente, equipamento e técnico: a view devolve UMA LINHA POR DEMANDA
-- com as dimensões resolvidas, e qualquer corte novo vira código, não migração.
-- É a regra escrita na 0008 e ela continua valendo aqui.
--
--
-- ── Por que `separado_por` também entra ──────────────────────────────
--
-- O relatório não é sobre quem CONFERIU: é sobre quem SEPAROU o item que não
-- bateu. Sem `separado_por` a divergência fica órfã — dá para contar quantas
-- houve e nunca de quem foram. São dois nomes diferentes na mesma linha, e os
-- dois precisam vir.
--
--
-- ── Uma leitura que a tela vai precisar fazer ────────────────────────
--
-- Contagem crua pune quem separa mais. Quem separou duzentos itens e errou
-- quatro está melhor que quem separou vinte e errou três, e um ranking por
-- número absoluto diz o contrário. Por isso a view entrega o denominador junto
-- (a linha existe mesmo quando conferencia = 'NAO_CONFERIDO'), e a tela divide.
--
-- Vale o mesmo aviso na direção oposta: divergência zero não quer dizer carga
-- certa, quer dizer que ninguém conferiu. A adesão vem antes do ranking.

-- ---------------------------------------------------------------------
-- 1. A view de fato ganha a conferência
-- ---------------------------------------------------------------------
--
-- `create or replace view` só aceita coluna NOVA no fim da lista — trocar a
-- ordem exigiria drop, e drop derrubaria quem depende dela. As quatro entram
-- depois de `finalizado_em`, que é onde a 0014 parou.

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
  d.divergencia
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
  'traz também a conferência da carga: o que o técnico viu, quem separou e o que '
  'não bateu.';

-- ---------------------------------------------------------------------
-- 2. Conferência
-- ---------------------------------------------------------------------
--
-- O editor do Supabase mostra só o resultado da ÚLTIMA instrução — por isso
-- toda migração termina se conferindo. Espere três linhas, todas "ok".
-- E confira que não há texto selecionado na tela: com seleção, o editor roda
-- SÓ o trecho selecionado, e o resto desta migração não sobe.

select item, situacao, detalhe from (
  select 1 as ordem, 'as quatro colunas na view' as item,
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_rel_demandas'
                       and column_name in ('conferencia','conferido_por','separado_por','divergencia')) = 4
              then 'ok' else 'FALTOU' end as situacao,
         'conferencia, conferido_por, separado_por, divergencia' as detalhe

  union all
  select 2, 'o que já existia continua lá',
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_rel_demandas') >= 18
              then 'ok' else 'FALTOU' end,
         'a view não perdeu coluna ao ser recriada'

  union all
  select 3, 'a view responde',
         case when (select count(*) from v_rel_demandas) >= 0 then 'ok' else 'FALTOU' end,
         (select count(*)::text || ' demanda(s) no relatório' from v_rel_demandas)
) t order by ordem;
