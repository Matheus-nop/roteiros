-- =====================================================================
-- Migração 0018: endereço e contato do treinamento
-- (idempotente; rode no SQL Editor depois da 0017)
-- =====================================================================
--
-- O QUE FALTAVA
--
-- O treinamento já sabia QUANDO e O QUÊ. Não sabia ONDE, no sentido que
-- importa para quem dirige até lá, nem PARA QUEM LIGAR ao chegar.
--
-- `local` não resolve isso e não deveria: ele é a LOCALIDADE — "MAGÉ -
-- PIABETÁ", "NOVA IGUAÇU - CENTRO" — e existe para agrupar o quadro do
-- planejamento por região. Endereço de obra dentro dele estouraria as colunas
-- do quadro e faria "RUA X, 200 - PIABETÁ" e "PIABETÁ" virarem duas
-- localidades diferentes na sugestão do campo Local.
--
-- Então o endereço é campo próprio, e o contato também. É o que a capa do
-- técnico imprime, e é o que fazia o técnico ligar para o escritório perguntando
-- em que portão entrar.
--
-- POR QUE NO TREINAMENTO, E NÃO NO CLIENTE
--
-- O mesmo cliente tem várias obras. A AEGEA dá treinamento num canteiro este
-- mês e em outro no mês que vem, com encarregado diferente em cada um. Endereço
-- preso ao cadastro do cliente mandaria o técnico para o canteiro do mês
-- passado — e, pior, em silêncio.
--
-- TELEFONE É TEXTO, E CONTINUA SENDO
--
-- Nada de normalizar para só dígitos: aqui aparece "(21) 99999-0000 / ramal
-- 4", "falar com a portaria antes" e dois números na mesma linha. O campo é
-- lido por uma pessoa com o celular na mão, não por um discador.

alter table treinamentos
  add column if not exists endereco         text,
  add column if not exists contato_nome     text,
  add column if not exists contato_telefone text;

comment on column treinamentos.endereco is
  'Endereço de chegada: rua, número, portão, ponto de referência. Sai na capa do técnico. Não confundir com `local`, que é a localidade usada para agrupar o planejamento.';
comment on column treinamentos.contato_nome is
  'Quem o técnico procura ao chegar.';
comment on column treinamentos.contato_telefone is
  'Telefone do contato, como se escreve. Texto livre de propósito: cabe ramal e recado.';

-- Conferência: as três colunas existem.
select column_name, data_type
from information_schema.columns
where table_name = 'treinamentos'
  and column_name in ('endereco', 'contato_nome', 'contato_telefone')
order by column_name;
