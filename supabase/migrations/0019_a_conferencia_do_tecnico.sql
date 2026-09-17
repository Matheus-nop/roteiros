-- 0019 · A conferência da carga pelo técnico
--
-- "Quero uma tela de conferência de carga para o técnico, a mesma coisa da aba
--  expedição, para evitar que um erro da expedição não seja pego."
--
-- Hoje o caminho é: a expedição separa (status_separacao), fecha a pré-carga
-- (AGUARDANDO_SAIDA) e o técnico aperta "Iniciar rota" (EM_DESLOCAMENTO). Entre
-- o fechar e o iniciar não existe ninguém olhando: quem separou é quem confere,
-- e ninguém confere o próprio trabalho de verdade. O erro só aparece na obra,
-- com o cliente na frente e o caminhão a trinta quilômetros.
--
-- Esta migração abre a segunda vista. Não muda o fluxo — a rota continua saindo
-- do mesmo jeito. Ela só grava o que o técnico viu ao carregar.
--
--
-- ── Por que a divergência NÃO trava a saída ──────────────────────────
--
-- Porque caminhão parado custa mais que entrega errada, e porque travar cria o
-- incentivo errado: o técnico que não consegue sair aprende a marcar tudo OK.
-- A divergência fica registrada na demanda, acende na tela da expedição na hora
-- e sobra no histórico com nome e hora. Quem erra não é barrado — é visto.
--
--
-- ── Por que quatro colunas, e não uma tabela ─────────────────────────
--
-- A conferência é um ATRIBUTO da demanda, como `status_separacao` já é: uma
-- linha, um conferente, um instante. Tabela à parte pediria join em toda tela
-- que hoje lê `demandas` direto — e são nove — para responder algo que cabe em
-- quatro campos. Se um dia a mesma carga for conferida duas vezes, aí sim.

-- ---------------------------------------------------------------------
-- 1. As colunas
-- ---------------------------------------------------------------------

alter table public.demandas
  add column if not exists conferencia    text not null default 'NAO_CONFERIDO',
  -- Nome de quem conferiu, não o id: é o que a tela mostra e o que o gestor lê
  -- no relatório, do mesmo jeito que `separado_por` já faz.
  add column if not exists conferido_por  text,
  add column if not exists conferido_em   timestamptz,
  -- O que o técnico apontou. Só existe quando conferencia = 'DIVERGENTE'.
  add column if not exists divergencia    text;

alter table public.demandas drop constraint if exists demandas_conferencia_check;
alter table public.demandas add constraint demandas_conferencia_check
  check (conferencia in ('NAO_CONFERIDO', 'OK', 'DIVERGENTE'));

-- Divergência sem motivo escrito não serve para ninguém: o gestor abre o
-- relatório e lê "divergente", que é a mesma coisa que não ler nada.
alter table public.demandas drop constraint if exists demandas_divergencia_check;
alter table public.demandas add constraint demandas_divergencia_check
  check (conferencia <> 'DIVERGENTE' or nullif(btrim(coalesce(divergencia, '')), '') is not null);

comment on column public.demandas.conferencia is
  'O que o TÉCNICO viu ao carregar, não o que a expedição diz ter separado. '
  'NAO_CONFERIDO | OK | DIVERGENTE.';

-- O índice serve a uma pergunta só, e é a mais feita: o que está divergente e
-- ainda não saiu? Parcial, porque divergência é exceção — o índice fica com
-- dezenas de linhas, não com as dezenas de milhares da tabela.
create index if not exists demandas_divergentes_idx
  on public.demandas (data_planejada, tecnico_id)
  where conferencia = 'DIVERGENTE';

-- ---------------------------------------------------------------------
-- 2. O histórico registra a conferência
-- ---------------------------------------------------------------------
--
-- `registrar_historico` já anota status, separação, técnico, data e veículo.
-- A conferência entra na mesma lista: é exatamente o tipo de coisa que alguém
-- vai querer reconstituir depois — "quem conferiu esta carga, e a que horas".
--
-- A função é recriada inteira porque não há como acrescentar um ramo a um
-- `if` existente por fora. O resto do corpo é idêntico ao da 0001.

