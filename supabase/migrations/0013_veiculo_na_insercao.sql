-- =====================================================================
-- Migração 0013: o veículo também na inserção
-- (idempotente; rode no SQL Editor depois da 0012)
-- =====================================================================
--
-- A 0012 fez o veículo acompanhar o técnico, mas só no UPDATE — o gatilho
-- `marcar_tempos` é `before update`. Demanda que **nasce** com técnico e
-- veículo (a importação de contrato e de planilha trazem os dois) nunca passa
-- por ele.
--
-- O resultado apareceu em produção logo depois: três demandas roteirizadas com
-- veículo diferente do técnico, e o cabeçalho da expedição voltando a mostrar
-- `FIORINO - SRT9D65 / KIA - TTB0J08` no mesmo dia.
--
-- A REGRA, DITA POR INTEIRO
--
-- O veículo é do técnico, não da demanda. Quem define é o planejamento: se o
-- Igor roda de KIA hoje, tudo que estiver com o Igor hoje vai de KIA. Não
-- existe item avulso em outro carro — e é por isso que a correção vale também
-- na inserção, e não só quando alguém reatribui.

create or replace function public.marcar_tempos()
returns trigger language plpgsql as $$
begin
  -- Na inserção não há `old`: o veículo simplesmente segue o técnico.
  if tg_op = 'INSERT' then
    if new.tecnico_id is not null then
      new.veiculo := (select t.veiculo_padrao from tecnicos t where t.id = new.tecnico_id);
    end if;
    return new;
  end if;

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

drop trigger if exists trg_demandas_tempos on demandas;
create trigger trg_demandas_tempos
  before insert or update on demandas
  for each row execute function public.marcar_tempos();

-- Alinha as que já entraram erradas.
update demandas d
   set veiculo = t.veiculo_padrao
  from tecnicos t
 where t.id = d.tecnico_id
   and d.status in ('AGUARDANDO_ROTEIRIZACAO','PLANEJADO','ROTEIRIZADO','AGUARDANDO_SAIDA','EM_DESLOCAMENTO')
   and d.veiculo is distinct from t.veiculo_padrao;

-- ---------------------------------------------------------------------
-- Conferência: tem que vir vazia
-- ---------------------------------------------------------------------
select t.nome, d.data_planejada, string_agg(distinct d.veiculo, ' / ') as veiculos
  from demandas d join tecnicos t on t.id = d.tecnico_id
 where d.status in ('ROTEIRIZADO','AGUARDANDO_SAIDA','EM_DESLOCAMENTO')
   and d.veiculo is not null
 group by t.nome, d.data_planejada
having count(distinct d.veiculo) > 1;
