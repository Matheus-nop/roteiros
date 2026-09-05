-- =====================================================================
-- Conferência: o que da migração JÁ EXISTE no sistema
-- Rode no SQL Editor do Supabase. NÃO grava nada — só lê e responde.
-- =====================================================================
--
-- As demandas do dia 04 foram lançadas à mão antes da migração. A regra de duplicidade
-- do app só barra igualdade EXATA de OM + equipamento + patrimônio + cliente, e só olha
-- demandas ATIVAS. Quatro furos, todos presentes nestes dados:
--
--   1. OS com zero à esquerda   — a planilha manda '035635', você digitou '35635';
--   2. patrimônio com sufixo    — '250225-407 SN: 20244406271' contra '250225-407';
--   3. cliente por razão social — 'CONSTRUTORA LYTORANEA LTDA - EM RECUPERACAO
--                                 JUDICIAL' contra o nome curto do cadastro;
--   4. demanda já concluída     — a checagem ignora finalizadas e canceladas, que é
--                                 exatamente o caso do roteiro de ontem.
--
-- DUAS COLUNAS, DUAS PERGUNTAS DIFERENTES
--
--   veredito    JA EXISTE                       = mesma ordem de serviço, OU a demanda
--                                                 que já existe ainda está aberta.
--                                                 Não importe essa linha.
--               SERVICO ANTERIOR (pode importar) = a mesma peça já passou por aqui, mas
--                                                 em OS diferente e já encerrada. É
--                                                 atendimento novo — pode entrar.
--               NOVA                            = não achei nada parecido.
--
--   app_barra   NAO, VAI DUPLICAR = o app não vê essa como duplicata (a grafia difere,
--                                   ou a demanda já foi concluída). É o caso perigoso.
--               sim              = a regra do app pega sozinha, pode colar sem medo.
--
-- Ou seja: toda linha com veredito JA EXISTE e app_barra "NAO, VAI DUPLICAR" é uma
-- duplicata que VAI entrar se você importar o arquivo inteiro.
--
-- Comparação forte por PATRIMÔNIO (identificador da peça). Sem patrimônio, cai para OM
-- sem zeros à esquerda + equipamento. Sem depender da extensão `unaccent`.
--
-- As 118 linhas abaixo são o conteúdo de planejamento-aberto.tsv.

