-- #####################################################################
-- ##  NÃO COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE.               ##
-- ##  Ele é o TESTE, e usa comandos do psql (\set, set role) que o   ##
-- ##  editor não entende — dá "syntax error at or near \".           ##
-- ##  No Supabase roda a MIGRAÇÃO: migrations/0016_treinamentos.sql  ##
-- #####################################################################
--
-- =====================================================================
-- Prova da 0016: quem agenda treinamento, quem lê, e o que o banco recusa
-- =====================================================================
--
-- Como rodar (num Postgres local com o schema aplicado, na ordem):
--   psql -d SEUBANCO -f supabase/scripts/testar-rls-0016.sql
--
-- Espera-se 20 linhas "OK" e nenhuma "FALHOU".
--
-- O QUE SE PROVA, E POR QUE CADA CASO ESTÁ AQUI
--
-- 1. SEM_ACESSO não alcança nada. A tabela `participantes` guarda CPF de
--    gente do cliente; ela é o registro mais sensível do app. Uma política de
--    leitura escrita como `using (true)` — que é o que as onze políticas
--    antigas diziam antes da 0010 — abriria esse CPF para quem ganhou perfil
--    aqui sem nunca ter aberto o app.
--
-- 2. TECNICO lê e não escreve. Ele precisa ver o compromisso, e a lista de
--    presença é digitada no escritório a partir da folha assinada. Se a RLS
--    deixasse o técnico gravar presença, existiriam duas listas para o mesmo
--    treinamento e a assinada não seria necessariamente a que virou certificado.
--
-- 3. EXPEDICAO também não escreve: treinamento não passa pelo galpão.
--
-- 4. COMERCIAL escreve. É o caso que prova o outro lado — uma regra que fecha
--    demais é tão ruim quanto uma que abre. Quem combina a data com o cliente é
--    quem vende, e se o comercial não pudesse agendar, o módulo nasceria morto.
--
-- 5. O banco recusa o que o certificado não pode ter: hora de fim antes da de
--    início (carga horária negativa) e o mesmo CPF cadastrado duas vezes.
--
-- 6. A carga horária é conta do banco, não digitação. 09:00–11:30 tem que dar
--    2.5 sem ninguém ter escrito isso em lugar nenhum.
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
    when unique_violation then deu := 'repetido';
    when generated_always then deu := 'gerada';
    when others then deu := 'erro: ' || sqlerrm;
  end;
  raise notice '%  % (esperado %) → %', case when deu = esperado then 'OK    ' else 'FALHOU' end, rpad(rotulo, 40), rpad(esperado, 10), deu;
end $$;

-- ---------------------------------------------------------------------
-- Gente do teste
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa0016-0000-0000-0000-00000000000a', 'galpao0016@teste'),
  ('bbbb0016-0000-0000-0000-00000000000b', 'pcm0016@teste'),
  ('cccc0016-0000-0000-0000-00000000000c', 'tecnico0016@teste'),
  ('dddd0016-0000-0000-0000-00000000000d', 'comercial0016@teste'),
  ('eeee0016-0000-0000-0000-00000000000e', 'expedicao0016@teste')
on conflict (id) do nothing;

insert into perfis (id, nome, papel) values
  ('aaaa0016-0000-0000-0000-00000000000a', 'Gente do galpão', 'SEM_ACESSO'),
  ('bbbb0016-0000-0000-0000-00000000000b', 'PCM do teste',    'PCM'),
  ('cccc0016-0000-0000-0000-00000000000c', 'Técnico do teste','TECNICO'),
  ('dddd0016-0000-0000-0000-00000000000d', 'Comercial',       'COMERCIAL'),
  ('eeee0016-0000-0000-0000-00000000000e', 'Expedição',       'EXPEDICAO')
on conflict (id) do update set papel = excluded.papel;

insert into treinamentos (id, tema, data, hora_inicio, hora_fim, cliente_nome, local)
values ('ffff0016-0000-0000-0000-00000000000f', 'RLS0016 OPERACAO SEGURA', current_date + 3,
        '09:00', '11:30', 'CONSTRUTORA DO TESTE', 'NOVA IGUACU - CENTRO')
on conflict (id) do nothing;

insert into participantes (id, nome, documento)
values ('ffff0016-0000-0000-0000-0000000000aa', 'JOSE DO TESTE 0016', '00000001601')
on conflict (id) do nothing;

