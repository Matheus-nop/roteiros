-- =====================================================================
-- Separa AEGEA de ÁGUAS DO RIO (são clientes diferentes)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =====================================================================
--
-- O QUE ACONTECEU
--
-- O `seed.sql` cadastrava ÁGUAS DO RIO com os apelidos 'AEGEA' e 'AEGEA SANEAMENTO'.
-- Apelido serve para VARIAÇÃO DE ESCRITA do mesmo cliente ('AGUAS DO RIO' sem acento);
-- usá-lo para juntar duas empresas do mesmo grupo faz o sistema tratar as duas como
-- uma. Enquanto isso valeu:
--
--   * quem digitou "AEGEA" no lançamento teve a demanda gravada como ÁGUAS DO RIO —
--     o formulário troca o que foi digitado pelo nome oficial do cadastro;
--   * o relatório soma as duas no mesmo cliente.
--
-- O QUE ESTE SCRIPT FAZ, E O QUE ELE NÃO FAZ
--
-- FAZ: tira os apelidos errados, cria AEGEA como cliente próprio e mostra o que ficou
-- pendurado em ÁGUAS DO RIO.
--
-- NÃO FAZ: separar as demandas antigas sozinho. O texto digitado foi substituído no
-- momento do lançamento e não está guardado em lugar nenhum — nem no histórico, que
-- fotografa a linha já corrigida. Não dá para saber quais eram AEGEA sem alguém olhar.
-- O passo 4 imprime a lista e deixa o comando pronto para você marcar as que forem.
--
-- Rodar isto não muda nenhum número para trás: só para a frente.

-- ---------------------------------------------------------------------
-- 1. Como está agora
-- ---------------------------------------------------------------------
select 'ANTES' as quando, nome, apelidos,
       (select count(*) from demandas d where d.cliente_id = c.id) as demandas
from clientes c
where nome ilike '%AGUAS DO RIO%' or nome ilike '%ÁGUAS DO RIO%' or nome ilike '%AEGEA%'
order by nome;

-- ---------------------------------------------------------------------
-- 2. Tira os apelidos errados de ÁGUAS DO RIO
-- ---------------------------------------------------------------------
-- Sobra só a variação sem acento, que é apelido de verdade: mesma empresa, outra escrita.
update clientes
set apelidos = array(
      select a from unnest(apelidos) a
      where upper(btrim(a)) not in ('AEGEA', 'AEGEA SANEAMENTO')
    )
where upper(btrim(nome)) in ('ÁGUAS DO RIO', 'AGUAS DO RIO')
  and apelidos && array['AEGEA', 'AEGEA SANEAMENTO'];

-- ---------------------------------------------------------------------
-- 3. AEGEA passa a existir por conta própria
-- ---------------------------------------------------------------------
-- Se para vocês AEGEA e AEGEA SANEAMENTO também forem empresas diferentes, apague o
-- apelido daqui e cadastre a segunda à parte na tela de Cadastros.
insert into clientes (nome, apelidos)
values ('AEGEA', array['AEGEA SANEAMENTO'])
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- 4. O que ficou pendurado em ÁGUAS DO RIO — para conferência humana
-- ---------------------------------------------------------------------
-- Olhe OM, local e observação: é o que sobrou para reconhecer as que eram AEGEA.
select d.numero, d.om, d.data_abertura, d.local, d.equipamento_nome, d.status, d.observacao
from demandas d
join clientes c on c.id = d.cliente_id
where upper(btrim(c.nome)) in ('ÁGUAS DO RIO', 'AGUAS DO RIO')
order by d.data_abertura desc nulls last, d.numero desc;

-- Para mover as que você identificar, troque os números e rode:
--
--   update demandas
--   set cliente_id   = (select id from clientes where nome = 'AEGEA'),
--       cliente_nome = 'AEGEA'
--   where numero in (123, 124, 125);
--
-- (Trocar o cliente NÃO mexe em status, roteiro nem data: só na etiqueta de quem é.)

-- ---------------------------------------------------------------------
-- 5. Como ficou
-- ---------------------------------------------------------------------
select 'DEPOIS' as quando, nome, apelidos,
       (select count(*) from demandas d where d.cliente_id = c.id) as demandas
from clientes c
where nome ilike '%AGUAS DO RIO%' or nome ilike '%ÁGUAS DO RIO%' or nome ilike '%AEGEA%'
order by nome;

-- ---------------------------------------------------------------------
-- 6. Vale conferir os outros apelidos do seed
-- ---------------------------------------------------------------------
-- Mesma pergunta para cada linha: é a MESMA empresa escrita de outro jeito, ou é outra
-- empresa do mesmo grupo? Se for outra empresa, faça com ela o que os passos 2 e 3
-- fizeram com AEGEA.
select nome, apelidos
from clientes
where cardinality(apelidos) > 0
order by nome;
