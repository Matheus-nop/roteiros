-- =====================================================================
-- Recupera o "pendente desde" das demandas antigas, a partir da auditoria
-- =====================================================================
--
-- POR QUE ISTO EXISTE
--
-- A migração 0007 passou a registrar `pendente_desde` no momento em que a demanda vira
-- pendência. Para as que JÁ estavam pendentes ela usou um palpite: a data para a qual
-- foram reagendadas. E esse palpite tem um defeito que só apareceu no teste — essa data
-- costuma estar no FUTURO, então a demanda ficava "pendente desde" um dia que ainda não
-- chegou, e a conta de espera dava negativo.
--
-- Só que o instante real EXISTE: a tabela `historico` guarda cada mudança de status com
-- a hora. A primeira vez que a demanda voltou para AGUARDANDO ROTEIRIZAÇÃO é exatamente
-- quando ela virou pendência.
--
-- Este script troca o palpite pelo dado, e descarta o palpite quando não há dado — nulo
-- é melhor que uma data errada. Só mexe em quem está pendente agora. Rodar duas vezes
-- não muda mais nada.


-- ---------------------------------------------------------------------
-- PASSO 1 — Pré-voo (só leitura).
-- ---------------------------------------------------------------------
with primeira_volta as (
  select h.demanda_id, min(h.alterado_em) as quando
    from historico h
   where h.status_novo = 'AGUARDANDO_ROTEIRIZACAO'
   group by h.demanda_id
)
select
  count(*)                                                  as pendentes_agora,
  count(*) filter (where pv.quando is not null)             as recuperaveis_pela_auditoria,
  count(*) filter (where d.pendente_desde > now())          as com_data_no_futuro_a_limpar,
  count(*) filter (where pv.quando is null
                     and d.pendente_desde is null)          as ficarao_sem_data
from demandas d
left join primeira_volta pv on pv.demanda_id = d.id
where d.herdado_de_pendencia
  and d.status not in ('FINALIZADO', 'CANCELADO');


-- ---------------------------------------------------------------------
-- PASSO 2a — Traz o instante real da auditoria.
-- ---------------------------------------------------------------------
with primeira_volta as (
  select h.demanda_id, min(h.alterado_em) as quando
    from historico h
   where h.status_novo = 'AGUARDANDO_ROTEIRIZACAO'
   group by h.demanda_id
)
update demandas d
   set pendente_desde = pv.quando
  from primeira_volta pv
 where pv.demanda_id = d.id
   and d.herdado_de_pendencia
   and d.status not in ('FINALIZADO', 'CANCELADO')
   -- Só substitui por um momento ANTERIOR ao gravado: o que interessa é desde quando
   -- ela espera, não para quando foi empurrada.
   and (d.pendente_desde is null or pv.quando < d.pendente_desde);

-- ---------------------------------------------------------------------
-- PASSO 2b — Descarta o que sobrou de palpite no futuro.
-- ---------------------------------------------------------------------
-- Ninguém está pendente desde uma data que ainda não chegou. Sem a auditoria para
-- corrigir, o certo é não afirmar nada: o card volta a mostrar "para DD/MM".
update demandas
   set pendente_desde = null
 where herdado_de_pendencia
   and pendente_desde > now();


-- ---------------------------------------------------------------------
-- PASSO 3 — Conferência: as que esperam há mais tempo primeiro.
-- ---------------------------------------------------------------------
select
  d.cliente_nome,
  d.equipamento_nome,
  to_char(d.pendente_desde, 'DD/MM/YYYY HH24:MI')     as pendente_desde,
  (current_date - d.pendente_desde::date)             as dias_esperando,
  to_char(d.data_reagendada, 'DD/MM/YYYY')            as reagendada_para
from demandas d
where d.herdado_de_pendencia
  and d.status not in ('FINALIZADO', 'CANCELADO')
order by d.pendente_desde nulls last
limit 30;
