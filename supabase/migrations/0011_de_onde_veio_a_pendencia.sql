-- =====================================================================
-- Migração 0011: de qual roteiro a pendência veio
-- (idempotente; rode no SQL Editor depois da 0010)
-- =====================================================================
--
-- O PROBLEMA, NA VOZ DE QUEM SEPARA
--
-- A peça saiu ontem no roteiro do Leonardo Oliveira, na Strada. Não deu. Foi
-- reagendada para hoje e o PCM colocou no roteiro do Henrique, na Saveiro.
--
-- A expedição vê o item na fila e vai buscar outro igual na prateleira — quando
-- a peça pode estar **dentro da Strada do Leonardo**, carregada desde ontem.
-- É retrabalho na melhor hipótese e equipamento duplicado na rua na pior.
--
-- Hoje isso é impossível de saber pela tela: o reagendamento reaproveita a mesma
-- linha da demanda, e quando o PCM reatribui, `tecnico_id` e `veiculo` são
-- SOBRESCRITOS. Quem carregou antes só existe no `historico`, que nenhuma tela
-- de trabalho consulta.
--
-- A CORREÇÃO
--
-- Três colunas que guardam de onde a pendência veio, preenchidas no instante em
-- que a demanda vira pendência — antes de o PCM reatribuir. Nada muda de dono:
-- é registro do passado, não do plano.
--
-- Vai dentro do `marcar_tempos` da 0007, que já é o gatilho que carimba o que
-- acontece nesse mesmo instante. Um gatilho só, um lugar só para procurar.

alter table demandas
  add column if not exists reagendado_de_tecnico_id uuid references tecnicos(id),
  add column if not exists reagendado_de_veiculo    text,
  add column if not exists reagendado_de_data       date;

comment on column demandas.reagendado_de_tecnico_id is
  'Técnico que levava esta demanda quando ela virou pendência. Não é o técnico atual.';
comment on column demandas.reagendado_de_veiculo is
  'Veículo em que ela foi carregada da última vez. A peça pode ainda estar nele.';
comment on column demandas.reagendado_de_data is
  'Dia em que ela deveria ter saído e não saiu.';

create or replace function public.marcar_tempos()
returns trigger language plpgsql as $$
begin
  -- Virou pendência agora: começa a contagem. `coalesce` garante que um segundo
  -- reagendamento não reinicie o relógio — senão a demanda que mais se arrasta
  -- apareceria sempre como recém-chegada.
  if new.herdado_de_pendencia and not coalesce(old.herdado_de_pendencia, false) then
    new.pendente_desde := coalesce(old.pendente_desde, now());

    -- De onde ela veio. Lê-se de `old` de propósito: no mesmo UPDATE que marca a
    -- pendência, `data_planejada` já é a data nova — a antiga só existe aqui.
    -- O veículo cai no padrão do técnico quando a demanda não tinha um próprio.
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
-- Retroativo, até onde o histórico permite
-- ---------------------------------------------------------------------
-- Quem já está pendente hoje passou pela mudança antes desta migração existir.
-- O `historico` guarda cada alteração; dele dá para recuperar o técnico que
-- levava a demanda quando ela virou pendência. Onde não der, fica nulo — e a
-- tela simplesmente não mostra, em vez de inventar.
do $$
begin
  update demandas d
     set reagendado_de_tecnico_id = h.tecnico_anterior,
         reagendado_de_veiculo    = coalesce(
           h.veiculo_anterior,
           (select t.veiculo_padrao from tecnicos t where t.id = h.tecnico_anterior)),
         reagendado_de_data       = h.data_anterior
    from (
      select distinct on (x.demanda_id)
             x.demanda_id,
             (x.antes ->> 'tecnico_id')::uuid   as tecnico_anterior,
             x.antes ->> 'veiculo'              as veiculo_anterior,
             (x.antes ->> 'data_planejada')::date as data_anterior
        from historico x
       where x.depois ->> 'herdado_de_pendencia' = 'true'
         and coalesce(x.antes ->> 'herdado_de_pendencia', 'false') <> 'true'
       order by x.demanda_id, x.criado_em desc
    ) h
   where d.id = h.demanda_id
     and d.herdado_de_pendencia
     and d.reagendado_de_tecnico_id is null;
exception when others then
  -- O histórico pode não ter as colunas com estes nomes em bancos antigos. Não
  -- vale interromper a migração por um retroativo que é bônus.
  raise notice 'retroativo de "de onde veio" ignorado: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select count(*) filter (where herdado_de_pendencia)                              as pendencias,
       count(*) filter (where herdado_de_pendencia and reagendado_de_tecnico_id is not null) as com_origem
  from demandas;
