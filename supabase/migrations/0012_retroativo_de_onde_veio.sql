-- =====================================================================
-- Migração 0012: refazer o retroativo da 0011
-- (idempotente; rode no SQL Editor depois da 0011)
-- =====================================================================
--
-- A 0011 acertou o gatilho — daqui para frente toda pendência guarda de onde
-- veio. Mas o retroativo dela **não funcionou**, e falhou calado: eu escrevi a
-- consulta contra colunas `antes`/`depois` que a tabela `historico` não tem
-- (ela guarda `snapshot`, que é a linha DEPOIS da mudança, mais
-- `status_anterior`/`status_novo`). O `exception when others` que estava lá para
-- não derrubar a migração engoliu o erro, e as pendências que já existiam
-- ficaram sem origem — a tela mostra "REAGENDADA" e nada mais.
--
-- COMO SE RECUPERA O DADO
--
-- `snapshot` é a foto de cada alteração. A última foto em que a demanda ainda
-- NÃO era pendência é o retrato de quem a levava quando ela falhou: técnico,
-- veículo e a data em que deveria ter saído.
--
-- Esta migração só preenche o que está vazio. Rodar de novo não sobrescreve o
-- que o gatilho já gravou certo.

update demandas d
   set reagendado_de_tecnico_id = h.tecnico,
       reagendado_de_veiculo    = coalesce(
         h.veiculo,
         (select t.veiculo_padrao from tecnicos t where t.id = h.tecnico)),
       reagendado_de_data       = h.data
  from (
    select distinct on (x.demanda_id)
           x.demanda_id,
           (x.snapshot ->> 'tecnico_id')::uuid       as tecnico,
            x.snapshot ->> 'veiculo'                 as veiculo,
           (x.snapshot ->> 'data_planejada')::date   as data
      from historico x
     where coalesce(x.snapshot ->> 'herdado_de_pendencia', 'false') <> 'true'
       and x.snapshot ->> 'tecnico_id' is not null
     order by x.demanda_id, x.alterado_em desc      -- a última antes de virar pendência
  ) h
 where d.id = h.demanda_id
   and d.herdado_de_pendencia
   and d.reagendado_de_tecnico_id is null;

-- =====================================================================
-- E o veículo, que estava aparecendo em dobro
-- =====================================================================
--
-- Na Expedição, o cabeçalho do técnico mostrava
-- `FIORINO - SRT9D65 / STRADA - SRT9D55` no mesmo dia. Duas causas:
--
-- 1. Ao virar pendência, o `veiculo` antigo continuava na demanda. A peça que
--    saiu ontem na Fiorino voltou para o planejamento carregando a Fiorino, e
--    hoje polui o grupo de quem vai levá-la na Strada.
-- 2. Quando o PCM arrasta para outro técnico, o app manda só `tecnico_id` — o
--    veículo não acompanha, e fica o do técnico anterior.
--
-- Agora que a 0011 guarda de onde a pendência veio, o `veiculo` corrente pode
-- ser o que ele deveria sempre ter sido: **o carro do dia, de quem vai levar**.
-- Onde a peça esteve antes não se perde — está em `reagendado_de_veiculo`.

create or replace function public.marcar_tempos()
returns trigger language plpgsql as $$
begin
  if new.herdado_de_pendencia and not coalesce(old.herdado_de_pendencia, false) then
    new.pendente_desde := coalesce(old.pendente_desde, now());

    -- De onde ela veio. Lê-se de `old`: no mesmo UPDATE que marca a pendência,
    -- `data_planejada` já é a data nova — a antiga só existe aqui.
    new.reagendado_de_tecnico_id := old.tecnico_id;
    new.reagendado_de_data       := old.data_planejada;
    new.reagendado_de_veiculo    := coalesce(
      old.veiculo,
      (select t.veiculo_padrao from tecnicos t where t.id = old.tecnico_id));

    -- E some do plano: ela não está mais carregada em carro nenhum.
    new.veiculo := null;
  end if;

  -- Trocou de técnico sem que o app dissesse o veículo: o carro acompanha o
  -- novo dono. Se o app mandou um veículo no mesmo UPDATE, ele manda.
  if new.tecnico_id is distinct from old.tecnico_id
     and new.veiculo is not distinct from old.veiculo then
    new.veiculo := (select t.veiculo_padrao from tecnicos t where t.id = new.tecnico_id);
  end if;

  if new.data_reagendada is distinct from old.data_reagendada and new.data_reagendada is not null then
    new.reagendado_em := now();
  end if;

  if new.status = 'FINALIZADO' and old.status is distinct from 'FINALIZADO' then
    new.finalizado_em := coalesce(new.finalizado_em, now());
    new.pendente_desde := null;
  end if;

  if new.status = 'CANCELADO' and old.status is distinct from 'CANCELADO' then
    new.pendente_desde := null;
  end if;

  if old.status = 'FINALIZADO' and new.status is distinct from 'FINALIZADO' then
    new.finalizado_em := null;
  end if;

  return new;
end $$;

-- Alinha o que já está em rota: o veículo passa a ser o do técnico de hoje.
-- Seguro porque nenhuma tela define veículo à mão — o `atribuir` aceita, mas o
-- Planejamento manda só o técnico. O que estiver diferente é resto do passado.
update demandas d
   set veiculo = t.veiculo_padrao
  from tecnicos t
 where t.id = d.tecnico_id
   and d.status in ('AGUARDANDO_ROTEIRIZACAO','PLANEJADO','ROTEIRIZADO','AGUARDANDO_SAIDA','EM_DESLOCAMENTO')
   and d.veiculo is distinct from t.veiculo_padrao;

-- ---------------------------------------------------------------------
-- Conferência: quantas pendências têm origem agora
-- ---------------------------------------------------------------------
select count(*) filter (where herdado_de_pendencia)                                          as pendencias,
       count(*) filter (where herdado_de_pendencia and reagendado_de_tecnico_id is not null)  as com_origem,
       count(*) filter (where herdado_de_pendencia and reagendado_de_tecnico_id is null)      as sem_origem
  from demandas;

-- As que ficarem sem origem são pendências anteriores ao histórico guardar a
-- mudança de técnico. Não há de onde tirar — a tela não mostra o selo, em vez
-- de inventar um nome.
select d.om, d.cliente_nome, d.patrimonio, d.data_planejada
  from demandas d
 where d.herdado_de_pendencia and d.reagendado_de_tecnico_id is null
 order by d.data_planejada desc nulls last
 limit 20;

-- Nenhum técnico pode ter dois veículos no mesmo dia. Tem que vir vazio.
select t.nome, d.data_planejada, count(distinct d.veiculo) as veiculos
  from demandas d join tecnicos t on t.id = d.tecnico_id
 where d.status in ('ROTEIRIZADO','AGUARDANDO_SAIDA','EM_DESLOCAMENTO')
 group by t.nome, d.data_planejada
having count(distinct d.veiculo) > 1;