insert into presencas (treinamento_id, participante_id)
values ('ffff0016-0000-0000-0000-00000000000f', 'ffff0016-0000-0000-0000-0000000000aa')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 1. SEM_ACESSO: a porta está fechada dos dois lados
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaa0016-0000-0000-0000-00000000000a';
select testar('SEM_ACESSO lê treinamentos',   $$select 1 from treinamentos where tema like 'RLS0016%'$$, 'sem efeito');
select testar('SEM_ACESSO lê participantes',  $$select 1 from participantes where nome like '%0016'$$, 'sem efeito');
select testar('SEM_ACESSO lê presenças',      $$select 1 from presencas$$, 'sem efeito');
select testar('SEM_ACESSO agenda treinamento',$$insert into treinamentos (tema, data) values ('RLS0016 INVASAO', current_date)$$, 'bloqueado');
reset role; reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- 2. TECNICO: vê o compromisso, não mexe na lista
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'cccc0016-0000-0000-0000-00000000000c';
select testar('TECNICO lê treinamentos',      $$select 1 from treinamentos where tema like 'RLS0016%'$$, 'permitido');
select testar('TECNICO agenda treinamento',   $$insert into treinamentos (tema, data) values ('RLS0016 TEC', current_date)$$, 'bloqueado');
select testar('TECNICO cadastra participante',$$insert into participantes (nome) values ('INVENTADO 0016')$$, 'bloqueado');
select testar('TECNICO marca presença',       $$update presencas set presente = false where treinamento_id = 'ffff0016-0000-0000-0000-00000000000f'$$, 'sem efeito');
select testar('TECNICO remove treinamento',   $$delete from treinamentos where tema like 'RLS0016%'$$, 'sem efeito');
reset role; reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- 3. EXPEDICAO: treinamento não passa pelo galpão
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'eeee0016-0000-0000-0000-00000000000e';
select testar('EXPEDICAO lê treinamentos',    $$select 1 from treinamentos where tema like 'RLS0016%'$$, 'permitido');
select testar('EXPEDICAO agenda treinamento', $$insert into treinamentos (tema, data) values ('RLS0016 EXP', current_date)$$, 'bloqueado');
reset role; reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- 4. COMERCIAL e PCM: quem trabalha aqui não perdeu nada
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'dddd0016-0000-0000-0000-00000000000d';
select testar('COMERCIAL agenda treinamento', $$insert into treinamentos (tema, data) values ('RLS0016 COMERCIAL', current_date + 5)$$, 'permitido');
select testar('COMERCIAL cadastra pessoa',    $$insert into participantes (nome, documento) values ('MARIA DO TESTE 0016', '00000001602')$$, 'permitido');
select testar('COMERCIAL marca presença',     $$update presencas set presente = false where treinamento_id = 'ffff0016-0000-0000-0000-00000000000f'$$, 'permitido');
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = 'bbbb0016-0000-0000-0000-00000000000b';
select testar('PCM remarca treinamento',      $$update treinamentos set data = current_date + 9 where tema = 'RLS0016 OPERACAO SEGURA'$$, 'permitido');
reset role; reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- 5. O que o banco recusa, independentemente de quem seja
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'bbbb0016-0000-0000-0000-00000000000b';
select testar('Hora de fim antes da de início',
  $$insert into treinamentos (tema, data, hora_inicio, hora_fim) values ('RLS0016 AO CONTRARIO', current_date, '14:00', '11:00')$$, 'gatilho');
select testar('Mesmo CPF cadastrado duas vezes',
  $$insert into participantes (nome, documento) values ('OUTRO NOME 0016', '00000001601')$$, 'repetido');
select testar('Mesma pessoa duas vezes no treinamento',
  $$insert into presencas (treinamento_id, participante_id) values ('ffff0016-0000-0000-0000-00000000000f','ffff0016-0000-0000-0000-0000000000aa')$$, 'repetido');
reset role; reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- 6. Carga horária é conta do banco: 09:00–11:30 = 2.5, sem ninguém digitar
-- ---------------------------------------------------------------------
do $$
declare v numeric;
begin
  select carga_horaria into v from treinamentos where tema = 'RLS0016 OPERACAO SEGURA';
  raise notice '%  % (esperado %) → %',
    case when v = 2.5 then 'OK    ' else 'FALHOU' end,
    rpad('Carga horária calculada', 40), rpad('2.5', 10), coalesce(v::text, 'nulo');
end $$;

-- Coluna gerada não aceita escrita: é isso que impede o certificado de sair com
-- uma carga horária que não bate com o horário impresso ao lado dela.
select testar('Gravar carga horária à mão',
  $$update treinamentos set carga_horaria = 40 where tema = 'RLS0016 OPERACAO SEGURA'$$, 'gerada');

-- Limpeza.
delete from presencas where treinamento_id in (select id from treinamentos where tema like 'RLS0016%');
delete from treinamentos where tema like 'RLS0016%';
delete from participantes where nome like '%0016';
delete from perfis where id::text like '%0016-0000-0000-0000-%';
delete from auth.users where email like '%0016@teste';
drop function testar(text, text, text);
