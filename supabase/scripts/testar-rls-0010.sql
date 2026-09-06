-- #####################################################################
-- ##  NÃO COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE.               ##
-- ##  Ele é o TESTE, e usa comandos do psql (\set, set role) que o    ##
-- ##  editor não entende — dá "syntax error at or near \".            ##
-- ##  No Supabase roda a MIGRAÇÃO: migrations/0010_papel_sem_acesso.sql##
-- #####################################################################
--
-- =====================================================================
-- Prova da 0010: SEM_ACESSO existe e não alcança nada
-- =====================================================================
--
-- Como rodar (num Postgres local com o schema aplicado, na ordem):
--   psql -d SEUBANCO -f supabase/scripts/testar-rls-0010.sql
--
-- Espera-se 10 linhas "OK" e nenhuma "FALHOU".
--
-- O que se prova, e por que cada caso está aqui:
--
-- Acrescentar o valor ao check NÃO bastava. As políticas deste banco liberam
-- com `papel_atual() is not null`, e as de leitura diziam `using (true)`: um
-- papel novo passava em tudo. O primeiro ensaio mostrou exatamente isso — a
-- pessoa lia as demandas e ainda conseguia alterá-las. Por isso a 0010 mexe em
-- dois lugares: `papel_atual()` devolve NULL para SEM_ACESSO, e as onze
-- políticas de leitura passam a exigir papel.
--
-- Os casos do PCM estão aqui para provar o outro lado: quem tem papel não
-- perdeu nada. Uma regra que fecha demais é tão ruim quanto uma que abre.
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
    when check_violation then deu := 'gatilho';
    when others then deu := 'erro: ' || sqlerrm;
  end;
  raise notice '%  % (esperado %) → %', case when deu = esperado then 'OK    ' else 'FALHOU' end, rpad(rotulo, 38), rpad(esperado, 10), deu;
end $$;

-- ---------------------------------------------------------------------
-- Gente do teste
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa0010-0000-0000-0000-00000000000a', 'galpao0010@teste'),
  ('bbbb0010-0000-0000-0000-00000000000b', 'pcm0010@teste')
on conflict (id) do nothing;

insert into perfis (id, nome, papel) values
  ('aaaa0010-0000-0000-0000-00000000000a', 'Gente do galpão', 'SEM_ACESSO'),
  ('bbbb0010-0000-0000-0000-00000000000b', 'PCM do teste',    'PCM')
on conflict (id) do update set papel = excluded.papel;

insert into demandas (id, om, cliente_nome, local, tipo, status) values
  ('ffff0010-0000-0000-0000-00000000000f', 'RLS0010-A', 'AGUAS DO RIO', 'NOVA IGUACU', 'ENTREGA', 'FILA')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- SEM_ACESSO: a porta está fechada dos dois lados
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaa0010-0000-0000-0000-00000000000a';
select testar('SEM_ACESSO lê demandas',       $$select 1 from demandas where om='RLS0010-A'$$, 'sem efeito');
select testar('SEM_ACESSO lê técnicos',       $$select 1 from tecnicos$$, 'sem efeito');
select testar('SEM_ACESSO lê clientes',       $$select 1 from clientes$$, 'sem efeito');
select testar('SEM_ACESSO lê perfis',         $$select 1 from perfis$$, 'sem efeito');
select testar('SEM_ACESSO lê histórico',      $$select 1 from historico$$, 'sem efeito');
select testar('SEM_ACESSO altera demanda',    $$update demandas set observacao='invadiu' where om='RLS0010-A'$$, 'sem efeito');
select testar('SEM_ACESSO cria demanda',      $$insert into demandas (om, tipo, status) values ('RLS0010-X','ENTREGA','FILA')$$, 'bloqueado');
reset role; reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- PCM: a 0010 não pode ter tirado nada de quem tem papel
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'bbbb0010-0000-0000-0000-00000000000b';
select testar('PCM continua lendo demandas',  $$select 1 from demandas where om='RLS0010-A'$$, 'permitido');
select testar('PCM continua lendo perfis',    $$select 1 from perfis$$, 'permitido');
select testar('PCM continua alterando',       $$update demandas set observacao='ok' where om='RLS0010-A'$$, 'permitido');
reset role; reset request.jwt.claim.sub;

-- Limpeza.
delete from demandas where om like 'RLS0010%';
delete from perfis where id in ('aaaa0010-0000-0000-0000-00000000000a','bbbb0010-0000-0000-0000-00000000000b');
delete from auth.users where email in ('galpao0010@teste','pcm0010@teste');
drop function testar(text, text, text);
