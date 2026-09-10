-- =====================================================================
-- Migração 0014: o relatório volta a contar reagendamento
-- (idempotente; rode no SQL Editor)
-- =====================================================================
--
-- SINTOMA
--
-- A coluna "Reag." dos relatórios mostrava ZERO para todo mundo — todos os
-- clientes, todos os técnicos, todos os meses — e o cartão "Quem mais
-- reagenda" dizia "Nenhum reagendamento no período. Bom sinal." Não era bom
-- sinal: era conta que nunca podia dar outra coisa.
--
-- CAUSA
--
-- A `v_rel_demandas` contava assim:
--
--   where h.demanda_id = d.id and h.status_novo = 'REAGENDADO'
--
-- Mas o app **nunca grava o status REAGENDADO**. Os três caminhos que reagendam
-- — `marcarPendente`, `reagendar` e `fecharRoteiro` — devolvem a demanda ao
-- planejamento com `status = 'AGUARDANDO_ROTEIRIZACAO'` e a data nova. O status
-- 'REAGENDADO' só entra por uma porta: a importação de planilha antiga, quando
-- o texto da coluna começa com "REAGENDAD".
--
-- Ou seja: a view procurava um valor que o sistema não produz. Contar linha
-- nenhuma é o resultado correto da pergunta errada.
--
-- O QUE PASSA A CONTAR
--
-- Reagendamento é a demanda que **já tinha dia marcado e teve o dia trocado**.
-- No `historico` isso aparece de duas formas, e as duas contam:
--
--   1. Voltou ao planejamento depois de já ter sido despachada. É o caso do
--      técnico que não conseguiu executar e o roteiro fechou empurrando para
--      outro dia: ROTEIRIZADO/AGUARDANDO_SAIDA/EM_DESLOCAMENTO/PENDENTE →
--      AGUARDANDO_ROTEIRIZACAO.
--
--   2. Já era pendência e foi empurrada de novo. É a tela de Pendências
--      trocando a data de quem já vinha arrastado. O `snapshot` guarda a linha
--      ANTES da mudança, então `herdado_de_pendencia` verdadeiro ali significa
--      "já era pendência antes desta troca" — a segunda vez em diante.
--
-- O que continua NÃO contando, de propósito: mudar a data de uma demanda que
-- ainda está em planejamento e nunca saiu. Isso é planejar, não reagendar, e
-- somar aí faria o número dizer que a equipe reagenda o tempo todo.
--
-- A regra antiga (`status_novo = 'REAGENDADO'`) fica, para não perder o que
-- veio das planilhas importadas. Uma mesma linha do histórico que se encaixe em
-- mais de um caso conta uma vez só — é `count(*)` sobre linhas, não soma de
-- condições.
--
-- POR QUE ESTA REGRA, E NÃO OUTRA
--
-- O banco já tinha uma definição de reagendamento, no gatilho `marcar_tempos`
-- da 0007: `data_reagendada` mudou para um valor não nulo. É ela que carimba
-- `demandas.reagendado_em`. Esta view não pode usá-la diretamente — o
-- `historico` guarda o `snapshot` da linha ANTES da mudança, então "mudou para"
-- exigiria comparar linhas consecutivas — mas foi calibrada contra ela: as duas
-- dão o mesmo número em todos os caminhos que o app percorre (fechar roteiro,
-- marcar pendente, empurrar de novo, falhar duas viagens seguidas), e as duas
-- dão zero em replanejamento puro e no caminho feliz.
--
-- Se um dia divergirem, a do gatilho é a certa: a conferência 4 no fim deste
-- arquivo é justamente esse confronto. `reagendado_em` preenchido com
-- `reagendamentos = 0` é sinal de que esta regra ficou para trás.

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
  d.finalizado_em
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
  'Uma linha por demanda com as dimensões dos relatórios resolvidas (cliente oficial, técnico, nº de reagendamentos). Reagendamento = demanda que já tinha dia marcado e teve o dia trocado. Filtre por `mes` para recortar o período.';

grant select on v_rel_demandas to authenticated;

-- ---------------------------------------------------------------------
-- Conferência: rode junto e compare.
-- ---------------------------------------------------------------------

-- 1. A prova da causa: quantas linhas do histórico batem em cada regra.
--    `regra_antiga` perto de zero com `regra_nova` alta é o defeito confirmado.
select
  count(*) filter (
    where status_novo = 'REAGENDADO' and acao is distinct from 'criada'
  ) as regra_antiga,
  count(*) filter (
    where acao is distinct from 'criada'
      and status_novo = 'AGUARDANDO_ROTEIRIZACAO'
      and status_anterior in
          ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO', 'PENDENTE', 'REAGENDADO')
  ) as voltou_da_rota,
  count(*) filter (
    where acao is distinct from 'criada'
      and (snapshot ->> 'herdado_de_pendencia')::boolean
      and acao like '%data planejada%'
  ) as pendencia_empurrada_de_novo
from historico;

-- 2. Para onde o status vai de verdade quando alguém reagenda. Serve de
--    conferência se um dia o app passar a gravar outro valor.
select status_anterior, status_novo, count(*) as vezes
from historico
where acao is distinct from 'criada' and status_novo is distinct from status_anterior
group by status_anterior, status_novo
order by vezes desc
limit 20;

-- 3. O número já pela view, por cliente, nos últimos 6 meses.
select cliente, count(*) as demandas, sum(reagendamentos) as reagendamentos
from v_rel_demandas
where mes >= to_char(current_date - interval '6 months', 'YYYY-MM')
group by cliente
having sum(reagendamentos) > 0
order by reagendamentos desc
limit 20;

-- 4. Confronto com o gatilho do banco. `reagendado_em` é carimbado pela
--    `marcar_tempos` a cada data nova; se esta view estiver certa, nenhuma
--    demanda tem carimbo com contagem zero. Linhas aqui = regra desatualizada.
select v.id, v.cliente, v.status, v.reagendamentos, d.reagendado_em
from v_rel_demandas v
join demandas d on d.id = v.id
where d.reagendado_em is not null and v.reagendamentos = 0
limit 20;
