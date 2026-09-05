-- =====================================================================
-- Prova das regras criadas pela migração 0009 (expedição)
-- =====================================================================
--
-- A regra do projeto é que política nova exige teste que prove o bloqueio. Este é o
-- teste. Ele NÃO roda no Supabase (usa `set role` e `set request.jwt.claim.sub`, que o
-- SQL Editor não permite): roda num Postgres local com o schema aplicado.
--
-- Como rodar:
--   createdb rls0009
--   psql -d rls0009 -f supabase/scripts/stub-supabase.sql
--   psql -d rls0009 -f supabase/migrations/0001_schema.sql   (e as demais, em ordem)
--   psql -d rls0009 -f supabase/scripts/testar-rls-0009.sql
--
-- Este script cria a própria gente e a própria carga — não depende do seed.
-- Espera-se 24 linhas "OK" e nenhuma "FALHOU".
--
-- O que se prova: a EXPEDIÇÃO mexe na carga do galpão e em mais nada.
--
-- Três desfechos diferentes, e a diferença importa:
--   • 'sem efeito' — o `using` não alcançou a linha. UPDATE barrado por RLS não levanta
--     erro no Postgres: a linha simplesmente não existe para aquele usuário.
--   • 'bloqueado'  — o `with check` reprovou como a linha ia ficar (mudar de status para
--     fora da faixa do galpão, por exemplo).
--   • 'gatilho'    — a linha estava ao alcance e o status era válido, mas a alteração
--     mexia no plano (técnico, data, equipamento…). Política de linha não compara valor
--     velho com novo; quem barra isso é o gatilho da 0009.
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
-- Gente e carga do teste (como dono da tabela, sem RLS no caminho)
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'pcm@teste'),
  ('44444444-4444-4444-4444-444444444444', 'tecnico@teste'),
  ('55555555-5555-5555-5555-555555555555', 'expedicao@teste')
on conflict (id) do nothing;

insert into tecnicos (id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'TECNICO DO TESTE'),
  ('99999999-9999-9999-9999-999999999999', 'OUTRO TECNICO')
on conflict (id) do nothing;

insert into perfis (id, nome, papel, tecnico_id) values
  ('22222222-2222-2222-2222-222222222222', 'PCM',       'PCM',       null),
  ('44444444-4444-4444-4444-444444444444', 'Técnico',   'TECNICO',   '11111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', 'Expedição', 'EXPEDICAO', null)
on conflict (id) do update set papel = excluded.papel, tecnico_id = excluded.tecnico_id;

-- Uma demanda em cada ponto do fluxo.
create or replace function repor_carga() returns void language sql as $$
  delete from demandas where om like 'RLS0009%';
  insert into demandas (id, om, cliente_nome, local, tipo, equipamento_nome, patrimonio, quantidade,
                        tecnico_id, data_planejada, status, status_separacao, ordem_parada) values
    ('aaaaaaaa-0000-0000-0000-00000000000a', 'RLS0009-A', 'AGUAS DO RIO', 'NOVA IGUACU', 'ENTREGA', 'BETONEIRA', 'P-1', 1,
     '11111111-1111-1111-1111-111111111111', current_date, 'ROTEIRIZADO', 'NAO_SEPARADO', 10),
    ('bbbbbbbb-0000-0000-0000-00000000000b', 'RLS0009-B', 'R2X', 'BELFORD ROXO', 'ENTREGA', 'ANDAIME', 'P-2', 1,
     '11111111-1111-1111-1111-111111111111', current_date, 'AGUARDANDO_SAIDA', 'SEPARADO', 20),
    ('cccccccc-0000-0000-0000-00000000000c', 'RLS0009-C', 'JC MORAES', 'QUEIMADOS', 'ENTREGA', 'MARTELETE', 'P-3', 1,
     null, current_date + 1, 'AGUARDANDO_ROTEIRIZACAO', 'NAO_SEPARADO', null),
    ('dddddddd-0000-0000-0000-00000000000d', 'RLS0009-D', 'AEGEA', 'MAGE', 'ENTREGA', 'GERADOR', 'P-4', 1,
     '99999999-9999-9999-9999-999999999999', current_date, 'EM_DESLOCAMENTO', 'SEPARADO', 10);
$$;
select repor_carga();