with migracao (os, cliente, equipamento, patrimonio, data_exec, status_plan) as (values
  ('35112', 'F.A.B ZONA LESTE', 'GERADOR DE ENERGIA 3,5KVA', '240215-437', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035635', 'AGUAS DO RIO 4 SPE S.A', 'PLACA VIBRATÓRIA 100KG', '22031-076', '2026-09-08', 'PENDENTE'),
  ('035639', 'CONSTRUTORA LYTORANEA LTDA - EM RECUPERACAO JUDICIAL', 'CORTADORA MANUAL', '250225-407 SN: 20244406271', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035640', 'RIO + SANEAMENTO BL3 S.A', 'BOMBA DE MANGOTE 3"', '24115-815', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1415-01', 'NORSIL QUIMICA', 'MARTELO ROMPEDOR 30KG', '250114-681', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35598', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '250115-473', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35605', 'ELCOP', 'MARTELO ROMPEDOR 30KG', '201214-251', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35604', 'ELCOP', 'COMPACTADOR DE SOLO', '24068-184', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1307-01', 'BRAÇOS CONSTRUÇÕES', 'GERADOR DE ENERGIA 9,0KVA', '24103-214', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035625', 'AGUAS DO RIO 4', 'MOTOVIBRADOR GASOLINA', '24014-086', '2026-09-08', 'PENDENTE'),
  ('035629', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-329', '2026-09-08', 'PENDENTE'),
  ('035632', 'AGUAS DO RIO 4', 'MOTOVIBRADOR GASOLINA', '24014-096', '2026-09-08', 'PENDENTE'),
  ('035633', 'AGUAS DO RIO 4', 'CORTADORA DE PISO', '18122-044', '2026-09-08', 'PENDENTE'),
  ('1753-09/24', 'VDINIZ CONSTRUTORA', 'BOMBA DE MANGOTE', '25045-899', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'BOMBA DE MANGOTE', '26025-029', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '230415-139', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250215-667', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '240115-287', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250915-689', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250115-506', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '260315-347', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250115-657', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '260315-742', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MANGUEIRA FLEXÍVEL 3', '', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '140214-185', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '260514-976', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '180814-159', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '191014-091', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '241114-135', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MOTOVIBRADOR GASOLINA', '18114-469', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'PUNHO PARA MARTELO 03 A 20KG', '', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'PONTEIRO 20 E 30KG', '', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'TALHADEIRA 20 E 30KG', '', '2026-09-04', 'PENDENTE'),
  ('1099-06/25', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '240914-614', '2026-09-04', 'PENDENTE'),
  ('1099-06/25', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '241114-642', '2026-09-04', 'PENDENTE'),
  ('1643-10/25', 'VDINIZ CONSTRUTORA', 'MOTOVIBRADOR GASOLINA', '19044-570', '2026-09-04', 'PENDENTE'),
  ('1387-05/26', 'VDINIZ CONSTRUTORA', 'BOMBA DE MANGOTE', '25045-902', '2026-09-04', 'PENDENTE'),
  ('35665', 'BRAÇOS CONSTRUÇÕES', 'CORTADORA DE PISO', '24012-125', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35666', 'RIO + SANEAMENTO', 'BOMBA DE MANGOTE', '24015-290', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35665', 'BRAÇOS CONSTRUÇÕES', 'CORTADORA DE PISO', '24012-125', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35666', 'RIO + SANEAMENTO', 'BOMBA DE MANGOTE', '24015-290', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'ESMERILHADEIRA 7', '220510-274', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '240115-274', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELETE PERFURADOR 03KG', '24097-009', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELETE PERFURADOR 03KG', '25027-043', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 05KG', '210814-148', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 10KG', '240914-039', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 10KG', '260214-953', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'SERRA MÁRMORE', '091018-007', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '13103512-123', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '23113812-126', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '24113812-150', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '25063812-172', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('', 'F.A.B ZONA LESTE', 'GERADOR DE ENERGIA 3,5KVA', '230915-023', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35551', 'RIO +', 'MOTOVIBRADOR GASOLINA', '13084-131', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035491', 'AGUAS DO RIO 4 SPE S.A', 'DESENTUPIDORA VARETA K-1000 (CLIENTE)', 'SN', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('34952', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '240115-272', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1190/25', 'AEGEA SANEMAENTO', 'BOMBA DE MANGOTE', '26085-940', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35703', 'AEGEA', 'COMPACTADOR DE SOLO', '24018-153', '2026-09-08', 'PLANEJADO'),
  ('35701', 'AEGEA', 'CORTADORA DE PISO', '23112-120', '2026-09-08', 'PLANEJADO'),
  ('35702', 'AEGEA', 'COMPACTADOR DE SOLO', '24048-182', '2026-09-08', 'PLANEJADO'),
  ('1038-16/26', 'CONSTRUTORA LYTORANEA', 'BOMBA DE MANGOTE', '25035-874', '2026-09-08', 'PLANEJADO'),
  ('1038-16/26', 'CONSTRUTORA LYTORANEA', 'MOTOVIBRADOR GASOLINA', '24084-826', '2026-09-08', 'PLANEJADO'),
  ('2262-07/25', 'CONSTRUTORA LYTORANEA', 'MOTOVIBRADOR GASOLINA', '24034-742', '2026-09-08', 'PLANEJADO'),
  ('2262-07/25', 'CONSTRUTORA LYTORANEA', 'MANGUEIRA FLEXÍVEL 3', '', '2026-09-08', 'PLANEJADO'),
  ('1544-07', 'RIO +', 'BOMBA DE MANGOTE', '26035-003', '2026-09-08', 'PLANEJADO'),
  ('35077', 'RIO +', 'MARTELO ROMPEDOR 30KG', '240114-549', '2026-09-08', 'PLANEJADO'),
  ('35705', 'RIO +', 'PLACA VIBRATÓRIA', '24081-069', '2026-09-08', 'PLANEJADO'),
  ('35704', 'RIO +', 'CORTADORA MANUAL', '240925-189', '2026-09-08', 'PLANEJADO'),
  ('35080', 'RIO +', 'MOTOVIBRADOR GASOLINA', '23124-475', '2026-09-08', 'PLANEJADO'),
  ('1433-01', 'SOUZA PINA', 'ELEMENTO TUBULAR DE ENCAIXE 1,00 X 1,00M', '', '2026-09-08', 'PLANEJADO'),
  ('1433-01', 'SOUZA PINA', 'DIAGONAL PARA ANDAIME 1,00 X 1,00M', '', '2026-09-08', 'PLANEJADO'),
  ('1433-01', 'SOUZA PINA', 'PISO METÁLICO 0,33 X 1,00M', '', '2026-09-08', 'PLANEJADO'),
  ('35685', 'MPE ENGENHARIA', 'COMPACTADOR DE SOLO', '24088-193', '2026-09-08', 'PLANEJADO'),
  ('1038-17/26', 'CONSTRUTORA LYTORANEA', 'BOMBA DE MANGOTE', '25045-897', '2026-09-08', 'PLANEJADO'),
  ('1038-17/26', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '24042812-140', '2026-09-08', 'PLANEJADO'),
  ('035724', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '220115-069', '2026-09-08', 'PLANEJADO'),
  ('35728', 'ELCOP', 'MARTELO ROMPEDOR 30KG', '201214-248', '2026-09-08', 'PLANEJADO'),
  ('35727', 'ELCOP', 'COMPACTADOR DE SOLO', '23108-132', '2026-09-08', 'PLANEJADO'),
  ('035735', 'CONSTRUTORA R2X LTDA', 'FURADEIRA (CLIENTE)', 'SN', '2026-09-08', 'PLANEJADO'),
  ('1852-19', 'AGUAS DO RIO', 'BOMBA DE MANGOTE', '24045-295', '2026-09-08', 'PLANEJADO'),
  ('1393-05', 'CONSORCIO FAVELAS URBANIZADAS', 'BETONEIRA', '221111-033', '2026-09-08', 'PLANEJADO'),
  ('1589-06/25', 'RIO + SANEAMENTO', 'CORTADORA MANUAL', '240925-166', '2026-09-08', 'PLANEJADO'),
  ('2061-03/24', 'RIO + SANEAMENTO', 'CARRO CORTADORA MANUAL', '240925-181', '2026-09-08', 'PLANEJADO'),
  ('035720', 'AEGEA SANEAMENTO', 'CARRO CORTADORA MANUAL', '250225-372', '2026-09-08', 'PLANEJADO'),
  ('035718', 'AEGEA SANEAMENTO', 'CARRO CORTADORA MANUAL', '240125-075', '2026-09-08', 'PLANEJADO'),
  ('1474-01', 'NEVES', 'MARTELO ROMPEDOR 05KG', '250214-236', '2026-09-08', 'PLANEJADO'),
  ('35738', 'AGUAS DO RIO 4', 'MOTOVIBRADOR GASOLINA', '12014-085', '2026-09-08', 'PLANEJADO'),
  ('35736', 'AEGEA SANEMAENTO', 'CORTADORA MANUAL', '230625-017', '2026-09-08', 'PLANEJADO'),
  ('35734', 'AEGEA SANEMAENTO', 'GERADOR DE ENERGIA 3,5KVA', '250115-474', '2026-09-08', 'PLANEJADO'),
  ('35733', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-352', '2026-09-08', 'PLANEJADO'),
  ('35725', 'AEGEA SANEAMENTO', 'GERADOR DE ENERGIA 3,5KVA', '240715-451', '2026-09-08', 'PLANEJADO'),
  ('35722', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-348', '2026-09-08', 'PLANEJADO'),
  ('1475-01/26', 'ELCOP ENGENHARIA', 'ESMERILHADEIRA 7', '250110-260', '2026-09-08', 'PLANEJADO'),
  ('035742', 'CONSTRUTORA LYTORANEA', 'PLACA VIBRATÓRIA', '23081-125', '2026-09-08', 'PLANEJADO'),
  ('035753', 'VDINIZ CONSTRUTORA', 'COMPACTADOR DE SOLO', '24068-191', '2026-09-08', 'PLANEJADO'),
  ('35756', 'DUO LONDON', 'MARTELETE PERFURADOR 03KG', '24107-016', '2026-09-08', 'PLANEJADO'),
  ('35755', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-359', '2026-09-08', 'PLANEJADO'),
  ('35559', 'AGUAS DO RIO 1', 'CORTADORA MANUAL', '240125-424', '2026-09-04', 'PLANEJADO'),
  ('35719', 'AEGEA SANEAMENTO', 'CORTADORA MANUAL', '240825-149', '2026-09-08', 'PLANEJADO'),
  ('35766', 'AEGEA', 'CORTADORA MANUAL', '240125-034', '2026-09-08', 'PLANEJADO'),
  ('35767', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 10KG', '160814-061', '2026-09-08', 'PLANEJADO'),
  ('35764', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-366', '2026-09-08', 'PLANEJADO'),
  ('35763', 'AGUAS DO RIO 4', 'CORTADORA MANUAL', '250225-250', '2026-09-08', 'PLANEJADO'),
  ('1190-03/25', 'AEGEA SANEAMENTO', 'BOMBA DE MANGOTE', '26085-940', '2026-09-08', 'PLANEJADO'),
  ('1111-01', 'CONSTRUTORA LYTORANEA', 'COMPACTADOR DE SOLO', '23088-105', '2026-09-08', 'PLANEJADO'),
  ('1194-01/23', 'RIOPET', 'ESMERILHADEIRA 4', '220710-135', '2026-09-18', 'PLANEJADO'),
  ('2304-01/23', 'RIOPET', 'FURADEIRA', '200221-035', '2026-09-18', 'PLANEJADO'),
  ('1463-02/26', 'DETON ENGENHARIA', 'DIAGONAL PARA ANDAIME 1,00 X 1,50M', '', '2026-09-08', 'PLANEJADO'),
  ('1463-02/26', 'DETON ENGENHARIA', 'ELEMENTO TUBULAR DE ENCAIXE 1,00 X 1,50M', '', '2026-09-08', 'PLANEJADO'),
  ('1463-02/26', 'DETON ENGENHARIA', 'SAPATA REGULÁVEL PARA ANDAIME', '', '2026-09-08', 'PLANEJADO'),
  ('035775', 'DETON ENGENHARIA', 'CARRO CORTADORA MANUAL', '240125-038', '2026-09-08', 'PLANEJADO'),
  ('35776', 'CBTEC', 'PLACA VIBRATÓRIA', '240111-152', '2026-09-08', 'PLANEJADO'),
  ('35441', 'AEGEA SANEAMENTO', 'COMPACTADOR DE SOLO', '21048-030', '2026-09-04', 'PLANEJADO'),
  ('1460-01/26', 'RIO + SANEAMENTO', 'BOMBA DE MANGOTE', '24045-257', '2026-09-08', 'PLANEJADO'),
  ('34979', 'CONSTRUTORA LYTORANEA', 'CORTADORA MANUAL', '240825-120', '2026-09-04', 'PLANEJADO'),
  ('34951', 'CONSTRUTORA LYTORANEA', 'PLACA VIBRATÓRIA', '25111-151', '2026-09-04', 'PLANEJADO'),
  ('34833', 'CONSTRUTORA LYTORANEA', 'COMPACTADOR DE SOLO', '25028-255', '2026-09-04', 'PLANEJADO')
),
norm as (
  select m.*,
         regexp_replace(translate(upper(coalesce(split_part(m.patrimonio, ' SN', 1), '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g') as pat_k,
         regexp_replace(translate(upper(coalesce(m.equipamento, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g')      as equip_k,
         ltrim(regexp_replace(translate(upper(coalesce(m.os, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g'), '0')   as om_k,
         regexp_replace(btrim(translate(upper(coalesce(m.os, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')             as os_app,
         regexp_replace(btrim(translate(upper(coalesce(m.equipamento, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')    as equip_app,
         regexp_replace(btrim(translate(upper(coalesce(m.patrimonio, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')     as pat_app
  from migracao m
),
banco as (
  select d.numero, d.status, d.data_planejada, d.om, d.equipamento_nome, d.patrimonio, d.cliente_nome,
         regexp_replace(translate(upper(coalesce(split_part(d.patrimonio, ' SN', 1), '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g') as pat_k,
         regexp_replace(translate(upper(coalesce(d.equipamento_nome, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g') as equip_k,
         ltrim(regexp_replace(translate(upper(coalesce(d.om, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g'), '0')   as om_k,
         regexp_replace(btrim(translate(upper(coalesce(d.om, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')             as os_app,
         regexp_replace(btrim(translate(upper(coalesce(d.equipamento_nome, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g') as equip_app,
         regexp_replace(btrim(translate(upper(coalesce(d.patrimonio, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')     as pat_app,
         (d.status in ('FINALIZADO','CANCELADO')) as arquivada
  from demandas d
),
cruzado as (
  select
    case
      when b.numero is null then 'NOVA'
      -- Mesma peça só não basta: equipamento volta para manutenção o tempo todo. É
      -- repetição quando a ORDEM DE SERVIÇO é a mesma, ou quando a demanda que já
      -- existe ainda está ABERTA (mandar a peça duas vezes no mesmo período).
      when b.om_k <> '' and n.om_k <> '' and (b.om_k = n.om_k or b.om_k like n.om_k || '%' or n.om_k like b.om_k || '%')
        then 'JA EXISTE'
      when b.status not in ('FINALIZADO','CANCELADO') then 'JA EXISTE'
      else 'SERVICO ANTERIOR (pode importar)'
    end as veredito,
    case
      when b.numero is null then '—'
      -- a regra do app: strings normalizadas iguais E demanda ainda ativa
      when b.os_app = n.os_app and b.equip_app = n.equip_app and b.pat_app = n.pat_app
           and not b.arquivada then 'sim'
      else 'NAO, VAI DUPLICAR'
    end as app_barra,
    n.os, n.equipamento, n.patrimonio, n.cliente, n.data_exec, n.status_plan,
    b.numero as no_sistema_no, b.status as no_sistema_status,
    b.data_planejada as no_sistema_data, b.om as no_sistema_om, b.patrimonio as no_sistema_pat
  from norm n
  left join lateral (
    select * from banco b
    where (n.pat_k <> '' and b.pat_k = n.pat_k and b.equip_k = n.equip_k)
       or (n.pat_k =  '' and n.om_k <> '' and b.om_k = n.om_k and b.equip_k = n.equip_k)
    order by b.numero desc   -- a mais recente é a que interessa conferir
    limit 1
  ) b on true
)
-- ---------------------------------------------------------------------
-- 1. RESUMO — comece por aqui
-- ---------------------------------------------------------------------
select veredito, app_barra, count(*) as linhas
from cruzado group by 1, 2 order by 1, 2;

-- ---------------------------------------------------------------------
-- 2. DETALHE — as que já existem vêm primeiro
-- ---------------------------------------------------------------------
with migracao (os, cliente, equipamento, patrimonio, data_exec, status_plan) as (values
  ('35112', 'F.A.B ZONA LESTE', 'GERADOR DE ENERGIA 3,5KVA', '240215-437', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035635', 'AGUAS DO RIO 4 SPE S.A', 'PLACA VIBRATÓRIA 100KG', '22031-076', '2026-09-08', 'PENDENTE'),
  ('035639', 'CONSTRUTORA LYTORANEA LTDA - EM RECUPERACAO JUDICIAL', 'CORTADORA MANUAL', '250225-407 SN: 20244406271', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035640', 'RIO + SANEAMENTO BL3 S.A', 'BOMBA DE MANGOTE 3"', '24115-815', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1415-01', 'NORSIL QUIMICA', 'MARTELO ROMPEDOR 30KG', '250114-681', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35598', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '250115-473', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35605', 'ELCOP', 'MARTELO ROMPEDOR 30KG', '201214-251', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35604', 'ELCOP', 'COMPACTADOR DE SOLO', '24068-184', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1307-01', 'BRAÇOS CONSTRUÇÕES', 'GERADOR DE ENERGIA 9,0KVA', '24103-214', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035625', 'AGUAS DO RIO 4', 'MOTOVIBRADOR GASOLINA', '24014-086', '2026-09-08', 'PENDENTE'),
  ('035629', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-329', '2026-09-08', 'PENDENTE'),
  ('035632', 'AGUAS DO RIO 4', 'MOTOVIBRADOR GASOLINA', '24014-096', '2026-09-08', 'PENDENTE'),
  ('035633', 'AGUAS DO RIO 4', 'CORTADORA DE PISO', '18122-044', '2026-09-08', 'PENDENTE'),
  ('1753-09/24', 'VDINIZ CONSTRUTORA', 'BOMBA DE MANGOTE', '25045-899', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'BOMBA DE MANGOTE', '26025-029', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '230415-139', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250215-667', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '240115-287', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250915-689', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250115-506', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '260315-347', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '250115-657', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'GERADOR DE ENERGIA 3,5KVA', '260315-742', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MANGUEIRA FLEXÍVEL 3', '', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '140214-185', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '260514-976', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '180814-159', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '191014-091', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '241114-135', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'MOTOVIBRADOR GASOLINA', '18114-469', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'PUNHO PARA MARTELO 03 A 20KG', '', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'PONTEIRO 20 E 30KG', '', '2026-09-04', 'PENDENTE'),
  ('1060-09/26', 'VDINIZ CONSTRUTORA', 'TALHADEIRA 20 E 30KG', '', '2026-09-04', 'PENDENTE'),
  ('1099-06/25', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '240914-614', '2026-09-04', 'PENDENTE'),
  ('1099-06/25', 'VDINIZ CONSTRUTORA', 'MARTELO ROMPEDOR 20KG', '241114-642', '2026-09-04', 'PENDENTE'),
  ('1643-10/25', 'VDINIZ CONSTRUTORA', 'MOTOVIBRADOR GASOLINA', '19044-570', '2026-09-04', 'PENDENTE'),
  ('1387-05/26', 'VDINIZ CONSTRUTORA', 'BOMBA DE MANGOTE', '25045-902', '2026-09-04', 'PENDENTE'),
  ('35665', 'BRAÇOS CONSTRUÇÕES', 'CORTADORA DE PISO', '24012-125', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35666', 'RIO + SANEAMENTO', 'BOMBA DE MANGOTE', '24015-290', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35665', 'BRAÇOS CONSTRUÇÕES', 'CORTADORA DE PISO', '24012-125', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35666', 'RIO + SANEAMENTO', 'BOMBA DE MANGOTE', '24015-290', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'ESMERILHADEIRA 7', '220510-274', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '240115-274', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELETE PERFURADOR 03KG', '24097-009', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELETE PERFURADOR 03KG', '25027-043', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 05KG', '210814-148', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 10KG', '240914-039', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 10KG', '260214-953', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'SERRA MÁRMORE', '091018-007', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '13103512-123', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '23113812-126', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '24113812-150', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1223', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '25063812-172', '2026-09-04', 'AGUARDANDO_ROTEIRIZACAO'),
  ('', 'F.A.B ZONA LESTE', 'GERADOR DE ENERGIA 3,5KVA', '230915-023', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35551', 'RIO +', 'MOTOVIBRADOR GASOLINA', '13084-131', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('035491', 'AGUAS DO RIO 4 SPE S.A', 'DESENTUPIDORA VARETA K-1000 (CLIENTE)', 'SN', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('34952', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '240115-272', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('1190/25', 'AEGEA SANEMAENTO', 'BOMBA DE MANGOTE', '26085-940', '2026-09-08', 'AGUARDANDO_ROTEIRIZACAO'),
  ('35703', 'AEGEA', 'COMPACTADOR DE SOLO', '24018-153', '2026-09-08', 'PLANEJADO'),
  ('35701', 'AEGEA', 'CORTADORA DE PISO', '23112-120', '2026-09-08', 'PLANEJADO'),
  ('35702', 'AEGEA', 'COMPACTADOR DE SOLO', '24048-182', '2026-09-08', 'PLANEJADO'),
  ('1038-16/26', 'CONSTRUTORA LYTORANEA', 'BOMBA DE MANGOTE', '25035-874', '2026-09-08', 'PLANEJADO'),
  ('1038-16/26', 'CONSTRUTORA LYTORANEA', 'MOTOVIBRADOR GASOLINA', '24084-826', '2026-09-08', 'PLANEJADO'),
  ('2262-07/25', 'CONSTRUTORA LYTORANEA', 'MOTOVIBRADOR GASOLINA', '24034-742', '2026-09-08', 'PLANEJADO'),
  ('2262-07/25', 'CONSTRUTORA LYTORANEA', 'MANGUEIRA FLEXÍVEL 3', '', '2026-09-08', 'PLANEJADO'),
  ('1544-07', 'RIO +', 'BOMBA DE MANGOTE', '26035-003', '2026-09-08', 'PLANEJADO'),
  ('35077', 'RIO +', 'MARTELO ROMPEDOR 30KG', '240114-549', '2026-09-08', 'PLANEJADO'),
  ('35705', 'RIO +', 'PLACA VIBRATÓRIA', '24081-069', '2026-09-08', 'PLANEJADO'),
  ('35704', 'RIO +', 'CORTADORA MANUAL', '240925-189', '2026-09-08', 'PLANEJADO'),
  ('35080', 'RIO +', 'MOTOVIBRADOR GASOLINA', '23124-475', '2026-09-08', 'PLANEJADO'),
  ('1433-01', 'SOUZA PINA', 'ELEMENTO TUBULAR DE ENCAIXE 1,00 X 1,00M', '', '2026-09-08', 'PLANEJADO'),
  ('1433-01', 'SOUZA PINA', 'DIAGONAL PARA ANDAIME 1,00 X 1,00M', '', '2026-09-08', 'PLANEJADO'),
  ('1433-01', 'SOUZA PINA', 'PISO METÁLICO 0,33 X 1,00M', '', '2026-09-08', 'PLANEJADO'),
  ('35685', 'MPE ENGENHARIA', 'COMPACTADOR DE SOLO', '24088-193', '2026-09-08', 'PLANEJADO'),
  ('1038-17/26', 'CONSTRUTORA LYTORANEA', 'BOMBA DE MANGOTE', '25045-897', '2026-09-08', 'PLANEJADO'),
  ('1038-17/26', 'CONSTRUTORA LYTORANEA', 'VIBRADOR DE IMERSÃO 35MM', '24042812-140', '2026-09-08', 'PLANEJADO'),
  ('035724', 'CONSTRUTORA LYTORANEA', 'GERADOR DE ENERGIA 3,5KVA', '220115-069', '2026-09-08', 'PLANEJADO'),
  ('35728', 'ELCOP', 'MARTELO ROMPEDOR 30KG', '201214-248', '2026-09-08', 'PLANEJADO'),
  ('35727', 'ELCOP', 'COMPACTADOR DE SOLO', '23108-132', '2026-09-08', 'PLANEJADO'),
  ('035735', 'CONSTRUTORA R2X LTDA', 'FURADEIRA (CLIENTE)', 'SN', '2026-09-08', 'PLANEJADO'),
  ('1852-19', 'AGUAS DO RIO', 'BOMBA DE MANGOTE', '24045-295', '2026-09-08', 'PLANEJADO'),
  ('1393-05', 'CONSORCIO FAVELAS URBANIZADAS', 'BETONEIRA', '221111-033', '2026-09-08', 'PLANEJADO'),
  ('1589-06/25', 'RIO + SANEAMENTO', 'CORTADORA MANUAL', '240925-166', '2026-09-08', 'PLANEJADO'),
  ('2061-03/24', 'RIO + SANEAMENTO', 'CARRO CORTADORA MANUAL', '240925-181', '2026-09-08', 'PLANEJADO'),
  ('035720', 'AEGEA SANEAMENTO', 'CARRO CORTADORA MANUAL', '250225-372', '2026-09-08', 'PLANEJADO'),
  ('035718', 'AEGEA SANEAMENTO', 'CARRO CORTADORA MANUAL', '240125-075', '2026-09-08', 'PLANEJADO'),
  ('1474-01', 'NEVES', 'MARTELO ROMPEDOR 05KG', '250214-236', '2026-09-08', 'PLANEJADO'),
  ('35738', 'AGUAS DO RIO 4', 'MOTOVIBRADOR GASOLINA', '12014-085', '2026-09-08', 'PLANEJADO'),
  ('35736', 'AEGEA SANEMAENTO', 'CORTADORA MANUAL', '230625-017', '2026-09-08', 'PLANEJADO'),
  ('35734', 'AEGEA SANEMAENTO', 'GERADOR DE ENERGIA 3,5KVA', '250115-474', '2026-09-08', 'PLANEJADO'),
  ('35733', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-352', '2026-09-08', 'PLANEJADO'),
  ('35725', 'AEGEA SANEAMENTO', 'GERADOR DE ENERGIA 3,5KVA', '240715-451', '2026-09-08', 'PLANEJADO'),
  ('35722', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-348', '2026-09-08', 'PLANEJADO'),
  ('1475-01/26', 'ELCOP ENGENHARIA', 'ESMERILHADEIRA 7', '250110-260', '2026-09-08', 'PLANEJADO'),
  ('035742', 'CONSTRUTORA LYTORANEA', 'PLACA VIBRATÓRIA', '23081-125', '2026-09-08', 'PLANEJADO'),
  ('035753', 'VDINIZ CONSTRUTORA', 'COMPACTADOR DE SOLO', '24068-191', '2026-09-08', 'PLANEJADO'),
  ('35756', 'DUO LONDON', 'MARTELETE PERFURADOR 03KG', '24107-016', '2026-09-08', 'PLANEJADO'),
  ('35755', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-359', '2026-09-08', 'PLANEJADO'),
  ('35559', 'AGUAS DO RIO 1', 'CORTADORA MANUAL', '240125-424', '2026-09-04', 'PLANEJADO'),
  ('35719', 'AEGEA SANEAMENTO', 'CORTADORA MANUAL', '240825-149', '2026-09-08', 'PLANEJADO'),
  ('35766', 'AEGEA', 'CORTADORA MANUAL', '240125-034', '2026-09-08', 'PLANEJADO'),
  ('35767', 'CONSTRUTORA LYTORANEA', 'MARTELO ROMPEDOR 10KG', '160814-061', '2026-09-08', 'PLANEJADO'),
  ('35764', 'AGUAS DO RIO 4', 'GERADOR DE ENERGIA 3,5KVA', '240115-366', '2026-09-08', 'PLANEJADO'),
  ('35763', 'AGUAS DO RIO 4', 'CORTADORA MANUAL', '250225-250', '2026-09-08', 'PLANEJADO'),
  ('1190-03/25', 'AEGEA SANEAMENTO', 'BOMBA DE MANGOTE', '26085-940', '2026-09-08', 'PLANEJADO'),
  ('1111-01', 'CONSTRUTORA LYTORANEA', 'COMPACTADOR DE SOLO', '23088-105', '2026-09-08', 'PLANEJADO'),
  ('1194-01/23', 'RIOPET', 'ESMERILHADEIRA 4', '220710-135', '2026-09-18', 'PLANEJADO'),
  ('2304-01/23', 'RIOPET', 'FURADEIRA', '200221-035', '2026-09-18', 'PLANEJADO'),
  ('1463-02/26', 'DETON ENGENHARIA', 'DIAGONAL PARA ANDAIME 1,00 X 1,50M', '', '2026-09-08', 'PLANEJADO'),
  ('1463-02/26', 'DETON ENGENHARIA', 'ELEMENTO TUBULAR DE ENCAIXE 1,00 X 1,50M', '', '2026-09-08', 'PLANEJADO'),
  ('1463-02/26', 'DETON ENGENHARIA', 'SAPATA REGULÁVEL PARA ANDAIME', '', '2026-09-08', 'PLANEJADO'),
  ('035775', 'DETON ENGENHARIA', 'CARRO CORTADORA MANUAL', '240125-038', '2026-09-08', 'PLANEJADO'),
  ('35776', 'CBTEC', 'PLACA VIBRATÓRIA', '240111-152', '2026-09-08', 'PLANEJADO'),
  ('35441', 'AEGEA SANEAMENTO', 'COMPACTADOR DE SOLO', '21048-030', '2026-09-04', 'PLANEJADO'),
  ('1460-01/26', 'RIO + SANEAMENTO', 'BOMBA DE MANGOTE', '24045-257', '2026-09-08', 'PLANEJADO'),
  ('34979', 'CONSTRUTORA LYTORANEA', 'CORTADORA MANUAL', '240825-120', '2026-09-04', 'PLANEJADO'),
  ('34951', 'CONSTRUTORA LYTORANEA', 'PLACA VIBRATÓRIA', '25111-151', '2026-09-04', 'PLANEJADO'),
  ('34833', 'CONSTRUTORA LYTORANEA', 'COMPACTADOR DE SOLO', '25028-255', '2026-09-04', 'PLANEJADO')
),
norm as (
  select m.*,
         regexp_replace(translate(upper(coalesce(split_part(m.patrimonio, ' SN', 1), '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g') as pat_k,
         regexp_replace(translate(upper(coalesce(m.equipamento, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g')      as equip_k,
         ltrim(regexp_replace(translate(upper(coalesce(m.os, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g'), '0')   as om_k,
         regexp_replace(btrim(translate(upper(coalesce(m.os, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')             as os_app,
         regexp_replace(btrim(translate(upper(coalesce(m.equipamento, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')    as equip_app,
         regexp_replace(btrim(translate(upper(coalesce(m.patrimonio, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')     as pat_app
  from migracao m
),
banco as (
  select d.numero, d.status, d.data_planejada, d.om, d.equipamento_nome, d.patrimonio, d.cliente_nome,
         regexp_replace(translate(upper(coalesce(split_part(d.patrimonio, ' SN', 1), '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g') as pat_k,
         regexp_replace(translate(upper(coalesce(d.equipamento_nome, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g') as equip_k,
         ltrim(regexp_replace(translate(upper(coalesce(d.om, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g'), '0')   as om_k,
         regexp_replace(btrim(translate(upper(coalesce(d.om, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')             as os_app,
         regexp_replace(btrim(translate(upper(coalesce(d.equipamento_nome, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g') as equip_app,
         regexp_replace(btrim(translate(upper(coalesce(d.patrimonio, '')), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g')     as pat_app,
         (d.status in ('FINALIZADO','CANCELADO')) as arquivada
  from demandas d
),
cruzado as (
  select
    case
      when b.numero is null then 'NOVA'
      -- Mesma peça só não basta: equipamento volta para manutenção o tempo todo. É
      -- repetição quando a ORDEM DE SERVIÇO é a mesma, ou quando a demanda que já
      -- existe ainda está ABERTA (mandar a peça duas vezes no mesmo período).
      when b.om_k <> '' and n.om_k <> '' and (b.om_k = n.om_k or b.om_k like n.om_k || '%' or n.om_k like b.om_k || '%')
        then 'JA EXISTE'
      when b.status not in ('FINALIZADO','CANCELADO') then 'JA EXISTE'
      else 'SERVICO ANTERIOR (pode importar)'
    end as veredito,
    case
      when b.numero is null then '—'
      -- a regra do app: strings normalizadas iguais E demanda ainda ativa
      when b.os_app = n.os_app and b.equip_app = n.equip_app and b.pat_app = n.pat_app
           and not b.arquivada then 'sim'
      else 'NAO, VAI DUPLICAR'
    end as app_barra,
    n.os, n.equipamento, n.patrimonio, n.cliente, n.data_exec, n.status_plan,
    b.numero as no_sistema_no, b.status as no_sistema_status,
    b.data_planejada as no_sistema_data, b.om as no_sistema_om, b.patrimonio as no_sistema_pat
  from norm n
  left join lateral (
    select * from banco b
    where (n.pat_k <> '' and b.pat_k = n.pat_k and b.equip_k = n.equip_k)
       or (n.pat_k =  '' and n.om_k <> '' and b.om_k = n.om_k and b.equip_k = n.equip_k)
    order by b.numero desc   -- a mais recente é a que interessa conferir
    limit 1
  ) b on true
)
select * from cruzado
order by (veredito <> 'JA EXISTE'), (app_barra = 'sim'), data_exec, os;
