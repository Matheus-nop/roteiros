-- =====================================================================
-- Migração 0015: "veio de" passa a ser a ÚLTIMA saída, não a primeira
-- (idempotente; rode no SQL Editor depois da 0014)
-- =====================================================================
--
-- O SINTOMA
--
-- Na expedição, o item reagendado mostra "veio de Rafael · KIA TTZ7I26 ·
-- 08/09". Só que a peça não está com o Rafael: ela saiu ONTEM com o Douglas, no
-- RJM, e voltou de novo. O crachá está mostrando a primeira tentativa, de dois
-- reagendamentos atrás.
--
-- Isso é o oposto do que a coluna serve para fazer. O comentário dela, escrito
-- na 0011, diz: "Veículo em que ela foi carregada da ÚLTIMA vez. A peça pode
-- ainda estar nele." E o `VeioDe` da tela de Expedição diz "o técnico e o
-- veículo da tentativa ANTERIOR". Os dois estão certos sobre a intenção; o
-- gatilho é que nunca fez isso.
--
-- A CAUSA
--
-- Na 0011 o preenchimento entrou dentro deste `if`:
--
--   if new.herdado_de_pendencia and not coalesce(old.herdado_de_pendencia, false)
--
-- que é a transição de "não era pendência" para "é pendência" — acontece UMA
-- vez na vida da demanda. Da segunda falha em diante `old.herdado_de_pendencia`
-- já é verdadeiro, o bloco inteiro é pulado, e `reagendado_de_*` fica
-- congelado na primeira viagem.
--
-- A guarda está certa para o vizinho de bloco: `pendente_desde` é o começo da
-- espera e NÃO pode se mexer, senão a demanda que mais se arrasta apareceria
-- sempre como recém-chegada. O erro foi as três colunas de origem terem pegado
-- carona nessa guarda — elas têm a semântica oposta, a de acompanhar.
--
-- A CORREÇÃO
--
-- Separa os dois. `pendente_desde` continua com a guarda de primeira vez.
-- `reagendado_de_*` passa a ser reescrito **a cada volta da rua**: quando a
-- demanda já estava despachada (ROTEIRIZADO, AGUARDANDO_SAIDA ou
-- EM_DESLOCAMENTO) e volta marcada como pendência.
--
-- O que NÃO reescreve, de propósito: empurrar a data pela tela de Pendências.
-- Ali `old.status` é AGUARDANDO_ROTEIRIZACAO — ninguém carregou nada, e o
-- crachá tem que continuar apontando para o carro onde a peça pode estar.

create or replace function public.marcar_tempos()
returns trigger language plpgsql as $$
begin
  -- Virou pendência agora: começa a contagem. `coalesce` garante que um segundo
  -- reagendamento não reinicie o relógio — senão a demanda que mais se arrasta
  -- apareceria sempre como recém-chegada. (Inalterado desde a 0007.)
  if new.herdado_de_pendencia and not coalesce(old.herdado_de_pendencia, false) then
    new.pendente_desde := coalesce(old.pendente_desde, now());
  end if;

  -- De onde ela veio DESTA vez.
  --
  -- Lê-se de `old` de propósito: no mesmo UPDATE que marca a pendência,
  -- `data_planejada` já é a data nova — a antiga só existe aqui. O veículo cai
  -- no padrão do técnico quando a demanda não tinha um próprio.
  --
  -- Dispara na primeira vez (a demanda vira pendência) e em toda volta seguinte
  -- (já era pendência, saiu de novo e voltou de novo).
  --
  -- O segundo caso exige `new.status = 'AGUARDANDO_ROTEIRIZACAO'`, e não só
  -- "estava despachada". Sem isso o gatilho dispararia em QUALQUER alteração
  -- feita enquanto a demanda está em rota — a expedição marcando "separado", por
  -- exemplo — e sobrescreveria o crachá com o técnico ATUAL, apagando de onde a
  -- peça veio justamente na tela que precisa saber. Só volta da rua conta, e
  -- voltar da rua é o status mudar de despachado para planejamento.
  if new.herdado_de_pendencia
     and (not coalesce(old.herdado_de_pendencia, false)
          or (old.status in ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO')
              and new.status = 'AGUARDANDO_ROTEIRIZACAO')) then
    new.reagendado_de_tecnico_id := old.tecnico_id;
    new.reagendado_de_data       := old.data_planejada;
    new.reagendado_de_veiculo    := coalesce(
      old.veiculo,
      (select t.veiculo_padrao from tecnicos t where t.id = old.tecnico_id)
    );
  end if;

  -- Ganhou data nova: registra o momento.
  if new.data_reagendada is distinct from old.data_reagendada and new.data_reagendada is not null then
    new.reagendado_em := now();
  end if;

  -- Concluída: carimba a hora se o app não mandou, e encerra a espera.
  if new.status = 'FINALIZADO' and old.status is distinct from 'FINALIZADO' then
    new.finalizado_em := coalesce(new.finalizado_em, now());
    new.pendente_desde := null;
  end if;

  -- Cancelada deixa de esperar por alguém.
  if new.status = 'CANCELADO' and old.status is distinct from 'CANCELADO' then
    new.pendente_desde := null;
  end if;

  -- Voltou a circular sem ser por pendência (restaurada do histórico): limpa o
  -- carimbo de conclusão, que não vale mais.
  if old.status = 'FINALIZADO' and new.status is distinct from 'FINALIZADO' then
    new.finalizado_em := null;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- Retroativo: quem já está pendente hoje está com a viagem errada no crachá
