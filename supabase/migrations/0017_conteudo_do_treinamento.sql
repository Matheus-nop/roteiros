-- =====================================================================
-- Migração 0017: o conteúdo programático do treinamento
-- (idempotente; rode no SQL Editor depois da 0016)
-- =====================================================================
--
-- POR QUE ISTO EXISTE
--
-- O certificado que a empresa já emitia à mão traz, abaixo do tema, os
-- tópicos cobertos na aula:
--
--   • INSTRUÇÃO DE OPERAÇÃO ANTES/DURANTE E APÓS O USO;
--   • MEDIDAS PREVENTIVAS;
--   • MEDIDAS DE SEGURANÇA E EPI'S;
--   • ARMAZENAGEM CORRETA;
--   • TRANSPORTE ADEQUADO.
--
-- Eles não são enfeite: é o que o RH do cliente lê para saber se a pessoa
-- foi treinada naquilo que ela opera. E MUDAM com o tema — martelo rompedor
-- não tem os mesmos tópicos que gerador de energia.
--
-- Até aqui eles viviam chapados na arte do Canva, o que obrigava a manter um
-- arquivo por tema e a lembrar de trocar de arquivo na hora de emitir. Agora
-- são campo do treinamento, e a arte é uma só.
--
-- POR QUE `text[]`, E NÃO UM TEXTO COM QUEBRAS DE LINHA
--
-- Cada tópico é uma linha com marcador no papel. Guardar tudo num texto só
-- obrigaria o certificado a adivinhar onde cortar — e "EPI'S;" tem ponto e
-- vírgula no meio, "ANTES/DURANTE" tem barra. Array é o que o dado é.
-- Mesma escolha de `clientes.apelidos`, pelo mesmo motivo.
--
-- POR QUE NÃO É UMA TABELA DE "MODELOS DE CONTEÚDO"
--
-- Seria uma segunda cópia para manter em dia, e no dia em que divergisse o
-- certificado passaria a mentir. O vocabulário já existe dentro dos
-- treinamentos: a tela oferece o conteúdo do último treinamento com o MESMO
-- tema, e quem agenda aceita ou corrige. Mesma ideia da `v_localidades`
-- (0006) e da `v_temas_treinamento` (0016) — sugerir, não obrigar.

alter table treinamentos
  add column if not exists conteudo text[] not null default '{}';

comment on column treinamentos.conteudo is
  'Tópicos cobertos na aula, um por item. Saem em lista no certificado, abaixo do tema.';

-- Conferência: a coluna existe e é array de texto.
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'treinamentos' and column_name = 'conteudo';
