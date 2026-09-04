-- =====================================================================
-- CORTE: manda tudo que está em circulação para o histórico
-- =====================================================================
--
-- Use para começar a operar limpo, sem perder nada: as demandas ativas passam a
-- CANCELADO e continuam consultáveis (e restauráveis) em Histórico → Demandas
-- arquivadas. Cadastros — técnicos, veículos, clientes, equipamentos, expedidores,
-- usuários — não são tocados.
--
-- POR QUE CANCELADO E NÃO FINALIZADO
--
-- FINALIZADO quer dizer "foi executada". Marcar assim 130 demandas que ninguém
-- executou mentiria em todo relatório daqui pra frente: a taxa de execução do
-- dashboard, o percentual do arquivo de roteiros, a contagem de concluídas do dia.
-- CANCELADO diz a verdade — saiu de circulação sem ter sido feita — e é o mesmo
-- status que o botão "Cancelar" da tela usa, então nada de novo aparece no sistema.
--
-- COMO RODAR
--
-- Um passo de cada vez, no SQL Editor do Supabase, conferindo o resultado entre eles.
-- Cada script roda numa transação: se uma linha falhar, o bloco inteiro é desfeito.


-- ---------------------------------------------------------------------
-- PASSO 1 — Pré-voo (só leitura). Veja o que vai acontecer antes de acontecer.
-- ---------------------------------------------------------------------
select
  count(*) filter (where status in ('FINALIZADO','CANCELADO'))     as ja_no_historico,
  count(*) filter (where status not in ('FINALIZADO','CANCELADO')) as vao_para_o_historico,
  count(*)                                                          as total
from demandas;

-- Detalhe por status, para reconhecer o que está saindo:
select status, count(*)
  from demandas
 where status not in ('FINALIZADO','CANCELADO')
 group by status
 order by 2 desc;


-- ---------------------------------------------------------------------
-- PASSO 2 — O corte.
-- ---------------------------------------------------------------------
-- `ordem_parada` é zerada porque ela pertencia a um roteiro que deixou de existir.
-- A observação é ACRESCENTADA, nunca sobrescrita: o motivo original da demanda é
-- informação, e o corte não pode apagá-lo.
update demandas
   set status       = 'CANCELADO',
       ordem_parada = null,
       observacao   = case
                        when observacao is null or btrim(observacao) = ''
                          then 'Encerrada no corte de ' || to_char(now(), 'DD/MM/YYYY') || ' (início da operação no app)'
                        else observacao || ' · Encerrada no corte de ' || to_char(now(), 'DD/MM/YYYY')
                      end
 where status not in ('FINALIZADO','CANCELADO');

-- O gatilho de auditoria grava uma linha por demanda alterada: o corte fica
-- registrado em Histórico → Eventos, demanda por demanda. Rodando pelo SQL Editor
-- não há usuário logado, então o autor desses eventos aparece como "—".


-- ---------------------------------------------------------------------
-- PASSO 3 — Opcional: limpar os registros operacionais do período de teste.
-- ---------------------------------------------------------------------
-- Só rode se quiser a operação zerada de verdade. Estes registros não seguram
-- demanda nenhuma; são o diário do que foi fechado e arquivado durante os testes.
--
-- delete from fechamentos;         -- fechamentos de pré-carga e de roteiro
-- delete from roteiros_arquivo;    -- arquivo digital dos roteiros

-- Para apagar também a trilha de auditoria dos testes (perde o rastro do corte):
-- delete from historico;


-- ---------------------------------------------------------------------
-- PASSO 4 — Conferência. O esperado é zero em circulação.
-- ---------------------------------------------------------------------
select
  count(*) filter (where status not in ('FINALIZADO','CANCELADO')) as ainda_em_circulacao,
  count(*) filter (where status = 'CANCELADO')                     as no_historico_canceladas,
  count(*) filter (where status = 'FINALIZADO')                    as no_historico_finalizadas
from demandas;