-- ---------------------------------------------------------------------
-- Sem isto, a correção só vale da próxima falha em diante — e o item que está
-- na fila da expedição AGORA continua apontando para o carro errado, que é
-- justamente o caso que apareceu.
--
-- O `snapshot` do `historico` é a linha ANTES da mudança. Na linha em que a
-- demanda saiu de um status despachado e voltou para o planejamento, ele é o
-- retrato exato da viagem que falhou: técnico, veículo e o dia em que deveria
-- ter saído. `distinct on` com `alterado_em desc` pega a mais recente.
--
-- Recalcula do zero a cada execução, então rodar de novo não acumula nada.
-- Mexe só em pendência viva: arquivada não aparece na expedição, e o
-- `updated_at` dela ordena a tela de Histórico.
with ultima_saida as (
  select distinct on (h.demanda_id)
    h.demanda_id,
    (h.snapshot ->> 'tecnico_id')::uuid     as tecnico_id,
    h.snapshot ->> 'veiculo'                as veiculo,
    (h.snapshot ->> 'data_planejada')::date as data
  from historico h
  where h.acao is distinct from 'criada'
    and h.status_anterior in ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO')
    and h.status_novo = 'AGUARDANDO_ROTEIRIZACAO'
  order by h.demanda_id, h.alterado_em desc
)
update demandas d
   set reagendado_de_tecnico_id = coalesce(u.tecnico_id, d.reagendado_de_tecnico_id),
       reagendado_de_veiculo    = coalesce(
                                    u.veiculo,
                                    (select t.veiculo_padrao from tecnicos t where t.id = u.tecnico_id),
                                    d.reagendado_de_veiculo),
       reagendado_de_data       = coalesce(u.data, d.reagendado_de_data)
  from ultima_saida u
 where u.demanda_id = d.id
   and d.herdado_de_pendencia
   and d.status not in ('FINALIZADO', 'CANCELADO')
   and (d.reagendado_de_tecnico_id is distinct from coalesce(u.tecnico_id, d.reagendado_de_tecnico_id)
        or d.reagendado_de_data    is distinct from coalesce(u.data, d.reagendado_de_data));

comment on column demandas.reagendado_de_tecnico_id is
  'Técnico que levava esta demanda na ÚLTIMA vez que ela saiu e não deu. Não é o técnico atual, e não é a primeira tentativa.';
comment on column demandas.reagendado_de_veiculo is
  'Veículo em que ela foi carregada da última vez. A peça pode ainda estar nele.';
comment on column demandas.reagendado_de_data is
  'Dia da última vez em que ela deveria ter saído e não saiu.';

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------

-- 1. As pendências vivas com mais de uma saída registrada. `saidas` maior que 1
--    com `de_data` igual à PRIMEIRA saída é o defeito; igual à última é o certo.
select
  d.numero,
  d.cliente_nome,
  t.nome                                   as tecnico_agora,
  ta.nome                                  as veio_de,
  d.reagendado_de_veiculo                  as veiculo,
  d.reagendado_de_data                     as de_data,
  (select count(*) from historico h
    where h.demanda_id = d.id
      and h.status_anterior in ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO')
      and h.status_novo = 'AGUARDANDO_ROTEIRIZACAO') as saidas,
  (select max(h.alterado_em)::date from historico h
    where h.demanda_id = d.id
      and h.status_anterior in ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO')
      and h.status_novo = 'AGUARDANDO_ROTEIRIZACAO') as ultima_volta
from demandas d
left join tecnicos t  on t.id = d.tecnico_id
left join tecnicos ta on ta.id = d.reagendado_de_tecnico_id
where d.herdado_de_pendencia
  and d.status not in ('FINALIZADO', 'CANCELADO')
order by saidas desc, d.reagendado_de_data
limit 30;