-- ---------------------------------------------------------------------
-- EXPEDIÇÃO: o que ela faz todo dia
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select testar('separar item da carga',        $$update demandas set status_separacao='SEPARADO', data_separacao=current_date where om='RLS0009-A'$$, 'permitido');
select testar('registrar quem separou',       $$update demandas set separado_por='Silvio' where om='RLS0009-A'$$, 'permitido');
select testar('fechar pré-carga',             $$update demandas set status='AGUARDANDO_SAIDA' where om='RLS0009-A'$$, 'permitido');
select testar('estornar fechamento',          $$update demandas set status='ROTEIRIZADO' where om='RLS0009-B'$$, 'permitido');
select testar('anotar observação na carga',   $$update demandas set observacao='faltou pino' where om='RLS0009-A'$$, 'permitido');
reset role; reset request.jwt.claim.sub;
select repor_carga();

-- ---------------------------------------------------------------------
-- EXPEDIÇÃO: o que ela não decide — desfecho é do técnico ou do PCM
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select testar('finalizar demanda',            $$update demandas set status='FINALIZADO', finalizado_em=now() where om='RLS0009-A'$$, 'bloqueado');
select testar('cancelar demanda',             $$update demandas set status='CANCELADO' where om='RLS0009-D'$$, 'bloqueado');
select testar('devolver para a fila',         $$update demandas set status='FILA' where om='RLS0009-B'$$, 'bloqueado');
select testar('reagendar (sai da rota)',      $$update demandas set status='AGUARDANDO_ROTEIRIZACAO' where om='RLS0009-A'$$, 'bloqueado');
select testar('mexer no que está no plano',   $$update demandas set observacao='x' where om='RLS0009-C'$$, 'sem efeito');
select testar('apagar demanda',               $$delete from demandas where om='RLS0009-B'$$, 'sem efeito');
select testar('criar demanda',                $$insert into demandas (om, tipo, status) values ('RLS0009-X','ENTREGA','FILA')$$, 'bloqueado');
reset role; reset request.jwt.claim.sub;
select repor_carga();

-- ---------------------------------------------------------------------
-- EXPEDIÇÃO: dentro da faixa, mexe na carga — não no plano
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select testar('trocar o técnico da carga',    $$update demandas set tecnico_id='99999999-9999-9999-9999-999999999999' where om='RLS0009-A'$$, 'gatilho');
select testar('trocar a data planejada',      $$update demandas set data_planejada=current_date+7 where om='RLS0009-A'$$, 'gatilho');
select testar('trocar o equipamento',         $$update demandas set equipamento_nome='OUTRO' where om='RLS0009-A'$$, 'gatilho');
select testar('trocar o patrimônio',          $$update demandas set patrimonio='P-99' where om='RLS0009-A'$$, 'gatilho');
select testar('trocar a ordem da parada',     $$update demandas set ordem_parada=999 where om='RLS0009-A'$$, 'gatilho');
select testar('trocar o cliente',             $$update demandas set cliente_nome='OUTRO CLIENTE' where om='RLS0009-A'$$, 'gatilho');
reset role; reset request.jwt.claim.sub;
select repor_carga();

-- ---------------------------------------------------------------------
-- TÉCNICO e PCM: a 0009 não pode ter mexido neles
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select testar('TECNICO conclui a dele',       $$update demandas set status='FINALIZADO', finalizado_em=now() where om='RLS0009-A'$$, 'permitido');
select testar('TECNICO conclui a de outro',   $$update demandas set status='FINALIZADO' where om='RLS0009-D'$$, 'sem efeito');
reset role; reset request.jwt.claim.sub;
select repor_carga();

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select testar('PCM finaliza qualquer uma',    $$update demandas set status='FINALIZADO', finalizado_em=now() where om='RLS0009-D'$$, 'permitido');
select testar('PCM troca técnico e data',     $$update demandas set tecnico_id='99999999-9999-9999-9999-999999999999', data_planejada=current_date+2 where om='RLS0009-A'$$, 'permitido');
select testar('PCM cancela demanda',          $$update demandas set status='CANCELADO' where om='RLS0009-B'$$, 'permitido');
reset role; reset request.jwt.claim.sub;

-- Depois de tudo, a carga que a expedição tentou desmontar continua de pé.
select repor_carga();
select testar('carga do teste intacta',       $$select 1 from demandas where om='RLS0009-A' and status='ROTEIRIZADO' and tecnico_id='11111111-1111-1111-1111-111111111111' and equipamento_nome='BETONEIRA'$$, 'permitido');

-- Limpeza: o teste não deixa carga fantasma no banco.
delete from demandas where om like 'RLS0009%';
drop function repor_carga();
