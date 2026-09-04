-- =====================================================================
-- Migração 0006: vocabulário de localidades (para sugestão nos formulários)
-- (idempotente; rode no SQL Editor depois da 0005)
-- =====================================================================
--
-- O campo `local` é texto livre, e precisa continuar sendo: aparece endereço novo
-- toda semana e travar isso num cadastro fechado emperraria o comercial. Mas digitar
-- do zero produz "DUQUE DE CAXIAS - JD. PRIMAVERA", "Duque de Caxias JD PRIMAVERA" e
-- "DUQUE CAXIAS - PRIMAVERA" para o mesmo lugar — e aí o agrupamento por localidade
-- do quadro mostra três colunas onde deveria haver uma.
--
-- A solução é sugerir, não obrigar: o formulário oferece o que a equipe já usou e
-- deixa digitar qualquer coisa nova.
--
-- POR QUE UMA VIEW, E NÃO UMA TABELA DE CADASTRO
--
-- O vocabulário JÁ EXISTE dentro das demandas. Uma tabela seria uma segunda cópia
-- para manter em dia, e no dia em que divergisse a sugestão passaria a mentir. A view
-- é sempre a verdade do momento e não precisa de manutenção.
--
-- Lê TODAS as demandas, inclusive as arquivadas — é o que faz a sugestão sobreviver a
-- um corte que manda tudo para o histórico.

create or replace view v_localidades
with (security_invoker = true) as
select
  local                                                                as nome,
  count(*)::int                                                        as usos,
  max(coalesce(data_planejada, data_abertura, created_at::date))       as ultimo_uso
from demandas
where local is not null and btrim(local) <> ''
group by local;

comment on view v_localidades is
  'Localidades já usadas em demandas, com quantas vezes e quando foi a última. Alimenta a sugestão do campo Local.';

grant select on v_localidades to authenticated;
