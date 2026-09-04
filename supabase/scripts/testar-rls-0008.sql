-- =====================================================================
-- Prova das políticas de RLS criadas pela migração 0008
-- =====================================================================
--
-- A regra do projeto é que política nova exige teste que prove o bloqueio. Este é o
-- teste. Ele NÃO roda no Supabase (usa `set role` e `set request.jwt.claim.sub`, que o
-- SQL Editor não permite): roda num Postgres local com o schema aplicado, que é onde dá
-- para trocar de usuário à vontade.
--
-- Como rodar:
--   createdb rel0008
--   psql -d rel0008 -f supabase/scripts/stub-supabase.sql    (auth.uid, auth.users, role authenticated)
--   psql -d rel0008 -f supabase/migrations/000*.sql
--   psql -d rel0008 -f <um seed com um perfil de cada papel>
--   psql -d rel0008 -f supabase/scripts/testar-rls-0008.sql
--
-- Espera-se 18 linhas "OK" e nenhuma "FALHOU".
--
-- O que se prova: COMERCIAL pode CRIAR cadastro, e só isso.
--
-- "não deu erro" não prova nada. Duas armadilhas:
--   1. um UPDATE que não casa com linha nenhuma passa calado — por isso cada caso
--      confere TAMBÉM quantas linhas foram afetadas;
--   2. no Postgres, UPDATE/DELETE barrado por RLS NÃO levanta erro: as linhas
--      simplesmente não existem para o USING, e nada é afetado. O bloqueio se chama
--      'sem efeito' aqui. `insufficient_privilege` só aparece quando um WITH CHECK
--      reprova uma linha que estava sendo escrita (INSERT).
-- No fim, o teste confere que a linha alvo continua lá, intacta.
\set QUIET on
\pset format unaligned
\pset tuples_only on

create or replace function testar(rotulo text, sql text, esperado text) returns void language plpgsql as $$
declare deu text; n int;
begin
  begin
    execute sql;
    get diagnostics n = row_count;
    deu := case when n > 0 then 'permitido' else 'sem efeito' end;
  exception
    when insufficient_privilege then deu := 'bloqueado';
    when others then deu := 'erro: ' || sqlerrm;
  end;
  raise notice '%  % (esperado %) → %', case when deu = esperado then 'OK    ' else 'FALHOU' end, rpad(rotulo, 30), esperado, deu;
end $$;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select testar('COMERCIAL insere cliente',     $$insert into clientes (nome, criado_automaticamente) values ('CLIENTE NOVO COM', true)$$, 'permitido');
select testar('COMERCIAL insere equipamento', $$insert into equipamentos (nome, criado_automaticamente) values ('EQUIP NOVO COM', true)$$, 'permitido');
select testar('COMERCIAL renomeia cliente',   $$update clientes set nome = 'RENOMEADO' where nome = 'IGUA SANEAMENTO'$$, 'sem efeito');
select testar('COMERCIAL renomeia equip.',    $$update equipamentos set nome = 'X' where nome = 'EQUIP NOVO COM'$$, 'sem efeito');
select testar('COMERCIAL apaga cliente',      $$delete from clientes where nome = 'IGUA SANEAMENTO'$$, 'sem efeito');
select testar('COMERCIAL apaga equipamento',  $$delete from equipamentos where nome = 'EQUIP NOVO COM'$$, 'sem efeito');
select testar('COMERCIAL lê v_rel_demandas',  $$select count(*) from v_rel_demandas$$, 'permitido');
select testar('COMERCIAL lê v_clientes_uso',  $$select count(*) from v_clientes_uso$$, 'permitido');
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select testar('TECNICO insere cliente',       $$insert into clientes (nome) values ('CLIENTE DO TECNICO')$$, 'bloqueado');
select testar('TECNICO insere equipamento',   $$insert into equipamentos (nome) values ('EQUIP DO TECNICO')$$, 'bloqueado');
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select testar('SEM PERFIL insere cliente',    $$insert into clientes (nome) values ('CLIENTE FANTASMA')$$, 'bloqueado');
select testar('SEM PERFIL insere equip.',     $$insert into equipamentos (nome) values ('EQUIP FANTASMA')$$, 'bloqueado');
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select testar('PCM insere cliente',           $$insert into clientes (nome) values ('CLIENTE DO PCM')$$, 'permitido');
select testar('PCM renomeia cliente',         $$update clientes set nome = 'CLIENTE DO PCM 2' where nome = 'CLIENTE DO PCM'$$, 'permitido');
select testar('PCM apaga cliente',            $$delete from clientes where nome = 'CLIENTE DO PCM 2'$$, 'permitido');
reset role; reset request.jwt.claim.sub;

-- Confere que os inserts do comercial realmente ficaram gravados.
select testar('cadastro do comercial ficou',  $$select 1 from clientes where nome='CLIENTE NOVO COM' and criado_automaticamente$$, 'permitido');
select testar('cliente alvo intacto',         $$select 1 from clientes where nome='IGUA SANEAMENTO'$$, 'permitido');
select testar('equipamento alvo intacto',     $$select 1 from equipamentos where nome='EQUIP NOVO COM'$$, 'permitido');