create or replace function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_acao text;
begin
  if tg_op = 'INSERT' then
    insert into historico (demanda_id, status_anterior, status_novo, alterado_por, snapshot, acao)
    values (new.id, null, new.status, auth.uid(), to_jsonb(new), 'criada');
    return new;
  elsif tg_op = 'DELETE' then
    insert into historico (demanda_id, status_anterior, status_novo, alterado_por, snapshot, acao)
    values (old.id, old.status, null, auth.uid(), to_jsonb(old), 'excluída');
    return old;
  else
    if new.status is distinct from old.status
       or new.status_separacao is distinct from old.status_separacao
       or new.conferencia is distinct from old.conferencia
       or new.tecnico_id is distinct from old.tecnico_id
       or new.data_planejada is distinct from old.data_planejada
       or new.veiculo is distinct from old.veiculo then
      v_acao := '';
      if new.status is distinct from old.status then
        v_acao := v_acao || 'status ' || coalesce(old.status,'—') || ' → ' || new.status || '; ';
      end if;
      if new.status_separacao is distinct from old.status_separacao then
        v_acao := v_acao || 'separação ' || new.status_separacao
                  || coalesce(' por ' || new.separado_por, '') || '; ';
      end if;
      if new.conferencia is distinct from old.conferencia then
        v_acao := v_acao || 'conferência ' || new.conferencia
                  || coalesce(' por ' || new.conferido_por, '')
                  || coalesce(' · ' || new.divergencia, '') || '; ';
      end if;
      if new.tecnico_id is distinct from old.tecnico_id then
        v_acao := v_acao || 'técnico alterado; ';
      end if;
      if new.data_planejada is distinct from old.data_planejada then
        v_acao := v_acao || 'data planejada ' || coalesce(to_char(old.data_planejada,'DD/MM/YYYY'),'—')
                  || ' → ' || coalesce(to_char(new.data_planejada,'DD/MM/YYYY'),'—') || '; ';
      end if;
      if new.veiculo is distinct from old.veiculo then
        v_acao := v_acao || 'veículo ' || coalesce(old.veiculo,'—') || ' → ' || coalesce(new.veiculo,'—') || '; ';
      end if;
      insert into historico (demanda_id, status_anterior, status_novo, alterado_por, snapshot, acao)
      values (new.id, old.status, new.status, auth.uid(), to_jsonb(old), rtrim(v_acao, '; '));
    end if;
    return new;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Quando a demanda volta atrás, a conferência volta junto
-- ---------------------------------------------------------------------
--
-- Estornar a pré-carga devolve o item ao galpão para ser separado de novo.
-- Manter o "conferido" de antes seria guardar o carimbo de uma carga que não
-- existe mais — e na próxima saída o técnico veria tudo verde sem ter olhado.
--
-- Vale para os dois caminhos de volta: o estorno (AGUARDANDO_SAIDA →
-- ROTEIRIZADO) e o reagendamento (qualquer coisa → AGUARDANDO_ROTEIRIZACAO).

create or replace function public.limpar_conferencia_ao_voltar()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status in ('ROTEIRIZADO', 'AGUARDANDO_ROTEIRIZACAO', 'PLANEJADO')
     and old.conferencia <> 'NAO_CONFERIDO' then
    new.conferencia   := 'NAO_CONFERIDO';
    new.conferido_por := null;
    new.conferido_em  := null;
    new.divergencia   := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_demandas_limpar_conferencia on public.demandas;
create trigger trg_demandas_limpar_conferencia
  before update on public.demandas
  for each row execute function public.limpar_conferencia_ao_voltar();

-- ---------------------------------------------------------------------
-- 4. Permissão
-- ---------------------------------------------------------------------
--
-- Nada a fazer, e é de propósito: a `demandas_update` da 0004 já diz que o
-- TÉCNICO alcança as linhas em que `tecnico_id` é o dele, e não restringe
-- coluna. Conferir é escrever na própria carga — cabe na regra que já existe.
-- O passo 5 confere isso em vez de supor.

-- ---------------------------------------------------------------------
-- 5. Conferência
-- ---------------------------------------------------------------------
--
-- O editor do Supabase mostra só o resultado da ÚLTIMA instrução — por isso
-- toda migração termina se conferindo. Espere cinco linhas, todas "ok".
-- E confira que não há texto selecionado na tela: com seleção, o editor roda
-- SÓ o trecho selecionado, e o resto desta migração não sobe.

select item, situacao, detalhe from (
  select 1 as ordem, 'as quatro colunas' as item,
         case when (select count(*) from information_schema.columns
                     where table_schema = 'public' and table_name = 'demandas'
                       and column_name in ('conferencia','conferido_por','conferido_em','divergencia')) = 4
              then 'ok' else 'FALTOU' end as situacao,
         'conferencia, conferido_por, conferido_em, divergencia' as detalhe

  union all
  select 2, 'divergência exige motivo',
         case when exists (select 1 from pg_constraint
                            where conrelid = 'public.demandas'::regclass
                              and conname = 'demandas_divergencia_check')
              then 'ok' else 'FALTOU' end,
         'não dá para marcar divergente sem escrever o que houve'

  union all
  select 3, 'índice das divergentes',
         case when to_regclass('public.demandas_divergentes_idx') is not null
              then 'ok' else 'FALTOU' end,
         'parcial: só as divergentes entram nele'

  union all
  select 4, 'o histórico anota a conferência',
         case when position('conferência' in
                (select pg_get_functiondef(p.oid) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'registrar_historico')) > 0
              then 'ok' else 'FALTOU' end,
         'quem conferiu e o que apontou ficam rastreáveis'

  union all
  select 5, 'voltar atrás limpa a conferência',
         case when exists (select 1 from pg_trigger
                            where tgrelid = 'public.demandas'::regclass
                              and tgname = 'trg_demandas_limpar_conferencia')
              then 'ok' else 'FALTOU' end,
         'estorno e reagendamento não deixam carimbo de carga antiga'
) t order by ordem;
