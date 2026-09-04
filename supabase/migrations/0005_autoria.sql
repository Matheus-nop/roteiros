-- =====================================================================
-- Migração 0005: quem lançou a demanda
-- (idempotente; rode no SQL Editor depois da 0004)
-- =====================================================================
--
-- O PROBLEMA
--
-- A coluna `demandas.created_by` existe desde a 0001, mas **nunca foi preenchida**: não
-- tem default, o app não manda o valor e nenhum gatilho grava. Ou seja, toda demanda em
-- produção tem esse campo nulo, e não havia como responder "quem lançou isso?".
--
-- (A auditoria em `historico` sempre gravou o autor de cada MUDANÇA, via `auth.uid()` no
-- gatilho. O que faltava era o autor da CRIAÇÃO ficar na própria demanda, para aparecer
-- sem precisar cruzar tabela.)
--
-- A CORREÇÃO
--
-- Default no banco, e não no app: assim vale para qualquer caminho de inserção — a tela
-- de nova demanda, a importação de planilha, a importação de contrato e qualquer consulta
-- feita à mão no SQL Editor. Um app que esqueça de mandar o campo não cria buraco.

alter table demandas alter column created_by set default auth.uid();

-- Quem já está gravado continua como está. O passado não tem como ser recuperado: o dado
-- nunca existiu. Da migração em diante, toda demanda nova nasce com autor.
comment on column demandas.created_by is
  'Quem lançou a demanda. Preenchido por default com auth.uid() a partir da migração 0005; nulo nas demandas anteriores a ela.';

-- Índice para a consulta "o que fulano lançou", usada no filtro por autor.
create index if not exists idx_demandas_created_by on demandas (created_by);
