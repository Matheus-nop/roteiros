-- =====================================================================
-- Migração 0007: quando concluiu, quando reagendou, desde quando espera
-- (idempotente; rode no SQL Editor depois da 0006)
-- =====================================================================
--
-- O QUE FALTAVA
--
-- `finalizado_em` já existia, mas dependia do app mandar o valor — e nenhum registro
-- guardava QUANDO a demanda virou pendência. Sem isso não dá para responder a pergunta
-- que interessa ao PCM: "essa aqui está rolando desde quando?". Uma demanda reagendada
-- três vezes parecia igual a uma que falhou ontem.
--
-- Duas colunas, com significados diferentes de propósito:
--
--   pendente_desde  a PRIMEIRA vez que ela não foi executada. Não se mexe mais depois:
--                   é o que mede há quanto tempo o problema se arrasta.
--   reagendado_em   a ÚLTIMA vez que ganhou data nova. Muda a cada reagendamento:
--                   é o que diz se alguém tocou nela recentemente.
--
-- Uma demanda com `pendente_desde` de 12 dias atrás e `reagendado_em` de hoje está
-- sendo empurrada. As duas juntas contam essa história; uma só não conta.
--
-- POR QUE EM GATILHO, E NÃO NO APP
--
-- O app tem quatro caminhos que reagendam (o botão do técnico, o fechamento do roteiro,
-- a tela de Pendências e a edição). Marcar em cada um deixaria buraco no dia em que
-- aparecesse o quinto. No banco, vale para todos — inclusive para o que for corrigido
-- à mão no SQL Editor.

alter table demandas add column if not exists pendente_desde timestamptz;
alter table demandas add column if not exists reagendado_em  timestamptz;

comment on column demandas.pendente_desde is
  'Quando a demanda virou pendência pela primeira vez. Zerada ao ser concluída ou cancelada.';
comment on column demandas.reagendado_em is
  'Quando recebeu data nova pela última vez.';

create or replace function public.marcar_tempos()
returns trigger language plpgsql as $$
begin
  -- Virou pendência agora: começa a contagem. `coalesce` garante que um segundo
  -- reagendamento não reinicie o relógio — senão a demanda que mais se arrasta
  -- apareceria sempre como recém-chegada.
  if new.herdado_de_pendencia and not coalesce(old.herdado_de_pendencia, false) then
    new.pendente_desde := coalesce(old.pendente_desde, now());
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

  -- Voltou a circular sem ser por pendência (restaurada do histórico): limpa o carimbo
  -- de conclusão, que não vale mais.
  if old.status = 'FINALIZADO' and new.status is distinct from 'FINALIZADO' then
    new.finalizado_em := null;
  end if;

  return new;
end $$;

drop trigger if exists trg_demandas_tempos on demandas;
create trigger trg_demandas_tempos
  before update on demandas
  for each row execute function public.marcar_tempos();

-- Retroativo possível: quem já está pendente hoje ganha, como ponto de partida, a data
-- para a qual foi reagendada. Não é o instante real — esse nunca foi gravado — mas é
-- melhor do que nulo, e daqui pra frente o gatilho registra a hora de verdade.
update demandas
   set pendente_desde = coalesce(pendente_desde, data_reagendada::timestamptz)
 where herdado_de_pendencia
   and pendente_desde is null
   and data_reagendada is not null
   and status not in ('FINALIZADO', 'CANCELADO');
