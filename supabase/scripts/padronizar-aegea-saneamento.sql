-- =====================================================================
-- AEGEA SANEAMENTO passa a ser o nome oficial; 'AEGEA' vira apelido
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- =====================================================================
--
-- São o mesmo cliente — o que estava errado era qual dos dois nomes manda. O cadastro
-- tinha 'AEGEA' como oficial e 'AEGEA SANEAMENTO' como apelido, então quem digitava o
-- nome completo via o sistema gravar a forma curta e concluía que não tinha salvo.
--
-- POR QUE NÃO BASTA RENOMEAR O CADASTRO
--
-- `demandas.cliente_nome` guarda o nome junto de cada demanda, de propósito: é o que as
-- telas mostram e o que sobrevive à exclusão do cadastro. Renomear só a linha de
-- `clientes` deixaria o quadro mostrando 'AEGEA' para sempre. Por isso o passo 3.
--
-- (Da versão nova do app em diante isso não precisa mais ser feito à mão: renomear pela
-- tela de Cadastros já leva o nome novo às demandas. Este script é para o que já está
-- gravado.)

-- ---------------------------------------------------------------------
-- 1. Como está agora
-- ---------------------------------------------------------------------
select 'ANTES' as quando, c.nome, c.apelidos,
       (select count(*) from demandas d where d.cliente_id = c.id) as demandas
from clientes c
where upper(btrim(c.nome)) in ('AEGEA', 'AEGEA SANEAMENTO')
order by c.nome;

-- ---------------------------------------------------------------------
-- 2. Uma linha só, chamada AEGEA SANEAMENTO
-- ---------------------------------------------------------------------
do $$
declare
  v_curto  uuid;   -- a linha chamada 'AEGEA'
  v_longo  uuid;   -- a linha chamada 'AEGEA SANEAMENTO', se já existir
  v_apelidos text[];
begin
  select id into v_curto from clientes where upper(btrim(nome)) = 'AEGEA';
  select id into v_longo from clientes where upper(btrim(nome)) = 'AEGEA SANEAMENTO';

  if v_curto is not null and v_longo is not null then
    -- As duas existem: as demandas da curta passam para a longa, e a curta some.
    -- (O índice único em `nome` impede simplesmente renomear uma sobre a outra.)
    update demandas set cliente_id = v_longo where cliente_id = v_curto;
    select array(select distinct x from unnest(
             coalesce((select apelidos from clientes where id = v_longo), '{}') ||
             coalesce((select apelidos from clientes where id = v_curto), '{}') ||
             array['AEGEA']) x
           where upper(btrim(x)) <> 'AEGEA SANEAMENTO')
      into v_apelidos;
    update clientes set apelidos = v_apelidos where id = v_longo;
    delete from clientes where id = v_curto;
    raise notice 'As duas linhas existiam: demandas movidas para AEGEA SANEAMENTO e a linha AEGEA removida.';

  elsif v_curto is not null then
    -- Só a curta existe: renomeia e guarda 'AEGEA' como apelido.
    select array(select distinct x from unnest(coalesce(apelidos, '{}') || array['AEGEA']) x
                 where upper(btrim(x)) <> 'AEGEA SANEAMENTO')
      into v_apelidos from clientes where id = v_curto;
    update clientes set nome = 'AEGEA SANEAMENTO', apelidos = v_apelidos where id = v_curto;
    raise notice 'AEGEA renomeada para AEGEA SANEAMENTO.';

  elsif v_longo is not null then
    -- Já está certo: só garante que a forma curta esteja entre os apelidos.
    select array(select distinct x from unnest(coalesce(apelidos, '{}') || array['AEGEA']) x)
      into v_apelidos from clientes where id = v_longo;
    update clientes set apelidos = v_apelidos where id = v_longo;
    raise notice 'Já estava como AEGEA SANEAMENTO; apelido AEGEA garantido.';

  else
    raise notice 'Nenhum cliente AEGEA encontrado — nada a fazer.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. O nome gravado em cada demanda
-- ---------------------------------------------------------------------
-- Pelo cadastro (as que têm FK): estas são certeza.
update demandas d
set cliente_nome = 'AEGEA SANEAMENTO'
from clientes c
where d.cliente_id = c.id
  and upper(btrim(c.nome)) = 'AEGEA SANEAMENTO'
  and coalesce(d.cliente_nome, '') <> 'AEGEA SANEAMENTO';

-- Sem FK, texto solto exatamente 'AEGEA': padroniza e amarra no cadastro.
-- Só a forma exata — 'AEGEA' dentro de outro nome pode ser outra empresa do grupo.
update demandas d
set cliente_nome = 'AEGEA SANEAMENTO',
    cliente_id   = (select id from clientes where upper(btrim(nome)) = 'AEGEA SANEAMENTO')
where d.cliente_id is null
  and upper(btrim(coalesce(d.cliente_nome, ''))) = 'AEGEA';

-- ---------------------------------------------------------------------
-- 4. Como ficou
-- ---------------------------------------------------------------------
select 'DEPOIS' as quando, c.nome, c.apelidos,
       (select count(*) from demandas d where d.cliente_id = c.id) as demandas
from clientes c
where upper(btrim(c.nome)) in ('AEGEA', 'AEGEA SANEAMENTO')
order by c.nome;

-- Sobrou algum nome solto parecido? Confira à mão: pode ser outra empresa do grupo.
select coalesce(cliente_nome, '(sem nome)') as nome_solto, count(*) as demandas
from demandas
where cliente_id is null and upper(coalesce(cliente_nome, '')) like '%AEGEA%'
group by 1 order by 2 desc;
